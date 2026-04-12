import { db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getPublicProfileUrl,
  renderNameWithPrinterBadge,
  startDmWith
} from "./dm-utils.js";

function $(id){ return document.getElementById(id); }
function setText(id, v){ const el = $(id); if(el) el.textContent = v || ""; }

function setPhone(phoneRaw){
  const row = $("u_phone_row");
  const a = $("u_phone");
  if (!row || !a) return;

  const phone = (phoneRaw || "").toString().trim();

  if (!phone) {
    row.style.display = "none";
    return;
  }

  row.style.display = "";
  a.textContent = phone;

  const tel = phone.replace(/\s+/g, "");
  a.href = `tel:${encodeURIComponent(tel)}`;
}

function tsMs(x){
  try{
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  }catch{
    return 0;
  }
}

function fmtMemberSince(ms){
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("ro-RO", { month:"long", year:"numeric" });
}

function timeAgo(ms){
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "acum 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ore`;
  const d = Math.floor(h / 24);
  if (d < 30) return `acum ${d} zile`;
  const dt = new Date(ms);
  return dt.toLocaleDateString("ro-RO", { year:"numeric", month:"2-digit", day:"2-digit" });
}

async function getLatestPresenceMs(uid){
  try{
    const snap = await getDocs(query(
      collection(db, "presence"),
      where("uid", "==", uid)
    ));
    let latest = 0;
    snap.forEach((d) => {
      const ms = tsMs(d.data()?.lastSeen);
      if (ms > latest) latest = ms;
    });
    return latest;
  }catch{
    return 0;
  }
}

export async function initProfilPage(){
  document.body.classList.remove("auth-loading");

  const p = new URLSearchParams(location.search);
  const uid = (p.get("uid") || "").trim();

  const btn = $("btnMsgDemo");
  if (btn){
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try{
        if(!uid){
          alert("Profil invalid (uid lipsa).");
          return;
        }
        await startDmWith(uid);
      }catch(err){
        console.error("[profil] startDmWith failed:", err);
        alert(err?.message || String(err));
      }
    });
  }

  if(!uid){
    setText("u_name", "Profil lipsa");
    setText("u_bio", "Nu am primit uid in URL. Exemplu: /profil.html?uid=...");
    return;
  }

  try{
    const snap = await getDoc(doc(db, "users", uid));
    if(!snap.exists()){
      setText("u_name", "Profil inexistent");
      setText("u_bio", "Acest utilizator nu are profil public.");
      return;
    }

    const u = snap.data() || {};
    const isPrinter = u.isPrinter === true;

    const publicUrl = getPublicProfileUrl({
      uid,
      isPrinter,
      printerVisible: u.printerVisible !== false
    });

    const nameEl = $("u_name");
    if (nameEl) {
      nameEl.innerHTML = renderNameWithPrinterBadge(u.name || "User", isPrinter, false);
    }

    setText("u_city", u.printerCity || u.city || "—");
    setPhone(u.phone || u.phoneNumber || u.telefon || "");
    setText("u_bio", u.printerBio || u.bio || "—");

    const printerBadgeWrap = $("u_printerBadgeWrap");
    if (printerBadgeWrap) {
      printerBadgeWrap.style.display = isPrinter ? "" : "none";
      printerBadgeWrap.innerHTML = isPrinter
        ? `<a href="/profil-printator.html?uid=${encodeURIComponent(uid)}" class="btn btn-blue btn-soft" style="display:inline-flex;">🖨️ Vezi pagina de printator</a>`
        : "";
    }

    const btnViewPrinterProfile = $("btnViewPrinterProfile");
    if (btnViewPrinterProfile) {
      btnViewPrinterProfile.style.display = isPrinter ? "" : "none";
      btnViewPrinterProfile.href = `/profil-printator.html?uid=${encodeURIComponent(uid)}`;
    }

    const img = $("u_avatar");
    if(img){
      img.src = u.avatarUrl || "/assets/avatar-placeholder.svg";
      img.onerror = () => {
        img.src = "/assets/avatar-placeholder.svg";
      };
    }

    const ratingAvg = Number(u.ratingAvg || 0);
    const ratingCount = Number(u.ratingCount || 0);
    setText("u_rating", ratingAvg.toFixed(1));
    setText("u_ratingCount", `(${ratingCount} recenzii)`);

    const memberSince = fmtMemberSince(tsMs(u.createdAt));
    const fallbackLastActiveMs =
      tsMs(u.printerLastActiveAt) ||
      tsMs(u.lastActiveAt) ||
      tsMs(u.lastSeenAt) ||
      tsMs(u.updatedAt) ||
      0;
    const latestPresenceMs = await getLatestPresenceMs(uid);
    const lastActiveMs = Math.max(fallbackLastActiveMs, latestPresenceMs);

    let solvedCount = Number(u.printerSolvedCount || 0);
    if (!solvedCount) {
      try{
        const qSolved = query(
          collection(db, "cereri"),
          where("selectedMakerUid", "==", uid),
          where("status", "==", "solved")
        );
        const agg = await getCountFromServer(qSolved);
        solvedCount = agg.data().count || 0;
      }catch{
        solvedCount = 0;
      }
    }

    const msEl = $("u_memberSince");
    if (msEl) msEl.textContent = memberSince;

    const laEl = $("u_lastActive");
    if (laEl) laEl.textContent = timeAgo(lastActiveMs);

    const solEl = $("u_solved");
    if (solEl) solEl.textContent = String(solvedCount);

    const btnPublic = $("btnViewPublic");
    if (btnPublic) btnPublic.href = publicUrl;

  }catch(e){
    console.error(e);
    setText("u_name", "Eroare");
    setText("u_bio", e?.message || "Nu pot incarca profilul.");
  }
}
