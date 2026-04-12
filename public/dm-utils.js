// dm-utils.js
import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const _pubCache = new Map();

export function convoIdFor(a, b) {
  return [a, b].sort().join("_");
}

export async function getUserPublic(uid, { forceFresh = false } = {}) {
  const k = (uid || "").trim();
  if (!k) {
    return {
      uid: "",
      name: "User",
      avatarUrl: "",
      email: "",
      isPrinter: false,
      printerVisible: false
    };
  }

  if (!forceFresh && _pubCache.has(k)) {
    return _pubCache.get(k);
  }

  try {
    const snap = await getDoc(doc(db, "users", k));
    const data = snap.exists() ? (snap.data() || {}) : {};

    const resolvedName =
      (data.name || "").toString().trim() ||
      (data.displayName || "").toString().trim() ||
      (data.email || "").toString().trim().split("@")[0] ||
      "User";

    const resolvedAvatar =
      (data.avatarUrl || "").toString().trim() ||
      (data.photoURL || "").toString().trim() ||
      "";

    const pub = {
      uid: k,
      name: resolvedName,
      avatarUrl: resolvedAvatar,
      email: (data.email || "").toString().trim(),
      isPrinter: data.isPrinter === true,
      printerVisible: data.printerVisible !== false
    };

    _pubCache.set(k, pub);
    return pub;
  } catch (e) {
    console.warn("[DM] getUserPublic failed:", uid, e?.message || e);

    const fallback = {
      uid: k,
      name: "User",
      avatarUrl: "",
      email: "",
      isPrinter: false,
      printerVisible: false
    };

    return fallback;
  }
}

export function invalidateUserCache(uid) {
  _pubCache.delete((uid || "").trim());
}

export function isPrinterUser(userLike) {
  return !!(userLike && userLike.isPrinter === true && userLike.printerVisible !== false);
}

export function getPublicProfileUrl(userLikeOrUid, maybeUserData = null) {
  if (typeof userLikeOrUid === "object" && userLikeOrUid) {
    const u = userLikeOrUid;
    const uid = (u.uid || "").toString().trim();
    if (!uid) return "#";
    return isPrinterUser(u)
      ? `/profil-printator.html?uid=${encodeURIComponent(uid)}`
      : `/profil.html?uid=${encodeURIComponent(uid)}`;
  }

  const uid = (userLikeOrUid || "").toString().trim();
  if (!uid) return "#";

  if (maybeUserData && typeof maybeUserData === "object") {
    return isPrinterUser(maybeUserData)
      ? `/profil-printator.html?uid=${encodeURIComponent(uid)}`
      : `/profil.html?uid=${encodeURIComponent(uid)}`;
  }

  return `/profil.html?uid=${encodeURIComponent(uid)}`;
}

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderPrinterBadge(isPrinter, compact = false) {
  if (!isPrinter) return "";

  return compact
    ? `<span style="
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:2px 8px;
        border-radius:999px;
        background:rgba(37,99,235,.10);
        border:1px solid rgba(37,99,235,.16);
        color:#1d4ed8;
        font-size:11px;
        font-weight:800;
        line-height:1;
        vertical-align:middle;
      ">🖨️ Printator</span>`
    : `<span style="
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:4px 10px;
        border-radius:999px;
        background:linear-gradient(135deg, rgba(37,99,235,.12), rgba(249,115,22,.12));
        border:1px solid rgba(37,99,235,.18);
        color:#1d4ed8;
        font-size:12px;
        font-weight:900;
        line-height:1;
        vertical-align:middle;
      ">🖨️ Printator 3D</span>`;
}

export function renderNameWithPrinterBadge(name, isPrinter, compact = false) {
  return `
    <span style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>${esc(name || "User")}</span>
      ${renderPrinterBadge(isPrinter, compact)}
    </span>
  `;
}

export function renderAvatarWithPrinterBadge(avatarUrl, isPrinter, size = 42) {
  const safeUrl = esc(avatarUrl || "/assets/avatar-placeholder.svg");
  const badgeSize = Math.max(16, Math.round(size * 0.38));
  const badgeFont = Math.max(8, Math.round(size * 0.18));

  return `
    <span style="
      position:relative;
      display:inline-block;
      width:${size}px;
      height:${size}px;
      flex:0 0 ${size}px;
    ">
      <img
        src="${safeUrl}"
        alt=""
        style="
          width:${size}px;
          height:${size}px;
          border-radius:999px;
          object-fit:cover;
          display:block;
          border:1px solid rgba(15,31,58,.10);
          background:#eef4ff;
        "
      />
      ${
        isPrinter
          ? `<span style="
              position:absolute;
              right:-2px;
              bottom:-2px;
              width:${badgeSize}px;
              height:${badgeSize}px;
              border-radius:999px;
              display:flex;
              align-items:center;
              justify-content:center;
              background:linear-gradient(135deg,#2563eb 0%,#f97316 100%);
              color:#fff;
              font-size:${badgeFont}px;
              font-weight:900;
              border:2px solid #fff;
              box-shadow:0 4px 10px rgba(37,99,235,.25);
              line-height:1;
            ">3D</span>`
          : ``
      }
    </span>
  `;
}

export async function startDmWith(otherUid, { redirect = true } = {}) {
  const me = auth.currentUser;
  if (!me) {
    const ret = encodeURIComponent(location.pathname + location.search);
    location.href = `/auth.html?return=${ret}`;
    return "";
  }

  const other = (otherUid || "").trim();
  if (!other || other === me.uid) {
    console.warn("[DM] startDmWith: invalid otherUid", otherUid);
    return "";
  }

  const cid = convoIdFor(me.uid, other);
  const [a, b] = [me.uid, other].sort();

  try {
    await setDoc(
      doc(db, "conversations", cid),
      {
        participants: [a, b],
        participantsMap: { [a]: true, [b]: true },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("[DM] conversation UPSERT failed:", cid, e?.message || e);
    throw e;
  }

  try {
    const otherPub = await getUserPublic(other);

    const myInboxRef = doc(db, "users", me.uid, "dm", cid);
    const myInboxSnap = await getDoc(myInboxRef);
    const existing = myInboxSnap.exists() ? (myInboxSnap.data() || {}) : {};

    const payload = {
      cid,
      otherUid: other,
      otherName: (otherPub.name || "User").toString(),
      otherAvatar: (otherPub.avatarUrl || "").toString(),
      otherIsPrinter: otherPub.isPrinter === true,
      lastReadAt: serverTimestamp(),
      lastAt: serverTimestamp(),
      lastSenderId: existing.lastSenderId || "",
      _lastText: existing._lastText || "",
      createdAt: existing.createdAt || serverTimestamp(),
    };

    await setDoc(myInboxRef, payload, { merge: true });
  } catch (e) {
    console.error("[DM] inbox UPSERT failed:", cid, e?.message || e);
    throw e;
  }

  if (redirect) {
    location.href = `/mesaje.html?cid=${encodeURIComponent(cid)}`;
  }

  return cid;
}