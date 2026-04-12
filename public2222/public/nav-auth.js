// nav-auth.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPresence, initLiveStats } from "./presence.js";
import { buildGlobalActivityText, getOwnerUnreadTotal } from "./activity-utils.js";

function $(id){ return document.getElementById(id); }

let unsubDm = null;
let unsubMyCereri = null;

const CACHE_KEY = "cere3d_me_public_v1";
const ADMIN_UID = "LpiKjlandvYaPgQIaKAlDkUkEeB2";
const ADMIN_LINK_ID = "navAdminLink";
const MY_LINK_ID = "navMyCereriLink";

function loadCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}
function saveCache(obj){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(obj || {})); }catch{}
}
function clearCache(){
  try{ localStorage.removeItem(CACHE_KEY); }catch{}
}

function stopDmDot(){
  if (unsubDm) { unsubDm(); unsubDm = null; }
  const dot = $("navDmDot");
  if (dot) dot.style.display = "none";
  setNavMessagesCount(0);
}

function stopMyCereriWatcher(){
  if (unsubMyCereri) { unsubMyCereri(); unsubMyCereri = null; }
  setMyCereriCount(0);
  renderGlobalActivityBanner({ dmUnread: 0, offerUnread: 0, requestChatUnread: 0 });
}

function setNavMessagesCount(count){
  const link = $("navMessages");
  const dot = $("navDmDot");
  if (!link) return;

  const n = Number(count || 0);
  link.textContent = n > 0 ? `Mesaje (${n})` : "Mesaje";

  if (dot) {
    dot.style.display = n > 0 ? "block" : "none";
  }
}

function setMyCereriCount(count){
  const a = document.getElementById(MY_LINK_ID);
  if (!a) return;

  const n = Number(count || 0);
  a.textContent = n > 0 ? `Cererile mele (${n})` : "Cererile mele";
}

function ensureGlobalActivityBanner(){
  let el = document.getElementById("globalActivityBanner");
  if (el) return el;

  el = document.createElement("div");
  el.id = "globalActivityBanner";
  el.className = "global-activity-banner";
  el.style.display = "none";

  const livebar = document.querySelector(".livebar");
  const topbar = document.querySelector(".topbar");

  if (livebar && livebar.parentNode) {
    livebar.insertAdjacentElement("afterend", el);
  } else if (topbar && topbar.parentNode) {
    topbar.insertAdjacentElement("afterend", el);
  } else {
    document.body.prepend(el);
  }

  return el;
}

function renderGlobalActivityBanner({ dmUnread = 0, offerUnread = 0, requestChatUnread = 0 }){
  const el = ensureGlobalActivityBanner();
  const text = buildGlobalActivityText({ dmUnread, offerUnread, requestChatUnread });

  if (!text) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="wrap">
      <div class="global-activity-banner__inner">
        <span class="global-activity-banner__dot"></span>
        <span>${text}</span>
      </div>
    </div>
  `;
  el.style.display = "";
}

// unread = dm.lastAt vs dm.lastReadAt
function watchDmDot(uid){
  stopDmDot();

  unsubDm = onSnapshot(collection(db, "users", uid, "dm"), (snap) => {
    try{
      let unreadThreads = 0;

      snap.forEach(d => {
        const it = d.data() || {};
        const lastAt = it.lastAt?.toMillis ? it.lastAt.toMillis() : 0;
        const readAt = it.lastReadAt?.toMillis ? it.lastReadAt.toMillis() : 0;
        const lastSender = it.lastSenderId || "";

        if (lastAt > readAt && lastSender && lastSender !== uid) {
          unreadThreads += 1;
        }
      });

      setNavMessagesCount(unreadThreads);

      const current = window.__cere3dActivitySummary || { offerUnread: 0, requestChatUnread: 0 };
      window.__cere3dActivitySummary = {
        ...current,
        dmUnread: unreadThreads
      };
      renderGlobalActivityBanner(window.__cere3dActivitySummary);
    }catch(e){
      console.warn("watchDmDot failed:", e);
      setNavMessagesCount(0);
    }
  }, (err) => {
    console.warn("watchDmDot snapshot failed:", err);
    setNavMessagesCount(0);
  });
}

function watchMyCereriActivity(uid){
  stopMyCereriWatcher();

  const qy = query(collection(db, "cereri"), where("createdBy", "==", uid));

  unsubMyCereri = onSnapshot(qy, (snap) => {
    try{
      let cereriCuActivitate = 0;
      let offerUnread = 0;
      let requestChatUnread = 0;

      snap.forEach((d) => {
        const r = d.data() || {};
        const total = getOwnerUnreadTotal(r);

        if (total > 0) cereriCuActivitate += 1;
        offerUnread += Number(r.ownerUnreadOffers || 0);
        requestChatUnread += Number(r.ownerUnreadChat || 0);
      });

      setMyCereriCount(cereriCuActivitate);

      const current = window.__cere3dActivitySummary || { dmUnread: 0 };
      window.__cere3dActivitySummary = {
        ...current,
        offerUnread,
        requestChatUnread
      };

      renderGlobalActivityBanner(window.__cere3dActivitySummary);
    }catch(e){
      console.warn("watchMyCereriActivity failed:", e);
      setMyCereriCount(0);
    }
  }, (err) => {
    console.warn("watchMyCereriActivity snapshot failed:", err);
    setMyCereriCount(0);
  });
}

function setNavProfile({ name, avatarUrl }){
  const nameEl = $("navName");
  const avEl = $("navAvatar");

  const safeName = (name || "").trim();
  const safeAv = (avatarUrl || "").trim();

  if (nameEl) nameEl.textContent = safeName;
  if (avEl) avEl.src = safeAv || "/assets/avatar-placeholder.svg";
}

function ensureAdminLink(show){
  const wrap = $("navUserWrap");
  if (!wrap) return;

  let a = document.getElementById(ADMIN_LINK_ID);

  if (!show){
    if (a) a.remove();
    return;
  }

  if (!a){
    a = document.createElement("a");
    a.id = ADMIN_LINK_ID;
    a.className = "nav-link";
    a.href = "/admin-rapoarte.html";
    a.textContent = "Admin";
  }

  const messages = $("navMessages");
  if (messages && messages.parentNode === wrap){
    if (messages.nextSibling !== a) wrap.insertBefore(a, messages.nextSibling);
  }else{
    wrap.appendChild(a);
  }
}

function ensureMyCereriLink(show){
  const wrap = $("navUserWrap");
  if (!wrap) return;

  let a = document.getElementById(MY_LINK_ID);

  if (!show){
    if (a) a.remove();
    return;
  }

  if (!a){
    a = document.createElement("a");
    a.id = MY_LINK_ID;
    a.className = "nav-link";
    a.href = "/cererile-mele.html";
    a.textContent = "Cererile mele";
  }

  const messages = $("navMessages");
  if (messages && messages.parentNode === wrap){
    if (messages.nextSibling !== a) wrap.insertBefore(a, messages.nextSibling);
  }else{
    wrap.appendChild(a);
  }
}

function setLoggedUiVisible(isLogged){
  const authLink = $("navAuthLink");
  const wrap = $("navUserWrap");

  const navUser = $("navUser");
  const navMessages = $("navMessages");
  const logoutBtn = $("navLogout");

  if (authLink) authLink.hidden = !!isLogged;

  if (wrap) wrap.hidden = !isLogged;
  if (navUser) navUser.hidden = !isLogged;
  if (navMessages) navMessages.hidden = !isLogged;
  if (logoutBtn) logoutBtn.hidden = !isLogged;

  if (wrap) wrap.style.display = isLogged ? "" : "none";
  if (navUser) navUser.style.display = isLogged ? "" : "none";
  if (navMessages) navMessages.style.display = isLogged ? "" : "none";
  if (logoutBtn) logoutBtn.style.display = isLogged ? "" : "none";
  if (authLink) authLink.style.display = isLogged ? "none" : "";
}

export function initNavAuth(){
  const authLink = $("navAuthLink");
  const wrap = $("navUserWrap");
  const logoutBtn = $("navLogout");

  initPresence();
  initLiveStats("liveStats");

  setLoggedUiVisible(false);

  if (logoutBtn && !logoutBtn.dataset.bound){
    logoutBtn.dataset.bound = "1";
    logoutBtn.addEventListener("click", async () => {
      try { await signOut(auth); } catch(e) {}

      stopDmDot();
      stopMyCereriWatcher();
      clearCache();
      ensureAdminLink(false);
      ensureMyCereriLink(false);
      setNavProfile({ name: "", avatarUrl: "" });
      setLoggedUiVisible(false);
      location.href = "/index.html";
    });
  }

  onAuthStateChanged(auth, async (u) => {
    document.body.classList.remove("auth-loading");

    if(!authLink || !wrap){
      console.warn("[nav-auth] missing navAuthLink or navUserWrap in DOM");
    }

    if(!u){
      setLoggedUiVisible(false);
      setNavProfile({ name: "", avatarUrl: "" });
      stopDmDot();
      stopMyCereriWatcher();
      clearCache();
      ensureAdminLink(false);
      ensureMyCereriLink(false);
      return;
    }

    setLoggedUiVisible(true);

    ensureMyCereriLink(true);
    ensureAdminLink(u.uid === ADMIN_UID);

    const cached = loadCache();
    if (cached?.uid === u.uid) {
      setNavProfile({ name: cached.name, avatarUrl: cached.avatarUrl });
    } else {
      setNavProfile({
        name: (u.displayName || u.email || "User"),
        avatarUrl: (u.photoURL || "")
      });
    }

    watchDmDot(u.uid);
    watchMyCereriActivity(u.uid);

    try{
      const snap = await getDoc(doc(db, "users", u.uid));
      if(snap.exists()){
        const p = snap.data() || {};
        const name = (p.name || "").trim();
        const avatarUrl = (p.avatarUrl || "").trim();

        setNavProfile({
          name: name || (cached?.name || (u.displayName || u.email || "User")),
          avatarUrl: avatarUrl || (cached?.avatarUrl || (u.photoURL || ""))
        });

        saveCache({
          uid: u.uid,
          name: name || (cached?.name || (u.displayName || u.email || "User")),
          avatarUrl: avatarUrl || (cached?.avatarUrl || (u.photoURL || ""))
        });
      } else {
        console.warn("users/" + u.uid + " missing");
      }
    }catch(e){
      console.warn("nav profile load failed", e);
    }
  });
}