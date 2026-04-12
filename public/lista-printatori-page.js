/**
 * lista-printatori-page.js — v3
 * Fix-uri:
 *  - Rating calculat corect din subcollection reviews
 *  - Online presence check per printer
 *  - Badge 3D pe avatar
 *  - Stele vizuale
 *  - Filter by name/city + sort
 *  - Link catre /profil-printator.html in loc de /profil.html
 */

import { db } from "./firebase-init.js";
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

function getLastSeenMs(u) {
  return Math.max(
    Number(u.__lastSeen || 0),
    tsMs(u.printerLastActiveAt),
    tsMs(u.lastActiveAt),
    tsMs(u.lastSeenAt),
    tsMs(u.updatedAt)
  );
}

function isOnlineNowFromMs(ms) {
  return !!ms && (Date.now() - ms) <= (5 * 60 * 1000);
}

function timeAgo(ms) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "acum";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ore`;
  const d = Math.floor(h / 24);
  if (d < 30) return `acum ${d} zile`;
  return new Date(ms).toLocaleDateString("ro-RO", { year:"numeric", month:"2-digit", day:"2-digit" });
}

function starsHtml(avg) {
  const r = Math.round(Math.max(0, Math.min(5, avg)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

/* ===== RATING FROM SUBCOLLECTION ===== */
async function computeRating(uid, fallbackAvg, fallbackCount) {
  if (fallbackAvg > 0 && fallbackCount > 0) {
    return { avg: fallbackAvg, count: fallbackCount };
  }
  try {
    const snap = await getDocs(collection(db, "users", uid, "reviews"));
    let sum = 0, count = 0;
    snap.forEach(d => {
      const r = Number(d.data()?.rating || 0);
      if (r >= 1 && r <= 5) { sum += r; count++; }
    });
    return { avg: count ? sum / count : 0, count };
  } catch { return { avg: fallbackAvg, count: fallbackCount }; }
}

/* ===== SOLVED COUNT ===== */
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

/* ===== ONLINE MAP ===== */
async function getOnlineMap() {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const snap = await getDocs(query(
      collection(db, "presence"),
      where("lastSeen", ">=", cutoff)
    ));
    const map = new Map();
    snap.forEach(d => {
      const p = d.data() || {};
      const uid = (p.uid || "").trim();
      if (!uid) return;
      const ms = tsMs(p.lastSeen);
      if (ms > (map.get(uid) || 0)) map.set(uid, ms);
    });
    return map;
  } catch { return new Map(); }
}

/* ===== RENDER CARD ===== */
function renderCard(u) {
  const uid = u.uid || "";
  const name = esc(u.name || "Printator");
  const avatar = esc(u.avatarUrl || "/assets/avatar-placeholder.svg");
  const city = esc(u.printerCity || u.city || "Romania");
  const bio = esc(u.printerBio || u.bio || "Printator 3D activ pe Cere3D.");
  const ratingAvg = Number(u.__ratingAvg || 0);
  const ratingCount = Number(u.__ratingCount || 0);
  const solved = Number(u.printerSolvedCount || 0);
  const isOnline = !!u.__isOnline;
  const lastActive = getLastSeenMs(u);

  return `
    <article class="lp-card" itemscope itemtype="https://schema.org/Person">
      <div class="lp-top">
        <div class="lp-avatar-wrap">
          <a href="/profil-printator.html?uid=${encodeURIComponent(uid)}" aria-label="Profil ${name}">
            <img class="lp-avatar" src="${avatar}" alt="Avatar printator ${name}"
              itemprop="image" loading="lazy" decoding="async" />
            <span class="lp-badge-3d" title="Printator 3D verificat Cere3D">3D</span>
          </a>
        </div>
        <div style="min-width:0;flex:1;">
          <div class="lp-name-row">
            <a class="lp-name" href="/profil-printator.html?uid=${encodeURIComponent(uid)}" itemprop="name">${name}</a>
            <span class="lp-chip">🖨️</span>
            ${isOnline ? `<span class="lp-chip lp-chip-online"><span class="lp-online-dot"></span>Online</span>` : `<span class="lp-chip">Ultima activitate</span>`}
          </div>
          <div class="lp-meta">📍 ${city}${isOnline ? " · activ acum" : lastActive ? ` · vazut ${esc(timeAgo(lastActive))}` : " · fara activitate recenta"}</div>
        </div>
      </div>

      <div class="lp-rating-row" itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
        <span class="lp-stars">${starsHtml(ratingAvg)}</span>
        <span class="lp-rating-num" itemprop="ratingValue">${ratingAvg > 0 ? ratingAvg.toFixed(1) : "—"}</span>
        <span class="lp-rating-count" itemprop="reviewCount">(${ratingCount} recenzii)</span>
      </div>

      <p class="lp-desc" itemprop="description">${bio}</p>

      <div class="lp-stats">
        <span class="lp-stat">✔ ${solved} rezolvate</span>
        ${ratingCount > 0 ? `<span class="lp-stat">⭐ ${ratingAvg.toFixed(1)}/5</span>` : ""}
      </div>

      <a class="btn btn-blue btn-soft" href="/profil-printator.html?uid=${encodeURIComponent(uid)}"
        style="width:100%;justify-content:center;margin-top:4px;">
        Vezi profilul →
      </a>
    </article>
  `;
}

/* ===== MAIN ===== */
export async function initListaPrintatoriPage() {
  const grid = $("printersPublicGrid");
  const countStat = $("printersCountStat");
  const filterSearch = $("filterSearch");
  const filterSort = $("filterSort");
  const noResults = $("noResults");

  if (!grid) return;

  grid.innerHTML = `<div class="lp-empty">Se incarca printatorii...</div>`;

  let allList = [];

  try {
    const snap = await getDocs(query(
      collection(db, "users"),
      where("isPrinter", "==", true),
      where("printerVisible", "==", true)
    ));

    const rawList = [];
    snap.forEach(d => rawList.push({ uid: d.id, ...(d.data() || {}) }));

    // Online map
    const onlineMap = await getOnlineMap();

    // Enrich (parallel)
    await Promise.all(rawList.map(async (item) => {
      // Solved count
      if (!(item.printerSolvedCount > 0)) {
        item.printerSolvedCount = await getSolvedCount(item.uid);
      }
      // Rating
      const { avg, count } = await computeRating(
        item.uid,
        Number(item.ratingAvg || item.rating || 0),
        Number(item.ratingCount || item.reviewsCount || 0)
      );
      item.__ratingAvg = avg;
      item.__ratingCount = count;
      // Online
      item.__lastSeen = Math.max(
        onlineMap.get(item.uid) || 0,
        tsMs(item.printerLastActiveAt),
        tsMs(item.lastActiveAt),
        tsMs(item.lastSeenAt),
        tsMs(item.updatedAt)
      );
      item.__isOnline = isOnlineNowFromMs(item.__lastSeen);
    }));

    allList = rawList;

    if (countStat) countStat.textContent = String(allList.length);

    renderFiltered();

  } catch (e) {
    console.error("[lista-printatori] load failed:", e);
    grid.innerHTML = `<div class="lp-empty">Eroare la incarcare. Incearca din nou.</div>`;
  }

  /* ===== FILTER + SORT ===== */
  function sortList(list, sortBy) {
    return [...list].sort((a, b) => {
      if (sortBy === "rating") return (b.__ratingAvg || 0) - (a.__ratingAvg || 0);
      if (sortBy === "recent") return (b.__lastSeen || 0) - (a.__lastSeen || 0);
      // default: solved
      const sdiff = (b.printerSolvedCount || 0) - (a.printerSolvedCount || 0);
      if (sdiff !== 0) return sdiff;
      return (b.__ratingAvg || 0) - (a.__ratingAvg || 0);
    });
  }

  function renderFiltered() {
    const search = (filterSearch?.value || "").toLowerCase().trim();
    const sort = filterSort?.value || "solved";

    let filtered = allList.filter(u => {
      if (!search) return true;
      const name = (u.name || "").toLowerCase();
      const city = (u.printerCity || u.city || "").toLowerCase();
      const bio = (u.printerBio || u.bio || "").toLowerCase();
      return name.includes(search) || city.includes(search) || bio.includes(search);
    });

    filtered = sortList(filtered, sort);

    if (filtered.length === 0) {
      grid.innerHTML = "";
      if (noResults) noResults.style.display = "";
    } else {
      if (noResults) noResults.style.display = "none";
      grid.innerHTML = filtered.map(renderCard).join("");
    }
  }

  filterSearch?.addEventListener("input", renderFiltered);
  filterSort?.addEventListener("change", renderFiltered);
}
