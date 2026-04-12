// cereri-tabs.js
// Adauga in cereri.html, in <script type="module">:
//   import { initCereriTabs } from "./cereri-tabs.js";
//   initCereriTabs();
// (apeleaza DUPA initCereriFeed si initCereriFilters)

const NEW_DAYS = 3;     // "Noi" = postate in ultimele N zile
const OLD_DAYS = 30;    // "Vechi" = fara activitate de peste N zile

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

function isSolved(r) {
  return !!(r?.solved || r?.status === "solved");
}

function getActivityMs(r) {
  return (
    tsMillis(r?.lastActivityAt) ||
    tsMillis(r?.updatedAt) ||
    tsMillis(r?.createdAt) ||
    0
  );
}

function isNew(r) {
  if (isSolved(r)) return false;

  const ms = tsMillis(r?.createdAt);
  if (!ms) return false;

  const diffDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return diffDays <= NEW_DAYS;
}

function isOld(r) {
  if (isSolved(r)) return false;

  const ms = getActivityMs(r);
  if (!ms) return false;

  const diffDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return diffDays > OLD_DAYS;
}

function isOpenActive(r) {
  if (isSolved(r)) return false;
  return !isOld(r);
}

/* ── Injecteaza HTML-ul topbar + tabs inaintea grid-ului ── */
function injectTabsUI() {
  const section = document.querySelector(".requests-section");
  if (!section) return;

  if (document.getElementById("cereriTabsWrap")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="cereri-topbar" id="cereriTopbar">
      <div class="cereri-topbar-left">
        <span class="cereri-topbar-badge">Printatori</span>
        <span class="cereri-topbar-text">
          Scrie primul in chat · cere detalii (poze, material, termen)
        </span>
      </div>
      <div class="cereri-topbar-right">
        <a class="btn btn-orange" href="./cere.html" style="height:38px;font-size:13.5px;padding:0 16px;border-radius:11px;">
          + Posteaza cerere
        </a>
      </div>
    </div>

    <div class="cereri-tabs-wrap" id="cereriTabsWrap">
      <div class="cereri-tabs" role="tablist" id="cereriTabs">
        <button class="cereri-tab" data-tab="all" role="tab" aria-selected="false">
          <span class="tab-dot tab-dot-all"></span>
          <span class="tab-label">Toate</span>
          <span class="tab-count" id="cnt-all">—</span>
        </button>

        <button class="cereri-tab active" data-tab="open" role="tab" aria-selected="true">
          <span class="tab-dot tab-dot-open"></span>
          <span class="tab-label">Nerezolvate</span>
          <span class="tab-count" id="cnt-open">—</span>
        </button>

        <button class="cereri-tab" data-tab="new" role="tab" aria-selected="false">
          <span class="tab-dot tab-dot-new"></span>
          <span class="tab-label">Noi</span>
          <span class="tab-count" id="cnt-new">—</span>
        </button>

        <button class="cereri-tab" data-tab="old" role="tab" aria-selected="false">
          <span class="tab-dot tab-dot-old"></span>
          <span class="tab-label">Vechi</span>
          <span class="tab-count" id="cnt-old">—</span>
        </button>

        <button class="cereri-tab" data-tab="solved" role="tab" aria-selected="false">
          <span class="tab-dot tab-dot-solved"></span>
          <span class="tab-label">Rezolvate</span>
          <span class="tab-count" id="cnt-solved">—</span>
        </button>
      </div>

      <div class="cereri-status-row" id="cereriStatusRow" style="display:none;">
        <span class="status-dot-live"></span>
        <span id="cereriStatusText"></span>
      </div>
    </div>
  `;

  const grid = section.querySelector("#cereriGrid");
  if (grid) {
    section.insertBefore(wrap, grid);
  } else {
    section.prepend(wrap);
  }
}

/* ── Calculeaza counts si aplica filtrul activ ── */
let _activeTab = "open"; // default: Nerezolvate

function updateCounts(all) {
  const total = all.length;
  const solved = all.filter(isSolved).length;
  const open = all.filter(isOpenActive).length;
  const newC = all.filter(isNew).length;
  const oldC = all.filter(isOld).length;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  set("cnt-all", total);
  set("cnt-open", open);
  set("cnt-new", newC);
  set("cnt-old", oldC);
  set("cnt-solved", solved);
}

function filterByTab(all, tab) {
  switch (tab) {
    case "all":
      return all;

    case "open":
      return all.filter(isOpenActive);

    case "new":
      return all.filter(isNew);

    case "old":
      return all.filter(isOld);

    case "solved":
      return all.filter(isSolved);

    default:
      return all;
  }
}

function tabLabel(tab) {
  const map = {
    all: "toate cererile",
    open: "cererile nerezolvate active",
    new: `cererile noi (ultimele ${NEW_DAYS} zile)`,
    old: `cererile vechi (fara activitate de peste ${OLD_DAYS} zile)`,
    solved: "cererile rezolvate"
  };
  return map[tab] || tab;
}

function applyTab(tab, all) {
  _activeTab = tab;

  document.querySelectorAll(".cereri-tab").forEach((btn) => {
    const isActive = btn.getAttribute("data-tab") === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  const filtered = filterByTab(all, tab);

  const statusRow = document.getElementById("cereriStatusRow");
  const statusText = document.getElementById("cereriStatusText");

  if (statusRow && statusText) {
    if (filtered.length > 0) {
      statusRow.style.display = "flex";
      statusText.textContent = `${filtered.length} ${tabLabel(tab)}`;
    } else {
      statusRow.style.display = "none";
      statusText.textContent = "";
    }
  }

  if (filtered.length === all.length) {
    window.dispatchEvent(new CustomEvent("cereri:filterReset"));
  } else {
    window.dispatchEvent(new CustomEvent("cereri:filter", { detail: filtered }));
  }
}

/* ── Event listeners pe tabs ── */
function bindTabs() {
  const tabsEl = document.getElementById("cereriTabs");
  if (!tabsEl) return;

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cereri-tab");
    if (!btn) return;

    const tab = btn.getAttribute("data-tab");
    if (!tab) return;

    const all = window.__CERERI_ALL__ || [];
    applyTab(tab, all);
  });
}

/* ── Entry point ── */
export function initCereriTabs() {
  injectTabsUI();
  bindTabs();

  window.addEventListener("cereri:updated", (e) => {
    const all = Array.isArray(e.detail) ? e.detail : (window.__CERERI_ALL__ || []);
    updateCounts(all);
    applyTab(_activeTab, all);
  });
}