// dm-page.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection, doc, getDoc, setDoc, addDoc,
  serverTimestamp, query, orderBy, onSnapshot,
  updateDoc, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getUserPublic,
  convoIdFor,
  getPublicProfileUrl,
  renderNameWithPrinterBadge,
  renderAvatarWithPrinterBadge
} from "./dm-utils.js";

/* ── Helpers ─────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* ── State ───────────────────────────────────────── */
let me          = null;
let currentCid  = null;
let unsubMsgs   = null;
let unsubHeader = null;
let lastInboxItems = [];

/* ─── Hydrate cooldown (repara inbox-uri vechi cu "User"/placeholder) ─── */
const _hydrateInFlight  = new Set();
const _hydrateLastOk    = new Map();
const HYDRATE_COOLDOWN  = 30_000; // ms

async function hydrateDmMeta(ownerUid, items) {
  const now = Date.now();
  const needs = items.filter(it => {
    const cid      = (it.cid || it.id || "").trim();
    const otherUid = (it.otherUid || "").trim();
    if (!cid || !otherUid) return false;
    if (_hydrateInFlight.has(cid)) return false;
    if (now - (_hydrateLastOk.get(cid) || 0) < HYDRATE_COOLDOWN) return false;
    const nm = (it.otherName   || "").trim();
    const av = (it.otherAvatar || "").trim();
    return !nm || nm.toLowerCase() === "user" || !av || av.includes("avatar-placeholder");
  });
  if (!needs.length) return;

  await Promise.all(needs.map(async (it) => {
    const cid      = (it.cid || it.id || "").trim();
    const otherUid = (it.otherUid || "").trim();
    _hydrateInFlight.add(cid);
    try {
      const pub   = await getUserPublic(otherUid);
      const patch = {};
      const nm    = (it.otherName   || "").trim();
      const av    = (it.otherAvatar || "").trim();
      if ((!nm || nm.toLowerCase() === "user") && pub.name) patch.otherName = pub.name;
      if ((!av || av.includes("avatar-placeholder")) && pub.avatarUrl) patch.otherAvatar = pub.avatarUrl;
      patch.otherIsPrinter = pub.isPrinter === true;
      if (Object.keys(patch).length) {
        await setDoc(doc(db, "users", ownerUid, "dm", cid), { otherUid, ...patch }, { merge: true });
      }
      _hydrateLastOk.set(cid, Date.now());
    } catch (e) {
      console.warn("[DM] hydrate failed", cid, e?.message || e);
    } finally {
      _hydrateInFlight.delete(cid);
    }
  }));
}

/* ── Formatare dată/oră ──────────────────────────── */
function fmtTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (!d || isNaN(d)) return "";
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff  = today - msgDay;

    const timeStr = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
    if (diff === 0) return timeStr;
    if (diff === 86400000) return `Ieri ${timeStr}`;
    return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short" }) + ` ${timeStr}`;
  } catch { return ""; }
}

function fmtDateLabel(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (!d || isNaN(d)) return "";
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff  = today - msgDay;
    if (diff === 0) return "Azi";
    if (diff === 86400000) return "Ieri";
    return d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
  } catch { return ""; }
}

/* ── Status bar ──────────────────────────────────── */
function setStatus(t) {
  const el = $("dmStatus");
  if (el) el.textContent = t || "";
}

/* ── Touch users/{uid} (lastSeen only) ───────────── */
async function ensureUserDoc(u) {
  try {
    await setDoc(doc(db, "users", u.uid), {
      uid:        u.uid,
      lastSeenAt: serverTimestamp(),
      updatedAt:  serverTimestamp(),
      ...(u.email ? { email: u.email } : {}),
    }, { merge: true });
  } catch (e) {
    console.warn("[DM] ensureUserDoc failed", e?.message || e);
  }
}

/* ── Render: lista conversații ───────────────────── */
function renderList(items) {
  const list = $("dmList");
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<div class="small-muted" style="padding:8px 4px;">Nu ai conversații încă.</div>`;
    return;
  }

  list.innerHTML = items.map(it => {
    const av = it.otherAvatar || "/assets/avatar-placeholder.svg";
    const unread = it._unread ? "unread" : "";
    const active = currentCid && it.cid === currentCid ? "active" : "";
    const time = fmtTime(it.lastAt);
    const isPrinter = it.otherIsPrinter === true;
    const profileUrl = getPublicProfileUrl({
      uid: it.otherUid || "",
      isPrinter,
      printerVisible: true
    });

    const preview = it._lastText
      ? (it.lastSenderId === (me?.uid || "") ? `Tu: ${it._lastText}` : it._lastText)
      : "Nicio conversație";

    return `
      <div class="dm-item ${unread} ${active}" data-cid="${esc(it.cid)}">
        ${renderAvatarWithPrinterBadge(av, isPrinter, 42)}
        <div class="dm-item-info">
          <div class="dm-item-name">
            <a href="${profileUrl}" onclick="event.stopPropagation();" style="text-decoration:none;color:inherit;">
              ${renderNameWithPrinterBadge(it.otherName || "User", isPrinter, true)}
            </a>
          </div>
          <div class="dm-item-preview">${esc(preview)}</div>
        </div>
        <div class="dm-item-meta">
          <span class="dm-item-time">${esc(time)}</span>
          ${it._unread ? `<span class="dm-unread-badge">●</span>` : ""}
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".dm-item").forEach(el => {
    el.addEventListener("click", () => {
      const cid = el.getAttribute("data-cid");
      openConversation(cid);
      // Mobile: ascunde lista, arată chatul
      document.body.classList.add("dm-show-chat");
    });
  });
}

/* ── Render: mesaje ──────────────────────────────── */
function renderMsgs(meUid, msgs) {
  const box = $("dmMsgs");
  if (!box) return;

  if (!msgs.length) {
    box.innerHTML = `
      <div class="dm-empty">
        <div class="dm-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <div class="dm-empty-title">Niciun mesaj încă</div>
        <div class="dm-empty-sub">Fii primul care scrie! Mesajele sunt private.</div>
      </div>`;
    return;
  }

  const html = [];
  let lastDateLabel = "";

  msgs.forEach((m, i) => {
    const isMine = m.senderId === meUid;
    const ts     = m.createdAt || m.at || null;
    const when   = fmtTime(ts);
    const dateLabel = fmtDateLabel(ts);

    /* Separator dată */
    if (dateLabel && dateLabel !== lastDateLabel) {
      html.push(`
        <div class="dm-date-sep">
          <span>${esc(dateLabel)}</span>
        </div>`);
      lastDateLabel = dateLabel;
    }

    /* Bubble */
    const text = (m.text || "").toString();
    html.push(`
      <div class="dm-bubble ${isMine ? "me" : ""}">
        <div>${esc(text)}</div>
        <div class="dm-time">${esc(when)}</div>
      </div>`);
  });

  box.innerHTML = html.join("");
  box.scrollTop = box.scrollHeight;
}

/* ── markRead ────────────────────────────────────── */
async function markRead(uid, cid) {
  try {
    await updateDoc(doc(db, "users", uid, "dm", cid), { lastReadAt: serverTimestamp() });
  } catch { /* silent */ }
}

/* ── Watch mesaje (realtime) ─────────────────────── */
function watchMessages(uid, cid) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }

  const q = query(
    collection(db, "conversations", cid, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubMsgs = onSnapshot(q, (snap) => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    renderMsgs(uid, msgs);
    markRead(uid, cid);
  }, err => {
    console.warn("[DM] watchMessages error:", err);
    setStatus("Eroare la încărcare mesaje.");
  });
}

/* ── Watch header peer (realtime) ───────────────── */
function watchHeader(uid, cid) {
  if (unsubHeader) { unsubHeader(); unsubHeader = null; }

  unsubHeader = onSnapshot(doc(db, "users", uid, "dm", cid), async (snap) => {
    if (!snap.exists()) return;
    const dm = snap.data() || {};

    let otherPub = {
      uid: dm.otherUid || "",
      name: dm.otherName || "Conversație",
      avatarUrl: dm.otherAvatar || "/assets/avatar-placeholder.svg",
      isPrinter: dm.otherIsPrinter === true
    };

    if (dm.otherUid) {
      try {
        const fresh = await getUserPublic(dm.otherUid);
        otherPub = {
          uid: dm.otherUid,
          name: fresh.name || otherPub.name,
          avatarUrl: fresh.avatarUrl || otherPub.avatarUrl,
          isPrinter: fresh.isPrinter === true
        };
      } catch {}
    }

    const pl = $("dmPeerLink");
    if (pl && otherPub.uid) {
      pl.href = getPublicProfileUrl(otherPub);
    }

    const nameEl = $("dmPeerName");
    if (nameEl) {
      nameEl.innerHTML = renderNameWithPrinterBadge(otherPub.name || "Conversație", otherPub.isPrinter, false);
    }

    const avEl = $("dmPeerAvatar");
    if (avEl) {
      avEl.src = otherPub.avatarUrl || "/assets/avatar-placeholder.svg";
    }

    const hintEl = $("dmPeerHint");
    if (hintEl) {
      hintEl.textContent = otherPub.isPrinter ? "Printator 3D · chat privat · realtime" : "Chat privat · realtime";
    }
  }, err => console.warn("[DM] watchHeader error:", err));
}

/* ── Open conversation ───────────────────────────── */
async function openConversation(cid) {
  if (!me || !cid) return;
  cid = cid.trim();
  currentCid = cid;

  /* Highlight instant în listă */
  const list = $("dmList");
  if (list) {
    list.querySelectorAll(".dm-item.active").forEach(x => x.classList.remove("active"));
    const el = list.querySelector(`.dm-item[data-cid="${CSS.escape(cid)}"]`);
    if (el) el.classList.add("active");
  }

  watchHeader(me.uid, cid);
  watchMessages(me.uid, cid);
}

/* ── Trimite mesaj ───────────────────────────────── */
async function sendMessage() {
  if (!me || !currentCid) return;
  const input = $("dmText");
  const text  = (input?.value || "").trim();
  if (!text) return;

  input.value = "";
  setStatus("");

  /* 1. Adaugă mesajul */
  await addDoc(collection(db, "conversations", currentCid, "messages"), {
    senderId:  me.uid,
    text,
    createdAt: serverTimestamp(),
  });

  /* 2. Update conversație (lastMessage) */
  await setDoc(doc(db, "conversations", currentCid), {
    updatedAt:   serverTimestamp(),
    lastMessage: { text, at: serverTimestamp(), senderId: me.uid },
  }, { merge: true });

  /* 3. Update inbox ambii participanți */
  let parts = [];
  try {
    const cs = await getDoc(doc(db, "conversations", currentCid));
    parts = cs.exists() ? (cs.data()?.participants || []) : [];
  } catch { /* silent */ }

  /* Fallback: ia otherUid din propriul inbox */
  if (parts.length < 2) {
    try {
      const myDm = await getDoc(doc(db, "users", me.uid, "dm", currentCid));
      const otherUid = myDm.exists() ? (myDm.data()?.otherUid || "") : "";
      if (otherUid) parts = [me.uid, otherUid];
    } catch { /* silent */ }
  }

  if (parts.length < 2) {
    console.warn("[DM] participants missing for", currentCid);
    return;
  }

  await Promise.all(parts.map(async (uid) => {
    try {
      const otherUid  = parts.find(x => x !== uid) || "";
      const pub       = otherUid ? await getUserPublic(otherUid) : {};
      const otherName = (pub.name || "User").toString();
      const otherAvatar = (pub.avatarUrl || "").toString();
      const otherIsPrinter = pub.isPrinter === true;

      await setDoc(doc(db, "users", uid, "dm", currentCid), {
        cid: currentCid,
        otherUid,
        otherName,
        otherAvatar,
        otherIsPrinter,
        lastAt: serverTimestamp(),
        lastSenderId: me.uid,
        _lastText: text,
      }, { merge: true });
    } catch (e) {
      console.warn("[DM] inbox update failed for", uid, e?.message || e);
    }
  }));
}

/* ── Filter + render listă ───────────────────────── */
function applySearchAndRender() {
  const s = ($("dmSearch")?.value || "").trim().toLowerCase();
  const filtered = s
    ? lastInboxItems.filter(it => (it.otherName || "").toLowerCase().includes(s))
    : lastInboxItems;
  renderList(filtered);
}

/* ── Entry point ─────────────────────────────────── */
export function initDmPage() {
  onAuthStateChanged(auth, async (u) => {
    document.body.classList.remove("auth-loading");

    if (!u) {
      location.href = `/auth.html?return=${encodeURIComponent("/mesaje.html")}`;
      return;
    }

    me = u;
    await ensureUserDoc(u);

    /* Trimite */
    $("dmSendBtn")?.addEventListener("click", () =>
      sendMessage().catch(e => setStatus(e?.message || String(e)))
    );
    $("dmText")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage().catch(e2 => setStatus(e2?.message || String(e2)));
      }
    });

    /* Search */
    $("dmSearch")?.addEventListener("input", () => applySearchAndRender());

    /* Buton BACK mobil */
    $("dmBackBtn")?.addEventListener("click", () => {
      document.body.classList.remove("dm-show-chat");
    });

    /* Inbox listener */
    const listQ = query(
      collection(db, "users", u.uid, "dm"),
      orderBy("lastAt", "desc"),
      limit(100)
    );

    onSnapshot(listQ, async (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));

      items.forEach(it => {
        if (!it.cid) it.cid = it.id;
        const lastAtMs = it.lastAt?.toMillis?.() || 0;
        const readAtMs = it.lastReadAt?.toMillis?.() || 0;
        it._unread = lastAtMs > readAtMs && !!it.lastSenderId && it.lastSenderId !== u.uid;
        it.otherName = it.otherName || "User";
        it.otherAvatar = it.otherAvatar || "/assets/avatar-placeholder.svg";
        it.otherIsPrinter = it.otherIsPrinter === true;
        it._lastText = it._lastText || "";
      });

      lastInboxItems = items;
      applySearchAndRender();

      /* Hydrate async (nu blochează UI) */
      hydrateDmMeta(u.uid, items).catch(() => {});

      /* Nav dot */
      const dot = $("navDmDot");
      if (dot) dot.style.display = items.some(x => x._unread) ? "block" : "none";

      /* Auto-open din URL sau primul item */
      const urlCid = new URLSearchParams(location.search).get("cid");
      if (urlCid && urlCid !== currentCid) {
        await openConversation(urlCid);
        if (urlCid) document.body.classList.add("dm-show-chat");
      } else if (!currentCid && items.length) {
        await openConversation(items[0].cid);
      }
    }, err => {
      console.warn("[DM] inbox snapshot error:", err);
      setStatus(err?.message || String(err));
    });
  });
}