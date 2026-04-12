import { db } from "./firebase-init.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function $(id){ return document.getElementById(id); }

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tsMs(x) {
  try {
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  } catch {
    return 0;
  }
}

function fmtDate(x) {
  const ms = tsMs(x);
  if (!ms) return "";
  return new Date(ms).toLocaleString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function initNewsDetailPage() {
  const p = new URLSearchParams(location.search);
  const id = (p.get("id") || "").trim();
  const box = $("newsDetail");

  if (!id) {
    if (box) box.innerHTML = "Lipseste id-ul stirii.";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "communityNews", id));
    if (!snap.exists()) {
      if (box) box.innerHTML = "Stirea nu a fost gasita.";
      return;
    }

    const data = snap.data() || {};
    document.title = `${data.title || "Stire"} | Cere3D`;

    if (box) {
      box.innerHTML = `
        <div class="news-detail-meta">
          <span>📰 ${esc(data.sourceName || "Sursa necunoscuta")}</span>
          <span>•</span>
          <span>${esc(fmtDate(data.publishedAt))}</span>
        </div>

        <h1 class="news-detail-title">${esc(data.title || "Stire")}</h1>

        ${
          data.imageUrl
            ? `<img class="news-detail-image" src="${esc(data.imageUrl)}" alt="${esc(data.title || "Stire")}" />`
            : ``
        }

        <div class="news-detail-content">${esc(data.content || data.excerpt || "")}</div>

        <div class="news-detail-actions">
          <a class="btn btn-blue-soft" href="/comunitate-printatori.html">← Inapoi in comunitate</a>
          ${
            data.articleUrl
              ? `<a class="btn btn-orange" href="${esc(data.articleUrl)}" target="_blank" rel="noopener noreferrer">Citeste sursa originala</a>`
              : ``
          }
        </div>
      `;
    }
  } catch (err) {
    console.error(err);
    if (box) box.innerHTML = "Eroare la incarcarea stirii.";
  }
}

initNewsDetailPage();