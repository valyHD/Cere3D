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
   ensureWebPageSchema();
   optimizeImages();
   reduceMotionCost();
 }

 if (document.readyState === "loading") {
   document.addEventListener("DOMContentLoaded", runOptimizations, { once: true });
 } else {
   runOptimizations();
 }
