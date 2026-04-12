// cereri-feed.js
import { db } from "./firebase-init.js";
import { getDisplayStatus } from "./activity-utils.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getPublicProfileUrl,
  renderNameWithPrinterBadge
} from "./dm-utils.js";

const PAGE_SIZE_DEFAULT = 200;

function getPageSize() {
  const el = document.getElementById("cereriGrid");
  const n = Number(el?.dataset?.pageSize || "");
  return Number.isFinite(n) && n > 0 ? n : PAGE_SIZE_DEFAULT;
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tsMillis(x) {
  try {
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  } catch {
    return 0;
  }
}

function timeAgoFromMs(ms) {
  if (!ms) return "";
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
  return dt.toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function timeAgoFromTs(ts) {
  return timeAgoFromMs(tsMillis(ts));
}

function clip2Lines(text, maxChars = 160) {
  const t = (text ?? "").toString().trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 1) + "…";
}

/* ===== status ===== */
function statusKey(r) {
  return getDisplayStatus(r).key;
}

function statusLabel(r) {
  return getDisplayStatus(r).label;
}

function statusDotClass(k) {
  if (k === "solved") return "dot dot-green";
  if (k === "urgent") return "dot dot-purple";
  if (k === "highpay") return "dot dot-orange";
  return "dot dot-blue";
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

/* ===== badges ===== */
function hasAnyChat(r) {
  return !!(r?.chatLast && (r.chatLast.text || r.chatLast.at || r.chatLast.senderId));
}

function isFresh24h(r) {
  const created = tsMillis(r?.createdAt);
  if (!created) return false;
  return (Date.now() - created) <= 24 * 60 * 60 * 1000;
}

function isHighPay(r) {
  return !!(r?.flags?.highPay);
}

function svgIcon(kind) {
  if (kind === "fire") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
          d="M13.5 2.2c.4 3-1 4.7-2.2 6.1-1.1 1.3-2 2.4-1.7 4.1.3 1.9 2 3.3 4 3.3 2.7 0 4.7-2.1 4.7-4.8 0-2.7-1.6-5-4.8-8.7z"/>
        <path fill="currentColor"
          d="M10.8 9.2C8.2 11.3 6.6 13.6 6.6 16.4c0 3.7 3 6.6 6.6 6.6s6.6-3 6.6-6.6c0-2.6-1.5-4.9-4-7.2.3 1 .3 1.9.2 2.7-.4 2.3-2.4 4-4.8 4-2.7 0-5-1.9-5.4-4.5-.3-1.6.2-2.9 1.4-4.2z"/>
      </svg>`;
  }

  if (kind === "money") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" style="display:block">
        <path fill="#10b981" style="fill:#10b981 !important"
          d="M4 7h16c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2zm0 2v6h16V9H4zm8 1.2c1.5 0 2.8 1.2 2.8 2.8S13.5 15.8 12 15.8 9.2 14.6 9.2 13 10.5 10.2 12 10.2z"/>
      </svg>`;
  }

  if (kind === "chat") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 4h16v11H7.4L4 18.4V4zm2 2v7.6L6.6 13H18V6H6z"/>
      </svg>`;
  }

  if (kind === "clock") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h4v-2h-3V7h-2v6z"/>
      </svg>`;
  }

  return "";
}

/* ===== profiles ===== */
async function getUserPublic(uid) {
  if (!uid) {
    return {
      name: "User",
      avatarUrl: "",
      isPrinter: false,
      printerVisible: false
    };
  }

  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) {
      const p = s.data() || {};
      return {
        name: p.name || "User",
        avatarUrl: p.avatarUrl || "",
        isPrinter: p.isPrinter === true,
        printerVisible: p.printerVisible !== false
      };
    }
  } catch {}

  return {
    name: "User",
    avatarUrl: "",
    isPrinter: false,
    printerVisible: false
  };
}

/* ===== render ===== */
function renderCardsHtml(list, uidToProfile) {
  return (list || []).map((r) => {
    const title = escapeHtml(r.title || "Cerere");
    const county = escapeHtml(r.county || "—");
    const desc = escapeHtml(clip2Lines(r.description || "", 170));
    const posted = timeAgoFromTs(r.createdAt);

    const showChat = hasAnyChat(r);
    const showFire = isFresh24h(r);
    const showMoney = isHighPay(r);

    const autoBadges = [
      showFire ? `<span class="auto-badge ab-fire" title="Postare noua (sub 24 ore)">${svgIcon("fire")}</span>` : "",
      showMoney ? `<span class="auto-badge ab-money" title="Platesc bine">${svgIcon("money")}</span>` : "",
      showChat ? `<span class="auto-badge ab-chat" title="Exista mesaje in chat">${svgIcon("chat")}</span>` : ""
    ].filter(Boolean).join("");

    const autoBadgesHtml = autoBadges
      ? `<div class="auto-badges" aria-hidden="true">${autoBadges}</div>`
      : "";

    const authorUid = r.createdBy || "";
    const prof = uidToProfile[authorUid] || {};
    const authorRawName = prof.name || r.createdByName || "User";
    const authorIsPrinter = prof.isPrinter === true;
    const authorName = renderNameWithPrinterBadge(authorRawName, authorIsPrinter, true);
    const authorProfileUrl = getPublicProfileUrl({
      uid: authorUid,
      isPrinter: authorIsPrinter,
      printerVisible: prof.printerVisible !== false
    });
    const authorAv = escapeHtml(prof.avatarUrl || r.createdByAvatar || "/assets/avatar-placeholder.svg");

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
    const makerRawName = r.selectedMakerName || "";
    const makerProf = makerUid ? (uidToProfile[makerUid] || {}) : {};
    const makerIsPrinter = makerProf.isPrinter === true;
    const makerProfileUrl = makerUid
      ? getPublicProfileUrl({
          uid: makerUid,
          isPrinter: makerIsPrinter,
          printerVisible: makerProf.printerVisible !== false
        })
      : "#";

    const makerLine = makerRawName
      ? `<div class="maker-line">
           Printator ales:
           <a href="${makerProfileUrl}"
              onclick="event.stopPropagation();"
              class="maker-link">${renderNameWithPrinterBadge(makerRawName, makerIsPrinter, true)}</a>
         </div>`
      : "";

    return `
      <article class="${statusCardClassByRequest(r)} request-card-click"
        onclick="location.href='/cerere.html?id=${encodeURIComponent(r.id)}'">
        ${autoBadgesHtml}

        <div class="request-top">
          <div class="request-title">${title}</div>
        </div>

        <div class="request-meta">
          <span class="meta-pill">${county}</span>
          ${posted ? `<span class="meta-pill">Postata ${escapeHtml(posted)}</span>` : ``}
        </div>

        <div class="request-desc-2l">${desc || ""}</div>

        <div class="request-author">
          <a class="author-link" href="${authorProfileUrl}" onclick="event.stopPropagation();">
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

function sortSolvedLast(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => {
    const aSolved = !!(a?.solved || a?.status === "solved");
    const bSolved = !!(b?.solved || b?.status === "solved");

    if (aSolved !== bSolved) return aSolved ? 1 : -1;

    const atA = tsMillis(a?.createdAt);
    const atB = tsMillis(b?.createdAt);
    return atB - atA;
  });
  return arr;
}

/* ===== hint ===== */
document.addEventListener("click", (e) => {
  const b = e.target.closest(".auto-badge");
  if (!b) return;

  try {
    const alreadyShown = localStorage.getItem("cere3d_badge_hint");
    if (alreadyShown) return;

    const msg = b.title || "Indicator cerere";
    if (typeof window.showToast === "function") {
      window.showToast(msg);
    }

    localStorage.setItem("cere3d_badge_hint", "1");
  } catch {}
});

/* ===== init ===== */
export async function initCereriFeed() {
  const grid = document.getElementById("cereriGrid");
  const btnMore = document.getElementById("btnLoadMoreCereri");
  if (!grid) return;

  const isIndex = document.body.dataset.page === "index";

  window.__CERERI_ALL__ = [];
  window.__CERERI_FILTERED__ = null;

  const uidToProfile = {};

  let lastDoc = null;
  let hasMore = true;
  let loading = false;

  function setBtnVisible(v) {
    if (!btnMore) return;
    btnMore.style.display = v ? "" : "none";
  }

  if (isIndex) setBtnVisible(false);

  async function ensureProfilesFor(list) {
    const docs = Array.isArray(list) ? list : [];

    const needUids = Array.from(new Set(
      docs
        .flatMap((r) => [r.createdBy, r.selectedMakerUid])
        .filter(Boolean)
        .filter((uid) => !uidToProfile[uid])
    ));

    await Promise.all(
      needUids.map(async (uid) => {
        uidToProfile[uid] = await getUserPublic(uid);
      })
    );
  }

  function renderGrid(list) {
    const arr = Array.isArray(list) ? list : [];
    grid.innerHTML = arr.length
      ? renderCardsHtml(arr, uidToProfile)
      : `<div class="card">Nu exista cereri pentru filtrele alese.</div>`;
  }

  function renderGridFromMode() {
    const list = Array.isArray(window.__CERERI_FILTERED__)
      ? window.__CERERI_FILTERED__
      : window.__CERERI_ALL__;
    renderGrid(list);
  }

  async function loadPage() {
    if (loading || !hasMore) return;
    loading = true;

    try {
      if (window.__CERERI_ALL__.length === 0) {
        grid.innerHTML = `<div class="card">Se incarca cererile...</div>`;
      }

      const base = collection(db, "cereri");
      const pageSize = getPageSize();

      const qy = lastDoc
        ? query(base, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(pageSize))
        : query(base, orderBy("createdAt", "desc"), limit(pageSize));

      const snap = await getDocs(qy);

      if (snap.empty) {
        hasMore = false;
        setBtnVisible(false);

        if (window.__CERERI_ALL__.length === 0) {
          grid.innerHTML = `<div class="card">Nu exista cereri inca. Posteaza prima cerere.</div>`;
        }

        window.dispatchEvent(
          new CustomEvent("cereri:updated", { detail: window.__CERERI_ALL__ })
        );
        return;
      }

      lastDoc = snap.docs[snap.docs.length - 1];

      const batch = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      await ensureProfilesFor(batch);

      window.__CERERI_ALL__ = window.__CERERI_ALL__.concat(batch);
      window.__CERERI_ALL__ = sortSolvedLast(window.__CERERI_ALL__);

      if (!Array.isArray(window.__CERERI_FILTERED__)) {
        renderGridFromMode();
      }

      if (isIndex) {
        hasMore = false;
        setBtnVisible(false);
        window.dispatchEvent(
          new CustomEvent("cereri:updated", { detail: window.__CERERI_ALL__ })
        );
        return;
      }

      if (snap.size < pageSize) {
        hasMore = false;
        setBtnVisible(false);
      } else {
        setBtnVisible(true);
      }

      window.dispatchEvent(
        new CustomEvent("cereri:updated", { detail: window.__CERERI_ALL__ })
      );
    } catch (e) {
      console.warn("[cereri-feed] load failed:", e);
      grid.innerHTML = `<div class="card">Eroare la incarcare cereri: ${escapeHtml(e?.message || String(e))}</div>`;
      setBtnVisible(false);
    } finally {
      loading = false;
    }
  }

  if (btnMore) {
    btnMore.addEventListener("click", () => {
      loadPage();
    });
  }

  window.addEventListener("cereri:filter", async (e) => {
    const list = Array.isArray(e.detail) ? e.detail : [];
    window.__CERERI_FILTERED__ = list;
    await ensureProfilesFor(list);
    renderGrid(list);
  });

  window.addEventListener("cereri:filterReset", () => {
    window.__CERERI_FILTERED__ = null;
    renderGridFromMode();
  });

  await loadPage();
}