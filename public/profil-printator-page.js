import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  serverTimestamp,
  getCountFromServer,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function $(id) { return document.getElementById(id); }

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function timeAgo(ms) {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "acum cateva secunde";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ore`;
  const d = Math.floor(h / 24);
  if (d < 30) return `acum ${d} zile`;
  return new Date(ms).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("ro-RO", {
    month: "long",
    year: "numeric"
  });
}

function starsHtml(avg) {
  const rounded = Math.round(Math.max(0, Math.min(5, avg)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function normalizeList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map(x => String(x || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map(x => x.trim()).filter(Boolean);
  }
  return fallback;
}

function joinListInput(value) {
  return normalizeList(value).join(", ");
}

function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return "";
}

function safeWhatsappLink(value) {
  const raw = String(value || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}`;
}

function formatBusinessEmail(value) {
  const s = String(value || "").trim();
  return s && s.includes("@") ? `mailto:${s}` : "";
}

function getSeoProfileData(u) {
  const name = u.name || "Printator";
  const city = u.printerCity || u.city || "Romania";

  const quickBadges = normalizeList(u.printerQuickBadges, [
    "Lucreaza dupa poza",
    "Livrare nationala"
  ]);

  const specialties = normalizeList(u.printerSpecialties, [
    "Printare 3D la comanda",
    "Refacere piese rupte",
    "Modelare 3D dupa poza"
  ]);

  const services = normalizeList(u.printerServices, [
    "Printare 3D la comanda",
    "Refacere piese rupte",
    "Modelare 3D",
    "Productie serie mica"
  ]);

  const materials = normalizeList(u.printerMaterials, [
    "PLA",
    "PETG"
  ]);

  const areas = normalizeList(
    u.printerAreas,
    city && city !== "Romania" ? [city, "Romania"] : ["Romania"]
  );

  const responseTime = String(u.printerResponseTime || "").trim() || "Raspunde de obicei in aceeasi zi.";
  const executionTime = String(u.printerExecutionTime || "").trim() || "Proiectele simple se executa de obicei in 1-2 zile, in functie de complexitate.";
  const whyMe = String(u.printerWhyMe || "").trim() || "Raspund rapid, pot lucra dupa poza sau dimensiuni si pot recomanda materialul potrivit pentru piesa ta.";

  const workSteps = Array.isArray(u.printerWorkSteps)
    ? u.printerWorkSteps.map(x => String(x || "").trim()).filter(Boolean)
    : String(u.printerWorkSteps || "")
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);

  const normalizedWorkSteps = workSteps.length ? workSteps : [
    "Trimiti poza, modelul sau dimensiunile.",
    "Discutam cerinta si alegem materialul potrivit.",
    "Printez si verific piesa sau proiectul.",
    "Predare personala sau livrare, in functie de proiect."
  ];

  const links = {
    website: safeUrl(u.printerWebsite),
    instagram: safeUrl(u.printerInstagram),
    facebook: safeUrl(u.printerFacebook),
    tiktok: safeUrl(u.printerTikTok),
    whatsapp: safeWhatsappLink(u.printerWhatsapp),
    email: formatBusinessEmail(u.printerBusinessEmail),
    externalPortfolio: safeUrl(u.printerExternalPortfolio)
  };

  const faqPhoto = typeof u.printerFaqPhoto === "boolean" ? u.printerFaqPhoto : true;
  const faqDelivery = typeof u.printerFaqDelivery === "boolean" ? u.printerFaqDelivery : true;
  const faqMaterials = String(u.printerFaqMaterials || "").trim() || "Lucrez in functie de proiect cu PLA, PETG, ABS, ASA sau alte materiale potrivite pentru interior, exterior sau piese functionale.";

  return {
    name,
    city,
    quickBadges,
    specialties,
    services,
    materials,
    areas,
    responseTime,
    executionTime,
    whyMe,
    normalizedWorkSteps,
    links,
    faqPhoto,
    faqDelivery,
    faqMaterials
  };
}

function buildSeoText(profile) {
  const s1 = profile.specialties.slice(0, 4).join(", ");
  const s2 = profile.services.slice(0, 4).join(", ");
  return `${profile.name} este printator 3D din ${profile.city}, specializat in ${s1 || "printare 3D la comanda"}. Ofera servicii de ${s2 || "printare 3D la comanda"}, refacere piese rupte si modelare 3D dupa poza sau dimensiuni pentru clienti din ${profile.areas.join(", ")}.`;
}

function renderChipList(items, variant = "") {
  if (!items?.length) return `<span class="pp-chip-tag">Nu sunt completate inca</span>`;
  return items.map(item => `<span class="pp-chip-tag ${variant}">${esc(item)}</span>`).join("");
}

function renderExternalLinks(links) {
  const out = [];
  if (links.website) out.push({ label: "🌍 Site oficial", href: links.website });
  if (links.instagram) out.push({ label: "📸 Instagram", href: links.instagram });
  if (links.facebook) out.push({ label: "📘 Facebook", href: links.facebook });
  if (links.tiktok) out.push({ label: "🎵 TikTok", href: links.tiktok });
  if (links.whatsapp) out.push({ label: "💬 WhatsApp", href: links.whatsapp });
  if (links.email) out.push({ label: "✉️ Email business", href: links.email });
  if (links.externalPortfolio) out.push({ label: "🗂️ Portofoliu extern", href: links.externalPortfolio });

  if (!out.length) return `<span class="pp-chip-tag">Canalele externe nu sunt completate inca.</span>`;

  return out.map(link => `
    <a class="pp-link-btn" href="${esc(link.href)}" target="_blank" rel="nofollow noopener noreferrer">
      ${esc(link.label)}
    </a>
  `).join("");
}

function renderFaq(profile) {
  const items = [
    {
      q: "Ce tipuri de piese poate realiza?",
      a: `${profile.name} lucreaza in special cu proiecte precum ${profile.specialties.slice(0, 6).join(", ")}.`
    },
    {
      q: "Lucreaza dupa poza?",
      a: profile.faqPhoto
        ? "Da. In multe cazuri poate lucra dupa poze clare, dimensiuni sau model existent, in functie de complexitatea piesei."
        : "Pentru unele proiecte este nevoie de mai multe detalii, dimensiuni sau model 3D, in functie de complexitatea piesei."
    },
    {
      q: "Livreaza in tara?",
      a: profile.faqDelivery
        ? `Da. Acopera ${profile.areas.join(", ")} si poate discuta livrarea in functie de proiect.`
        : `Lucreaza in special pentru ${profile.areas.join(", ")}.`
    },
    {
      q: "Ce materiale foloseste?",
      a: profile.faqMaterials
    }
  ];

  return items.map(item => `
    <div class="pp-faq-item">
      <div class="pp-faq-q">${esc(item.q)}</div>
      <div class="pp-faq-a">${esc(item.a)}</div>
    </div>
  `).join("");
}

function renderWorkSteps(profile) {
  const steps = profile.normalizedWorkSteps || [];
  if (!steps.length) {
    return `<div class="pp-empty">Nu sunt completati pasii de lucru inca.</div>`;
  }

  return steps.slice(0, 6).map((step, index) => `
    <div class="pp-faq-item">
      <div class="pp-faq-q">Pasul ${index + 1}</div>
      <div class="pp-faq-a">${esc(step)}</div>
    </div>
  `).join("");
}

async function getReviewStats(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "reviews"));
    let sum = 0;
    let count = 0;
    snap.forEach(d => {
      const r = Number(d.data()?.rating || 0);
      if (r >= 1 && r <= 5) {
        sum += r;
        count++;
      }
    });
    return { avg: count ? sum / count : 0, count, docs: snap };
  } catch {
    return { avg: 0, count: 0, docs: null };
  }
}

async function isUserOnline(uid) {
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const snap = await getDocs(query(
      collection(db, "presence"),
      where("uid", "==", uid),
      where("lastSeen", ">=", cutoff)
    ));
    return !snap.empty;
  } catch {
    return false;
  }
}

async function getSolvedTotalCount(uid) {
  try {
    const agg = await getCountFromServer(query(
      collection(db, "cereri"),
      where("selectedMakerUid", "==", uid),
      where("status", "==", "solved")
    ));
    return agg.data().count || 0;
  } catch (e) {
    console.warn("[profil-printator] solved total failed:", e);
    return 0;
  }
}

function setSeoMeta(u, uid, reviewStats, solvedTotal = null) {
  const profile = getSeoProfileData(u);
  const solved = Number(((solvedTotal ?? u.printerSolvedCount) || 0));
  const ratingAvgValue = Number(reviewStats?.avg || 0);
  const ratingCountValue = Number(reviewStats?.count || 0);
  const ratingAvgText = ratingAvgValue > 0 ? ratingAvgValue.toFixed(1) : "0.0";
  const seoText = buildSeoText(profile);

  document.title = `${profile.name} — Printator 3D ${profile.city} | Cere3D`;
  document.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    `${seoText} ${solved} cereri rezolvate, rating ${ratingAvgText}/5 pe Cere3D.`
  );

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = `https://cere3d.ro/profil-printator.html?uid=${uid}`;

  document.querySelector('meta[property="og:title"]')?.setAttribute("content", `${profile.name} — Printator 3D ${profile.city} | Cere3D`);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", seoText);

  const sameAs = Object.values(profile.links).filter(Boolean);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": profile.name,
    "description": seoText,
    "url": `https://cere3d.ro/profil-printator.html?uid=${uid}`,
    "image": u.avatarUrl || "https://cere3d.ro/assets/avatar-placeholder.svg",
    "sameAs": sameAs.length ? sameAs : undefined,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": profile.city,
      "addressCountry": "RO"
    },
    "areaServed": profile.areas.map(area => ({
      "@type": "Place",
      "name": area
    })),
    "knowsAbout": [...new Set([
      ...profile.quickBadges,
      ...profile.specialties,
      ...profile.services,
      ...profile.materials
    ])],
    "aggregateRating": ratingCountValue > 0 ? {
      "@type": "AggregateRating",
      "ratingValue": ratingAvgText,
      "reviewCount": String(ratingCountValue),
      "bestRating": "5",
      "worstRating": "1"
    } : undefined
  };

  const ldEl = $("jsonLdPrinter");
  if (ldEl) ldEl.textContent = JSON.stringify(ld, null, 2);

  const breadcrumb = $("breadcrumbName");
  if (breadcrumb) breadcrumb.textContent = profile.name;
}

function renderSeoSection(u) {
  const profile = getSeoProfileData(u);

  const seoTextEl = $("printerSeoText");
  if (seoTextEl) seoTextEl.textContent = buildSeoText(profile);

  const quickBadgesEl = $("printerQuickBadgesChips");
  if (quickBadgesEl) quickBadgesEl.innerHTML = renderChipList(profile.quickBadges, "orange");

  const specEl = $("printerSpecialtiesChips");
  if (specEl) specEl.innerHTML = renderChipList(profile.specialties, "blue");

  const servicesEl = $("printerServicesChips");
  if (servicesEl) servicesEl.innerHTML = renderChipList(profile.services, "green");

  const areasEl = $("printerAreasChips");
  if (areasEl) areasEl.innerHTML = renderChipList(profile.areas, "orange");

  const materialsEl = $("printerMaterialsChips");
  if (materialsEl) materialsEl.innerHTML = renderChipList(profile.materials, "green");

  const responseTimeEl = $("printerResponseTimeText");
  if (responseTimeEl) responseTimeEl.textContent = profile.responseTime;

  const executionTimeEl = $("printerExecutionTimeText");
  if (executionTimeEl) executionTimeEl.textContent = profile.executionTime;

  const whyMeEl = $("printerWhyMeText");
  if (whyMeEl) whyMeEl.textContent = profile.whyMe;

  const workStepsEl = $("printerWorkStepsList");
  if (workStepsEl) workStepsEl.innerHTML = renderWorkSteps(profile);

  const linksWrap = $("printerLinksWrap");
  if (linksWrap) linksWrap.innerHTML = renderExternalLinks(profile.links);

  const faqList = $("printerFaqList");
  if (faqList) faqList.innerHTML = renderFaq(profile);
}

function fillSeoEditor(u) {
  if ($("printerQuickBadgesInput")) $("printerQuickBadgesInput").value = joinListInput(u.printerQuickBadges);
  if ($("printerSpecialtiesInput")) $("printerSpecialtiesInput").value = joinListInput(u.printerSpecialties);
  if ($("printerServicesInput")) $("printerServicesInput").value = joinListInput(u.printerServices);
  if ($("printerMaterialsInput")) $("printerMaterialsInput").value = joinListInput(u.printerMaterials);
  if ($("printerAreasInput")) $("printerAreasInput").value = joinListInput(u.printerAreas);
  if ($("printerResponseTimeInput")) $("printerResponseTimeInput").value = String(u.printerResponseTime || "");
  if ($("printerExecutionTimeInput")) $("printerExecutionTimeInput").value = String(u.printerExecutionTime || "");
  if ($("printerWhyMeInput")) $("printerWhyMeInput").value = String(u.printerWhyMe || "");
  if ($("printerWorkStepsInput")) {
    $("printerWorkStepsInput").value = Array.isArray(u.printerWorkSteps)
      ? u.printerWorkSteps.join("\n")
      : String(u.printerWorkSteps || "");
  }
  if ($("printerWebsiteInput")) $("printerWebsiteInput").value = String(u.printerWebsite || "");
  if ($("printerInstagramInput")) $("printerInstagramInput").value = String(u.printerInstagram || "");
  if ($("printerFacebookInput")) $("printerFacebookInput").value = String(u.printerFacebook || "");
  if ($("printerTiktokInput")) $("printerTiktokInput").value = String(u.printerTikTok || "");
  if ($("printerWhatsappInput")) $("printerWhatsappInput").value = String(u.printerWhatsapp || "");
  if ($("printerBusinessEmailInput")) $("printerBusinessEmailInput").value = String(u.printerBusinessEmail || "");
  if ($("printerExternalPortfolioInput")) $("printerExternalPortfolioInput").value = String(u.printerExternalPortfolio || "");
  if ($("printerFaqPhotoInput")) $("printerFaqPhotoInput").value = String(typeof u.printerFaqPhoto === "boolean" ? u.printerFaqPhoto : true);
  if ($("printerFaqDeliveryInput")) $("printerFaqDeliveryInput").value = String(typeof u.printerFaqDelivery === "boolean" ? u.printerFaqDelivery : true);
  if ($("printerFaqMaterialsInput")) $("printerFaqMaterialsInput").value = String(u.printerFaqMaterials || "");
}

function collectSeoEditorData() {
  return {
    printerQuickBadges: normalizeList($("printerQuickBadgesInput")?.value),
    printerSpecialties: normalizeList($("printerSpecialtiesInput")?.value),
    printerServices: normalizeList($("printerServicesInput")?.value),
    printerMaterials: normalizeList($("printerMaterialsInput")?.value),
    printerAreas: normalizeList($("printerAreasInput")?.value),
    printerResponseTime: String($("printerResponseTimeInput")?.value || "").trim(),
    printerExecutionTime: String($("printerExecutionTimeInput")?.value || "").trim(),
    printerWhyMe: String($("printerWhyMeInput")?.value || "").trim(),
    printerWorkSteps: String($("printerWorkStepsInput")?.value || "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean),
    printerWebsite: String($("printerWebsiteInput")?.value || "").trim(),
    printerInstagram: String($("printerInstagramInput")?.value || "").trim(),
    printerFacebook: String($("printerFacebookInput")?.value || "").trim(),
    printerTikTok: String($("printerTiktokInput")?.value || "").trim(),
    printerWhatsapp: String($("printerWhatsappInput")?.value || "").trim(),
    printerBusinessEmail: String($("printerBusinessEmailInput")?.value || "").trim(),
    printerExternalPortfolio: String($("printerExternalPortfolioInput")?.value || "").trim(),
    printerFaqPhoto: $("printerFaqPhotoInput")?.value === "true",
    printerFaqDelivery: $("printerFaqDeliveryInput")?.value === "true",
    printerFaqMaterials: String($("printerFaqMaterialsInput")?.value || "").trim()
  };
}

function applySeoPreview(baseUser, patch, uid, reviewStats) {
  const merged = { ...baseUser, ...patch };
  renderSeoSection(merged);
  setSeoMeta(merged, uid, reviewStats, merged.printerSolvedCount || 0);
  setupQrCode(merged, uid);
  return merged;
}

function initSeoEditor(uid, userDataRef, reviewStats) {
  const editor = $("printerSeoEditor");
  const statusEl = $("printerSeoEditorStatus");
  const saveBtn = $("savePrinterSeoBtn");
  const previewBtn = $("previewPrinterSeoBtn");

  if (!editor || !saveBtn || !previewBtn) return;
  editor.style.display = "";

  let liveUserData = { ...userDataRef.value };
  fillSeoEditor(liveUserData);

  previewBtn.addEventListener("click", () => {
    const patch = collectSeoEditorData();
    liveUserData = applySeoPreview(liveUserData, patch, uid, reviewStats);
    if (statusEl) statusEl.textContent = "Preview actualizat.";
  });

  saveBtn.addEventListener("click", async () => {
    try {
      saveBtn.disabled = true;
      if (statusEl) statusEl.textContent = "Se salveaza profilul profesional...";

      const patch = collectSeoEditorData();

      await setDoc(doc(db, "users", uid), {
        ...patch,
        updatedAt: serverTimestamp()
      }, { merge: true });

      liveUserData = { ...liveUserData, ...patch };
      userDataRef.value = liveUserData;

      renderSeoSection(liveUserData);
      setSeoMeta(liveUserData, uid, reviewStats, liveUserData.printerSolvedCount || 0);
      setupQrCode(liveUserData, uid);

      if (statusEl) statusEl.textContent = "✅ Profilul profesional a fost salvat.";
    } catch (e) {
      console.error("[profil-printator] save seo editor failed:", e);
      if (statusEl) statusEl.textContent = e?.message || "Eroare la salvare.";
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function getPrinterProfileUrl(uid) {
  return `https://cere3d.ro/profil-printator.html?uid=${encodeURIComponent(uid)}`;
}

function setupQrCode(u, uid) {
  const qrImg = $("printerQrImg");
  const downloadBtn = $("downloadQrBtn");
  const copyBtn = $("copyPrinterProfileLinkBtn");

  if (!qrImg) return;

  const profileUrl = getPrinterProfileUrl(uid);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(profileUrl)}`;

  qrImg.src = qrUrl;

  if (downloadBtn) {
    downloadBtn.href = qrUrl;
    downloadBtn.download = `cere3d-profil-${(u.name || "printator").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "printator"}-qr.png`;
  }

  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = "1";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(profileUrl);
        copyBtn.textContent = "✅ Link copiat";
        setTimeout(() => {
          copyBtn.textContent = "📋 Copiaza linkul";
        }, 1800);
      } catch (e) {
        console.warn("[profil-printator] copy link failed:", e);
      }
    });
  }
}

function initShareButton(u, uid) {
  const btn = $("btnSharePrinterProfile");
  if (!btn || btn.dataset.bound) return;

  btn.dataset.bound = "1";

  const shareUrl = getPrinterProfileUrl(uid);
  const shareTitle = `${u.name || "Printator"} - profil printator 3D pe Cere3D`;
  const shareText = `Vezi profilul meu de printator pe Cere3D: portofoliu, specializari, servicii si review-uri.`;

  btn.addEventListener("click", async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      btn.textContent = "✅ Link copiat";
      setTimeout(() => {
        btn.textContent = "🔗 Distribuie profilul";
      }, 1800);
    } catch (e) {
      console.warn("[profil-printator] share failed:", e);
      try {
        await navigator.clipboard.writeText(shareUrl);
        btn.textContent = "✅ Link copiat";
        setTimeout(() => {
          btn.textContent = "🔗 Distribuie profilul";
        }, 1800);
      } catch {}
    }
  });
}

function renderPortfolioItem(item) {
  const beforeUrl = esc(item.beforeUrl || item.imageUrl || item.url || "");
  const afterUrl = esc(item.afterUrl || "");
  const title = esc(item.title || "Piesa printata");
  const desc = esc(item.desc || item.description || "");
  const createdMs = tsMs(item.createdAt);

  const imagesHtml = afterUrl
    ? `<div class="pp-portfolio-imgs">
        <img class="pp-portfolio-img js-lightbox" src="${beforeUrl}" alt="Inainte - ${title}" loading="lazy" />
        <img class="pp-portfolio-img js-lightbox" src="${afterUrl}" alt="Dupa - ${title}" loading="lazy" />
       </div>`
    : `<img class="pp-portfolio-img-single js-lightbox" src="${beforeUrl}" alt="${title}" loading="lazy" />`;

  return `
    <div class="pp-portfolio-item">
      ${imagesHtml}
      <div class="pp-portfolio-body">
        <div class="pp-portfolio-title">${title}</div>
        ${desc ? `<div class="pp-portfolio-desc">${desc}</div>` : ""}
        <div>
          <span class="pp-portfolio-label">✔ Piesa rezolvata</span>
          ${afterUrl ? `<span class="pp-portfolio-label" style="margin-left:4px;background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.18);color:#1d4ed8;">📸 Inainte &amp; Dupa</span>` : ""}
        </div>
        ${createdMs ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">${fmtDate(createdMs)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderSolvedCerere(c) {
  const id = c.id || "";
  const title = esc(c.title || c.titlu || "Cerere rezolvata");
  const city = esc(c.city || c.oras || "—");
  const material = esc(c.material || "");
  const solvedMs = tsMs(c.resolvedAt || c.updatedAt || c.createdAt);

  return `
    <a class="pp-cerere-item" href="/cerere.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">
      <span class="pp-cerere-status" aria-label="Rezolvata"></span>
      <div style="min-width:0;flex:1;">
        <div class="pp-cerere-title">${title}</div>
        <div class="pp-cerere-meta">
          ${city !== "—" ? `📍 ${city} · ` : ""}
          ${material ? `🧱 ${material} · ` : ""}
          ${solvedMs ? `✔ ${timeAgo(solvedMs)}` : ""}
        </div>
      </div>
      <span style="font-size:12px;color:#5e718d;flex-shrink:0;">→</span>
    </a>
  `;
}

async function loadPortfolio(uid, isOwner) {
  const grid = $("portfolioGrid");
  const countEl = $("portfolioCount");
  const uploadWrap = $("portfolioUploadWrap");

  if (!grid) return;
  if (isOwner && uploadWrap) uploadWrap.style.display = "";

  try {
    const snap = await getDocs(query(
      collection(db, "users", uid, "portfolio"),
      orderBy("createdAt", "desc"),
      limit(20)
    ));

    if (snap.empty) {
      grid.innerHTML = `<div class="pp-empty" style="grid-column:1/-1;">
        ${isOwner ? "Portofoliul tau este gol. Adauga prima poza cu o piesa rezolvata! 👆" : "Niciun element in portofoliu inca."}
      </div>`;
      if (countEl) countEl.textContent = "(0)";
      return;
    }

    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));

    grid.innerHTML = items.map(renderPortfolioItem).join("");
    if (countEl) countEl.textContent = `(${items.length})`;
  } catch (e) {
    console.error("[profil-printator] portfolio load failed:", e);
    grid.innerHTML = `<div class="pp-empty" style="grid-column:1/-1;">Eroare la incarcare portofoliu.</div>`;
  }
}

async function loadSolvedCereri(uid) {
  const list = $("solvedList");
  const countEl = $("solvedCount");
  const statSolved = $("statSolved");

  if (!list) return;

  try {
    let snap;
    try {
      snap = await getDocs(query(
        collection(db, "cereri"),
        where("selectedMakerUid", "==", uid),
        where("status", "==", "solved"),
        orderBy("updatedAt", "desc"),
        limit(15)
      ));
    } catch (e) {
      console.warn("[profil-printator] fallback solved query without orderBy", e);
      snap = await getDocs(query(
        collection(db, "cereri"),
        where("selectedMakerUid", "==", uid),
        where("status", "==", "solved"),
        limit(15)
      ));
    }

    const total = await getCountFromServer(query(
      collection(db, "cereri"),
      where("selectedMakerUid", "==", uid),
      where("status", "==", "solved")
    ));

    const totalCount = total.data().count || 0;
    if (countEl) countEl.textContent = `(${totalCount})`;
    if (statSolved) statSolved.textContent = String(totalCount);

    if (snap.empty) {
      list.innerHTML = `<div class="pp-empty">Nicio cerere rezolvata inca.</div>`;
      return;
    }

    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    list.innerHTML = items.map(renderSolvedCerere).join("");

    if (totalCount > 15) {
      const loadMoreWrap = $("solvedLoadMore");
      if (loadMoreWrap) loadMoreWrap.style.display = "";
    }
  } catch (e) {
    console.error("[profil-printator] solved cereri failed:", e);
    list.innerHTML = `<div class="pp-empty">Eroare la incarcare cereri rezolvate.</div>`;
  }
}

async function getSolvedThisMonthCount(uid) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    try {
      const agg = await getCountFromServer(query(
        collection(db, "cereri"),
        where("selectedMakerUid", "==", uid),
        where("status", "==", "solved"),
        where("solvedAt", ">=", Timestamp.fromDate(startOfMonth))
      ));
      return agg.data().count || 0;
    } catch (errSolvedAt) {
      console.warn("[profil-printator] solvedAt month count failed, fallback to updatedAt", errSolvedAt);

      const aggFallback = await getCountFromServer(query(
        collection(db, "cereri"),
        where("selectedMakerUid", "==", uid),
        where("status", "==", "solved"),
        where("updatedAt", ">=", Timestamp.fromDate(startOfMonth))
      ));

      return aggFallback.data().count || 0;
    }
  } catch (e) {
    console.warn("[profil-printator] solved this month failed:", e);
    return 0;
  }
}

function initPortfolioUpload(uid) {
  const zone = $("portfolioUploadZone");
  const fileInput = $("portfolioFileInput");
  const uploadForm = $("portfolioUploadForm");
  const titleInput = $("portfolioTitle");
  const descInput = $("portfolioDesc");
  const submitBtn = $("portfolioSubmitBtn");
  const cancelBtn = $("portfolioCancelBtn");
  const statusEl = $("portfolioStatus");

  if (!zone || !fileInput) return;

  let selectedFiles = [];

  zone.addEventListener("click", () => fileInput.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    if (uploadForm) uploadForm.style.display = "";
    const firstDiv = zone.querySelector("div:first-child");
    if (firstDiv) {
      firstDiv.textContent = `${selectedFiles.length} ${selectedFiles.length === 1 ? "imagine selectata" : "imagini selectate"} ✅`;
    }
  });

  cancelBtn?.addEventListener("click", () => {
    selectedFiles = [];
    fileInput.value = "";
    if (uploadForm) uploadForm.style.display = "none";
    const firstDiv = zone.querySelector("div:first-child");
    if (firstDiv) firstDiv.textContent = "📷";
  });

  submitBtn?.addEventListener("click", async () => {
    if (!selectedFiles.length) return;
    const title = (titleInput?.value || "").trim();
    const desc = (descInput?.value || "").trim();

    if (!title) {
      if (statusEl) statusEl.textContent = "Te rog adauga un titlu pentru piesa.";
      titleInput?.focus();
      return;
    }

    submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Se incarca imaginile...";

    try {
      const storage = getStorage();
      const urls = [];

      for (const file of selectedFiles.slice(0, 2)) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Fisierul selectat nu este o imagine valida.");
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Imaginea este prea mare. Maxim 5MB.");
        }

        const safeName = (file.name || "image")
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "_");

        const storageRef = ref(storage, `portfolio/${uid}/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
        const url = await getDownloadURL(storageRef);
        urls.push(url);
      }

      const portfolioItem = {
        title,
        desc,
        createdAt: serverTimestamp(),
        beforeUrl: urls[0] || "",
        afterUrl: urls[1] || ""
      };

      await addDoc(collection(db, "users", uid, "portfolio"), portfolioItem);

      if (statusEl) statusEl.textContent = "✅ Adaugat in portofoliu!";
      if (titleInput) titleInput.value = "";
      if (descInput) descInput.value = "";
      fileInput.value = "";
      selectedFiles = [];
      if (uploadForm) uploadForm.style.display = "none";

      await loadPortfolio(uid, true);
    } catch (e) {
      console.error("[portfolio] upload failed:", e);
      if (statusEl) statusEl.textContent = e?.message || "Eroare la upload.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

export async function initProfilPrintatorPage(uid) {
  document.body.classList.remove("auth-loading");

  if (!uid) {
    if ($("ppName")) $("ppName").textContent = "Profil lipsa";
    if ($("ppBio")) $("ppBio").textContent = "Lipseste uid in URL. Exemplu: /profil-printator.html?uid=...";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      if ($("ppName")) $("ppName").textContent = "Profil inexistent";
      if ($("ppBio")) $("ppBio").textContent = "Acest utilizator nu are profil de printator.";
      return;
    }

    const u = snap.data() || {};
    const userDataRef = { value: u };

    if (!u.isPrinter) {
      window.location.replace(`/profil.html?uid=${uid}`);
      return;
    }

    const reviewStats = await getReviewStats(uid);
    const solvedTotalReal = await getSolvedTotalCount(uid);

    u.printerSolvedCount = solvedTotalReal;
    userDataRef.value.printerSolvedCount = solvedTotalReal;

    setSeoMeta(u, uid, reviewStats, solvedTotalReal);
    renderSeoSection(u);
    setupQrCode(u, uid);

    const ppAvatar = $("ppAvatar");
    if (ppAvatar) {
      ppAvatar.src = u.avatarUrl || "/assets/avatar-placeholder.svg";
      ppAvatar.onerror = () => {
        ppAvatar.src = "/assets/avatar-placeholder.svg";
      };
    }

    if ($("ppName")) $("ppName").textContent = u.name || "Printator";
    if ($("ppBio")) $("ppBio").textContent = u.printerBio || u.bio || "Printator 3D activ pe Cere3D.";

    initShareButton(u, uid);

    const online = await isUserOnline(uid);
    if (online) {
      const chip = $("ppOnlineChip");
      if (chip) chip.style.display = "";
    }

    const ratingAvg = reviewStats.avg;
    const ratingCount = reviewStats.count;

    const ppStars = $("ppStars");
    if (ppStars) ppStars.textContent = starsHtml(ratingAvg);

    const ppRatingNum = $("ppRatingNum");
    if (ppRatingNum) ppRatingNum.textContent = ratingAvg > 0 ? ratingAvg.toFixed(1) : "Fara rating inca";

    const ppRatingCount = $("ppRatingCount");
    if (ppRatingCount) ppRatingCount.textContent = `(${ratingCount} review-uri)`;

    const metaPills = $("ppMetaPills");
    if (metaPills) {
      const city = u.printerCity || u.city;
      const joined = tsMs(u.printerJoinedAt || u.createdAt);
      const lastActive = tsMs(u.printerLastActiveAt || u.lastActiveAt);

      metaPills.innerHTML = `
        ${city ? `<span class="pp-meta-pill">📍 ${esc(city)}</span>` : ""}
        ${joined ? `<span class="pp-meta-pill">🗓️ Printator din ${fmtDate(joined)}</span>` : ""}
        <span class="pp-meta-pill green">✔ ${solvedTotalReal} cereri rezolvate</span>
        ${lastActive ? `<span class="pp-meta-pill blue">⏱ ${online ? "Activ acum" : timeAgo(lastActive)}</span>` : ""}
      `;
    }

    const statCity = $("statCity");
    if (statCity) statCity.textContent = u.printerCity || u.city || "—";

    const statJoined = $("statJoined");
    if (statJoined) statJoined.textContent = fmtDate(tsMs(u.printerJoinedAt || u.createdAt));

    const statLastActive = $("statLastActive");
    if (statLastActive) {
      const laMs = tsMs(u.printerLastActiveAt || u.lastActiveAt);
      statLastActive.textContent = online ? "Acum online" : timeAgo(laMs);
    }

    const statRating = $("statRating");
    if (statRating) statRating.textContent = ratingAvg > 0 ? `${ratingAvg.toFixed(1)} / 5` : "—";

    const statReviews = $("statReviews");
    if (statReviews) statReviews.textContent = String(ratingCount);

    const statSolved = $("statSolved");
    if (statSolved) statSolved.textContent = String(solvedTotalReal);

    const statSolvedMonth = $("statSolvedMonth");
    if (statSolvedMonth) {
      const solvedThisMonth = await getSolvedThisMonthCount(uid);
      statSolvedMonth.textContent = String(solvedThisMonth);
    }

    await loadSolvedCereri(uid);

    onAuthStateChanged(auth, async (currentUser) => {
      const isOwner = !!currentUser && currentUser.uid === uid;
      const isLoggedIn = !!currentUser;

      const btnEdit = $("btnEditProfile");
      if (btnEdit) btnEdit.style.display = isOwner ? "" : "none";

      const btnContact = $("btnContactPrinter");
      if (btnContact) {
        if (isLoggedIn && !isOwner) {
          btnContact.style.display = "";
          if (!btnContact.dataset.bound) {
            btnContact.dataset.bound = "1";
            btnContact.addEventListener("click", async () => {
              try {
                const { startDmWith } = await import("./dm-utils.js");
                await startDmWith(uid);
              } catch (e) {
                alert(e?.message || "Eroare la initierea conversatiei.");
              }
            });
          }
        }
      }

      await loadPortfolio(uid, isOwner);
      if (isOwner) initPortfolioUpload(uid);

      if (isOwner) {
        initSeoEditor(uid, userDataRef, reviewStats);
      }

      const reviewFormWrap = $("reviewFormWrap");
      const reviewFormHint = $("reviewFormHint");
      const revSend = $("revSend");

      if (reviewFormWrap) {
        if (!isLoggedIn) {
          reviewFormWrap.style.display = "none";
        } else if (isOwner) {
          reviewFormWrap.style.display = "";
          if (reviewFormHint) reviewFormHint.textContent = "Nu poti lasa review la propriul profil.";
          if (revSend) revSend.disabled = true;
        } else {
          reviewFormWrap.style.display = "";
          if (reviewFormHint) reviewFormHint.textContent = "Lasa un review acestui printator. Se poate trimite o singura data.";
        }
      }
    });

    const leaveReview = new URLSearchParams(location.search).get("leaveReview") === "1";
    if (leaveReview) {
      setTimeout(() => {
        const el = document.getElementById("reviewsSection");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }

  } catch (e) {
    console.error("[profil-printator] init failed:", e);
    if ($("ppName")) $("ppName").textContent = "Eroare";
    if ($("ppBio")) $("ppBio").textContent = e?.message || "Nu pot incarca profilul.";
  }
}