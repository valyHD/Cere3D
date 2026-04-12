import { db, auth } from "./firebase-init.js";
import { getDisplayStatus } from "./activity-utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function $(id){ return document.getElementById(id); }

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tsMillis(x){
  try{
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  }catch{
    return 0;
  }
}

function sortSolvedLast(list){
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => {
    const aSolved = !!(a?.solved || a?.status === "solved");
    const bSolved = !!(b?.solved || b?.status === "solved");

    if (aSolved !== bSolved) return aSolved ? 1 : -1;
    return tsMillis(b?.createdAt) - tsMillis(a?.createdAt);
  });
  return arr;
}

async function getUserPublic(uid){
  if(!uid) return { name:"User", avatarUrl:"" };

  try{
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) {
      const p = s.data() || {};
      return {
        name: p.name || "User",
        avatarUrl: p.avatarUrl || ""
      };
    }
  }catch{}

  return { name:"User", avatarUrl:"" };
}

function statusKey(r){
  return getDisplayStatus(r).key;
}

function statusLabel(r){
  return getDisplayStatus(r).label;
}

function statusDotClass(k){
  if (k === "solved") return "dot dot-green";
  if (k === "urgent") return "dot dot-purple";
  if (k === "highpay") return "dot dot-orange";
  return "dot dot-blue";
}

function statusCardClass(k){
  if (k === "solved") return "request-card status-green";
  if (k === "urgent") return "request-card status-purple";
  if (k === "highpay") return "request-card status-orange";
  return "request-card status-blue";
}

function renderCardsHtml(list, uidToProfile){
  return (list || []).map((r) => {
    const title = escapeHtml(r.title || "Cerere");

    const authorUid = r.createdBy || "";
    const prof = uidToProfile[authorUid] || {};
    const authorName = escapeHtml(r.createdByName || prof.name || "User");
    const authorAv = escapeHtml(r.createdByAvatar || prof.avatarUrl || "/assets/avatar-placeholder.svg");

    const sk = statusKey(r);
    const statusText = statusLabel(r);
    const urgentBadge = r?.flags?.urgent
      ? `<span class="mini-flag mini-flag-urgent"><span class="dot"></span>Urgent</span>`
      : "";

    const highPayBadge = r?.flags?.highPay
      ? `<span class="mini-flag mini-flag-highpay"><span class="dot"></span>Platesc bine</span>`
      : "";

    const extraFlags = (urgentBadge || highPayBadge)
      ? `<div class="request-mini-flags">${urgentBadge}${highPayBadge}</div>`
      : "";
    const makerUid = r.selectedMakerUid || "";
    const makerName = escapeHtml(r.selectedMakerName || "");
    const makerLine = makerName
      ? `<div class="maker-line">
           Printator ales:
           <a href="/profil.html?uid=${encodeURIComponent(makerUid)}"
              onclick="event.stopPropagation();"
              class="maker-link">${makerName}</a>
         </div>`
      : ``;

    return `
            <article class="${statusCardClassByRequest(r)} request-card-click"
        onclick="location.href='/cerere.html?id=${encodeURIComponent(r.id)}'">

        <div class="request-top">
          <div class="request-title">${title}</div>
        </div>

        <div class="request-author">
          <a class="author-link" href="/profil.html?uid=${encodeURIComponent(authorUid)}" onclick="event.stopPropagation();">
            <img loading="lazy" decoding="async" class="author-av" src="${authorAv}" alt="" />
            <span class="author-name">${authorName}</span>
          </a>
        </div>

        ${makerLine}
        ${extraFlags}
        <div class="request-foot">
          <div class="foot-left">
            <div class="request-status request-status-bottom">
              <span class="${statusDotClass(sk)}" aria-hidden="true"></span>
              <span class="status-text">${escapeHtml(statusText)}</span>
            </div>
          </div>

          <div class="foot-right">
            <span class="small-link">Vezi detalii →</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

export function initMyCereriPage(){
  const grid = $("cereriGrid");
  const gate = $("myCereriGate");
  const btnGoLogin = $("btnGoLogin");
  const btnMore = $("btnLoadMoreCereri");

  if (!grid) return;
  if (btnMore) btnMore.style.display = "none";

  const uidToProfile = {};

  async function ensureProfilesFor(list){
    const docs = Array.isArray(list) ? list : [];
    const uids = Array.from(new Set(docs.map(x => x.createdBy).filter(Boolean)));

    for (const uid of uids){
      if (uidToProfile[uid]) continue;
      uidToProfile[uid] = await getUserPublic(uid);
    }
  }

  onAuthStateChanged(auth, async (u) => {
    document.body.classList.remove("auth-loading");

    if (!u){
      if (gate) gate.style.display = "";
      if (btnGoLogin){
        btnGoLogin.href = "/auth.html?return=" + encodeURIComponent("/cererile-mele.html");
      }
      grid.innerHTML = "";
      return;
    }

    if (gate) gate.style.display = "none";
    grid.innerHTML = `<div class="card">Se incarca cererile tale...</div>`;

    try{
      const qy = query(
        collection(db, "cereri"),
        where("createdBy", "==", u.uid)
      );

      const snap = await getDocs(qy);
      const all = [];

      snap.forEach((d) => {
        all.push({ id: d.id, ...(d.data() || {}) });
      });

      const sorted = sortSolvedLast(all);
      await ensureProfilesFor(sorted);

      grid.innerHTML = sorted.length
        ? renderCardsHtml(sorted, uidToProfile)
        : `<div class="card">Nu ai inca cereri postate.</div>`;
    }catch(e){
      console.error("[my-cereri] load failed:", e);
      grid.innerHTML = `<div class="card">Eroare la incarcare: ${escapeHtml(e?.message || String(e))}</div>`;
    }
  });
}
function statusCardClassByRequest(r) {
  const isSolved = !!(r?.solved || r?.status === "solved");
  const isInDiscutie = (r?.activityStatus || "").toLowerCase() === "in_discutie";
  const isUrgent = !!r?.flags?.urgent;
  const isHighPay = !!r?.flags?.highPay;

  if (isSolved) return "request-card status-green";
  if (isInDiscutie) return "request-card status-purple";
  if (isUrgent) return "request-card status-purple";
  if (isHighPay) return "request-card status-orange";
  return "request-card status-blue";
}