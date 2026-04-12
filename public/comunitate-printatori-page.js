import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

import {
  startDmWith,
  getUserPublic,
  invalidateUserCache,
  getPublicProfileUrl,
  renderNameWithPrinterBadge
} from "./dm-utils.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

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

function timeAgo(ms) {
  if (!ms) return "acum putin timp";
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

function normalizeCategory(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "probleme") return "probleme";
  if (s === "sfaturi") return "sfaturi";
  if (s === "vanzari") return "vanzari";
  if (s === "showcase") return "showcase";
  return "general";
}

function categoryEmoji(cat) {
  switch (normalizeCategory(cat)) {
    case "probleme": return "🛠️";
    case "sfaturi": return "🧠";
    case "vanzari": return "🛒";
    case "showcase": return "🖼️";
    default: return "💬";
  }
}

function categoryLabel(cat) {
  switch (normalizeCategory(cat)) {
    case "probleme": return "Probleme";
    case "sfaturi": return "Sfaturi";
    case "vanzari": return "Vanzari";
    case "showcase": return "Showcase";
    default: return "General";
  }
}

function categoryClass(cat) {
  switch (normalizeCategory(cat)) {
    case "probleme": return "cp-type cp-type-probleme";
    case "sfaturi": return "cp-type cp-type-sfaturi";
    case "vanzari": return "cp-type cp-type-vanzari";
    case "showcase": return "cp-type cp-type-showcase";
    default: return "cp-type cp-type-general";
  }
}

function safeTrim(v) {
  return (v || "").toString().trim();
}

function splitTags(v) {
  return safeTrim(v)
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

// ─── upload blocking ────────────────────────────────────────────────────────

let isBlockingUpload = false;
let uploadBlockMessage = "Se incarca fisiere. Daca iesi acum, uploadul poate fi pierdut.";

function setUploadBlocking(active, message = "") {
  isBlockingUpload = !!active;

  let overlay = $("cpUploadOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cpUploadOverlay";
    overlay.innerHTML = `
      <div class="cp-upload-overlay-card">
        <div class="cp-upload-overlay-spinner"></div>
        <div class="cp-upload-overlay-title">Se incarca fisierele...</div>
        <div class="cp-upload-overlay-text" id="cpUploadOverlayText">Te rugam sa nu inchizi pagina.</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const textEl = $("cpUploadOverlayText");
  if (textEl) {
    textEl.textContent = message || "Te rugam sa nu inchizi pagina pana nu ajunge la 100%.";
  }

  overlay.style.display = active ? "flex" : "none";
  document.body.style.overflow = active ? "hidden" : "";
}

window.addEventListener("beforeunload", (e) => {
  if (!isBlockingUpload) return;
  e.preventDefault();
  e.returnValue = uploadBlockMessage;
});

// ─── state ──────────────────────────────────────────────────────────────────
const PAGE_STORAGE_KEY = "cp_current_page";
const POSTS_PER_PAGE = 6;
let allPostsCache = [];
let currentPage = 1;
let currentMe = null;

let shouldScrollFeedOnNextRender = false;
let pendingScrollToPostId = null;
let pendingCloseComposerAfterPublish = false;

// ─── lightbox ───────────────────────────────────────────────────────────────

let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(images, idx = 0) {
  lightboxImages = images;
  lightboxIndex = idx;

  let lb = $("cpLightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "cpLightbox";
    lb.innerHTML = `
      <div class="cp-lb-backdrop"></div>
      <button class="cp-lb-close" type="button" aria-label="Inchide">✕</button>
      <button class="cp-lb-prev" type="button" aria-label="Inapoi">‹</button>
      <div class="cp-lb-main">
        <img class="cp-lb-img" src="" alt="" />
        <div class="cp-lb-counter"></div>
      </div>
      <button class="cp-lb-next" type="button" aria-label="Inainte">›</button>
    `;
    document.body.appendChild(lb);

    lb.querySelector(".cp-lb-backdrop").addEventListener("click", closeLightbox);
    lb.querySelector(".cp-lb-close").addEventListener("click", closeLightbox);
    lb.querySelector(".cp-lb-prev").addEventListener("click", () => moveLightbox(-1));
    lb.querySelector(".cp-lb-next").addEventListener("click", () => moveLightbox(1));

    document.addEventListener("keydown", (e) => {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") moveLightbox(-1);
      if (e.key === "ArrowRight") moveLightbox(1);
    });
  }

  lb.classList.add("is-open");
  document.body.style.overflow = "hidden";
  updateLightboxSlide();
}

function closeLightbox() {
  const lb = $("cpLightbox");
  if (lb) lb.classList.remove("is-open");
  document.body.style.overflow = "";
}

function moveLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  updateLightboxSlide();
}

function updateLightboxSlide() {
  const lb = $("cpLightbox");
  if (!lb) return;
  const img = lb.querySelector(".cp-lb-img");
  const counter = lb.querySelector(".cp-lb-counter");
  if (img) {
    img.src = lightboxImages[lightboxIndex];
    img.alt = `Imagine ${lightboxIndex + 1} din ${lightboxImages.length}`;
  }
  if (counter) {
    counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
  }

  const prevBtn = lb.querySelector(".cp-lb-prev");
  const nextBtn = lb.querySelector(".cp-lb-next");
  if (prevBtn) prevBtn.style.display = lightboxImages.length > 1 ? "" : "none";
  if (nextBtn) nextBtn.style.display = lightboxImages.length > 1 ? "" : "none";
}

// ─── image render ───────────────────────────────────────────────────────────

function renderImages(images, showAll = false) {
  const arr = (Array.isArray(images) ? images : []).filter(url => url && url !== "placeholder");
  if (!arr.length) return "";

  const visible = showAll ? arr : arr.slice(0, 4);
  const extra = arr.length - 4;

  return `
    <div class="cp-image-row" data-images='${JSON.stringify(arr).replace(/'/g, "&#039;")}'>
      ${visible.map((url, idx) => `
        <div class="cp-image-real" data-img-idx="${idx}">
          <img
            src="${esc(url)}"
            alt="Imagine postare ${idx + 1}"
            style="width:100%;height:100%;object-fit:cover;display:block;border-radius:14px;"
          />
          ${!showAll && idx === 3 && extra > 0 ? `<div class="cp-image-more">+${extra}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

// ─── firebase image upload ──────────────────────────────────────────────────

async function uploadCommunityImages(files, postId, onProgress, kind = "post") {
  const urls = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = (file.name || `img_${i}`).replace(/[^\w.\-]+/g, "_");
    const basePath =
      kind === "comment"
        ? `comunitate/${postId}/comments`
        : `comunitate/${postId}`;

    const path = `${basePath}/${Date.now()}_${i}_${safeName}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          if (onProgress) {
            onProgress(i, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        },
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          urls.push(url);
          resolve();
        }
      );
    });
  }

  return urls;
}

// ─── poll helpers ───────────────────────────────────────────────────────────

function renderPollVote(poll, postId, me) {
  if (!poll || !Array.isArray(poll.options)) return "";

  const totalVotes = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
  const votesObj = (poll.votes && typeof poll.votes === "object") ? poll.votes : {};
const hasMyVote = !!(me && Object.prototype.hasOwnProperty.call(votesObj, me.uid));
const myVote = hasMyVote ? votesObj[me.uid] : null;
const closed = poll.closed === true;

  return `
    <div class="cp-poll" data-post-id="${esc(postId)}">
      <div class="cp-poll-title">${esc(poll.question || "Sondaj")}</div>
      ${poll.options.map((opt, idx) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
        const isMyVote = myVote === idx;
        const readonly = closed;

        return `
          <button
            class="cp-poll-opt ${isMyVote ? "is-voted" : ""} ${readonly ? "is-readonly" : ""}"
            type="button"
            data-vote-option="${idx}"
            data-vote-post="${esc(postId)}"
            aria-label="Voteaza ${esc(opt.label)}"
          >
            <div class="cp-poll-bar" style="width:${pct}%"></div>
            <span class="cp-poll-label">${esc(opt.label)}</span>
            <span class="cp-poll-pct">${pct}%</span>
          </button>
        `;
      }).join("")}
      <div class="cp-poll-meta">${totalVotes} vot${totalVotes !== 1 ? "uri" : ""}</div>
    </div>
  `;
}
async function castVote(postId, optionIdx, me) {
  if (!me) {
    alert("Trebuie sa fii autentificat.");
    return;
  }

  const ref = doc(db, "comunitatePrintatori", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  const poll = data.poll;
  if (!poll || !Array.isArray(poll.options)) return;

  const votes = (poll.votes && typeof poll.votes === "object") ? poll.votes : {};
  const prevVote = Object.prototype.hasOwnProperty.call(votes, me.uid) ? votes[me.uid] : null;

  if (optionIdx < 0 || optionIdx >= poll.options.length) return;

  const nextOptions = poll.options.map((opt, idx) => {
    let nextVotes = opt.votes || 0;

    // scoate votul vechi daca exista
    if (prevVote === idx) {
      nextVotes = Math.max(0, nextVotes - 1);
    }

    // adauga votul nou doar daca nu e acelasi click de unvote
    if (prevVote !== optionIdx && idx === optionIdx) {
      nextVotes += 1;
    }

    return {
      ...opt,
      votes: nextVotes
    };
  });

  const nextVotesMap = { ...votes };

  if (prevVote === optionIdx) {
    // unvote
    delete nextVotesMap[me.uid];
  } else {
    // vote nou sau schimbare vot
    nextVotesMap[me.uid] = optionIdx;
  }

  const nextPoll = {
    ...poll,
    options: nextOptions,
    votes: nextVotesMap
  };

  await updateDoc(ref, {
    poll: nextPoll,
    updatedAt: serverTimestamp()
  });
}

// ─── comment with image ─────────────────────────────────────────────────────

function renderCommentHtml(c) {
  const images = Array.isArray(c.images) ? c.images.filter(u => u && u !== "placeholder") : [];
  return `
    <div class="cp-comment" data-comment-id="${esc(c.id || "")}">
      <div class="cp-comment-head">
        <img class="cp-comment-av" src="${esc(c.createdByAvatar || "/assets/avatar-placeholder.svg")}" alt="" />
        <div>
          <div class="cp-comment-name">${esc(c.createdByName || "User")}${c.createdByIsPrinter ? " 🖨️" : ""}</div>
          <div class="cp-comment-time">${timeAgo(tsMs(c.createdAt))}</div>
        </div>
      </div>
      <div class="cp-comment-body">${esc(c.text || "")}</div>
      ${images.length ? `
        <div class="cp-comment-images" data-images='${JSON.stringify(images).replace(/'/g, "&#039;")}'>
          ${images.map((url, idx) => `<img class="cp-comment-img" src="${esc(url)}" alt="" data-img-idx="${idx}" />`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// ─── post card ──────────────────────────────────────────────────────────────

function renderTags(tags) {
  const arr = Array.isArray(tags) ? tags : [];
  if (!arr.length) return "";
  return `<div class="cp-post-tags">${arr.map(tag => `<span class="cp-tag">${esc(tag)}</span>`).join("")}</div>`;
}

function renderSaleLine(post) {
  if (normalizeCategory(post.category) !== "vanzari") return "";
  const price = safeTrim(post.price);
  const location = safeTrim(post.location);
  if (!price && !location) return "";
  return `
    <div class="cp-price-line">
      ${price ? `Pret: ${esc(price)}` : ""}
      ${price && location ? " · " : ""}
      ${location ? `Locatie: ${esc(location)}` : ""}
      ${(price || location) ? " · Tip post: Vanzare" : ""}
    </div>
  `;
}

function renderPostCard(post, me, profileMap = {}, commentsMap = {}) {
  const postId = post.id || "";
  const cat = normalizeCategory(post.category);
  const authorUid = post.createdBy || "";
  const prof = profileMap[authorUid] || {};
  const authorName = post.createdByName || prof.name || "User";
  const authorAvatar = post.createdByAvatar || prof.avatarUrl || "/assets/avatar-placeholder.svg";
  const authorIsPrinter = prof.isPrinter === true || post.createdByIsPrinter === true;
  const authorProfileUrl = authorUid
    ? getPublicProfileUrl({
        uid: authorUid,
        isPrinter: authorIsPrinter,
        printerVisible: prof.printerVisible !== false
      })
    : "#";

  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  const likesCount = likedBy.length;
  const comments = commentsMap[postId] || [];
  const commentsCount = post.commentCount ?? comments.length;
  const isLiked = !!(me && likedBy.includes(me.uid));
  const mine = !!(me && authorUid && me.uid === authorUid);

  const realImages = (Array.isArray(post.images) ? post.images : []).filter(u => u && u !== "placeholder");

  return `
    <article class="cp-card" data-post-id="${esc(postId)}" data-cat="${esc(cat)}">
      <div class="cp-card-top">
        <div style="min-width:0;">
          <div class="${categoryClass(cat)}">${categoryEmoji(cat)} ${categoryLabel(cat)}</div>
          <h3 class="cp-card-title" style="margin-top:10px;">
            <a href="/post.html?id=${esc(postId)}" class="cp-card-title-link">${esc(post.title || "Postare")}</a>
          </h3>
        </div>
        <div class="cp-stat">${timeAgo(tsMs(post.createdAt))}</div>
      </div>

      <div class="cp-author">
        <a href="${esc(authorProfileUrl)}" style="display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0;" onclick="event.stopPropagation();">
          <img class="cp-author-av" src="${esc(authorAvatar)}" alt="" />
          <div style="min-width:0;">
            <div class="cp-author-name">${renderNameWithPrinterBadge(authorName, authorIsPrinter, true)}</div>
            <div class="cp-author-meta">
              ${esc(post.city || prof.printerCity || prof.city || "Romania")} · ${mine ? "postarea ta" : "membru comunitate"}
            </div>
          </div>
        </a>
      </div>

      <p class="cp-card-desc">${esc(post.description || "")}</p>

      ${renderSaleLine(post)}
      ${renderTags(post.tags)}
      ${post.poll ? renderPollVote(post.poll, postId, me) : ""}
      ${realImages.length ? renderImages(realImages) : ""}

      <div class="cp-card-foot">
        <div class="cp-stats">
          <button class="cp-stat cp-like-btn ${isLiked ? "is-liked" : ""}" type="button" data-like="${esc(postId)}">
            ${isLiked ? "❤️" : "👍"} ${likesCount}
          </button>
          <span class="cp-stat">💬 ${commentsCount}</span>
        </div>

        <div class="cp-actions">
          ${cat === "vanzari" && authorUid && !mine
            ? `<button class="btn btn-orange" type="button" data-dm="${esc(authorUid)}">Trimite mesaj</button>`
            : ""
          }
          <a class="btn btn-blue-soft" href="/post.html?id=${esc(postId)}">Deschide →</a>
          <button class="btn btn-ghost cp-inline-comment-btn" type="button" data-toggle-comments="${esc(postId)}">💬 Comentarii</button>
        </div>
      </div>

      <div id="comments-${esc(postId)}" class="cp-comments-inline" style="display:none;">
        <div class="cp-comments-list" id="comments-list-${esc(postId)}">
          ${comments.length
            ? comments.slice(0, 3).map(c => renderCommentHtml(c)).join("")
            : `<div class="cp-comment-empty">Nu exista comentarii inca.</div>`
          }
        </div>
        ${comments.length > 3 ? `<a href="/post.html?id=${esc(postId)}" class="cp-see-more-link">Vezi toate ${commentsCount} comentariile →</a>` : ""}

        ${me ? `
          <div class="cp-comment-form">
            <img class="cp-comment-av" src="${esc(me.photoURL || "/assets/avatar-placeholder.svg")}" alt="" />
            <div class="cp-comment-input-wrap">
              <input
                id="comment-input-${esc(postId)}"
                class="input cp-comment-input"
                type="text"
                maxlength="800"
                placeholder="Scrie un comentariu..."
              />
              <div class="cp-comment-input-actions">
                <label class="cp-attach-btn" title="Adauga imagini" for="comment-img-${esc(postId)}">
                  📎
                  <input
                    id="comment-img-${esc(postId)}"
                    type="file"
                    accept="image/*"
                    multiple
                    style="display:none;"
                    data-comment-img-post="${esc(postId)}"
                  />
                </label>
                <button class="btn btn-blue-soft" type="button" data-send-comment="${esc(postId)}">Trimite</button>
              </div>
              <div id="comment-img-preview-${esc(postId)}" class="cp-comment-img-preview"></div>
            </div>
          </div>
        ` : `<div class="cp-comment-empty"><a href="/auth.html">Autentifica-te</a> pentru a comenta.</div>`}
      </div>
    </article>
  `;
}

// ─── profile + comments maps ────────────────────────────────────────────────

async function buildProfileMap(posts) {
  const map = {};
  const uids = [...new Set((posts || []).map(p => p.createdBy).filter(Boolean))];
  await Promise.all(uids.map(async uid => {
    try {
      map[uid] = await getUserPublic(uid);
    } catch {
      map[uid] = { name: "User", avatarUrl: "", isPrinter: false, printerVisible: false };
    }
  }));
  return map;
}

async function buildCommentsMap(posts) {
  const out = {};
  await Promise.all((posts || []).map(async p => {
    try {
      const snap = await getDocs(query(
        collection(db, "comunitatePrintatori", p.id, "comments"),
        orderBy("createdAt", "asc"),
        limit(50)
      ));
      out[p.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      out[p.id] = [];
    }
  }));
  return out;
}

// ─── pagination ─────────────────────────────────────────────────────────────

function totalPages() {
  return Math.max(1, Math.ceil(allPostsCache.length / POSTS_PER_PAGE));
}

function getPagePosts(page) {
  const start = (page - 1) * POSTS_PER_PAGE;
  return allPostsCache.slice(start, start + POSTS_PER_PAGE);
}

function renderPagination(page) {
  const total = totalPages();
  if (total <= 1) {
    const el = $("cpPagination");
    if (el) el.innerHTML = "";
    return;
  }

  const pager = $("cpPagination");
  if (!pager) return;

  let html = `<div class="cp-pager">`;

  if (page > 1) {
    html += `<button class="cp-page-btn" data-page="${page - 1}">‹ Inapoi</button>`;
  }

  const range = buildPageRange(page, total);
  for (const p of range) {
    if (p === "...") {
      html += `<span class="cp-page-ellipsis">…</span>`;
    } else {
      html += `<button class="cp-page-btn ${p === page ? "is-active" : ""}" data-page="${p}">${p}</button>`;
    }
  }

  if (page < total) {
    html += `<button class="cp-page-btn" data-page="${page + 1}">Inainte ›</button>`;
  }

  html += `</div>`;
  pager.innerHTML = html;

  pager.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.getAttribute("data-page"), 10);
      goToPage(p, { scrollToFeed: true });
    });
  });
}

function buildPageRange(current, total) {
  const delta = 2;
  const range = [];

  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i);
  }

  if (current - delta > 2) range.unshift("...");
  if (current + delta < total - 1) range.push("...");

  range.unshift(1);
  if (total !== 1) range.push(total);

  return range;
}

async function goToPage(page, opts = {}) {
  const {
    scrollToFeed = false,
    scrollToPostId = null
  } = opts;
localStorage.setItem(PAGE_STORAGE_KEY, String(page));
  currentPage = page;
  const pagePosts = getPagePosts(page);
  const profileMap = await buildProfileMap(pagePosts);
  const commentsMap = await buildCommentsMap(pagePosts);

  const feed = $("cpFeed");
  if (!feed) return;

  feed.innerHTML = pagePosts.map(post => renderPostCard(post, currentMe, profileMap, commentsMap)).join("");
  bindFeedActions(currentMe);
  renderPagination(page);

  if (pendingCloseComposerAfterPublish) {
    const wrap = $("cpComposerWrap");
    if (wrap) wrap.style.display = "none";
    pendingCloseComposerAfterPublish = false;
  }

  if (scrollToPostId) {
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-post-id="${scrollToPostId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("cp-card-new");
        setTimeout(() => card.classList.remove("cp-card-new"), 2200);
      }
    });
    return;
  }

  if (scrollToFeed) {
    requestAnimationFrame(() => {
      feed.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

// ─── render feed ────────────────────────────────────────────────────────────

async function renderFeed(posts, me) {
  const feed = $("cpFeed");
  if (!feed) return;

  allPostsCache = posts || [];
  if (currentPage > totalPages()) {
  currentPage = totalPages();
}
  currentMe = me;
  const savedPage = parseInt(localStorage.getItem(PAGE_STORAGE_KEY), 10);
if (!Number.isNaN(savedPage) && !pendingScrollToPostId) {
  currentPage = savedPage;
}
  if (pendingScrollToPostId) {
  currentPage = 1;
}

  if (!allPostsCache.length) {
    feed.innerHTML = `<div class="cp-empty">Nu exista postari inca. Fii primul care posteaza in comunitate!</div>`;
    const pager = $("cpPagination");
    if (pager) pager.innerHTML = "";
    return;
  }

  await goToPage(currentPage, {
    scrollToFeed: shouldScrollFeedOnNextRender,
    scrollToPostId: pendingScrollToPostId
  });
localStorage.setItem(PAGE_STORAGE_KEY, String(currentPage));
  shouldScrollFeedOnNextRender = false;
  pendingScrollToPostId = null;
}

// ─── top active ─────────────────────────────────────────────────────────────

function renderTopActive(posts) {
  const box = $("cpTopActiveList");
  if (!box) return;

  const scoreByUser = {};
  for (const p of posts || []) {
    const uid = p.createdBy || "";
    if (!uid) continue;
    const likes = Array.isArray(p.likedBy) ? p.likedBy.length : 0;
    scoreByUser[uid] = (scoreByUser[uid] || 0) + 1 + likes;
  }

  const ranked = Object.entries(scoreByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (!ranked.length) {
    box.innerHTML = `<div class="cp-empty">Nu exista activitate suficienta.</div>`;
    return;
  }

  Promise.all(ranked.map(async ([uid, score], idx) => {
    const p = await getUserPublic(uid);
    const badge = idx === 0
      ? `<span class="cp-rank-badge cp-badge-top">Top</span>`
      : idx === 1
        ? `<span class="cp-rank-badge cp-badge-fast">Rapid</span>`
        : `<span class="cp-rank-badge cp-badge-active">Activ</span>`;

    return `
      <div class="cp-rank-item">
        <div class="cp-rank-left">
          <div class="cp-rank-no">${idx + 1}</div>
          <div>
            <div class="cp-rank-name">${renderNameWithPrinterBadge(p.name || "User", p.isPrinter === true, true)}</div>
            <div class="cp-rank-meta">scor: ${score}</div>
          </div>
        </div>
        ${badge}
      </div>
    `;
  }))
    .then(html => { box.innerHTML = html.join(""); })
    .catch(() => { box.innerHTML = `<div class="cp-empty">Nu pot incarca topul.</div>`; });
}

// ─── showcase ───────────────────────────────────────────────────────────────

async function renderShowcase(posts) {
  const grid = $("cpShowcaseGrid");
  if (!grid) return;

  const showcase = (posts || [])
    .filter(p => normalizeCategory(p.category) === "showcase")
    .slice(0, 8);

  if (!showcase.length) {
    grid.innerHTML = `<div class="cp-empty" style="grid-column:1/-1;">Nu exista proiecte showcase inca.</div>`;
    return;
  }

  const profileMap = await buildProfileMap(showcase);

  grid.innerHTML = showcase.map(p => {
    const prof = profileMap[p.createdBy || ""] || {};
    const author = p.createdByName || prof.name || "User";
    const city = p.city || prof.printerCity || prof.city || "Romania";
    const likes = Array.isArray(p.likedBy) ? p.likedBy.length : 0;
    const realImages = (Array.isArray(p.images) ? p.images : []).filter(u => u && u !== "placeholder");
    const thumbUrl = realImages[0] || null;

    return `
      <article class="cp-showcase-item">
        <a href="/post.html?id=${esc(p.id)}" class="cp-showcase-link">
          <div class="cp-showcase-media ${thumbUrl ? "has-image" : ""}">
            ${
              thumbUrl
                ? `<img src="${esc(thumbUrl)}" alt="${esc(p.title || "Showcase")}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
                : esc(p.title || "Proiect")
            }
          </div>
          <div class="cp-showcase-body">
            <h3 class="cp-showcase-title">${esc(p.title || "Showcase")}</h3>
            <div class="cp-showcase-meta">de ${esc(author)} · ${esc(city)} · ${likes} aprecieri</div>
          </div>
        </a>
      </article>
    `;
  }).join("");
}

// ─── hero stats ─────────────────────────────────────────────────────────────

function updateHeroStats(posts) {
  const all = posts || [];
  const totalPosts = all.length;
  const showcaseCount = all.filter(p => normalizeCategory(p.category) === "showcase").length;
  const avgLikes = totalPosts
    ? (all.reduce((s, p) => s + (Array.isArray(p.likedBy) ? p.likedBy.length : 0), 0) / totalPosts).toFixed(1)
    : "0.0";

  if ($("printersCountStat")) $("printersCountStat").textContent = String(totalPosts);
  if ($("resolvedMonthStat")) $("resolvedMonthStat").textContent = String(showcaseCount);
  if ($("reviewsStat")) $("reviewsStat").textContent = avgLikes;

  const kpiLabels = document.querySelectorAll(".cp-kpi-label");
  if (kpiLabels[0]) kpiLabels[0].textContent = "Postari in comunitate";
  if (kpiLabels[1]) kpiLabels[1].textContent = "Postari Showcase";
  if (kpiLabels[2]) kpiLabels[2].textContent = "Like-uri medii / post";
  if (kpiLabels[3]) kpiLabels[3].textContent = "Gamification activa";
}

// ─── like / comment / vote ─────────────────────────────────────────────────

async function toggleLike(postId, me) {
  if (!me || !postId) {
    alert("Trebuie sa fii autentificat.");
    return;
  }

  const ref = doc(db, "comunitatePrintatori", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  const likedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
  const isLiked = likedBy.includes(me.uid);

  await updateDoc(ref, {
    likedBy: isLiked ? arrayRemove(me.uid) : arrayUnion(me.uid),
    updatedAt: serverTimestamp()
  });
}

const pendingCommentImages = {};

async function sendComment(postId, me) {
  if (!me || !postId) {
    alert("Trebuie sa fii autentificat.");
    return;
  }

  const input = document.getElementById(`comment-input-${postId}`);
  const text = safeTrim(input?.value);
  const imageFiles = pendingCommentImages[postId] || [];

  if (!text && !imageFiles.length) return;

  const pub = await getUserPublic(me.uid);

  let imageUrls = [];
  if (imageFiles.length) {
    const statusEl = document.createElement("div");
    statusEl.className = "small-muted";
    statusEl.textContent = "Se incarca imaginile...";
    input?.parentElement?.appendChild(statusEl);

    setUploadBlocking(true, `Se incarca ${imageFiles.length} imagini pentru comentariu.`);
    uploadBlockMessage = "Se incarca imaginile comentariului. Daca iesi acum, uploadul poate fi pierdut.";

    try {
      imageUrls = await uploadCommunityImages(imageFiles, postId, (i, pct) => {
        statusEl.textContent = `Imagine comentariu ${i + 1}: ${pct}%`;
        setUploadBlocking(true, `Se incarca imaginea comentariului ${i + 1}: ${pct}%`);
      }, "comment");
    } finally {
      setUploadBlocking(false);
      statusEl.remove();
    }
  }

  await addDoc(collection(db, "comunitatePrintatori", postId, "comments"), {
    text: text || "",
    images: imageUrls,
    createdAt: serverTimestamp(),
    createdBy: me.uid,
    createdByName: pub?.name || me.displayName || "User",
    createdByAvatar: pub?.avatarUrl || "",
    createdByIsPrinter: pub?.isPrinter === true
  });

  if (input) input.value = "";
  delete pendingCommentImages[postId];

  const preview = $(`comment-img-preview-${postId}`);
  if (preview) preview.innerHTML = "";
}

// ─── live comments per post ────────────────────────────────────────────────

const commentListeners = {};

function attachLiveComments(postId) {
  if (commentListeners[postId]) return;

  const q = query(
    collection(db, "comunitatePrintatori", postId, "comments"),
    orderBy("createdAt", "asc"),
    limit(100)
  );

  commentListeners[postId] = onSnapshot(q, snap => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const listEl = $(`comments-list-${postId}`);
    if (!listEl) return;

    if (!comments.length) {
      listEl.innerHTML = `<div class="cp-comment-empty">Nu exista comentarii inca.</div>`;
    } else {
      const visible = comments.slice(0, 3);
      const seeMoreEl = listEl.nextElementSibling;

      if (seeMoreEl && seeMoreEl.classList.contains("cp-see-more-link")) {
        if (comments.length > 3) {
          seeMoreEl.textContent = `Vezi toate ${comments.length} comentariile →`;
          seeMoreEl.style.display = "";
        } else {
          seeMoreEl.style.display = "none";
        }
      }

      listEl.innerHTML = visible.map(c => renderCommentHtml(c)).join("");
    }

    listEl.querySelectorAll(".cp-comment-images").forEach(wrap => {
      const imgs = JSON.parse(wrap.dataset.images || "[]");
      wrap.querySelectorAll(".cp-comment-img").forEach(img => {
        img.addEventListener("click", () => {
          const idx = parseInt(img.dataset.imgIdx || "0", 10);
          openLightbox(imgs, idx);
        });
      });
    });

    const card = document.querySelector(`[data-post-id="${postId}"]`);
    if (card) {
      const countEl = card.querySelector(".cp-stats .cp-stat:nth-child(2)");
      if (countEl) countEl.textContent = `💬 ${comments.length}`;
    }
  });
}

// ─── bind actions ───────────────────────────────────────────────────────────

function bindFeedActions(me) {
  document.querySelectorAll("[data-like]").forEach(btn => {
    if (btn.dataset.boundLike) return;
    btn.dataset.boundLike = "1";

    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      if (!me) {
        window.location.href = "/auth.html";
        return;
      }

      const postId = btn.getAttribute("data-like");
      btn.disabled = true;
      try {
        shouldScrollFeedOnNextRender = false;
await toggleLike(postId, me);
      } catch (err) {
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-toggle-comments]").forEach(btn => {
    if (btn.dataset.boundToggle) return;
    btn.dataset.boundToggle = "1";

    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();

      const postId = btn.getAttribute("data-toggle-comments");
      const box = $(`comments-${postId}`);
      if (!box) return;

      const open = box.style.display !== "none" && box.style.display !== "";
      box.style.display = open ? "none" : "";

      if (!open) {
        attachLiveComments(postId);
      }
    });
  });

  document.querySelectorAll("[data-send-comment]").forEach(btn => {
    if (btn.dataset.boundSendComment) return;
    btn.dataset.boundSendComment = "1";

    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();

      const postId = btn.getAttribute("data-send-comment");
      btn.disabled = true;
      btn.textContent = "Se trimite...";

      try {
        await sendComment(postId, me);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Eroare la comentariu.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Trimite";
      }
    });
  });

  document.querySelectorAll("[data-comment-img-post]").forEach(input => {
    if (input.dataset.boundImgPicker) return;
    input.dataset.boundImgPicker = "1";

    input.addEventListener("change", () => {
      const postId = input.getAttribute("data-comment-img-post");
      const files = Array.from(input.files || []).slice(0, 4);
      pendingCommentImages[postId] = files;

      const preview = $(`comment-img-preview-${postId}`);
      if (!preview) return;

      preview.innerHTML = files.map((f, i) => `
        <div class="cp-img-thumb-wrap">
          <img class="cp-img-thumb" src="${URL.createObjectURL(f)}" alt="" />
          <button class="cp-img-thumb-remove" type="button" data-remove-img="${i}" data-remove-post="${esc(postId)}">✕</button>
        </div>
      `).join("");

      preview.querySelectorAll("[data-remove-img]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-remove-img"), 10);
          const pid = btn.getAttribute("data-remove-post");
          if (pendingCommentImages[pid]) {
            pendingCommentImages[pid].splice(idx, 1);
            input.value = "";
            btn.parentElement.remove();
          }
        });
      });
    });
  });

  document.querySelectorAll("[data-dm]").forEach(btn => {
    if (btn.dataset.boundDm) return;
    btn.dataset.boundDm = "1";

    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();

      const uid = btn.getAttribute("data-dm");
      if (!uid) return;

      try {
        await startDmWith(uid);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Eroare la mesaj.");
      }
    });
  });

  document.querySelectorAll(".cp-image-row").forEach(row => {
    if (row.dataset.boundLightbox) return;
    row.dataset.boundLightbox = "1";

    const images = JSON.parse(row.dataset.images || "[]");
    row.querySelectorAll(".cp-image-real").forEach(cell => {
      cell.style.cursor = "pointer";
      cell.addEventListener("click", () => {
        const idx = parseInt(cell.dataset.imgIdx || "0", 10);
        openLightbox(images, idx);
      });
    });
  });


}

// ─── composer ───────────────────────────────────────────────────────────────

function ensureCommunityComposer() {
  if ($("cpComposerWrap")) return;

  const hero = document.querySelector(".cp-hero");
  if (!hero) return;

  const wrap = document.createElement("section");
  wrap.className = "cp-section";
  wrap.id = "cpComposerWrap";
  wrap.style.display = "none";

  wrap.innerHTML = `
    <div class="cp-section-head">
      <div>
        <h2>Posteaza in comunitate</h2>
        <p class="cp-section-sub">Poti posta intrebari, probleme, sfaturi, vanzari sau showcase.</p>
      </div>
    </div>

    <div class="card" style="border-radius:20px;">
      <div style="display:grid;gap:14px;">

        <label class="field">
          <span class="label">Tip postare</span>
          <select id="cpPostCategory" class="input">
            <option value="general">💬 General</option>
            <option value="probleme">🛠️ Probleme</option>
            <option value="sfaturi">🧠 Sfaturi</option>
            <option value="vanzari">🛒 Vanzari</option>
            <option value="showcase">🖼️ Showcase</option>
          </select>
        </label>

        <label class="field">
          <span class="label">Titlu</span>
          <input id="cpPostTitle" class="input" type="text" maxlength="140" placeholder="Ex: Ce material sa folosesc pentru asta?" />
        </label>

        <label class="field">
          <span class="label">Descriere</span>
          <textarea id="cpPostDesc" class="input textarea" rows="5" maxlength="3000" placeholder="Scrie clar problema, ideea, vanzarea sau proiectul."></textarea>
        </label>

        <div id="cpSaleFields" style="display:none;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="field">
            <span class="label">Pret</span>
            <input id="cpPostPrice" class="input" type="text" maxlength="40" placeholder="Ex: 900 lei" />
          </label>
          <label class="field">
            <span class="label">Locatie</span>
            <input id="cpPostLocation" class="input" type="text" maxlength="80" placeholder="Ex: Bucuresti" />
          </label>
        </div>

        <div id="cpImageSection">
          <div class="label" style="margin-bottom:8px;">
            Imagini (optional, max 8)
            <span id="cpImgCount" style="color:var(--cp-muted);font-weight:700;font-size:12px;"></span>
          </div>
          <div class="cp-upload-zone" id="cpUploadZone">
            <input id="cpPostImages" type="file" accept="image/*" multiple style="position:absolute;inset:0;opacity:0;cursor:pointer;" />
            <div class="cp-upload-icon">📷</div>
            <div class="cp-upload-label">Trage imaginile aici sau <span style="color:var(--cp-blue);">alege fisiere</span></div>
            <div class="cp-upload-hint">PNG, JPG, WEBP · max 8 imagini · max 10MB/imagine</div>
          </div>
          <div id="cpImgPreviews" class="cp-img-previews"></div>
          <div id="cpUploadProgress" class="small-muted" style="margin-top:10px;font-size:14px;font-weight:800;color:#1d4ed8;"></div>
        </div>

        <div id="cpPollSection" style="display:none;">
          <div class="label" style="margin-bottom:8px;">Sondaj</div>
          <div style="display:grid;gap:8px;">
            <input id="cpPollQuestion" class="input" type="text" maxlength="200" placeholder="Intrebarea sondajului..." />
            <div id="cpPollOptions" style="display:grid;gap:6px;">
              <div class="cp-poll-opt-row">
                <input class="input cp-poll-opt-input" type="text" maxlength="100" placeholder="Optiunea 1" />
              </div>
              <div class="cp-poll-opt-row">
                <input class="input cp-poll-opt-input" type="text" maxlength="100" placeholder="Optiunea 2" />
              </div>
            </div>
            <button class="btn btn-blue-soft" type="button" id="cpAddPollOption" style="width:fit-content;">+ Adauga optiune</button>
          </div>
        </div>

        <label class="field">
          <span class="label">Tag-uri (optional, separate prin virgula)</span>
          <input id="cpPostTags" class="input" type="text" maxlength="200" placeholder="Ex: PETG, auto, Ender 3" />
        </label>

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button id="cpTogglePoll" class="btn btn-blue-soft" type="button" style="font-size:13px;">📊 Adauga sondaj</button>
          <span class="small-muted">sau</span>
          <button id="cpToggleImages" class="btn btn-blue-soft" type="button" style="font-size:13px;">📷 Adauga imagini</button>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button id="cpSubmitPost" class="btn btn-orange" type="button">🚀 Publica postarea</button>
          <button id="cpCancelPost" class="btn btn-blue-soft" type="button">Inchide</button>
        </div>

        <div id="cpPostStatus" class="small-muted"></div>
      </div>
    </div>
  `;

  hero.insertAdjacentElement("afterend", wrap);

  const togglePollBtn = $("cpTogglePoll");
  const pollSection = $("cpPollSection");
  const toggleImgBtn = $("cpToggleImages");
  const imgSection = $("cpImageSection");

  if (togglePollBtn && pollSection) {
    let pollOpen = false;
    togglePollBtn.addEventListener("click", () => {
      pollOpen = !pollOpen;
      pollSection.style.display = pollOpen ? "" : "none";
      togglePollBtn.textContent = pollOpen ? "✕ Elimina sondaj" : "📊 Adauga sondaj";
    });
  }

  if (toggleImgBtn && imgSection) {
    imgSection.style.display = "none";
    let imgOpen = false;
    toggleImgBtn.addEventListener("click", () => {
      imgOpen = !imgOpen;
      imgSection.style.display = imgOpen ? "" : "none";
      toggleImgBtn.textContent = imgOpen ? "✕ Elimina imagini" : "📷 Adauga imagini";
    });
  }

  let pollOptionCount = 2;
  const addPollOpt = $("cpAddPollOption");
  if (addPollOpt) {
    addPollOpt.addEventListener("click", () => {
      if (pollOptionCount >= 6) return;
      pollOptionCount++;

      const row = document.createElement("div");
      row.className = "cp-poll-opt-row";
      row.innerHTML = `
        <input class="input cp-poll-opt-input" type="text" maxlength="100" placeholder="Optiunea ${pollOptionCount}" />
        <button class="cp-poll-opt-remove" type="button">✕</button>
      `;

      row.querySelector(".cp-poll-opt-remove").addEventListener("click", () => {
        row.remove();
        pollOptionCount--;
      });

      $("cpPollOptions").appendChild(row);
    });
  }

  const imageInput = $("cpPostImages");
  const previews = $("cpImgPreviews");
  const imgCount = $("cpImgCount");

  let selectedFiles = [];

  if (imageInput && previews) {
    imageInput.addEventListener("change", () => {
      const newFiles = Array.from(imageInput.files || []);
      selectedFiles = [...selectedFiles, ...newFiles].slice(0, 8);
      if (imgCount) {
        imgCount.textContent = selectedFiles.length ? `(${selectedFiles.length}/8)` : "";
      }
      renderImgPreviews();
      imageInput.value = "";
    });
  }

  function renderImgPreviews() {
    if (!previews) return;
    previews.innerHTML = selectedFiles.map((f, i) => `
      <div class="cp-img-thumb-wrap">
        <img class="cp-img-thumb" src="${URL.createObjectURL(f)}" alt="" />
        <button class="cp-img-thumb-remove" type="button" data-remove="${i}">✕</button>
      </div>
    `).join("");

    previews.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove"), 10);
        selectedFiles.splice(idx, 1);
        if (imgCount) {
          imgCount.textContent = selectedFiles.length ? `(${selectedFiles.length}/8)` : "";
        }
        renderImgPreviews();
      });
    });
  }

  wrap._getSelectedFiles = () => selectedFiles;
  wrap._clearSelectedFiles = () => {
    selectedFiles = [];
    renderImgPreviews();
    if (imgCount) imgCount.textContent = "";
  };
}

function ensureLiveSections() {
  const feedSection = document.querySelector('.cp-section[aria-label="Exemple de discutii"]');
  if (!feedSection) return;

  const layout = feedSection.querySelector(".cp-layout");
  if (!layout) return;

  const feed = layout.querySelector(".cp-feed");
  if (feed) {
    feed.id = "cpFeed";
    if (!feed.dataset.liveReady) {
      feed.dataset.liveReady = "1";
      feed.innerHTML = `<div class="cp-empty">Se incarca discutiile din comunitate...</div>`;
    }
  }

  if (!$("cpPagination")) {
    const pager = document.createElement("div");
    pager.id = "cpPagination";
    feed.parentElement.insertBefore(pager, feed.nextSibling);
  }

  const showcaseSection = document.querySelector('.cp-section[aria-label="Showcase global"]');
  if (showcaseSection) {
    const grid = showcaseSection.querySelector(".cp-showcase-grid");
    if (grid) {
      grid.id = "cpShowcaseGrid";
      if (!grid.dataset.liveReady) {
        grid.dataset.liveReady = "1";
        grid.innerHTML = `<div class="cp-empty" style="grid-column:1/-1;">Se incarca showcase-ul...</div>`;
      }
    }
  }

  const sideCards = document.querySelectorAll(".cp-side-card");
  if (sideCards[1]) {
    const box = sideCards[1].querySelector(".cp-rank-list");
    if (box) {
      box.id = "cpTopActiveList";
      box.innerHTML = `<div class="cp-empty">Se incarca topul...</div>`;
    }
  }
}

// ─── composer ui init ───────────────────────────────────────────────────────

function initComposerUi(me) {
  ensureCommunityComposer();

  const wrap = $("cpComposerWrap");
  const openButtons = [
    $("btnJoinPrinter"),
    $("btnJoinPrinterBottom"),
    ...Array.from(document.querySelectorAll('a[href*="action%3Dpost"], button[data-open-community-post]'))
  ].filter(Boolean);

  const categoryEl = $("cpPostCategory");
  const titleEl = $("cpPostTitle");
  const descEl = $("cpPostDesc");
  const tagsEl = $("cpPostTags");
  const priceEl = $("cpPostPrice");
  const locationEl = $("cpPostLocation");
  const saleFields = $("cpSaleFields");
  const submitBtn = $("cpSubmitPost");
  const cancelBtn = $("cpCancelPost");
  const statusEl = $("cpPostStatus");
  const uploadProgressEl = $("cpUploadProgress");

  function updateSaleFields() {
    if (!saleFields || !categoryEl) return;
    saleFields.style.display = normalizeCategory(categoryEl.value) === "vanzari" ? "grid" : "none";
  }

  function openComposer() {
    if (!me) {
      location.href = `/auth.html?return=${encodeURIComponent("/comunitate-printatori.html?action=post")}`;
      return;
    }
    if (!wrap) return;
    wrap.style.display = "";
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeComposer() {
    if (isBlockingUpload) return;
    if (!wrap) return;
    wrap.style.display = "none";
  }

  openButtons.forEach(btn => {
    if (btn.dataset.boundOpenComposer) return;
    btn.dataset.boundOpenComposer = "1";

    btn.addEventListener("click", e => {
      const href = btn.getAttribute("href") || "";
      if (href.includes("action%3Dpost")) e.preventDefault();
      openComposer();
    });
  });

  if (categoryEl && !categoryEl.dataset.bound) {
    categoryEl.dataset.bound = "1";
    categoryEl.addEventListener("change", updateSaleFields);
    updateSaleFields();
  }

  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = "1";
    cancelBtn.addEventListener("click", closeComposer);
  }

  if (submitBtn && !submitBtn.dataset.bound) {
    submitBtn.dataset.bound = "1";

    submitBtn.addEventListener("click", async () => {
      try {
        if (!me) {
          location.href = `/auth.html?return=${encodeURIComponent("/comunitate-printatori.html?action=post")}`;
          return;
        }

        const title = safeTrim(titleEl?.value);
        const description = safeTrim(descEl?.value);
        const category = normalizeCategory(categoryEl?.value);
        const tags = splitTags(tagsEl?.value);
        const price = safeTrim(priceEl?.value);
        const location = safeTrim(locationEl?.value);

        if (!title) {
          if (statusEl) statusEl.textContent = "Scrie un titlu.";
          return;
        }

        if (!description) {
          if (statusEl) statusEl.textContent = "Scrie descrierea.";
          return;
        }

        if (category === "vanzari" && !price) {
          if (statusEl) statusEl.textContent = "La vanzari completeaza si pretul.";
          return;
        }

        let poll = null;
        const pollSection = $("cpPollSection");
        if (pollSection && pollSection.style.display !== "none") {
          const question = safeTrim($("cpPollQuestion")?.value);
          const optInputs = Array.from(document.querySelectorAll(".cp-poll-opt-input"))
            .map(el => safeTrim(el.value))
            .filter(Boolean);

          if (question && optInputs.length >= 2) {
            poll = {
              question,
              options: optInputs.map(label => ({ label, votes: 0 })),
              votes: {},
              closed: false
            };
          }
        }

        if (statusEl) statusEl.textContent = "Se publica postarea...";
        submitBtn.disabled = true;

        const pub = await getUserPublic(me.uid);
        const docRef = doc(collection(db, "comunitatePrintatori"));
        const postId = docRef.id;

        const selectedFiles = wrap?._getSelectedFiles?.() || [];
        let imageUrls = [];

        if (selectedFiles.length) {
          setUploadBlocking(true, `Se incarca ${selectedFiles.length} imagini. Nu inchide pagina.`);
          uploadBlockMessage = "Se incarca imaginile postarii. Daca iesi acum, uploadul poate fi pierdut.";

          if (statusEl) statusEl.textContent = `Se incarca ${selectedFiles.length} imagini...`;
          if (uploadProgressEl) uploadProgressEl.textContent = `0 / ${selectedFiles.length} imagini finalizate`;

          imageUrls = await uploadCommunityImages(selectedFiles, postId, (i, pct) => {
            if (statusEl) statusEl.textContent = `Imagine ${i + 1} din ${selectedFiles.length}: ${pct}%`;

            if (uploadProgressEl) {
              uploadProgressEl.textContent =
                pct === 100
                  ? `Imagine ${i + 1} din ${selectedFiles.length} finalizata`
                  : `Imagine ${i + 1} din ${selectedFiles.length}: ${pct}%`;
            }

            setUploadBlocking(true, `Se incarca imaginea ${i + 1} din ${selectedFiles.length}: ${pct}%`);
          }, "post");
        }

        const payload = {
          title,
          description,
          category,
          tags,
          images: imageUrls,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: me.uid,
          createdByName: pub?.name || me.displayName || "User",
          createdByAvatar: pub?.avatarUrl || "",
          createdByIsPrinter: pub?.isPrinter === true,
          city: pub?.printerCity || pub?.city || "",
          likedBy: [],
          commentCount: 0
        };

        if (category === "vanzari") {
          payload.price = price;
          payload.location = location;
        }

        if (poll) {
          payload.poll = poll;
        }

        await setDoc(docRef, payload);

        pendingScrollToPostId = postId;
        pendingCloseComposerAfterPublish = true;
        currentPage = 1;

        if (titleEl) titleEl.value = "";
        if (descEl) descEl.value = "";
        if (tagsEl) tagsEl.value = "";
        if (priceEl) priceEl.value = "";
        if (locationEl) locationEl.value = "";
        if (categoryEl) categoryEl.value = "general";
        if ($("cpPollQuestion")) $("cpPollQuestion").value = "";

        document.querySelectorAll(".cp-poll-opt-input").forEach((el) => {
          el.value = "";
        });

        wrap?._clearSelectedFiles?.();
        updateSaleFields();

        const pollSectionEl = $("cpPollSection");
        const imgSectionEl = $("cpImageSection");
        const togglePollBtnEl = $("cpTogglePoll");
        const toggleImgBtnEl = $("cpToggleImages");

        if (pollSectionEl) pollSectionEl.style.display = "none";
        if (imgSectionEl) imgSectionEl.style.display = "none";
        if (togglePollBtnEl) togglePollBtnEl.textContent = "📊 Adauga sondaj";
        if (toggleImgBtnEl) toggleImgBtnEl.textContent = "📷 Adauga imagini";

        if (statusEl) statusEl.textContent = "✅ Postarea a fost publicata!";
        if (statusEl) {
          statusEl.textContent = "✅ Postarea a fost publicata!";
        }

      } catch (err) {
        console.error(err);
        if (statusEl) statusEl.textContent = err?.message || "Eroare la publicare.";
      } finally {
        setUploadBlocking(false);
        if (uploadProgressEl) uploadProgressEl.textContent = "";
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.get("action") === "post") {
    setTimeout(() => openComposer(), 200);
  }
}
// ─── community news ────────────────────────────────────────────────────────

function renderNewsTime(x) {
  const ms = tsMs(x);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function renderNewsCard(item) {
  return `
    <a class="cp-news-item" href="/stire.html?id=${esc(item.id || "")}">
      <div class="cp-news-top">
        <span class="cp-news-badge">📰 ${esc(item.sourceName || "Stire")}</span>
        <span class="cp-news-time">${esc(renderNewsTime(item.publishedAt))}</span>
      </div>
      <h4 class="cp-news-title">${esc(item.title || "Stire")}</h4>
      <p class="cp-news-excerpt">${esc(item.excerpt || item.content || "")}</p>
    </a>
  `;
}

function watchCommunityNews() {
  const box = $("cpNewsList");
  if (!box) return;

  const qNews = query(
    collection(db, "communityNews"),
    orderBy("publishedAt", "desc"),
    limit(5)
  );

  onSnapshot(qNews, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!items.length) {
      box.innerHTML = `<div class="cp-empty">Nu exista stiri inca.</div>`;
      return;
    }

    box.innerHTML = items.map(renderNewsCard).join("");
  }, (err) => {
    console.error("[community news] snapshot failed:", err);
    box.innerHTML = `<div class="cp-empty">Eroare la incarcarea stirilor.</div>`;
  });
}
// ─── watch community ────────────────────────────────────────────────────────

function watchCommunity(meRef) {
  const qPosts = query(
    collection(db, "comunitatePrintatori"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  onSnapshot(qPosts, async snap => {
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await renderFeed(posts, meRef.value);
    renderTopActive(posts);
    await renderShowcase(posts);
    updateHeroStats(posts);
  }, err => {
    console.error("[comunitate] snapshot failed:", err);
    const feed = $("cpFeed");
    if (feed) {
      feed.innerHTML = `<div class="cp-empty">Eroare la incarcare comunitate.</div>`;
    }
  });
}
function bindGlobalPollDelegation(meRef) {
  if (document.body.dataset.pollDelegationBound === "1") return;
  document.body.dataset.pollDelegationBound = "1";

  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-vote-option][data-vote-post]");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const me = meRef.value;
    if (!me) {
      window.location.href = "/auth.html";
      return;
    }

    if (btn.classList.contains("is-readonly")) return;

    const optIdx = parseInt(btn.getAttribute("data-vote-option"), 10);
    const postId = btn.getAttribute("data-vote-post");

    if (!postId || Number.isNaN(optIdx)) return;

    btn.disabled = true;
    try {
        shouldScrollFeedOnNextRender = false;
      await castVote(postId, optIdx, me);
    } catch (err) {
      console.error("Vote failed:", err);
      alert(err?.message || "Nu am putut salva votul.");
    } finally {
      btn.disabled = false;
    }
  });
}
// ─── live global chat ──────────────────────────────────────────────────────

let unsubscribeLiveChat = null;

function renderLiveChatMessage(msg, me) {
  const mine = !!(me && msg.createdBy === me.uid);

  return `
    <div class="cp-live-chat-item ${mine ? "mine" : ""}" data-live-msg-id="${esc(msg.id || "")}">
      <img
        class="cp-live-chat-avatar"
        src="${esc(msg.createdByAvatar || "/assets/avatar-placeholder.svg")}"
        alt=""
      />
      <div class="cp-live-chat-body">
        <div class="cp-live-chat-head">
          <div class="cp-live-chat-name">
            ${esc(msg.createdByName || "User")}${msg.createdByIsPrinter ? " 🖨️" : ""}
          </div>
          <div class="cp-live-chat-time">${timeAgo(tsMs(msg.createdAt))}</div>
        </div>
        <div class="cp-live-chat-text">${esc(msg.text || "")}</div>
      </div>
    </div>
  `;
}

function scrollLiveChatToBottom(force = false) {
  const box = $("cpLiveChatMsgs");
  if (!box) return;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (force || nearBottom) {
    box.scrollTop = box.scrollHeight;
  }
}

function initLiveChatUi(me) {
  const avatar = $("cpLiveChatAvatar");
  const formWrap = $("cpLiveChatFormWrap");
  const authNotice = $("cpLiveChatAuthNotice");

  if (avatar) {
    avatar.src = me?.photoURL || "/assets/avatar-placeholder.svg";
  }

  if (formWrap) formWrap.style.display = me ? "" : "none";
  if (authNotice) authNotice.style.display = me ? "none" : "";
}

function watchLiveCommunityChat(meRef) {
  if (unsubscribeLiveChat) {
    unsubscribeLiveChat();
    unsubscribeLiveChat = null;
  }

  const qLive = query(
    collection(db, "comunitateLiveChat"),
    orderBy("createdAt", "asc"),
    limit(120)
  );

  unsubscribeLiveChat = onSnapshot(qLive, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const box = $("cpLiveChatMsgs");
    if (!box) return;

    if (!msgs.length) {
      box.innerHTML = `<div class="cp-empty">Nu exista mesaje live inca. Fii primul care scrie.</div>`;
      return;
    }

    box.innerHTML = msgs.map(msg => renderLiveChatMessage(msg, meRef.value)).join("");
    scrollLiveChatToBottom(true);
  }, (err) => {
    console.error("[live chat] snapshot failed:", err);
    const box = $("cpLiveChatMsgs");
    if (box) {
      box.innerHTML = `<div class="cp-empty">Eroare la incarcarea chatului live.</div>`;
    }
  });
}

async function sendLiveCommunityMessage(me) {
  if (!me) {
    window.location.href = "/auth.html";
    return;
  }

  const input = $("cpLiveChatInput");
  const statusEl = $("cpLiveChatStatus");
  const sendBtn = $("cpLiveChatSend");

  const text = safeTrim(input?.value);
  if (!text) return;

  if (text.length > 500) {
    if (statusEl) statusEl.textContent = "Mesajul este prea lung.";
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Se trimite...";
  }
  if (statusEl) statusEl.textContent = "";

  try {
    invalidateUserCache(me.uid);
const pub = await getUserPublic(me.uid, { forceFresh: true });

await addDoc(collection(db, "comunitateLiveChat"), {
  text,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: me.uid,
  createdByName:
    safeTrim(pub?.name) ||
    safeTrim(me.displayName) ||
    safeTrim(me.email?.split("@")[0]) ||
    "User",
  createdByAvatar:
    safeTrim(pub?.avatarUrl) ||
    safeTrim(me.photoURL) ||
    "/assets/avatar-placeholder.svg",
  createdByIsPrinter: pub?.isPrinter === true,
  city: pub?.printerCity || pub?.city || ""
});

    if (input) input.value = "";
    if (statusEl) statusEl.textContent = "";
    scrollLiveChatToBottom(true);
  } catch (err) {
    console.error("send live chat failed:", err);
    if (statusEl) statusEl.textContent = err?.message || "Nu am putut trimite mesajul.";
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Trimite";
    }
  }
}

function bindLiveChatActions(meRef) {
  const sendBtn = $("cpLiveChatSend");
  const input = $("cpLiveChatInput");

  if (sendBtn && !sendBtn.dataset.boundLiveChat) {
    sendBtn.dataset.boundLiveChat = "1";

    sendBtn.addEventListener("click", async () => {
      await sendLiveCommunityMessage(meRef.value);
    });
  }

  if (input && !input.dataset.boundLiveChatEnter) {
    input.dataset.boundLiveChatEnter = "1";

    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await sendLiveCommunityMessage(meRef.value);
      }
    });
  }
}
// ─── main export ────────────────────────────────────────────────────────────

export function initComunitatePrintatoriPage() {
  document.body.classList.remove("auth-loading");
  ensureCommunityComposer();
  ensureLiveSections();
  watchCommunityNews();
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return; // 🔥 IMPORTANT (doar când vii din back cache)

if (!pendingScrollToPostId && !shouldScrollFeedOnNextRender) {
  const savedPage = parseInt(localStorage.getItem(PAGE_STORAGE_KEY), 10);
  if (!Number.isNaN(savedPage)) {
    currentPage = savedPage;
  }
}
});
  const meRef = { value: null };
    watchLiveCommunityChat(meRef);
  bindLiveChatActions(meRef);
  bindGlobalPollDelegation(meRef);
onAuthStateChanged(auth, async me => {
  meRef.value = me || null;
  initComposerUi(me);
  initLiveChatUi(me);

    const btnAuth = $("navAuthLink");
    if (btnAuth) btnAuth.style.display = me ? "none" : "";

    const btnTop = document.querySelector(".cp-hero-cta .btn.btn-orange");
    const btnFooter = document.querySelector(".cp-footer-cta .btn.btn-orange");

    if (btnTop && me) btnTop.textContent = "✍️ Posteaza in comunitate";
    if (btnFooter && me) btnFooter.textContent = "✍️ Posteaza acum";

    if (!window.__cere3d_community_watched__) {
      window.__cere3d_community_watched__ = true;
      const savedPage = parseInt(localStorage.getItem(PAGE_STORAGE_KEY), 10);
if (!Number.isNaN(savedPage)) {
  currentPage = savedPage;
}
      watchCommunity(meRef);
    } else if (allPostsCache.length) {
      await goToPage(currentPage);
    }
  });
}