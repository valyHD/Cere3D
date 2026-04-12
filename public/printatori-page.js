/**
 * printatori-page.js — v5
 * Fix-uri majore:
 *  - rating calculat corect din subcollection reviews (nu doar din user doc)
 *  - online presence robust
 *  - top printers correct sort
 *  - badge 3D spectaculos pe avatar
 *  - card-uri cu stele vizuale
 *  - auto-handle action=join-printer din URL
 */

import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  Timestamp,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ===== UTILS ===== */

function $(id) { return document.getElementById(id); }

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tsMs(x) {
  try {
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  } catch { return 0; }
}

function timeAgo(ms) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "acum cateva secunde";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ore`;
  const d = Math.floor(h / 24);
  if (d < 30) return `acum ${d} zile`;
  const dt = new Date(ms);
  return dt.toLocaleDateString("ro-RO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function starsHtml(avg) {
  const r = Math.round(Math.max(0, Math.min(5, avg)));
  const full = "★".repeat(r);
  const empty = "☆".repeat(5 - r);
  return `<span class="pr-stars">${full}${empty}</span>`;
}

function setStatus(text) {
  const el = $("printerJoinStatus");
  if (el) el.textContent = text || "";
}

/* ===== FIELD GETTERS ===== */

function getMonthlySolved(u) { return Number(u.printerSolvedMonthCount || 0); }
function getTotalSolved(u) { return Number(u.printerSolvedCount || 0); }

function getRatingAvg(u) {
  return Number(u.__computedRatingAvg ?? u.ratingAvg ?? u.rating ?? u.avgRating ?? 0) || 0;
}

function getRatingCount(u) {
  return Number(u.__computedRatingCount ?? u.ratingCount ?? u.reviewsCount ?? u.reviewCount ?? 0) || 0;
}

/* ===== FIRESTORE HELPERS ===== */

async function getSolvedCount(uid) {
  try {
    const agg = await getCountFromServer(query(
      collection(db, "cereri"),
      where("selectedMakerUid", "==", uid),
      where("status", "==", "solved")
    ));
    return agg.data().count || 0;
  } catch { return 0; }
}

/**
 * Calculeaza rating din subcollection reviews (sursa de adevar)
 * Daca exista date pe user doc le folosim ca fallback rapid.
 */
async function computeReviewStats(uid, fallbackAvg, fallbackCount) {
  // Daca avem deja date reale pe user doc, le returnam (vor fi sincronizate de server)
  if (fallbackAvg > 0 && fallbackCount > 0) {
    return { avg: fallbackAvg, count: fallbackCount };
  }
  // Altfel calculam din subcollection
  try {
    const snap = await getDocs(collection(db, "users", uid, "reviews"));
    let sum = 0, count = 0;
    snap.forEach((d) => {
      const r = Number(d.data()?.rating || 0);
      if (r >= 1 && r <= 5) { sum += r; count++; }
    });
    return { avg: count ? (sum / count) : 0, count };
  } catch { return { avg: fallbackAvg, count: fallbackCount }; }
}

async function getOnlinePresenceMap() {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const snap = await getDocs(query(
      collection(db, "presence"),
      where("lastSeen", ">=", cutoff)
    ));
    const map = new Map();
    snap.forEach((d) => {
      const p = d.data() || {};
      const uid = (p.uid || "").toString().trim();
      if (!uid) return;
      const ms = tsMs(p.lastSeen);
      if (ms > (map.get(uid) || 0)) map.set(uid, ms);
    });
    return map;
  } catch (e) {
    console.warn("[printatori] presence failed:", e);
    return new Map();
  }
}

/* ===== SORT FUNCTIONS ===== */

function stableSortPrinters(list) {
  return [...list].sort((a, b) => {
    const diff = getTotalSolved(b) - getTotalSolved(a);
    if (diff !== 0) return diff;
    const rdiff = getRatingAvg(b) - getRatingAvg(a);
    if (rdiff !== 0) return rdiff;
    return getRatingCount(b) - getRatingCount(a);
  });
}

function sortTopPrinters(list) {
  return [...list].sort((a, b) => {
    const mdiff = getMonthlySolved(b) - getMonthlySolved(a);
    if (mdiff !== 0) return mdiff;
    const sdiff = getTotalSolved(b) - getTotalSolved(a);
    if (sdiff !== 0) return sdiff;
    return getRatingAvg(b) - getRatingAvg(a);
  });
}

function getLastSeenMs(u) {
  return Number(
    u.__onlineLastSeen ||
    tsMs(u.printerLastActiveAt) ||
    tsMs(u.lastActiveAt) ||
    0
  );
}

function sortLiveAndRecentPrinters(list) {
  return [...list].sort((a, b) => {
    // intai online
    if (!!a.__isOnline !== !!b.__isOnline) {
      return a.__isOnline ? -1 : 1;
    }

    // apoi dupa last seen / activity
    const ad = getLastSeenMs(a);
    const bd = getLastSeenMs(b);
    if (bd !== ad) return bd - ad;

    // apoi dupa solved
    const sdiff = getTotalSolved(b) - getTotalSolved(a);
    if (sdiff !== 0) return sdiff;

    // apoi rating
    return getRatingAvg(b) - getRatingAvg(a);
  });
}
/* ===== RENDER FUNCTIONS ===== */

function renderPrinterCard(u) {
  const uid = u.uid || "";
  const name = esc(u.name || "Printator");
  const avatar = esc(u.avatarUrl || "/assets/avatar-placeholder.svg");
  const city = esc(u.printerCity || u.city || "Romania");
  const bio = esc(u.printerBio || u.bio || "Printator 3D activ pe Cere3D.");
  const ratingAvg = getRatingAvg(u);
  const ratingCount = getRatingCount(u);
  const solved = getTotalSolved(u);
  const isOnline = !!u.__isOnline;
const lastActiveMs = getLastSeenMs(u);

  return `
    <article class="pr-card" itemscope itemtype="https://schema.org/Person">
      <div class="pr-card-top">
        <div class="pr-avatar-wrap">
          <a href="/profil-printator.html?uid=${encodeURIComponent(uid)}" aria-label="Profil ${name}">
            <img class="pr-avatar" src="${avatar}" alt="Avatar printator ${name}"
              itemprop="image" loading="lazy" decoding="async" />
            <span class="pr-badge-3d" title="Printator 3D verificat Cere3D" aria-label="Printator 3D">3D</span>
          </a>
        </div>
        <div style="min-width:0;flex:1;">
          <div class="pr-name-row">
            <a class="pr-name-link" href="/profil-printator.html?uid=${encodeURIComponent(uid)}" itemprop="name">${name}</a>
            <span class="pr-chip">🖨️ Printator</span>
${isOnline
  ? `<span class="pr-chip pr-chip-green"><span class="pr-online-dot"></span>Online acum</span>`
  : `<span class="pr-chip pr-chip-orange">Ultima activitate</span>`
}          </div>
<div class="pr-meta-line" itemprop="address">
  📍 ${city}${isOnline ? " · activ acum" : lastActiveMs ? ` · vazut ${esc(timeAgo(lastActiveMs))}` : " · fara activitate recenta"}
</div>
        </div>
      </div>

      <div class="pr-rating-row" itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
        ${starsHtml(ratingAvg)}
        <span class="pr-rating-num" itemprop="ratingValue">${ratingAvg.toFixed(1)}</span>
        <span class="pr-rating-count" itemprop="reviewCount">(${ratingCount} review-uri)</span>
      </div>

      <p class="pr-desc" itemprop="description">${bio}</p>

      <div class="pr-stats">
        <span class="pr-stat">✔ ${solved} rezolvate</span>
        ${ratingCount > 0 ? `<span class="pr-stat">⭐ ${ratingAvg.toFixed(1)}/5</span>` : ""}
      </div>

      <div class="pr-card-cta">
        <a class="btn btn-blue btn-soft" href="/profil-printator.html?uid=${encodeURIComponent(uid)}">
          Vezi profilul →
        </a>
      </div>
    </article>
  `;
}

function renderTopPrinterCard(u, rank) {
  const uid = u.uid || "";
  const name = esc(u.name || "Printator");
  const avatar = esc(u.avatarUrl || "/assets/avatar-placeholder.svg");
  const city = esc(u.printerCity || u.city || "Romania");
  const bio = esc(u.printerBio || u.bio || "Printator 3D activ pe Cere3D.");
  const ratingAvg = getRatingAvg(u);
  const ratingCount = getRatingCount(u);
  const solvedMonth = getMonthlySolved(u);
  const solvedTotal = getTotalSolved(u);
  const isOnline = !!u.__isOnline;

  const rankClass = rank === 1 ? "pr-rank-1" : rank === 2 ? "pr-rank-2" : rank === 3 ? "pr-rank-3" : "pr-rank-other";
  const rankLabel = rank === 1 ? "🥇 #1 Luna aceasta" : rank === 2 ? "🥈 #2 Luna aceasta" : rank === 3 ? "🥉 #3 Luna aceasta" : `#${rank} Luna aceasta`;

  return `
    <article class="pr-card" itemscope itemtype="https://schema.org/Person">
      <div class="pr-rank-badge ${rankClass}">${rankLabel}</div>

      <div class="pr-card-top">
        <div class="pr-avatar-wrap">
          <a href="/profil-printator.html?uid=${encodeURIComponent(uid)}">
            <img class="pr-avatar" src="${avatar}" alt="Printator top ${name}"
              loading="lazy" decoding="async" itemprop="image" />
            <span class="pr-badge-3d" title="Printator 3D verificat">3D</span>
          </a>
        </div>
        <div style="min-width:0;flex:1;">
          <div class="pr-name-row">
            <a class="pr-name-link" href="/profil-printator.html?uid=${encodeURIComponent(uid)}" itemprop="name">${name}</a>
            ${isOnline ? `<span class="pr-chip pr-chip-green"><span class="pr-online-dot"></span>Online</span>` : ""}
          </div>
          <div class="pr-meta-line">📍 ${city}</div>
        </div>
      </div>

      <div class="pr-rating-row">
        ${starsHtml(ratingAvg)}
        <span class="pr-rating-num">${ratingAvg.toFixed(1)}</span>
        <span class="pr-rating-count">(${ratingCount} review-uri)</span>
      </div>

      <p class="pr-desc">${bio}</p>

      <div class="pr-stats">
        <span class="pr-stat">🏆 ${solvedMonth} luna asta</span>
        <span class="pr-stat">✔ ${solvedTotal} total</span>
      </div>

      <div class="pr-card-cta">
        <a class="btn btn-blue btn-soft" href="/profil-printator.html?uid=${encodeURIComponent(uid)}">
          Vezi profilul →
        </a>
      </div>
    </article>
  `;
}

/* ===== ACTIVATE PRINTER ===== */

async function activateCurrentUserAsPrinter(currentUser) {
  const userRef = doc(db, "users", currentUser.uid);

  const localSnap = await getDoc(userRef);
  const data = localSnap.exists() ? (localSnap.data() || {}) : {};

  const alreadyPrinter = data.isPrinter === true && data.printerVisible === true;

  const payload = {
    uid: currentUser.uid,
    email: currentUser.email || data.email || "",
    name: (data.name || currentUser.displayName || "User").trim(),
    nameLower: (data.name || currentUser.displayName || "User").trim().toLowerCase(),
    avatarUrl: data.avatarUrl || currentUser.photoURL || "",
    bio: data.bio || "",
    city: data.city || "",

    // marker clar si permanent
    wantsPrinter: true,

    // campurile reale de printer
    isPrinter: true,
    printerVisible: true,
    printerBadge: true,

    printerJoinedAt: data.printerJoinedAt || serverTimestamp(),
    printerBio: (data.printerBio || data.bio || "").trim(),
    printerCity: (data.printerCity || data.city || "").trim(),
    printerSolvedCount: Number(data.printerSolvedCount || 0),
    printerSolvedMonthCount: Number(data.printerSolvedMonthCount || 0),
    printerLastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  };

  await setDoc(userRef, payload, { merge: true });

  // verificare REALA din server, nu doar local/cache
  const verifySnap = await getDocFromServer(userRef);
  const verifyData = verifySnap.exists() ? (verifySnap.data() || {}) : {};

  if (!(verifyData.isPrinter === true && verifyData.printerVisible === true)) {
    throw new Error("Profilul nu a ramas salvat ca printator pe server.");
  }

  console.log("[PRINTATOR VERIFY OK]", currentUser.uid, verifyData);

  return { alreadyPrinter, uid: currentUser.uid };
}
/* ===== LOAD PRINTERS ===== */

async function loadPrinters(topGrid, grid, countStat, resolvedMonthStat, reviewsStat) {
  if (grid) grid.innerHTML = `<div class="pr-empty">Se incarca printatorii...</div>`;
  if (topGrid) topGrid.innerHTML = `<div class="pr-empty">Se incarca topul...</div>`;

  try {
    const snap = await getDocs(query(
      collection(db, "users"),
      where("isPrinter", "==", true)
    ));

    let list = [];
    snap.forEach((d) => list.push({ uid: d.id, ...(d.data() || {}) }));
    list = list.filter(u => u.printerVisible !== false);

    // Presence map
    const onlineMap = await getOnlinePresenceMap();
    for (const item of list) {
      item.__onlineLastSeen = onlineMap.get(item.uid) || 0;
      item.__isOnline = !!item.__onlineLastSeen;
    }

    // Enrich data — solved count + reviews (parallel per user)
    await Promise.all(list.map(async (item) => {
      // Solved count
      if (!getTotalSolved(item)) {
        item.printerSolvedCount = await getSolvedCount(item.uid);
      }

      // Rating — always compute from subcollection if user doc has no data
      const { avg, count } = await computeReviewStats(
        item.uid,
        Number(item.ratingAvg || item.rating || 0),
        Number(item.ratingCount || item.reviewsCount || 0)
      );
      item.__computedRatingAvg = avg;
      item.__computedRatingCount = count;
    }));

    const sorted = stableSortPrinters(list);

    // KPI stats
    if (countStat) countStat.textContent = String(sorted.length);

    const totalSolvedMonth = sorted.reduce((s, x) => s + getMonthlySolved(x), 0);
    if (resolvedMonthStat) resolvedMonthStat.textContent = String(totalSolvedMonth);

    const ratingValues = sorted
      .map(x => getRatingAvg(x))
      .filter(x => x > 0);
    const avgRating = ratingValues.length
      ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1)
      : "—";
    if (reviewsStat) reviewsStat.textContent = avgRating;

    // TOP section
    if (topGrid) {
      const topList = sortTopPrinters(sorted).slice(0, 6);
      topGrid.innerHTML = topList.length
        ? topList.map((u, i) => renderTopPrinterCard(u, i + 1)).join("")
        : `<div class="pr-empty">Nu exista inca suficienta activitate pentru topul lunar. Fii primul!</div>`;
    }

    // ONLINE section
// LIVE + RECENT section
if (grid) {
  const liveCount = sorted.filter(u => !!u.__isOnline).length;
  const mixedList = sortLiveAndRecentPrinters(sorted).slice(0, 6);

  grid.innerHTML = mixedList.length
    ? mixedList.map(renderPrinterCard).join("")
    : `<div class="pr-empty">Momentan nu exista printatori disponibili in lista publica.</div>`;

  const sectionTitle = document.querySelector("#online-printatori .pr-section-sub");
  if (sectionTitle) {
    if (liveCount > 0) {
      sectionTitle.textContent = "Printatori online recent. In top vezi maxim 6. Daca nu sunt destui live, afisam si ultimii activi.";
    } else {
      sectionTitle.textContent = "Momentan nu este nimeni live. Mai jos vezi ultimii printatori activi.";
    }
  }
}

  } catch (e) {
    console.error("[printatori] load failed:", e);
    if (grid) grid.innerHTML = `<div class="pr-empty">Eroare la incarcare. Incearca din nou.</div>`;
    if (topGrid) topGrid.innerHTML = `<div class="pr-empty">Eroare la incarcare top.</div>`;
  }
}

/* ===== MAIN INIT ===== */

export async function initPrintatoriPage() {
  const topGrid = $("topPrintersGrid");
  const grid = $("printersPublicGrid");
  const countStat = $("printersCountStat");
  const resolvedMonthStat = $("resolvedMonthStat");
  const reviewsStat = $("reviewsStat");

  const joinLoggedOut = $("printerJoinLoggedOut");
  const joinLoggedIn = $("printerJoinLoggedIn");
  const joinDone = $("printerJoinDone");

  const btnJoinPrinter = $("btnJoinPrinter");
  const btnBecomePrinterLoggedIn = $("btnBecomePrinterLoggedIn");
  const btnJoinPrinterBottom = $("btnJoinPrinterBottom");

  // Check if we should auto-trigger join (after auth redirect)
  const urlParams = new URLSearchParams(location.search);
  const autoJoin = urlParams.get("action") === "join-printer";

  async function handleBecomePrinterClick() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.location.href = "/auth.html?return=/printatori.html%3Faction%3Djoin-printer";
      return;
    }
    try {
      setStatus("Se activeaza profilul de printator...");

      // Disable buttons during operation
      [btnJoinPrinter, btnBecomePrinterLoggedIn, btnJoinPrinterBottom].forEach(b => {
        if (b) b.disabled = true;
      });

      const result = await activateCurrentUserAsPrinter(currentUser);
      const verified = await getDocFromServer(doc(db, "users", currentUser.uid));
console.log("[AFTER CLICK SERVER DOC]", verified.data());
      setStatus("Profilul de printator a fost activat! ✅");

      if (joinLoggedIn) joinLoggedIn.style.display = "none";
      if (joinLoggedOut) joinLoggedOut.style.display = "none";

      if (joinDone) {
        joinDone.style.display = "";
        joinDone.innerHTML = `
          <div class="note" style="background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.25);">
            <strong>🎉 ${result.alreadyPrinter ? "Esti deja printator!" : "Profilul tau de printator este activ!"}</strong><br>
            Apari acum in lista publica cu badge de printator 3D. Completeaza-ti profilul pentru mai multa vizibilitate.
            <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
              <a class="btn btn-orange" href="/profil-printator.html?uid=${encodeURIComponent(currentUser.uid)}">
                🖨️ Profilul meu de printator
              </a>
              <a class="btn btn-blue btn-soft" href="/lista-printatori.html">
                Vezi toti printatorii
              </a>
            </div>
          </div>
        `;
      }

      // Reload list
      await loadPrinters(topGrid, grid, countStat, resolvedMonthStat, reviewsStat);

    } catch (e) {
      console.error("[printatori] activate failed:", e);
      setStatus(e?.message || "Eroare la activare. Incearca din nou.");
      [btnJoinPrinter, btnBecomePrinterLoggedIn, btnJoinPrinterBottom].forEach(b => {
        if (b) b.disabled = false;
      });
    }
  }

  // Bind all CTA buttons
  [btnJoinPrinter, btnBecomePrinterLoggedIn, btnJoinPrinterBottom].forEach(btn => {
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", handleBecomePrinterClick);
    }
  });

  // Auth state
  onAuthStateChanged(auth, async (u) => {
    document.body.classList.remove("auth-loading");

    if (!u) {
      if (joinLoggedOut) joinLoggedOut.style.display = "";
      if (joinLoggedIn) joinLoggedIn.style.display = "none";
      if (joinDone) joinDone.style.display = "none";
      await loadPrinters(topGrid, grid, countStat, resolvedMonthStat, reviewsStat);
      return;
    }

    try {
let data = await normalizePrinterUserDoc(u);
data = await repairPrinterFlagsIfNeeded(u, data);

// update activitate pentru userul curent
await setDoc(doc(db, "users", u.uid), {
  lastSeenAt: serverTimestamp(),
  ...(data.isPrinter === true ? { printerLastActiveAt: serverTimestamp() } : {}),
  updatedAt: serverTimestamp()
}, { merge: true });

console.log("[PRINTATOR AUTH STATE]", u.uid, data);
      if (data.isPrinter) {
        if (joinLoggedOut) joinLoggedOut.style.display = "none";
        if (joinLoggedIn) joinLoggedIn.style.display = "none";
        if (joinDone) {
          joinDone.style.display = "";
          joinDone.innerHTML = `
            <div class="note">
              ✅ Esti deja inscris ca printator.
              <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
                <a class="btn btn-orange" href="/profil-printator.html?uid=${encodeURIComponent(u.uid)}">
                  🖨️ Profilul meu de printator
                </a>
                <a class="btn btn-blue btn-soft" href="/lista-printatori.html">
                  Toti printatorii
                </a>
              </div>
            </div>
          `;
        }
      } else {
        if (joinLoggedOut) joinLoggedOut.style.display = "none";
        if (joinDone) joinDone.style.display = "none";
        if (joinLoggedIn) joinLoggedIn.style.display = "";

        // Auto-join if redirected from auth
        if (autoJoin) {
          setTimeout(() => handleBecomePrinterClick(), 300);
        }
      }

      await loadPrinters(topGrid, grid, countStat, resolvedMonthStat, reviewsStat);

    } catch (e) {
      console.error("[printatori] init failed:", e);
    }
  });
}

async function normalizePrinterUserDoc(currentUser) {
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? (snap.data() || {}) : {};

  // daca nu exista deloc, cream documentul minim
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: currentUser.uid,
      email: currentUser.email || "",
      name: (currentUser.displayName || "User").trim(),
      nameLower: (currentUser.displayName || "User").trim().toLowerCase(),
      avatarUrl: currentUser.photoURL || "",
      bio: "",
      city: "",
      isPrinter: false,
      printerVisible: false,
      printerBadge: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp()
    }, { merge: true });

    return {
      uid: currentUser.uid,
      email: currentUser.email || "",
      name: (currentUser.displayName || "User").trim(),
      nameLower: (currentUser.displayName || "User").trim().toLowerCase(),
      avatarUrl: currentUser.photoURL || "",
      bio: "",
      city: "",
      isPrinter: false,
      printerVisible: false,
      printerBadge: false
    };
  }

  // daca documentul exista, doar il returnam
  return data;
}
async function repairPrinterFlagsIfNeeded(currentUser, data) {
  const userRef = doc(db, "users", currentUser.uid);

  // daca userul a fost deja activat candva, dar campurile s-au pierdut,
  // le refacem automat
  if (data.wantsPrinter === true && (data.isPrinter !== true || data.printerVisible !== true)) {
    await setDoc(userRef, {
      wantsPrinter: true,
      isPrinter: true,
      printerVisible: true,
      printerBadge: true,
      printerLastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp()
    }, { merge: true });

    const fixedSnap = await getDocFromServer(userRef);
    const fixedData = fixedSnap.exists() ? (fixedSnap.data() || {}) : {};

    console.log("[PRINTATOR AUTO-REPAIR]", currentUser.uid, fixedData);
    return fixedData;
  }

  return data;
}