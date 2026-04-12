import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function $(id){ return document.getElementById(id); }

function esc(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function fmt(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : null;
    if(!d) return "";
    return new Intl.DateTimeFormat("ro-RO", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    }).format(d);
  }catch{ return ""; }
}

function stars(n){
  const r = Math.max(1, Math.min(5, Number(n || 0)));
  return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r);
}

export function initProfileReviews(profileUid){
  const wrap = $("reviewFormWrap");
  const hint = $("reviewFormHint");
  const ratingSel = $("revRating");
  const textInp = $("revText");
  const btnSend = $("revSend");
  const status = $("revStatus");
  const list = $("reviewsList");

  if(!list) return;

  let me = null;

  function setStatus(t){ if(status) status.textContent = t || ""; }

  // live list
  const qy = query(
    collection(db, "users", profileUid, "reviews"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  onSnapshot(qy, (snap) => {
    if(snap.empty){
      list.innerHTML = `<div class="small-muted">Nu exista recenzii inca.</div>`;
      // update rating UI to 0
      const avgEl = $("u_rating");
      const cntEl = $("u_ratingCount");
      if(avgEl) avgEl.textContent = "0.0";
      if(cntEl) cntEl.textContent = "(0 recenzii)";
      return;
    }

    let sum = 0;
    let count = 0;

    const rows = [];
    snap.forEach(d => {
      const r = d.data() || {};
      const name = esc(r.reviewerName || "User");
      const av = esc(r.reviewerAvatar || "/assets/avatar-placeholder.svg");
      const rating = Number(r.rating || 0);
      const text = esc(r.text || "");
      const when = fmt(r.createdAt);

      if(rating >= 1 && rating <= 5){
        sum += rating;
        count += 1;
      }

      rows.push(`
        <div class="card" style="padding:12px; margin-top:10px; background:rgba(255,255,255,0.03);">
          <div style="display:flex; align-items:center; gap:10px;">
            <img loading="lazy" decoding="async" src="${av}" alt="" style="width:30px;height:30px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.12);" />
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900;">${name}</div>
                <div class="small-muted">${esc(when)}</div>
              </div>
              <div style="margin-top:2px; font-weight:900;">${esc(stars(rating))} <span class="small-muted">(${rating}/5)</span></div>
              ${text ? `<div style="margin-top:6px;">${text}</div>` : ``}
            </div>
          </div>
        </div>
      `);
    });

    list.innerHTML = rows.join("");

    // update profile rating badge from computed values
    const avg = count ? (sum / count) : 0;
    const avgEl = $("u_rating");
    const cntEl = $("u_ratingCount");
    if(avgEl) avgEl.textContent = avg.toFixed(1);
    if(cntEl) cntEl.textContent = `(${count} recenzii)`;
  });

  // auth -> show/hide form
  onAuthStateChanged(auth, (u) => {
    me = u || null;

    if(!wrap) return;

    if(!me){
      wrap.style.display = "none";
      return;
    }

    // cannot review self
    if(me.uid === profileUid){
      wrap.style.display = "";
      if(hint) hint.textContent = "Nu poti lasa review la propriul profil.";
      if(btnSend) btnSend.disabled = true;
      return;
    }

    wrap.style.display = "";
    if(hint) hint.textContent = "Lasa un review. Nu poti edita dupa trimitere (doar stergere in viitor, daca vrei).";
    if(btnSend) btnSend.disabled = false;
  });

  // send review
  if(btnSend){
    btnSend.addEventListener("click", async () => {
      try{
        if(!me){
          setStatus("Trebuie sa fii logat.");
          return;
        }
        if(me.uid === profileUid){
          setStatus("Nu poti lasa review la tine.");
          return;
        }

        const rating = Number(ratingSel?.value || 5);
        const text = (textInp?.value || "").trim();

        if(!(rating >= 1 && rating <= 5)){
          setStatus("Rating invalid.");
          return;
        }
        if(text.length > 1000){
          setStatus("Text prea lung (max 1000).");
          return;
        }

        // load my public profile (optional but nice)
        let myName = me.displayName || "User";
        let myAvatar = me.photoURL || "/assets/avatar-placeholder.svg";
        try{
          const ps = await getDoc(doc(db, "users", me.uid));
          if(ps.exists()){
            const p = ps.data() || {};
            myName = p.name || myName;
            myAvatar = p.avatarUrl || myAvatar;
          }
        }catch{}

        setStatus("Se trimite...");
        btnSend.disabled = true;

        await addDoc(collection(db, "users", profileUid, "reviews"), {
          reviewerUid: me.uid,
          reviewerName: myName || "User",
          reviewerAvatar: myAvatar || "/assets/avatar-placeholder.svg",
          rating,
          text,
          createdAt: serverTimestamp()
        });

        if(textInp) textInp.value = "";
        setStatus("Review trimis.");
      }catch(e){
        console.error("[reviews] send failed:", e);
        setStatus(e?.message || String(e));
      }finally{
        if(btnSend) btnSend.disabled = false;
      }
    });
  }
}
