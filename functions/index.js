/**
 * Cloud Functions - Cere3D
 * Notificari email (Brevo SMTP) pentru chat cerere si mesaje private (DM).
 * + SEO hard: prerender cerere la /c/:id (meta tags reale).
 * + DOWNLOAD HARD: /dl?path=...&name=... (Content-Disposition attachment)
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const Parser = require("rss-parser");
const crypto = require("crypto");

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const BREVO_SMTP_USER = defineSecret("BREVO_SMTP_USER");
const BREVO_SMTP_PASS = defineSecret("BREVO_SMTP_PASS");
const MAIL_FROM = defineSecret("MAIL_FROM"); // ex: no-reply@cere3d.ro

const APP_NAME = "Cere3D";

/**
 * Sanitize + limiteaza textul.
 */
function safeText(s, max) {
  const m = typeof max === "number" ? max : 180;
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (t.length > m) return t.slice(0, m - 1) + "…";
  return t;
}

/**
 * Escape HTML pentru meta/email.
 */
function escapeHtml(s) {
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Normalizeaza email (lowercase + trim).
 */
function normEmail(s) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Ia documentul user din /users/{uid}.
 */
async function getUserDoc(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().doc("users/" + uid).get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

/**
 * Transporter Brevo (creat o singura data).
 */
let __transporter = null;
function getTransporter() {
  if (__transporter) return __transporter;

  __transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: BREVO_SMTP_USER.value(),
      pass: BREVO_SMTP_PASS.value(),
    },
  });

  return __transporter;
}

/**
 * Trimite email folosind Brevo SMTP.
 */
async function sendEmail(p) {
  const toEmail = normEmail(p && p.to ? p.to : "");
  if (!toEmail) return;

  const transporter = getTransporter();

  const fromEmail = (MAIL_FROM.value() || "").toString().trim();
  if (!fromEmail) {
    console.warn("[MAIL] Missing MAIL_FROM secret");
    return;
  }

  await transporter.sendMail({
    from: `"${APP_NAME}" <${fromEmail}>`,
    to: toEmail,
    subject: p.subject || "",
    html: p.html || "",
  });
}
/* =========================
   COMMUNITY NEWS HELPERS
   ========================= */

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Cere3D-NewsBot/1.0 (+https://cere3d.ro)"
  }
});

const COMMUNITY_NEWS_FEEDS = [
  {
    sourceName: "All3DP",
    feedUrl: "https://all3dp.com/feed/",
    topic: "3d-printing"
  },
  {
    sourceName: "Prusa Blog",
    feedUrl: "https://blog.prusa3d.com/feed/",
    topic: "3d-printing"
  },
  {
    sourceName: "Bambu Lab Blog",
    feedUrl: "https://blog.bambulab.com/feed/",
    topic: "3d-printing"
  },
  {
    sourceName: "3D Printing Industry",
    feedUrl: "https://3dprintingindustry.com/feed/",
    topic: "3d-printing"
  }
];

function stripHtml(s) {
  return (s || "")
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNewsText(s, max = 260) {
  const t = stripHtml(s || "");
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + "…";
}

function makeSlug(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}
function makeNewsSlug(title, articleUrl) {
  const base = makeSlug(title);
  if (base) return base;
  return "stire-" + hashId(articleUrl || title).slice(0, 12);
}

function makeNewsSlug(title, articleUrl) {
  const base = makeSlug(title);
  if (base) return base;
  return "stire-" + hashId(articleUrl || title).slice(0, 12);
}

function makeNewsSlug(title, articleUrl) {
  const base = makeSlug(title);
  if (base) return base;
  return "stire-" + hashId(articleUrl || title).slice(0, 12);
}

function hashId(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex").slice(0, 24);
}
function sanitizeDownloadFileName(name) {
  const clean = (name || "file")
    .toString()
    .replace(/[\r\n]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();

  return clean || "file";
}


function sanitizeDownloadFileName(name) {
  const clean = (name || "file")
    .toString()
    .replace(/[\r\n]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();

  return clean || "file";
}

function sanitizeDownloadFileName(name) {
  const clean = (name || "file")
    .toString()
    .replace(/[\r\n]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();

  return clean || "file";
}

function pickImageFromItem(item) {
  if (item?.enclosure?.url) return item.enclosure.url;
  if (item?.image?.url) return item.image.url;

  const raw = [
    item?.content,
    item?.contentSnippet,
    item?.summary,
    item?.["content:encoded"]
  ].filter(Boolean).join(" ");

  const m = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function buildNewsDoc(feed, item) {
  const articleUrl = (item?.link || "").toString().trim();
  const title = safeNewsText(item?.title || "Stire", 180);
  const excerpt = safeNewsText(
    item?.contentSnippet ||
    item?.summary ||
    item?.content ||
    "",
    320
  );

  const content = safeNewsText(
    item?.contentSnippet ||
    item?.summary ||
    item?.content ||
    excerpt,
    4000
  );

  const publishedAtRaw = item?.isoDate || item?.pubDate || null;
  const publishedAtDate = publishedAtRaw ? new Date(publishedAtRaw) : new Date();

  return {
    title,
    slug: makeNewsSlug(title, articleUrl),
    excerpt,
    content,
    sourceName: feed.sourceName,
    sourceUrl: feed.feedUrl,
    articleUrl,
    imageUrl: pickImageFromItem(item),
    publishedAt: admin.firestore.Timestamp.fromDate(
      isNaN(publishedAtDate.getTime()) ? new Date() : publishedAtDate
    ),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    topic: feed.topic || "3d-printing",
    status: "published"
  };
}
/* =========================
   EMAIL: Chat cerere
   ========================= */

exports.notifyOnCerereChatMessage = onDocumentCreated(
  {
    document: "cereri/{cerereId}/chat/{msgId}",
    secrets: [BREVO_SMTP_USER, BREVO_SMTP_PASS, MAIL_FROM],
    region: "europe-west1",
  },
  async (event) => {
    const cerereId = event.params.cerereId;

    const snap = event.data;
    const msg = snap && typeof snap.data === "function" ? snap.data() : null;
    if (!msg) return;

    const senderId = msg.senderId || "";
    const text = safeText(msg.text, 220);
    const senderName = safeText(msg.senderName || "Cineva", 60);

    const cerereRef = admin.firestore().doc("cereri/" + cerereId);
    const cerereSnap = await cerereRef.get();
    if (!cerereSnap.exists) return;

    const cerere = cerereSnap.data() || {};
    const ownerId = cerere.createdBy || "";
    if (!ownerId) return;

    if (senderId && senderId === ownerId) return;

    const owner = await getUserDoc(ownerId);
    const ownerEmail = owner && owner.email ? owner.email : "";
    const notifyEmail = !(owner && owner.notifyEmail === false);
    if (!ownerEmail || !notifyEmail) return;

    const cerereTitle = safeText(cerere.title || "cererea ta", 80);
    const link = "https://cere3d.ro/cerere.html?id=" + encodeURIComponent(cerereId);

    const subject = "[" + APP_NAME + "] Mesaj nou la cererea: " + cerereTitle;

    const html =
      "<div style=\"font-family:Arial,sans-serif;line-height:1.5\">" +
      "<h2 style=\"margin:0 0 10px 0\">" + APP_NAME + "</h2>" +
      "<p>Ai un mesaj nou in chat la cererea: <b>" +
      escapeHtml(cerereTitle) + "</b></p>" +
      "<p><b>" + escapeHtml(senderName) + ":</b> " +
      escapeHtml(text) + "</p>" +
      "<p>Deschide cererea: <a href=\"" + link + "\">" +
      link + "</a></p>" +
      "<p style=\"color:#666;font-size:12px;margin-top:16px\">" +
      "Poti opri emailurile din cont (notifyEmail=false)." +
      "</p></div>";

    await sendEmail({ to: ownerEmail, subject, html });
  }
);

/* =========================
   EMAIL: DM
   ========================= */

exports.notifyOnDmMessage = onDocumentCreated(
  {
    document: "conversations/{cid}/messages/{msgId}",
    secrets: [BREVO_SMTP_USER, BREVO_SMTP_PASS, MAIL_FROM],
    region: "europe-west1",
  },
  async (event) => {
    const cid = event.params.cid;

    const snap = event.data;
    const msg = snap && typeof snap.data === "function" ? snap.data() : null;
    if (!msg) return;

    const senderId = msg.senderId || "";
    const text = safeText(msg.text, 220);
    if (!senderId) return;

    const convRef = admin.firestore().doc("conversations/" + cid);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return;

    const conv = convSnap.data() || {};
    const participants = Array.isArray(conv.participants) ? conv.participants : [];
    if (participants.length < 2) return;

    const recipientId = participants.find((u) => u !== senderId);
    if (!recipientId) return;

    const recipient = await getUserDoc(recipientId);
    const recipientEmail = recipient && recipient.email ? recipient.email : "";
    const notifyEmail = !(recipient && recipient.notifyEmail === false);
    if (!recipientEmail || !notifyEmail) return;

    const sender = await getUserDoc(senderId);
    const resolvedName = sender && sender.name ? sender.name : (msg.senderName || "Cineva");
    const senderName = safeText(resolvedName, 60);

    const link = "https://cere3d.ro/mesaje.html?cid=" + encodeURIComponent(cid);
    const subject = "[" + APP_NAME + "] Mesaj privat nou";

    const html =
      "<div style=\"font-family:Arial,sans-serif;line-height:1.5\">" +
      "<h2 style=\"margin:0 0 10px 0\">" + APP_NAME + "</h2>" +
      "<p>Ai primit un mesaj privat nou.</p>" +
      "<p><b>" + escapeHtml(senderName) + ":</b> " +
      escapeHtml(text) + "</p>" +
      "<p>Deschide conversatia: <a href=\"" + link + "\">" +
      link + "</a></p>" +
      "<p style=\"color:#666;font-size:12px;margin-top:16px\">" +
      "Poti opri emailurile din cont (notifyEmail=false)." +
      "</p></div>";

    await sendEmail({ to: recipientEmail, subject, html });
  }
);

/* =========================
   SEO HARD: prerender cerere
   ========================= */

function pickFirstPhotoUrl(r) {
  const photos = r && Array.isArray(r.photos) ? r.photos : [];
  if (!photos.length) return "";
  const p0 = photos[0];
  if (typeof p0 === "string") return p0;
  if (p0 && typeof p0 === "object") return p0.url || "";
  return "";
}

exports.prerenderCerere = onRequest(
  { region: "europe-west1" },
  async (req, res) => {
    try {
      const pathParts = (req.path || "").split("/").filter(Boolean);
      const id = pathParts.length ? pathParts[pathParts.length - 1] : "";
      if (!id) {
        res.status(400).send("Missing id");
        return;
      }

      const snap = await admin.firestore().doc("cereri/" + id).get();
      if (!snap.exists) {
        res.set("Cache-Control", "public, max-age=60");
        res.status(404).send(
          "<!doctype html><html lang=\"ro\"><head>" +
          "<meta charset=\"utf-8\">" +
          "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
          "<title>Cere3D - Cerere inexistenta</title>" +
          "<meta name=\"robots\" content=\"noindex\">" +
          "</head><body>" +
          "<h1>Cerere inexistenta</h1>" +
          "<p>Nu am gasit cererea.</p>" +
          "<p><a href=\"https://cere3d.ro/cereri.html\">Vezi cereri</a></p>" +
          "</body></html>"
        );
        return;
      }

      const r = snap.data() || {};

      const titleRaw = safeText(r.title || "Cerere 3D", 80);
      const city = safeText(r.city || "", 40);
      const material = safeText(r.material || "", 30);
      const budget = safeText(r.budget || "", 30);
      const deadline = safeText(r.deadline || "", 30);
      const descBase = safeText(r.description || "", 170);

      const metaParts = [];
      if (city) metaParts.push(city);
      if (material) metaParts.push(material);
      if (budget) metaParts.push("Buget: " + budget);
      if (deadline) metaParts.push("Termen: " + deadline);
      const partsLine = metaParts.join(" · ");

      const desc = descBase || partsLine || "Detalii cerere pentru printare 3D.";

      const ogImage = pickFirstPhotoUrl(r) || "https://cere3d.ro/assets/og-default.jpg";
      const ogUrl = "https://cere3d.ro/c/" + encodeURIComponent(id);
      const uiUrl = "https://cere3d.ro/cerere.html?id=" + encodeURIComponent(id);

      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      res.set("Content-Type", "text/html; charset=utf-8");

      const html =
        "<!doctype html><html lang=\"ro\"><head>" +
        "<meta charset=\"utf-8\" />" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
        "<title>" + escapeHtml("Cere3D - " + titleRaw) + "</title>" +
        "<meta name=\"description\" content=\"" + escapeHtml(desc) + "\" />" +
        "<link rel=\"canonical\" href=\"" + escapeHtml(ogUrl) + "\" />" +
        "<meta property=\"og:type\" content=\"website\" />" +
        "<meta property=\"og:site_name\" content=\"Cere3D\" />" +
        "<meta property=\"og:title\" content=\"" + escapeHtml("Cere3D - " + titleRaw) + "\" />" +
        "<meta property=\"og:description\" content=\"" + escapeHtml(desc) + "\" />" +
        "<meta property=\"og:url\" content=\"" + escapeHtml(ogUrl) + "\" />" +
        "<meta property=\"og:image\" content=\"" + escapeHtml(ogImage) + "\" />" +
        "<meta name=\"twitter:card\" content=\"summary_large_image\" />" +
        "<meta name=\"twitter:title\" content=\"" + escapeHtml("Cere3D - " + titleRaw) + "\" />" +
        "<meta name=\"twitter:description\" content=\"" + escapeHtml(desc) + "\" />" +
        "<meta name=\"twitter:image\" content=\"" + escapeHtml(ogImage) + "\" />" +
        "<meta name=\"robots\" content=\"index,follow\" />" +
        "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/assets/favicon.svg\" />" +
        "</head><body>" +
        "<div style=\"max-width:1100px;margin:40px auto;padding:0 16px;\">" +
        "<h1 style=\"margin:0 0 10px 0;\">" + escapeHtml(titleRaw) + "</h1>" +
        (partsLine ? "<p style=\"margin:0 0 14px 0;color:#555;\">" + escapeHtml(partsLine) + "</p>" : "") +
        "<p style=\"margin:0 0 18px 0;color:#333;\">" + escapeHtml(descBase || desc) + "</p>" +
        "<a href=\"" + escapeHtml(uiUrl) + "\" " +
        "style=\"display:inline-block;padding:12px 16px;border-radius:12px;" +
        "background:#2563eb;color:#fff;text-decoration:none;font-weight:800;\">" +
        "Deschide cererea</a></div>" +
        "<script>" +
        "setTimeout(function(){" +
        "var ua=(navigator&&navigator.userAgent)?navigator.userAgent:'';" +
        "if(/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram/i.test(ua)) return;" +
        "location.replace(" + JSON.stringify(uiUrl) + ");" +
        "},50);" +
        "</script></body></html>";

      res.status(200).send(html);
    } catch (e) {
      console.error("prerenderCerere failed:", e);
      res.status(500).send("Server error");
    }
  }
);

/* =========================
   EMAIL: maker ales la cerere
   ========================= */

exports.notifyMakerChosenOnCerere = onDocumentUpdated(
  {
    document: "cereri/{cerereId}",
    secrets: [BREVO_SMTP_USER, BREVO_SMTP_PASS, MAIL_FROM],
    region: "europe-west1",
  },
  async (event) => {
    try {
      const cerereId = event.params.cerereId;

      const beforeSnap = event.data.before;
      const afterSnap = event.data.after;

      const before = beforeSnap.exists ? (beforeSnap.data() || {}) : {};
      const after = afterSnap.exists ? (afterSnap.data() || {}) : {};

      const beforeMaker = (before.selectedMakerUid || "").toString();
      const afterMaker = (after.selectedMakerUid || "").toString();

      if (!afterMaker) return;
      if (beforeMaker === afterMaker) return;

      if (after.makerChosenEmailSentUid === afterMaker) return;

      const maker = await getUserDoc(afterMaker);
      const makerEmail = maker && maker.email ? maker.email : "";
      const notifyEmail = !(maker && maker.notifyEmail === false);
      if (!makerEmail || !notifyEmail) return;

      const titleRaw = safeText(after.title || "o cerere", 80);

      const city = safeText(after.city || "", 40);
      const material = safeText(after.material || "", 30);
      const budget = safeText(after.budget || "", 30);
      const deadline = safeText(after.deadline || "", 30);

      const metaParts = [];
      if (city) metaParts.push(city);
      if (material) metaParts.push(material);
      if (budget) metaParts.push("Buget: " + budget);
      if (deadline) metaParts.push("Termen: " + deadline);
      const partsLine = metaParts.join(" · ");

      const link = "https://cere3d.ro/cerere.html?id=" + encodeURIComponent(cerereId);
      const subject = "[" + APP_NAME + "] Ai fost ales la o cerere";

      const html =
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5\">" +
        "<h2 style=\"margin:0 0 10px 0\">" + APP_NAME + "</h2>" +
        "<p>Ai fost ales ca printator pentru cererea:</p>" +
        "<p><b>" + escapeHtml(titleRaw) + "</b></p>" +
        (partsLine ? "<p style=\"color:#444\">" + escapeHtml(partsLine) + "</p>" : "") +
        "<p>Deschide cererea: <a href=\"" + link + "\">" + link + "</a></p>" +
        "<p style=\"color:#666;font-size:12px;margin-top:16px\">" +
        "Poti opri emailurile din cont (notifyEmail=false)." +
        "</p></div>";

      await sendEmail({ to: makerEmail, subject, html });

      await admin.firestore().doc("cereri/" + cerereId).update({
        makerChosenEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        makerChosenEmailSentUid: afterMaker,
      });
    } catch (e) {
      console.error("notifyMakerChosenOnCerere failed:", e);
    }
  }
);

/* =========================
   DOWNLOAD HARD: /dl
   =========================
   GET /dl?path=cereri/<id>/photos/<file.png>&name=poza.png
   -> returneaza stream cu Content-Disposition: attachment
*/
exports.dl = onRequest(
  { region: "europe-west1" },
  async (req, res) => {
    try {
      // CORS minimal (ok chiar daca chemi direct din browser)
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      const path = (req.query.path || "").toString();
      const safeName = sanitizeDownloadFileName(req.query.name || "file");

      if (!path || path.includes("..") || path.startsWith("/")) {
        res.status(400).send("Bad path");
        return;
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(path);

      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).send("Not found");
        return;
      }

      const [meta] = await file.getMetadata();
      const ct = meta?.contentType || "application/octet-stream";

      res.set("Content-Type", ct);
      res.set("Content-Disposition", `attachment; filename="${safeName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      res.set("Cache-Control", "private, max-age=60");

      file
        .createReadStream()
        .on("error", (e) => {
          console.error("dl stream error:", e);
          res.status(500).end("Stream error");
        })
        .pipe(res);
    } catch (e) {
      console.error("dl failed:", e);
      res.status(500).send("Server error");
    }
  }
);


/* =========================
   EMAIL: oferta noua la cerere
   =========================
   Trigger: cereri/{cerereId}/oferte/{ofertaId}
   (schimba "oferte" daca la tine e alt nume)
*/
/* =========================
   EMAIL: oferta noua la cerere
   ========================= */

exports.notifyOnOfferCreated = onDocumentCreated(
  {
    document: "cereri/{cerereId}/oferte/{ofertaId}",
    secrets: [BREVO_SMTP_USER, BREVO_SMTP_PASS, MAIL_FROM],
    region: "europe-west1",
  },
  async (event) => {
    try {
      const cerereId = event.params.cerereId;
      const ofertaId = event.params.ofertaId;

      console.log("[notifyOnOfferCreated] fired", { cerereId, ofertaId });

      const snap = event.data;
      const oferta = snap && typeof snap.data === "function" ? snap.data() : null;
      if (!oferta) {
        console.log("[notifyOnOfferCreated] no oferta data");
        return;
      }

      // Ia cererea
      const cerereRef = admin.firestore().doc("cereri/" + cerereId);
      const cerereSnap = await cerereRef.get();
      if (!cerereSnap.exists) {
        console.log("[notifyOnOfferCreated] cerere missing", cerereId);
        return;
      }

      const cerere = cerereSnap.data() || {};
      const ownerId = (cerere.createdBy || "").toString();
      if (!ownerId) {
        console.log("[notifyOnOfferCreated] cerere has no createdBy", cerereId);
        return;
      }

      // Daca oferta e chiar de la owner (edge case), nu trimite
      const makerUid = (oferta.makerUid || oferta.createdBy || oferta.senderId || "").toString();
      if (makerUid && makerUid === ownerId) return;

      // Email user
      const owner = await getUserDoc(ownerId);
      const ownerEmail = owner && owner.email ? owner.email : "";
      const notifyEmail = !(owner && owner.notifyEmail === false);
      if (!ownerEmail || !notifyEmail) {
        console.log("[notifyOnOfferCreated] ownerEmail missing or notifyEmail disabled", { ownerId });
        return;
      }

      const cerereTitle = safeText(cerere.title || "cererea ta", 80);

      // Nume maker (daca exista)
      const makerName =
        safeText(oferta.makerName || oferta.senderName || "Un printator", 60);

      // Extras scurt oferta (pret / termen / mesaj) - adaptabil la schema ta
      const price = safeText(oferta.price || oferta.pret || "", 40);
      const term = safeText(oferta.term || oferta.termen || "", 40);
      const msgText = safeText(oferta.message || oferta.text || oferta.descriere || "", 220);

      const bits = [];
      if (price) bits.push("Pret: " + price);
      if (term) bits.push("Termen: " + term);
      const metaLine = bits.join(" · ");

      const link = "https://cere3d.ro/cerere.html?id=" + encodeURIComponent(cerereId);
      const subject = "[" + APP_NAME + "] Oferta noua la cererea: " + cerereTitle;

      const html =
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5\">" +
        "<h2 style=\"margin:0 0 10px 0\">" + APP_NAME + "</h2>" +
        "<p>Ai primit o oferta noua la cererea: <b>" + escapeHtml(cerereTitle) + "</b></p>" +
        "<p><b>" + escapeHtml(makerName) + "</b>" +
        (metaLine ? " <span style=\"color:#444\">(" + escapeHtml(metaLine) + ")</span>" : "") +
        "</p>" +
        (msgText ? "<p style=\"margin:10px 0 0 0\">" + escapeHtml(msgText) + "</p>" : "") +
        "<p style=\"margin-top:14px\">Vezi oferta: <a href=\"" + link + "\">" + link + "</a></p>" +
        "<p style=\"color:#666;font-size:12px;margin-top:16px\">" +
        "Poti opri emailurile din cont (notifyEmail=false)." +
        "</p></div>";

      await sendEmail({ to: ownerEmail, subject, html });

      console.log("[notifyOnOfferCreated] email sent to", ownerEmail);
    } catch (e) {
      console.error("notifyOnOfferCreated failed:", e);
    }
  }
);
/* =========================
   COMMUNITY NEWS SYNC
   ========================= */

exports.syncCommunityNews = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "Europe/Bucharest",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120
  },
  async () => {
    const db = admin.firestore();
    let inserted = 0;

    for (const feed of COMMUNITY_NEWS_FEEDS) {
      try {
        console.log("[syncCommunityNews] fetching", feed.sourceName, feed.feedUrl);

        const parsed = await rssParser.parseURL(feed.feedUrl);
        const items = Array.isArray(parsed?.items) ? parsed.items.slice(0, 10) : [];

        for (const item of items) {
          const articleUrl = (item?.link || "").toString().trim();
          const title = (item?.title || "").toString().trim();
          if (!articleUrl || !title) continue;

          const docId = hashId(articleUrl);
          const ref = db.collection("communityNews").doc(docId);
          const payload = buildNewsDoc(feed, item);

          try {
            await ref.create(payload);
            inserted++;
          } catch (err) {
            if (err && (err.code === 6 || err.code === "already-exists")) {
              continue;
            }
            throw err;
          }
        }
      } catch (err) {
        console.error("[syncCommunityNews] feed failed:", feed.sourceName, err);
      }
    }

    // curata si pastreaza doar ultimele 80
    try {
      const oldSnap = await db.collection("communityNews")
        .orderBy("publishedAt", "desc")
        .get();

      if (oldSnap.size > 80) {
        const batch = db.batch();
        oldSnap.docs.slice(80).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("[syncCommunityNews] cleanup failed:", err);
    }

    console.log("[syncCommunityNews] done, inserted:", inserted);
  }
);
