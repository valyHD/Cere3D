// consent.js (Cere3D) - Consent Mode v2 + blocare reala Pixel pana la accept
const LS_KEY = "cere3d_consent_v2";

const GA_ID = "G-1FY3LRNBF2";
const ADS_ID = "AW-17949757837";
const META_PIXEL_ID = "1606097973753136";

function readConsent() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    return {
      analytics: v.analytics === true,
      marketing: v.marketing === true,
      updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now()
    };
  } catch {
    return null;
  }
}

function saveConsent(c) {
  const v = {
    analytics: !!c.analytics,
    marketing: !!c.marketing,
    updatedAt: Date.now()
  };
  localStorage.setItem(LS_KEY, JSON.stringify(v));
  return v;
}

function gtagReady() {
  return typeof window.gtag === "function";
}

function updateGoogleConsent(consent) {
  if (!gtagReady()) return;

  // Consent Mode v2 fields:
  // ad_storage, analytics_storage, ad_user_data, ad_personalization
  const analyticsGranted = consent.analytics ? "granted" : "denied";
  const marketingGranted = consent.marketing ? "granted" : "denied";

  // analytics_storage urmeaza analytics
  // ad_storage + ad_user_data + ad_personalization urmeaza marketing
  window.gtag("consent", "update", {
    analytics_storage: analyticsGranted,
    ad_storage: marketingGranted,
    ad_user_data: marketingGranted,
    ad_personalization: marketingGranted
  });
}

let metaLoaded = false;
function loadMetaPixelIfAllowed(consent) {
  if (!consent.marketing) return;
  if (metaLoaded) return;
  metaLoaded = true;

  // inject Meta Pixel script
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", META_PIXEL_ID);
  window.fbq("track", "PageView");

  // optional: noscript pixel (doar daca marketing acceptat)
  const img = document.createElement("img");
  img.height = 1;
  img.width = 1;
  img.style.display = "none";
  img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(META_PIXEL_ID)}&ev=PageView&noscript=1`;
  document.body.appendChild(img);
}

function configGoogleTagsOnce() {
  // Ruleaza o singura data dupa ce gtag exista
  if (!gtagReady()) return;

  // GA4
  window.gtag("config", GA_ID, {
    // (optional) daca vrei: send_page_view: true (default)
  });

  // Google Ads
  window.gtag("config", ADS_ID);
}

function waitForGtagThenInit(callback) {
  const t0 = Date.now();
  (function tick() {
    if (gtagReady()) return callback();
    if (Date.now() - t0 > 8000) return; // fail silent
    setTimeout(tick, 50);
  })();
}

/* =======================
   UI: banner + settings
   ======================= */

function ensureFooterLink() {
  const footerLinks = document.querySelector(".site-footer .footer-links");
  if (!footerLinks) return;

  // daca exista deja, nu mai adaug
  if (document.getElementById("cookieSettingsLink")) return;

  const sep = document.createTextNode(" · ");
  const a = document.createElement("a");
  a.href = "#";
  a.id = "cookieSettingsLink";
  a.textContent = "Setari cookies";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openSettings();
  });

  footerLinks.appendChild(sep);
  footerLinks.appendChild(a);
}

function makeBanner() {
  if (document.getElementById("cookieBanner")) return;

  const wrap = document.createElement("div");
  wrap.id = "cookieBanner";
  wrap.className = "cookie-banner";
  wrap.innerHTML = `
    <div class="cookie-card">
      <div class="cookie-title">Folosim cookies</div>
      <div class="cookie-text">
        Folosim cookies pentru statistici (Google Analytics) si pentru masurarea reclamelor (Google Ads, Meta Pixel).
        Poti refuza sau poti alege din setari.
      </div>
      <div class="cookie-actions">
        <button class="btn btn-blue" id="cookieAcceptAll" type="button">Accepta toate</button>
        <button class="btn btn-soft" id="cookieRejectAll" type="button">Refuza</button>
        <button class="btn btn-soft" id="cookieOpenSettings" type="button">Setari</button>
      </div>
      <div class="cookie-links">
        <a href="/legal.html">Legal / Privacy / Cookies</a>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById("cookieAcceptAll").onclick = () => {
    const c = saveConsent({ analytics: true, marketing: true });
    applyConsent(c);
    closeBanner();
  };

  document.getElementById("cookieRejectAll").onclick = () => {
    const c = saveConsent({ analytics: false, marketing: false });
    applyConsent(c);
    closeBanner();
  };

  document.getElementById("cookieOpenSettings").onclick = () => openSettings();
}

function closeBanner() {
  const el = document.getElementById("cookieBanner");
  if (el) el.remove();
}

function makeSettingsModal() {
  if (document.getElementById("cookieModal")) return;

  const modal = document.createElement("div");
  modal.id = "cookieModal";
  modal.className = "cookie-modal-backdrop";
  modal.innerHTML = `
    <div class="cookie-modal">
      <div class="cookie-modal-head">
        <div>
          <div class="cookie-modal-title">Setari cookies</div>
          <div class="cookie-modal-sub">Poti schimba oricand. Esentiale sunt mereu active.</div>
        </div>
        <button class="cookie-x" id="cookieCloseX" type="button">✕</button>
      </div>

      <div class="cookie-modal-body">
        <div class="cookie-row">
          <div class="cookie-row-left">
            <div class="cookie-row-title">Esentiale</div>
            <div class="cookie-row-desc">Necesare pentru login si functionarea site-ului.</div>
          </div>
          <div class="cookie-row-right">
            <span class="cookie-pill">Mereu active</span>
          </div>
        </div>

        <div class="cookie-row">
          <div class="cookie-row-left">
            <div class="cookie-row-title">Analytics</div>
            <div class="cookie-row-desc">Google Analytics (statistici de utilizare).</div>
          </div>
          <div class="cookie-row-right">
            <label class="cookie-toggle">
              <input type="checkbox" id="cookieAnalyticsToggle">
              <span></span>
            </label>
          </div>
        </div>

        <div class="cookie-row">
          <div class="cookie-row-left">
            <div class="cookie-row-title">Marketing</div>
            <div class="cookie-row-desc">Google Ads + Meta Pixel (masurare reclame).</div>
          </div>
          <div class="cookie-row-right">
            <label class="cookie-toggle">
              <input type="checkbox" id="cookieMarketingToggle">
              <span></span>
            </label>
          </div>
        </div>

        <div class="cookie-modal-actions">
          <button class="btn btn-blue" id="cookieSave" type="button">Salveaza</button>
          <button class="btn btn-soft" id="cookieCancel" type="button">Inchide</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("cookieCloseX").onclick = closeSettings;
  document.getElementById("cookieCancel").onclick = closeSettings;

  document.getElementById("cookieSave").onclick = () => {
    const analytics = !!document.getElementById("cookieAnalyticsToggle").checked;
    const marketing = !!document.getElementById("cookieMarketingToggle").checked;
    const c = saveConsent({ analytics, marketing });
    applyConsent(c);
    closeSettings();
    closeBanner(); // daca era deschis banner-ul
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeSettings();
  });
}

function openSettings() {
  makeSettingsModal();
  const modal = document.getElementById("cookieModal");
  if (!modal) return;

  const c = readConsent() || { analytics: false, marketing: false };

  document.getElementById("cookieAnalyticsToggle").checked = !!c.analytics;
  document.getElementById("cookieMarketingToggle").checked = !!c.marketing;

  modal.style.display = "grid";
}

function closeSettings() {
  const modal = document.getElementById("cookieModal");
  if (modal) modal.style.display = "none";
}

/* =======================
   Apply consent (core)
   ======================= */

function applyConsent(consent) {
  // 1) Google consent update (v2)
  updateGoogleConsent(consent);

  // 2) Configure tags (GA + Ads) – pot rula si cu denied (cookieless)
  configGoogleTagsOnce();

  // 3) Meta Pixel doar daca marketing e acceptat
  loadMetaPixelIfAllowed(consent);
}

/* =======================
   Boot
   ======================= */
function boot() {
  ensureFooterLink();

  const saved = readConsent();

  // daca nu are optiune salvata -> arata banner
  if (!saved) {
    makeBanner();
  }

  // asteptam gtag apoi aplicam:
  // - daca nu are consimtamant -> ramane default denied (din head), nu incarcam Meta Pixel
  // - daca are -> update + config
  waitForGtagThenInit(() => {
    if (saved) applyConsent(saved);
    else {
      // fara consimtamant: configuram GA/Ads (cookieless) dar consent e denied -> nu pune cookies
      // daca vrei "mai strict": comenteaza linia asta
      configGoogleTagsOnce();
    }
  });

  // expune pentru debugging/manual
  window.cere3dOpenCookieSettings = openSettings;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}