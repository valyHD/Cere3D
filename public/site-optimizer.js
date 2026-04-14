// site-optimizer.js
// Optimizari SEO + performanta pentru paginile statice.

function ensureCanonical() {
  if (document.querySelector("link[rel='canonical']")) return;
  const link = document.createElement("link");
  link.rel = "canonical";
  link.href = window.location.origin + window.location.pathname;
  document.head.appendChild(link);
}

function ensureBasicMetaDescription() {
  if (document.querySelector("meta[name='description']")) return;
  const meta = document.createElement("meta");
  meta.name = "description";
  meta.content = "Printare 3D la comanda in Romania pentru piese, prototipuri si obiecte personalizate.";
  document.head.appendChild(meta);
}

function ensureWebPageSchema() {
  const hasSchema = [...document.querySelectorAll("script[type='application/ld+json']")]
    .some((n) => /"@type"\s*:\s*"WebPage"/.test(n.textContent || ""));
  if (hasSchema) return;

  const title = (document.title || "Printare 3D la comanda").trim();
  const description =
    document.querySelector("meta[name='description']")?.getAttribute("content") ||
    "Servicii de printare 3D la comanda in Romania.";
  const canonical =
    document.querySelector("link[rel='canonical']")?.getAttribute("href") ||
    window.location.origin + window.location.pathname;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": description,
    "url": canonical,
    "inLanguage": "ro-RO",
  });
  document.head.appendChild(script);
}

function ensureSocialMeta() {
  const title = (document.title || "Printare 3D la comanda - Cere3D").trim();
  const description =
    document.querySelector("meta[name='description']")?.getAttribute("content") ||
    "Printare 3D la comanda pentru piese tehnice, refacere piese rupte si obiecte personalizate.";
  const url = window.location.origin + window.location.pathname;

  const setMeta = (attr, key, value) => {
    let n = document.querySelector(`meta[${attr}='${key}']`);
    if (!n) {
      n = document.createElement("meta");
      n.setAttribute(attr, key);
      document.head.appendChild(n);
    }
    if (!n.getAttribute("content")) n.setAttribute("content", value);
  };

  setMeta("property", "og:type", "website");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
}

function ensureIndexingMeta() {
  let robots = document.querySelector("meta[name='robots']");
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.appendChild(robots);
  }
  if (!robots.getAttribute("content")) {
    robots.content = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  }
}

function ensureLocalBusinessSchema() {
  const hasSchema = [...document.querySelectorAll("script[type='application/ld+json']")]
    .some((n) => /"@type"\s*:\s*"(LocalBusiness|ProfessionalService|Organization)"/.test(n.textContent || ""));
  if (hasSchema) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Cere3D",
    "url": window.location.origin,
    "serviceType": "Printare 3D la comanda",
    "areaServed": "Romania",
    "knowsAbout": [
      "printare 3d",
      "refacere piese plastic",
      "piese custom auto",
      "decoratiuni si vaze printate 3d",
      "prototipuri si piese functionale"
    ]
  });
  document.head.appendChild(script);
}

function optimizeImages() {
  const images = [...document.querySelectorAll("img")];
  if (!images.length) return;

  images.forEach((img, idx) => {
    const isLikelyAboveFold = idx < 2;

    if (!img.hasAttribute("decoding")) {
      img.decoding = "async";
    }

    if (!isLikelyAboveFold && !img.hasAttribute("loading")) {
      img.loading = "lazy";
    }

    if (isLikelyAboveFold && !img.hasAttribute("fetchpriority")) {
      img.setAttribute("fetchpriority", "high");
    }
  });
}

function reduceMotionCost() {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("reduce-motion");
}

function runOptimizations() {
  ensureCanonical();
  ensureBasicMetaDescription();
  ensureSocialMeta();
  ensureIndexingMeta();
  ensureWebPageSchema();
  ensureLocalBusinessSchema();
  optimizeImages();
  reduceMotionCost();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runOptimizations, { once: true });
} else {
  runOptimizations();
}
