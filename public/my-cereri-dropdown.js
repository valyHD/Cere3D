import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
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
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    }).format(d);
  }catch{ return ""; }
}

/* ===== status -> culoare card ===== */
function rowClassByStatus(c){
  if (c?.solved === true || c?.status === "solved") return "my-post-solved";
  if (c?.flags?.urgent === true) return "my-post-urgent";
  if (c?.flags?.highPay === true) return "my-post-highpay";
  return "my-post-open"; // default
}

export function initMyPostsDropdown(){
  const card = $("myPostsCard");
  const toggle = $("myPostsToggle");
  const toggleText = $("myPostsToggleText");
  const panel = $("myPostsPanel");
  const list = $("myPostsList");
  const hint = $("myPostsHint");

  if(!card || !toggle || !panel || !list) return;

  let unsub = null;
  let isOpen = false;

  function setOpen(v){
    isOpen = !!v;
    panel.style.display = isOpen ? "block" : "none";
    if (toggleText){
      toggleText.textContent = isOpen
        ? "Postarile mele (inchide)"
        : "Vezi postarile mele";
    }
  }

  toggle.addEventListener("click", () => setOpen(!isOpen));

  onAuthStateChanged(auth, (u) => {
    if (unsub){ unsub(); unsub = null; }

    if(!u){
      card.style.display = "none";
      setOpen(false);
      return;
    }

    card.style.display = "";
    if (hint){
      hint.textContent = "Lista rapida cu postarile tale.";
    }

    list.textContent = "Se incarca...";

    const q = query(
      collection(db, "cereri"),
      where("createdBy", "==", u.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    unsub = onSnapshot(q, (snap) => {
      if (snap.empty){
        list.innerHTML = `<div class="small-muted">Nu ai postari inca.</div>`;
        return;
      }

      const rows = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const id = docSnap.id;

        const title = c.title || c.titlu || "Cerere";
        const city = c.city || c.oras || "";
        const when = fmt(c.createdAt);

        rows.push(`
          <a class="my-post-row ${rowClassByStatus(c)}"
             href="/cerere.html?id=${encodeURIComponent(id)}">

            <div style="min-width:0;flex:1;">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${esc(title)}
              </div>

              <div class="my-post-meta">
                ${esc(city ? city + " • " : "")}${esc(when)}
              </div>
            </div>

            <div aria-hidden="true" style="font-weight:900;">→</div>
          </a>
        `);
      });

      list.innerHTML = rows.join("");
    }, (err) => {
      console.warn("[myPostsDropdown] failed:", err);
      list.innerHTML = `
        <div class="small-muted">
          Eroare la incarcare: ${esc(err?.message || String(err))}
        </div>`;
    });
  });
}
