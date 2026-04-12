// index-recent.js
// Afiseaza pe homepage "Cereri recente" din Firestore (nu mock).

import { db } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeClass(material) {
  const m = (material || "").toLowerCase();
  if (m.includes("petg")) return "mat-badge mat-petg";
  if (m.includes("pla")) return "mat-badge mat-pla";
  return "mat-badge mat-unknown";
}

function formatBudget(budgetRaw) {
  const b = (budgetRaw ?? "").toString().trim();
  if (!b) return "Nu stiu";
  const lower = b.toLowerCase();
  if (lower.includes("lei")) return b;
  if (lower.includes("nu stiu") || lower.includes("nu știu")) return b;
  return `${b} lei`;
}

function findGridEl() {
  return document.getElementById("recentRequestsGrid")
    || document.querySelector("#cereri .requests-grid")
    || document.querySelector(".requests-section .requests-grid");
}

function setLoading(grid) {
  grid.innerHTML = `
    <article class="request-card">
      <div class="request-top">
        <div class="request-title">Se incarca...</div>
        <span class="mat-badge mat-unknown">...</span>
      </div>
      <div class="request-meta">
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
      </div>
    </article>
    <article class="request-card">
      <div class="request-top">
        <div class="request-title">Se incarca...</div>
        <span class="mat-badge mat-unknown">...</span>
      </div>
      <div class="request-meta">
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
      </div>
    </article>
    <article class="request-card">
      <div class="request-top">
        <div class="request-title">Se incarca...</div>
        <span class="mat-badge mat-unknown">...</span>
      </div>
      <div class="request-meta">
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
        <span class="meta-pill">...</span>
      </div>
    </article>
  `;
}

function renderEmpty(grid) {
  grid.innerHTML = `<div class="small-muted">Nu exista cereri inca. Posteaza prima cerere si va aparea aici.</div>`;
}

function renderItems(grid, items) {
  grid.innerHTML = items.map((r) => {
    const title = escapeHtml(r.title || "Cerere");
    const city = escapeHtml(r.city || "—");
    const budget = escapeHtml(formatBudget(r.budget || ""));
    const deadline = escapeHtml(r.deadline || "Oricand");
    const material = r.material || "Nu stiu";
    const blob = `${(r.title || "")} ${(r.description || "")}`.toLowerCase();
    const typeLabel = blob.includes("prototip") ? "Prototip" :
      (blob.includes("cadou") || blob.includes("personalizat") || blob.includes("decor")) ? "Personalizat" :
      (blob.includes("suport") || blob.includes("carcasa") || blob.includes("accesori")) ? "Obiect util" :
      "Piesa / reparatie";

    return `
      <article class="request-card request-card-click"
        onclick="location.href='/cerere.html?id=${encodeURIComponent(r.id)}'">
        <div class="request-top">
          <div class="request-title">${title}</div>
          <span class="${badgeClass(material)}">${escapeHtml(material)}</span>
        </div>
        <div class="request-meta">
          <span class="meta-pill">${city}</span>
          <span class="meta-pill">${escapeHtml(typeLabel)}</span>
          <span class="meta-pill">Buget: ${budget}</span>
          <span class="meta-pill">Termen: ${deadline}</span>
        </div>
      </article>
    `;
  }).join("");
}

export async function initRecentRequests() {
  const grid = findGridEl();
  if (!grid) return;

  setLoading(grid);

  try {
    const qy = query(
      collection(db, "cereri"),
      orderBy("createdAt", "desc"),
      limit(6)
    );

    const snap = await getDocs(qy);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));

    if (!items.length) return renderEmpty(grid);
    renderItems(grid, items);
  } catch (e) {
    console.warn("[index-recent] load failed:", e);
    grid.innerHTML = `<div class="small-muted">Nu am putut incarca cererile acum. Incearca refresh.</div>`;
  }
}

// auto-init
document.addEventListener("DOMContentLoaded", () => {
  initRecentRequests().catch(() => {});
});