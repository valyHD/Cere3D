import { auth } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function $(sel) { return document.querySelector(sel); }

async function promptLogin() {
  const email = prompt("Email:");
  if (!email) return;
  const pass = prompt("Parola (min 6 caractere):");
  if (!pass) return;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    alert("Logat!");
  } catch (e) {
    const wantRegister = confirm("Login esuat. Vrei sa creezi cont cu aceste date?");
    if (!wantRegister) return;
    await createUserWithEmailAndPassword(auth, email, pass);
    alert("Cont creat + logat!");
  }
}

async function doLogout() {
  await signOut(auth);
  alert("Logout ok!");
}

export function initAuthUi() {
  const authLink = $(".nav-auth");
  if (!authLink) return;

  authLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (auth.currentUser) return doLogout();
    return promptLogin();
  });

  onAuthStateChanged(auth, (user) => {
    authLink.textContent = user ? "Logout" : "Autentificare";
  });
}
