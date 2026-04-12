import { auth } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function $(sel) { return document.querySelector(sel); }

let authInFlight = false;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function withTimeout(promise, ms = 15000) {
  return await Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout autentificare. Incearca din nou.")), ms))
  ]);
}

function setBusy(authLink, busy, text){
  if (!authLink) return;
  authLink.dataset.busy = busy ? "1" : "0";
  authLink.style.pointerEvents = busy ? "none" : "auto";
  authLink.style.opacity = busy ? "0.7" : "1";
  if (text) authLink.textContent = text;
}

async function promptLogin() {
  const email = prompt("Email:");
  if (!email) return { cancelled:true };

  const pass = prompt("Parola (min 6 caractere):");
  if (!pass) return { cancelled:true };

  // incercam login
  try {
    await withTimeout(signInWithEmailAndPassword(auth, email.trim(), pass), 15000);
    return { ok:true, mode:"login" };
  } catch (e) {
    // daca userul nu exista / parola gresita, oferim register
    const wantRegister = confirm("Login esuat. Vrei sa creezi cont cu aceste date?");
    if (!wantRegister) return { cancelled:true };

    await withTimeout(createUserWithEmailAndPassword(auth, email.trim(), pass), 15000);
    return { ok:true, mode:"register" };
  }
}

async function doLogout() {
  await withTimeout(signOut(auth), 15000);
  return { ok:true };
}

export function initAuthUi() {
  const authLink = $(".nav-auth");
  if (!authLink) return;

  authLink.addEventListener("click", async (e) => {
    e.preventDefault();

    // blocheaza spam click
    if (authInFlight) return;

    authInFlight = true;
    const wasLogged = !!auth.currentUser;
    const oldText = authLink.textContent;

    setBusy(authLink, true, wasLogged ? "Logout in progres..." : "Login in progres...");

    try {
      if (auth.currentUser) {
        await doLogout();
        // nu mai alert spam
      } else {
        const res = await promptLogin();
        if (res?.cancelled) {
          // user a dat cancel la prompt -> nu aratam eroare
          return;
        }
      }

      // lasam onAuthStateChanged sa actualizeze textul final
      await sleep(150);
    } catch (err) {
      console.error("[AUTH] failed:", err);
      alert(err?.message || "Eroare la autentificare. Incearca din nou.");
    } finally {
      authInFlight = false;
      setBusy(authLink, false);
      // daca onAuthStateChanged nu a apucat, refacem textul vechi ca fallback
      if (!authLink.textContent || authLink.textContent.includes("in progres")) {
        authLink.textContent = oldText;
      }
    }
  });

  onAuthStateChanged(auth, (user) => {
    // cand se schimba starea, actualizam si scapam de orice 'busy'
    setBusy(authLink, false);
    authLink.textContent = user ? "Logout" : "Autentificare";
  });
}
