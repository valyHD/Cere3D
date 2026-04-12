import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getPublicProfileUrl } from "./dm-utils.js";

function $(id){ return document.getElementById(id); }
function txt(id, v){ const el = $(id); if(el) el.textContent = v || ""; }
function safeTrim(s){ return (s || "").toString().trim(); }

async function loadProfile(uid){
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() || {}) : null;
}

async function saveProfile(uid, patch){
  const existingSnap = await getDoc(doc(db, "users", uid));
  const existing = existingSnap.exists() ? (existingSnap.data() || {}) : {};

  const next = { ...existing, ...patch };

  const nameFinal = safeTrim(next.name || existing.name || "User");
  const avatarFinal = safeTrim(next.avatarUrl || existing.avatarUrl || "");

  await setDoc(doc(db, "users", uid), {
    ...patch,
    uid,
    name: nameFinal,
    nameLower: nameFinal.toLowerCase(),
    avatarUrl: avatarFinal,
    updatedAt: serverTimestamp(),
    ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() })
  }, { merge: true });
}

async function uploadAvatar(uid, file){
  const ext = (file.name || "jpg").split(".").pop().toLowerCase();
  const safeExt = ext && ext.length <= 5 ? ext : "jpg";
  const path = `avatars/${uid}/avatar_${Date.now()}.${safeExt}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
  const url = await getDownloadURL(r);
  return { url, path };
}

export function initContPage(){
  onAuthStateChanged(auth, async (u) => {
    document.body.classList.remove("auth-loading");

    if(!u){
      location.href = `/auth.html?return=${encodeURIComponent("/cont.html")}`;
      return;
    }

    txt("p_msg", "Se incarca profilul...");

    try{
      const p = await loadProfile(u.uid);
      const isPrinter = p?.isPrinter === true;

      const btnViewPublic = $("btnViewPublic");
      if (btnViewPublic) {
        btnViewPublic.href = getPublicProfileUrl({
          uid: u.uid,
          isPrinter,
          printerVisible: p?.printerVisible !== false
        });
      }

      const btnViewPrinterPublic = $("btnViewPrinterPublic");
      if (btnViewPrinterPublic) {
        btnViewPrinterPublic.style.display = isPrinter ? "" : "none";
        btnViewPrinterPublic.href = `/profil-printator.html?uid=${encodeURIComponent(u.uid)}`;
      }

      if ($("p_name")) $("p_name").value = p?.name || u.displayName || "";
      if ($("p_bio")) $("p_bio").value = p?.bio || "";
      if ($("p_city")) $("p_city").value = p?.city || "";
      if ($("p_phone")) $("p_phone").value = p?.phone || "";

      const av = p?.avatarUrl || u.photoURL || "/assets/avatar-placeholder.svg";
      if ($("p_avatarPreview")) $("p_avatarPreview").src = av;

      txt("p_msg", "");
    }catch(e){
      console.error(e);
      txt("p_msg", "Eroare la incarcare profil.");
    }

    $("p_avatarFile")?.addEventListener("change", () => {
      const f = $("p_avatarFile")?.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = $("p_avatarPreview");
      if (img) img.src = url;
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    $("btnUploadAvatar")?.addEventListener("click", async () => {
      try{
        const f = $("p_avatarFile")?.files?.[0];
        if(!f){
          txt("p_avatarMsg", "Selecteaza o imagine.");
          return;
        }

        txt("p_avatarMsg", "Se incarca avatarul...");
        const out = await uploadAvatar(u.uid, f);

        await saveProfile(u.uid, {
          avatarUrl: out.url,
          avatarPath: out.path
        });

        txt("p_avatarMsg", "Avatar salvat.");
      }catch(e){
        console.error(e);
        txt("p_avatarMsg", e?.message || "Eroare la upload avatar.");
      }
    });

    $("btnSaveProfile")?.addEventListener("click", async () => {
      try{
        const name = safeTrim($("p_name")?.value);
        const bio = safeTrim($("p_bio")?.value);
        const city = safeTrim($("p_city")?.value);
        const phone = safeTrim($("p_phone")?.value);

        if(!name){
          txt("p_msg", "Numele public este obligatoriu.");
          return;
        }

        txt("p_msg", "Se salveaza...");
        await saveProfile(u.uid, {
          name,
          bio,
          city,
          phone,
          email: u.email || "",
          lastSeenAt: serverTimestamp(),
        });

        txt("p_msg", "Profil salvat.");
      }catch(e){
        console.error(e);
        txt("p_msg", e?.message || "Eroare la salvare.");
      }
    });
  });
}