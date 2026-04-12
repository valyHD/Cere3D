import { db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function $(id){ return document.getElementById(id); }

export async function initProfilePage(){
  const params = new URLSearchParams(location.search);
  const uid = params.get("uid");
  if(!uid){
    $("p_name").textContent = "Profil lipsa";
    $("p_sub").textContent = "Lipseste uid in URL (profil.html?uid=...)";
    return;
  }

  const snap = await getDoc(doc(db, "users", uid));
  if(!snap.exists()){
    $("p_name").textContent = "Profil inexistent";
    $("p_sub").textContent = "Nu am gasit user-ul.";
    return;
  }

  const u = snap.data();
  $("p_name").textContent = u.name || "User";
  $("p_bio").textContent = u.bio || "—";
  $("p_avg").textContent = Number(u.ratingAvg || 0).toFixed(1);
  $("p_count").textContent = String(u.ratingCount || 0);
  $("p_rating").textContent = `Rating: ${Number(u.ratingAvg || 0).toFixed(1)} / 5 (${u.ratingCount || 0} review-uri)`;

  if (u.avatarUrl){
    const img = $("p_avatar");
    img.src = u.avatarUrl;
    img.style.display = "block";
    $("p_avatar_ph").style.display = "none";
  }
}
