// site-optimizer.js
// Optimizari SEO + performanta pentru paginile statice.

(function siteOptimizerBootstrap() {
  const BRAND = "Cere3D";
  const DEFAULT_OG_IMAGE = "https://cere3d.ro/assets/og-cere3d2.png";
  const SITE_ORIGIN = "https://cere3d.ro";
  const STOPWORDS = new Set(["si", "sau", "la", "de", "cu", "in", "din", "pentru", "pe", "un", "o", "a", "ale", "al", "the"]);

  function pathname() {
    return window.location.pathname || "/";
  }

  function absoluteCanonical() {
    const path = pathname().replace(/\/index\.html$/i, "/");
    const base = window.location.origin || SITE_ORIGIN;
    return `${base}${path}`;
  }

  function slugFromPath() {
    const p = pathname().replace(/^\/+|\/+$/g, "");
    if (!p || p === "index.html") return "printare-3d-la-comanda";
    return p.replace(/\.html$/i, "");
  }

  function humanizeSlug(slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map((w) => (STOPWORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ")
      .trim();
  }

  function slugPrimaryKeywords(slug) {
    const normalized = slug.toLowerCase();
    if (normalized.includes("printare-3d")) {
      return "Printare 3D";
    }
    if (normalized.includes("piese") || normalized.includes("piesa")) {
      return "Piese printate 3D";
    }
    if (normalized.includes("modelare") || normalized.includes("model")) {
      return "Modelare si printare 3D";
    }
    return "Printare 3D la comanda";
  }

  function ensureCanonical() {
    let link = document.querySelector("link[rel='canonical']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    if (!link.href) link.href = absoluteCanonical();
  }

  function ensureLangAndViewport() {
    if (!document.documentElement.getAttribute("lang")) {
      document.documentElement.setAttribute("lang", "ro");
    }

    let viewport = document.querySelector("meta[name='viewport']");
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(viewport);
    }
  }

  function ensureTitle() {
    const currentTitle = (document.title || "").trim();
    const lowQuality = !currentTitle || /^home$/i.test(currentTitle) || currentTitle.length < 18;
    if (!lowQuality) return;

    const slug = slugFromPath();
    const topic = humanizeSlug(slug);
    document.title = `${topic} | ${BRAND}`;
  }

  function ensureBasicMetaDescription() {
    let meta = document.querySelector("meta[name='description']");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }

    if (meta.getAttribute("content")) return;

    const slug = slugFromPath();
    const topic = humanizeSlug(slug);
    const kw = slugPrimaryKeywords(slug);
    meta.setAttribute(
      "content",
      `${topic}. ${kw} in Romania, oferte rapide si comanda simpla pe ${BRAND}.`
    );
  }

  function ensureSocialMeta() {
    const title = (document.title || `${BRAND} - Printare 3D la comanda`).trim();
    const description =
      document.querySelector("meta[name='description']")?.getAttribute("content") ||
      "Printare 3D la comanda pentru piese tehnice, refacere piese rupte si obiecte personalizate.";
    const url = absoluteCanonical();

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
    setMeta("property", "og:site_name", BRAND);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", DEFAULT_OG_IMAGE);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", DEFAULT_OG_IMAGE);
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

    let googlebot = document.querySelector("meta[name='googlebot']");
    if (!googlebot) {
      googlebot = document.createElement("meta");
      googlebot.name = "googlebot";
      document.head.appendChild(googlebot);
    }
    if (!googlebot.getAttribute("content")) {
      googlebot.content = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
    }

    if (!document.querySelector("link[rel='alternate'][hreflang='ro-RO']")) {
      const altRo = document.createElement("link");
      altRo.rel = "alternate";
      altRo.hreflang = "ro-RO";
      altRo.href = absoluteCanonical();
      document.head.appendChild(altRo);
    }

    if (!document.querySelector("link[rel='alternate'][hreflang='x-default']")) {
      const altDefault = document.createElement("link");
      altDefault.rel = "alternate";
      altDefault.hreflang = "x-default";
      altDefault.href = absoluteCanonical();
      document.head.appendChild(altDefault);
    }
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
      document.querySelector("link[rel='canonical']")?.getAttribute("href") || absoluteCanonical();

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonical,
      inLanguage: "ro-RO",
      isPartOf: {
        "@type": "WebSite",
        name: BRAND,
        url: SITE_ORIGIN
      }
    });
    document.head.appendChild(script);
  }

  function ensureBreadcrumbSchema() {
    const hasSchema = [...document.querySelectorAll("script[type='application/ld+json']")]
      .some((n) => /"@type"\s*:\s*"BreadcrumbList"/.test(n.textContent || ""));
    if (hasSchema) return;

    const slug = slugFromPath();
    const pageName = humanizeSlug(slug);
    const canonical = absoluteCanonical();

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: BRAND,
          item: `${SITE_ORIGIN}/`
        },
        {
          "@type": "ListItem",
          position: 2,
          name: pageName,
          item: canonical
        }
      ]
    });
    document.head.appendChild(script);
  }

  function ensureServiceSchema() {
    const hasSchema = [...document.querySelectorAll("script[type='application/ld+json']")]
      .some((n) => /"@type"\s*:\s*"Service"/.test(n.textContent || ""));
    if (hasSchema) return;

    const slug = slugFromPath();
    const pageName = humanizeSlug(slug);
    const description =
      document.querySelector("meta[name='description']")?.getAttribute("content") ||
      "Serviciu de printare 3D la comanda in Romania, pentru piese, obiecte personalizate si prototipuri.";

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Service",
      name: pageName,
      serviceType: slugPrimaryKeywords(slug),
      provider: {
        "@type": "Organization",
        name: BRAND,
        url: SITE_ORIGIN
      },
      areaServed: {
        "@type": "Country",
        name: "Romania"
      },
      url: absoluteCanonical(),
      description
    });
    document.head.appendChild(script);
  }

  function ensureFaqSchemaFromPage() {
    const hasFaq = [...document.querySelectorAll("script[type='application/ld+json']")]
      .some((n) => /"@type"\s*:\s*"FAQPage"/.test(n.textContent || ""));
    if (hasFaq) return;

    const faqNodes = [...document.querySelectorAll("details")]
      .map((node) => {
        const q = (node.querySelector("summary")?.textContent || "").trim();
        const a = (node.querySelector("p, div, span")?.textContent || "").trim();
        if (!q || !a || a.length < 20) return null;
        return {
          "@type": "Question",
          name: q,
          acceptedAnswer: {
            "@type": "Answer",
            text: a
          }
        };
      })
      .filter(Boolean)
      .slice(0, 6);

    if (faqNodes.length < 2) return;

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqNodes
    });
    document.head.appendChild(script);
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
      name: BRAND,
      url: SITE_ORIGIN,
      serviceType: "Printare 3D la comanda",
      areaServed: "Romania",
      knowsAbout: [
        "printare 3d",
        "refacere piese plastic",
        "piese custom auto",
        "prototipuri functionale",
        "obiecte personalizate printate 3d"
      ]
    });
    document.head.appendChild(script);
  }

  function ensurePrimaryHeading() {
    if (document.querySelector("h1")) return;

    const firstHeading = document.querySelector("main h2, article h2, h2");
    if (firstHeading) {
      const h1 = document.createElement("h1");
      h1.innerHTML = firstHeading.innerHTML;
      h1.className = firstHeading.className;
      firstHeading.replaceWith(h1);
      return;
    }

    const hero = document.querySelector("main, article, body");
    if (!hero) return;

    const slug = slugFromPath();
    const h1 = document.createElement("h1");
    h1.textContent = humanizeSlug(slug);
    h1.style.margin = "0 0 16px";
    hero.prepend(h1);
  }

  function ensureCrawlLinksBlock() {
    if (document.querySelector("[data-seo-crawl-links='true']")) return;
    const container = document.querySelector("main") || document.body;
    if (!container) return;

    const section = document.createElement("section");
    section.setAttribute("data-seo-crawl-links", "true");
    section.setAttribute("aria-label", "Pagini populare pentru printare 3D");
    section.style.margin = "28px 0";
    section.style.padding = "14px";
    section.style.border = "1px solid #e5e7eb";
    section.style.borderRadius = "10px";
    section.style.background = "#fff";

    const title = document.createElement("h2");
    title.textContent = "Pagini populare printare 3D";
    title.style.fontSize = "1.1rem";
    title.style.margin = "0 0 8px";

    const links = [
      ["/printare-3d-la-comanda.html", "Printare 3D la comanda"],
      ["/printare-3d-piese.html", "Printare 3D piese"],
      ["/printare-3d-online.html", "Printare 3D online"],
      ["/comanda-printare-3d.html", "Comanda printare 3D"],
      ["/pret-printare-3d-la-comanda.html", "Pret printare 3D"],
      ["/modelare-3d-la-comanda.html", "Modelare 3D la comanda"]
    ];

    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "18px";

    const current = pathname();
    links.forEach(([href, label]) => {
      if (href === current) return;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      li.appendChild(a);
      ul.appendChild(li);
    });

    if (!ul.childElementCount) return;

    section.appendChild(title);
    section.appendChild(ul);
    container.appendChild(section);
  }

  function optimizeImages() {
    const images = [...document.querySelectorAll("img")];
    if (!images.length) return;

    images.forEach((img, idx) => {
      const isLikelyAboveFold = idx < 2;

      if (!img.hasAttribute("decoding")) img.decoding = "async";
      if (!img.getAttribute("alt")) {
        img.setAttribute("alt", "Printare 3D la comanda - Cere3D");
      }
      if (!isLikelyAboveFold && !img.hasAttribute("loading")) img.loading = "lazy";
      if (isLikelyAboveFold && !img.hasAttribute("fetchpriority")) img.setAttribute("fetchpriority", "high");
    });
  }

  function reduceMotionCost() {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("reduce-motion");
  }

  function runOptimizations() {
    ensureLangAndViewport();
    ensureTitle();
    ensureCanonical();
    ensureBasicMetaDescription();
    ensureSocialMeta();
    ensureIndexingMeta();
    ensurePrimaryHeading();
    ensureWebPageSchema();
    ensureBreadcrumbSchema();
    ensureServiceSchema();
    ensureFaqSchemaFromPage();
    ensureLocalBusinessSchema();
    ensureCrawlLinksBlock();
    optimizeImages();
    reduceMotionCost();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runOptimizations, { once: true });
  } else {
    runOptimizations();
  }
})();
