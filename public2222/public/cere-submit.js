// cere-submit.js
import { db, storage, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function $(id) { return document.getElementById(id); }

function val(id) {
  const el = $(id);
  if (!el) return "";
  return (el.value ?? "").toString().trim();
}

function numVal(id) {
  const v = val(id);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function norm(s){
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showGuard(title, text, onClick){
  const t = $("guardTitle");
  const p = $("guardText");
  const modal = $("authGuard");
  const btn = $("guardBtn");

  if (t) t.textContent = title;
  if (p) p.textContent = text;
  if (modal) modal.style.display = "flex";
  if (btn) btn.onclick = onClick;
}

/* ========================= */

async function uploadPhotos(cerereId, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];

  const out = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const uid = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const safeBase = (file.name || `photo_${i}.jpg`).replace(/\s+/g, "_");
    const safeName = `${uid}_${i}_${safeBase}`;

    const path = `cereri/${cerereId}/photos/${safeName}`;
    const r = ref(storage, path);

    await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(r);

    out.push({
      url,
      name: file.name || safeBase,
      size: file.size || null,
      contentType: file.type || null,
      storagePath: path
    });
  }
  return out;
}

async function uploadModelFile(cerereId, file) {
  if (!file) return null;

  const safeName = `${Date.now()}_${file.name}`.replace(/\s+/g, "_");
  const path = `cereri/${cerereId}/model/${safeName}`;
  const r = ref(storage, path);

  await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(r);

  return {
    url,
    name: file.name || safeName,
    size: file.size || null,
    contentType: file.type || null,
    storagePath: path
  };
}

/* ========================= */

export function initCereSubmit() {
  const btn = $("btnPosteazaCererea");
  if (!btn) return;

  const originalBtnText = btn.textContent;

  btn.disabled = false;

  onAuthStateChanged(auth, () => {
    btn.disabled = false;
  });

  async function doSubmit() {
    let posted = false;

    try {
      const user = auth.currentUser;

      if (!user) {
        showGuard(
          "Trebuie autentificare",
          "Pentru a publica cererea ai nevoie de cont.",
          () => location.href = "/auth.html"
        );
        return;
      }

      const psRef = doc(db, "users", user.uid);
      const psSnap = await getDoc(psRef);

      if (!psSnap.exists()) {
        showGuard(
          "Profil incomplet",
          "Completeaza numele in profil ca sa poti posta.",
          () => location.href = "/cont.html"
        );
        return;
      }

      const p = psSnap.data() || {};
      const profName = (p.name || "").toString().trim();
      const profAvatar = (p.avatarUrl || "").toString();

      if (profName.length < 2) {
        showGuard(
          "Completeaza numele",
          "Inainte sa postezi, completeaza numele in profil.",
          () => location.href = "/cont.html"
        );
        return;
      }

      const county = val("c_county");
      const city = val("c_city") || county; // fallback logic

      if (!county) return alert("Selecteaza judetul.");
      if (!val("c_title")) return alert("Titlul scurt este obligatoriu.");
      if (!val("c_description")) return alert("Descrierea este obligatorie.");

      try {
        if (window.requestPushFromUserGesture) {
          console.log("[cere-submit] apelez requestPushFromUserGesture");
          await window.requestPushFromUserGesture();
        } else {
          console.log("[cere-submit] requestPushFromUserGesture nu exista pe window");
        }
      } catch (e) {
        console.warn("[cere-submit] push request failed:", e);
      }

      btn.disabled = true;
      btn.textContent = "Se posteaza...";

      const payload = {
        title: val("c_title"),
        description: val("c_description"),

        county: county,
        city: city,
        cityLower: norm(city),

        category: val("c_category") || "General",
        budget: val("c_budget") || "Nu stiu",
        deadline: val("c_deadline") || "Oricand",
        pickup: val("c_pickup") || "Oricare",
        have3d: val("c_have3d") || "",
        referenceUrl: val("c_refurl"),

        photos: [],
        modelFile: null,

        status: "open",
        createdBy: user.uid,
        createdByName: profName,
        createdByAvatar: profAvatar || "",

        createdAt: serverTimestamp(),
      };

      const refDoc = await addDoc(collection(db, "cereri"), payload);

      const modelFile = $("c_model3d")?.files?.[0] || null;
      if (modelFile) {
        const mf = await uploadModelFile(refDoc.id, modelFile);
        if (mf?.url) await updateDoc(doc(db, "cereri", refDoc.id), { modelFile: mf });
      }

      const uploadedPhotos = await uploadPhotos(refDoc.id, $("c_photos")?.files);
      if (uploadedPhotos.length) {
        await updateDoc(doc(db, "cereri", refDoc.id), { photos: uploadedPhotos });
      }

      posted = true;

      const go = () => {
        location.href = `/cerere.html?id=${encodeURIComponent(refDoc.id)}`;
      };

      // trimite conversia DOAR daca exista gtag (si nu e blocat)
      try {
        if (typeof window.gtag === "function") {
          window.gtag("event", "conversion", {
            send_to: "AW-17949757837/5Pd5CKqGwvcbEI2jju9C", // <- AICI pui label-ul real
            event_callback: go,               // redirect dupa ce se trimite
          });

          // fallback: daca event_callback nu vine (adblock / net), tot redirect dupa 800ms
          setTimeout(go, 800);
        } else {
          go();
        }
      } catch (e) {
        go();
      }

      return;

    } catch (err) {
      console.error(err);
      alert("Eroare la postare: " + (err?.message || err));
    } finally {
      if (!posted) {
        btn.disabled = false;
        btn.textContent = originalBtnText; // NU mai revine la textul vechi
      }
    }
  }

  btn.addEventListener("click", async () => {
    await doSubmit();
  });
}