import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ADMIN_UID = "LpiKjlandvYaPgQIaKAlDkUkEeB2";

function escapeHtml(str){
  return (str ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function fmtDate(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "-";
    return d.toLocaleString("ro-RO");
  }catch{
    return "-";
  }
}

function card(reportId, r){
  const status = r.status || "open";
  const statusText = status === "closed" ? "Rezolvat" : "Deschis";

  const reason = escapeHtml(r.reason || "-");
  const details = escapeHtml(r.details || "-");
  const url = escapeHtml(r.contextUrl || "-");
  const created = fmtDate(r.createdAt);

  const repUid = escapeHtml(r.reporterUid || "-");
  const repEmail = escapeHtml(r.reporterEmail || "-");
  const repName = escapeHtml(r.reporterName || "-");

  return `
  <article class="request-card" style="cursor:default;">
    <div class="request-top" style="justify-content:space-between;">
      <div class="request-title" style="white-space:normal;">
        Raport: <b>${reason}</b>
      </div>
      <span class="meta-pill" style="opacity:.9;">${statusText}</span>
    </div>

    <div class="request-meta">
      <span class="meta-pill">Data: ${escapeHtml(created)}</span>
      <span class="meta-pill">Reporter: ${repName || "User"}</span>
      <span class="meta-pill">Email: ${repEmail}</span>
      <span class="meta-pill">UID: ${repUid}</span>
    </div>

    <div class="request-tags" style="gap:8px;">
      <span class="tag" style="white-space:normal; line-height:1.35; max-width:100%;">
        <b>Detalii:</b> ${details}
      </span>
      <span class="tag" style="white-space:normal; line-height:1.35; max-width:100%;">
        <b>URL:</b> ${url}
      </span>
    </div>

    <div class="request-foot" style="margin-top:12px;">
      <div class="foot-left" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-blue btn-soft" data-action="copy" data-copy="${repUid}">Copiaza UID</button>
        <button class="btn btn-blue btn-soft" data-action="copy" data-copy="${repEmail}">Copiaza Email</button>
      </div>

      <div class="foot-right" style="display:flex; gap:10px; flex-wrap:wrap;">
        ${status !== "closed"
          ? `<button class="btn btn-blue" data-action="close" data-id="${reportId}">Marcheaza rezolvat</button>`
          : `<button class="btn btn-blue btn-soft" data-action="reopen" data-id="${reportId}">Redeschide</button>`
        }
        <button class="btn btn-orange btn-soft-orange" data-action="delete" data-id="${reportId}">
          Sterge
        </button>
      </div>
    </div>
  </article>`;
}

async function loadReports(){
  const grid = document.getElementById("reportsGrid");
  const empty = document.getElementById("reportsEmpty");
  const statusSel = document.getElementById("f_status");
  const qInput = document.getElementById("f_q");

  const mode = statusSel.value; // open / closed / all
  const textQ = (qInput.value || "").trim().toLowerCase();

  grid.innerHTML = "";
  empty.style.display = "none";

  const qy = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200));
  const snap = await getDocs(qy);

  let items = [];
  snap.forEach(docSnap => {
    const r = docSnap.data();
    const id = docSnap.id;

    const st = r.status || "open";
    if (mode === "open" && st === "closed") return;
    if (mode === "closed" && st !== "closed") return;

    if (textQ){
      const hay = [
        id,
        r.reason, r.details, r.contextUrl,
        r.reporterUid, r.reporterEmail, r.reporterName
      ].join(" ").toLowerCase();
      if (!hay.includes(textQ)) return;
    }

    items.push({ id, r });
  });

  if (!items.length){
    empty.style.display = "block";
    return;
  }

  grid.innerHTML = items.map(x => card(x.id, x.r)).join("");
}

async function setStatus(reportId, status){
  await updateDoc(doc(db, "reports", reportId), { status });
}

async function deleteReport(reportId){
  await deleteDoc(doc(db, "reports", reportId));
}

function copyToClipboard(txt){
  navigator.clipboard?.writeText(txt || "");
}

export function initAdminReports(){
  const adminStatus = document.getElementById("adminStatus");
  const btnReload = document.getElementById("btnReload");
  const grid = document.getElementById("reportsGrid");
  const statusSel = document.getElementById("f_status");
  const qInput = document.getElementById("f_q");

  onAuthStateChanged(auth, async (u) => {
    if (!u){
      adminStatus.textContent = "Trebuie sa fii autentificat.";
      return;
    }
    if (u.uid !== ADMIN_UID){
      adminStatus.textContent = "Nu ai acces (doar admin).";
      return;
    }

    adminStatus.textContent = "Admin ok. Se incarca rapoartele...";
    await loadReports();
    adminStatus.textContent = "Rapoarte incarcate.";
  });

  btnReload?.addEventListener("click", async () => loadReports());
  statusSel?.addEventListener("change", async () => loadReports());
  qInput?.addEventListener("input", () => {
    clearTimeout(window.__rT);
    window.__rT = setTimeout(loadReports, 250);
  });

  grid?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    try{
      if (action === "copy"){
        copyToClipboard(btn.dataset.copy || "");
        const old = btn.textContent;
        btn.textContent = "Copiat!";
        setTimeout(() => (btn.textContent = old), 800);
        return;
      }

      const id = btn.dataset.id;

      if (action === "close"){
        await setStatus(id, "closed");
        await loadReports();
        return;
      }
      if (action === "reopen"){
        await setStatus(id, "open");
        await loadReports();
        return;
      }
      if (action === "delete"){
        if (!confirm("Sigur stergi raportul?")) return;
        await deleteReport(id);
        await loadReports();
        return;
      }
    }catch(err){
      console.error(err);
      alert("Eroare. Verifica consola.");
    }
  });
}
