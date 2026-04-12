import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  confirmPasswordReset,
  verifyPasswordResetCode
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function $(id){ return document.getElementById(id); }

/** status colored */
function setStatus(type, text){
  const el = $("authStatus");
  if (!el) return;

  el.className = "form-status";
  if (type === "error") el.classList.add("is-error");
  if (type === "success") el.classList.add("is-success");
  if (type === "info") el.classList.add("is-info");

  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
}

function showPopup(title, text){
  const pop = document.getElementById("pop");
  const t = document.getElementById("popTitle");
  const x = document.getElementById("popText");
  if(!pop) { alert(text); return; }

  if (t) t.textContent = title || "Info";
  if (x) x.textContent = text || "";

  pop.classList.add("open");
  pop.setAttribute("aria-hidden", "false");

  const close = () => {
    pop.classList.remove("open");
    pop.setAttribute("aria-hidden", "true");
  };

  if (!pop.dataset.bound){
    pop.dataset.bound = "1";

    pop.addEventListener("click", (e) => {
      const target = e.target;
      if (target?.dataset?.close) close();
    });

    document.getElementById("popX")?.addEventListener("click", close);
    document.getElementById("popOk")?.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }
}

function getReturnUrl(){
  const p = new URLSearchParams(location.search);
  return p.get("return") || "/index.html";
}

function setReset2Msg(t){
  const el = document.getElementById("reset2Msg");
  if (el) el.textContent = t || "";
}

async function initResetStep2IfPresent(){
  const p = new URLSearchParams(location.search);
  const mode = p.get("mode");
  const oobCode = p.get("oobCode");

  if (mode !== "resetPassword" || !oobCode) return;

  const box = document.getElementById("reset2Box");
  if (box) box.style.display = "block";

  try{
    setReset2Msg("Se verifica codul de reset...");
    const email = await verifyPasswordResetCode(auth, oobCode);

    const emailEl = document.getElementById("reset2Email");
    if (emailEl) emailEl.value = email || "";

    setReset2Msg("Introdu parola noua.");
  }catch(e){
    console.error(e);
    setReset2Msg("Link invalid sau expirat. Cere din nou resetarea parolei.");
  }

  document.getElementById("btnReset2Confirm")?.addEventListener("click", async () => {
    try{
      const pass1 = document.getElementById("reset2Pass")?.value || "";
      const pass2 = document.getElementById("reset2Pass2")?.value || "";

      if (pass1.length < 6){
        setReset2Msg("Parola trebuie sa aiba minim 6 caractere.");
        return;
      }
      if (pass1 !== pass2){
        setReset2Msg("Parolele nu coincid.");
        return;
      }

      setReset2Msg("Se salveaza parola...");
      await confirmPasswordReset(auth, oobCode, pass1);

      setReset2Msg("Parola a fost schimbata. Acum te poti loga.");
      setTimeout(() => { location.href = "/auth.html"; }, 1200);
    }catch(e){
      console.error(e);
      setReset2Msg(e?.message || String(e));
    }
  });
}

async function ensureUserProfile(user, displayNameHint){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() || {}) : {};

  const resolvedName =
    (existing.name || "").trim() ||
    (displayNameHint || "").trim() ||
    (user.displayName || "").trim() ||
    (user.email || "").split("@")[0] ||
    "User";

  const resolvedAvatar =
    (existing.avatarUrl || "").trim() ||
    (user.photoURL || "").trim() ||
    "";

  const payload = {
    uid: user.uid,
    email: user.email || existing.email || "",
    name: resolvedName,
    nameLower: resolvedName.toLowerCase(),
    avatarUrl: resolvedAvatar,
    bio: existing.bio || "",
    ratingAvg: typeof existing.ratingAvg === "number" ? existing.ratingAvg : 0,
    ratingCount: typeof existing.ratingCount === "number" ? existing.ratingCount : 0,
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}

export function initAuthPage(){
  // Toggle reset box
  $("btnShowReset")?.addEventListener("click", () => {
    const box = $("resetBox");
    if (box) box.style.display = "block";
    const r = $("resetEmail");
    const l = $("loginEmail");
    if (r && l) r.value = l.value || "";
    setStatus("info", "Introdu emailul si trimitem link de reset.");
  });

  $("btnHideReset")?.addEventListener("click", () => {
    const box = $("resetBox");
    if (box) box.style.display = "none";
    setStatus("", "");
  });

  // LOGIN email/pass
  $("btnLogin")?.addEventListener("click", async () => {
    try{
      const email = ($("loginEmail")?.value || "").trim();
      const pass = $("loginPass")?.value || "";

      if(!email){ setStatus("error", "Completeaza adresa de email."); return; }
      if(!pass){ setStatus("error", "Completeaza parola."); return; }

      setStatus("info", "Se face login...");
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await ensureUserProfile(cred.user);

      setStatus("success", "Login reusit. Te redirectionam...");
      location.href = getReturnUrl();
    }catch(e){
      console.error(e);
      setStatus("error", e?.message || "Eroare la login. Incearca din nou.");
    }
  });

  // LOGIN Google
  $("btnGoogle")?.addEventListener("click", async () => {
    try{
      setStatus("info", "Se deschide Google...");
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);

      await ensureUserProfile(cred.user, cred.user.displayName || "User");
      setStatus("success", "Login reusit. Te redirectionam...");
      location.href = getReturnUrl();
    }catch(e){
      console.error(e);
      setStatus("error", e?.message || "Eroare la login cu Google.");
    }
  });

  // REGISTER
  $("btnRegister")?.addEventListener("click", async () => {
    try{
      const name = ($("regName")?.value || "").trim();
      const email = ($("regEmail")?.value || "").trim();
      const pass = $("regPass")?.value || "";

      if(!name){ setStatus("error", "Completeaza numele public (username)."); return; }
      if(!email){ setStatus("error", "Completeaza adresa de email."); return; }
      if(!pass){ setStatus("error", "Completeaza parola."); return; }
      if(pass.length < 6){ setStatus("error", "Parola trebuie sa aiba minim 6 caractere."); return; }

      setStatus("info", "Se creeaza contul...");
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await ensureUserProfile(cred.user, name);

      await signOut(auth);

      setStatus("success", "Cont creat cu succes! Acum te poti loga.");
      showPopup("Felicitari!", "Ai creat contul. Acum te poti loga.");

      // precompletare login
      if ($("loginEmail")) $("loginEmail").value = email;
      if ($("loginPass")) $("loginPass").value = "";
    }catch(e){
      console.error(e);
      setStatus("error", e?.message || "Eroare la creare cont.");
    }
  });

  // RESET parola
  $("btnReset")?.addEventListener("click", async () => {
    try{
      const email = ($("resetEmail")?.value || "").trim();
      if(!email){ setStatus("error", "Completeaza adresa de email pentru reset."); return; }

      setStatus("info", "Se trimite emailul de reset...");
      await sendPasswordResetEmail(auth, email);

      setStatus("success", "Email trimis. Verifica inbox/spam. Deschide link-ul si seteaza parola noua.");
    }catch(e){
      console.error(e);
      setStatus("error", e?.message || "Eroare la trimitere reset.");
    }
  });

  initResetStep2IfPresent();
}
