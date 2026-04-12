import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, addDoc, query, onSnapshot, limit, increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getUserPublic,
  getPublicProfileUrl,
  renderNameWithPrinterBadge,
  renderAvatarWithPrinterBadge
} from "./dm-utils.js";
function $(id){ return document.getElementById(id); }
function esc(s){
  return (s??"").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function pickTs(m){
  // compat: createdAt / timestamp / ts / sentAt
  const t =
    m?.createdAt ||
    m?.timestamp ||
    m?.ts ||
    m?.sentAt ||
    null;

  // Firestore Timestamp
  if (t?.toMillis) return t.toMillis();
  // Date
  if (t instanceof Date) return t.getTime();
  // number
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return n;

  return 0;
}

function fmtDateTimeAny(m){
  try{
    const t =
      m?.createdAt ||
      m?.timestamp ||
      m?.ts ||
      m?.sentAt ||
      null;

    const d = t?.toDate ? t.toDate() : (t instanceof Date ? t : null);
    if(!d) return "";
    return d.toLocaleString("ro-RO", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    });
  }catch{ return ""; }
}

export function initPostChat(cerereId, cerereData){
  const card = $("postChatCard");
  const box  = $("postChatMsgs");
  const input = $("postChatText");

  // accepta ambele id-uri (vechi + nou)
  const btn = $("postChatSendBtn") || $("postChatSend");

  // optional: daca nu exista in HTML, il cream
  let status = $("postChatStatus");
  if (!status && card){
    status = document.createElement("div");
    status.id = "postChatStatus";
    status.className = "small-muted";
    status.style.marginTop = "10px";
    card.appendChild(status);
  }

  // accepta ambele clase (vechi + nou)
  const sendRow = document.querySelector(".post-chat-send, .chat-send");

  // optional (daca ai dot in UI in viitor)
  const dot = $("liveDot");

  if(!box || !input || !btn) {
    console.warn("[chat] missing elements:", { box:!!box, input:!!input, btn:!!btn });
    return;
  }

  let me = null;
  let lastSeenAtMs = 0;

  // starea cererii (open/solved)
  let isClosed = (cerereData?.status === "solved" || cerereData?.solved === true);

  function setStatus(t){ if(status) status.textContent = t || ""; }

  function applyClosedUi(){
    if (isClosed){
      if (sendRow) sendRow.style.display = "none";
      setStatus("Postare rezolvata. Chatul este read-only.");
      if (dot) dot.style.display = "none";
    } else {
      if (sendRow) sendRow.style.display = "";
      if (status && status.textContent?.includes("read-only")) setStatus("");
    }
  }

  applyClosedUi();

  // watch cerere for solved changes
  const cerereRef = doc(db, "cereri", cerereId);
  onSnapshot(cerereRef, (snap) => {
    if (!snap.exists()) return;
    const r = snap.data() || {};
    const nextClosed = (r.status === "solved" || r.solved === true);
    if (nextClosed !== isClosed){
      isClosed = nextClosed;
      applyClosedUi();
    }
    cerereData = { ...(cerereData || {}), ...r };
  });

  // ===== messages realtime (NU depindem de orderBy createdAt, ca sa fie compat cu vechi) =====
  // daca ai peste 300-500 mesaje pe o cerere, zici si facem paginare cu "Load older".
  const q = query(
    collection(db, "cereri", cerereId, "chat"),
    limit(500)
  );

  // autoscroll doar daca userul e aproape de bottom
  function isNearBottom(){
    const slack = 80;
    return (box.scrollTop + box.clientHeight) >= (box.scrollHeight - slack);
  }

  onSnapshot(q, async (snap) => {
    const msgs = [];
    let lastMsgAtMs = 0;

    snap.forEach(d => {
      const m = d.data() || {};
      const ms = pickTs(m);
      if(ms > lastMsgAtMs) lastMsgAtMs = ms;
      msgs.push({ id:d.id, __ms: ms, ...m });
    });

    // sortare stabila: by timestamp then by id
    msgs.sort((a,b) => (a.__ms - b.__ms) || String(a.id).localeCompare(String(b.id)));

    const keepBottom = isNearBottom();

    const uidMap = {};
    const uniqueUids = Array.from(new Set(
      msgs.map(m => (m.senderId || "").trim()).filter(Boolean)
    ));

    await Promise.all(uniqueUids.map(async (uid) => {
      try {
        uidMap[uid] = await getUserPublic(uid);
      } catch {
        uidMap[uid] = null;
      }
    }));

    box.innerHTML = msgs.map(m => {
      const isMine = me && m.senderId === me.uid;
      const when = fmtDateTimeAny(m);

      const authorUid = m.senderId || "";
      const authorName = m.senderName || "User";
      const authorAv = m.senderAvatar || "/assets/avatar-placeholder.svg";

      const pub = uidMap[authorUid] || null;
      const isPrinter = pub?.isPrinter === true;
      const profileUrl = authorUid ? getPublicProfileUrl({
        uid: authorUid,
        isPrinter,
        printerVisible: true
      }) : "#";

      return `
        <div class="post-msg ${isMine ? "me" : ""}">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            ${renderAvatarWithPrinterBadge(authorAv, isPrinter, 26)}
            <div style="min-width:0;">
              <div style="font-weight:900;color:#111;">
                ${authorUid
                  ? `<a href="${profileUrl}" style="color:#111;text-decoration:underline;">${renderNameWithPrinterBadge(authorName, isPrinter, true)}</a>`
                  : `${renderNameWithPrinterBadge(authorName, isPrinter, true)}`
                }
              </div>
              <div style="color:#111;white-space:pre-wrap;word-break:break-word;">${esc(m.text || "")}</div>
              ${when ? `<div class="meta">${esc(when)}</div>` : ``}
            </div>
          </div>
        </div>
      `;
    }).join("");

    if (keepBottom) box.scrollTop = box.scrollHeight;

    // dot only if not closed
    if(isClosed){
      if(dot) dot.style.display = "none";
      return;
    }

    if(me){
      const readRef = doc(db, "cereri", cerereId, "chatRead", me.uid);
      try{
        const rs = await getDoc(readRef);
        const readAt = rs.exists()
          ? (rs.data().lastReadAt?.toMillis ? rs.data().lastReadAt.toMillis() : 0)
          : 0;
        lastSeenAtMs = readAt;
      }catch{}

      const hasNew = lastMsgAtMs > lastSeenAtMs;
      if(dot) dot.style.display = hasNew ? "inline-block" : "none";


    } else {
      if(dot) dot.style.display = "none";
    }
  });

  async function markRead(){
    if(!me) return;

    try{
      await setDoc(doc(db, "cereri", cerereId, "chatRead", me.uid), {
        lastReadAt: serverTimestamp()
      }, { merge:true });

      const ownerUid = (cerereData?.createdBy || "").toString();
      const isOwner = !!ownerUid && me.uid === ownerUid;

      if (isOwner) {
        await updateDoc(cerereRef, {
          ownerUnreadChat: 0,
          ownerLastSeenAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      if(dot) dot.style.display = "none";
    }catch(e){
      console.warn("[chat] markRead failed:", e);
    }
  }

  window.addEventListener("focus", () => markRead().catch(()=>{}));
  box.addEventListener("click", () => markRead().catch(()=>{}));

  btn.addEventListener("click", async () => {
    if(!me){
      setStatus("Trebuie sa fii logat ca sa scrii in chat.");
      return;
    }

    const text = (input.value || "").trim();
    if(!text) return;

    // anti-stale close check
    try{
      const cs = await getDoc(cerereRef);
      if(!cs.exists()){
        setStatus("Eroare: cererea nu exista (id invalid).");
        return;
      }
      const cNow = cs.data() || {};
      const closedNow = (cNow.status === "solved" || cNow.solved === true);
      if (closedNow){
        isClosed = true;
        applyClosedUi();
        setStatus("Postare rezolvata. Nu mai poti scrie.");
        return;
      }
    }catch(e){
      console.error("[SEND] get cerere failed:", e);
      setStatus("Eroare la citire cerere (permissions?).");
      return;
    }

    input.value = "";
    setStatus("");

    // profil din Firestore
    let senderName = me.displayName || "User";
    let senderAvatar = me.photoURL || "";
    try{
      const ps = await getDoc(doc(db, "users", me.uid));
      if(ps.exists()){
        const p = ps.data() || {};
        senderName = p.name || senderName;
        senderAvatar = p.avatarUrl || senderAvatar;
      }
    }catch{}

    try{
      await addDoc(collection(db, "cereri", cerereId, "chat"), {
        senderId: me.uid,
        senderName,
        senderAvatar: senderAvatar || "/assets/avatar-placeholder.svg",
        text,
        createdAt: serverTimestamp()
      });
    }catch(e){
      console.error("[SEND] addDoc chat FAILED:", e);
      setStatus("Nu pot trimite mesaj (blocaj la /cereri/{id}/chat).");
      return;
    }

    // chatLast (optional)
    try{
      const ownerUid = (cerereData?.createdBy || "").toString();
      const isOwnerSender = !!ownerUid && me.uid === ownerUid;
      const alreadyOwnerReplied = !!cerereData?.ownerHasReplied;
      const hasChosen = !!cerereData?.selectedMakerUid;

      const payload = {
        chatLast: { text, at: serverTimestamp(), senderId: me.uid },
        hasAnyChat: true,
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (isOwnerSender) {
        payload.ownerHasReplied = true;
        payload.ownerUnreadChat = 0;
        payload.lastOwnerReplyAt = serverTimestamp();

        payload.activityStatus = hasChosen ? "printator_ales" : "in_discutie";
      } else {
        payload.ownerUnreadChat = increment(1);
        payload.lastNonOwnerReplyAt = serverTimestamp();

        payload.activityStatus = hasChosen
          ? "printator_ales"
          : (alreadyOwnerReplied ? "in_discutie" : "are_interes");
      }
      console.log("[SEND] updating cerere activity", {
        cerereId,
        isOwnerSender,
        payload
      });
      await updateDoc(cerereRef, payload);
      cerereData.chatLast = {
        text,
        senderId: me.uid
      };
      cerereData.hasAnyChat = true;
      cerereData.ownerHasReplied = !!payload.ownerHasReplied || !!cerereData.ownerHasReplied;
      cerereData.ownerUnreadChat = isOwnerSender ? 0 : Number(cerereData.ownerUnreadChat || 0) + 1;
      cerereData.activityStatus = payload.activityStatus;

      if (isOwnerSender) {
        cerereData.ownerLastSeenAt = Date.now();
      }
    }catch(e){
      console.error("[SEND] update chatLast/activity FAILED:", e);
      setStatus("Mesajul s-a trimis, dar notificarea cererii NU s-a actualizat. Verifica regulile Firestore.");
    }

    try{ await markRead(); } catch {}
  });

  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter") btn.click();
  });

  onAuthStateChanged(auth, async (u) => {
    me = u || null;
    await markRead();
  });
}