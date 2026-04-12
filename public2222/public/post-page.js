import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import {
  startDmWith,
  getUserPublic,
  getPublicProfileUrl,
  renderNameWithPrinterBadge
} from "./dm-utils.js";

// ── helpers ────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
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
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
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
  const m = {
    probleme: "🛠️",
    sfaturi: "🧠",
    vanzari: "🛒",
    showcase: "🖼️"
  };
  return m[normalizeCategory(cat)] || "💬";
}

function categoryLabel(cat) {
  const m = {
    probleme: "Probleme",
    sfaturi: "Sfaturi",
    vanzari: "Vanzari",
    showcase: "Showcase"
  };
  return m[normalizeCategory(cat)] || "General";
}

function categoryClass(cat) {
  return `cp-type cp-type-${normalizeCategory(cat)}`;
}

function safeTrim(v) {
  return (v || "").toString().trim();
}

// ── lightbox ───────────────────────────────────────────────────────────────

let lbImages = [];
let lbIdx = 0;

function openLightbox(images, idx = 0) {
  lbImages = images;
  lbIdx = idx;

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
    lb.querySelector(".cp-lb-prev").addEventListener("click", () => moveLb(-1));
    lb.querySelector(".cp-lb-next").addEventListener("click", () => moveLb(1));

    document.addEventListener("keydown", e => {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") moveLb(-1);
      if (e.key === "ArrowRight") moveLb(1);
    });
  }

  lb.classList.add("is-open");
  document.body.style.overflow = "hidden";
  updateLbSlide();
}

function closeLightbox() {
  const lb = $("cpLightbox");
  if (lb) lb.classList.remove("is-open");
  document.body.style.overflow = "";
}

function moveLb(dir) {
  lbIdx = (lbIdx + dir + lbImages.length) % lbImages.length;
  updateLbSlide();
}

function updateLbSlide() {
  const lb = $("cpLightbox");
  if (!lb) return;

  const img = lb.querySelector(".cp-lb-img");
  const counter = lb.querySelector(".cp-lb-counter");
  const prev = lb.querySelector(".cp-lb-prev");
  const next = lb.querySelector(".cp-lb-next");

  if (img) {
    img.src = lbImages[lbIdx];
    img.alt = `Imagine ${lbIdx + 1} din ${lbImages.length}`;
  }
  if (counter) counter.textContent = `${lbIdx + 1} / ${lbImages.length}`;
  if (prev) prev.style.display = lbImages.length > 1 ? "" : "none";
  if (next) next.style.display = lbImages.length > 1 ? "" : "none";
}

// ── image upload ───────────────────────────────────────────────────────────

async function uploadImages(files, postId, commentId, onProgress) {
  const urls = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = (file.name || `img_${i}`).replace(/[^\w.\-]+/g, "_");
    const path = `comunitate/${postId}/comments/${commentId || Date.now()}_${i}_${safeName}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    await new Promise((res, rej) => {
      task.on(
        "state_changed",
        snap => {
          if (onProgress) {
            onProgress(i, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        },
        rej,
        async () => {
          urls.push(await getDownloadURL(task.snapshot.ref));
          res();
        }
      );
    });
  }

  return urls;
}

// ── render helpers ─────────────────────────────────────────────────────────

function renderImages(images) {
  const arr = (images || []).filter(u => u && u !== "placeholder");
  if (!arr.length) return "";

  return `
    <div class="cp-image-row" data-images='${JSON.stringify(arr).replace(/'/g, "&#039;")}'>
      ${arr.map((url, idx) => `
        <div class="cp-image-real" data-img-idx="${idx}"
          style="background-image:url('${esc(url)}')"></div>
      `).join("")}
    </div>
  `;
}

function renderPoll(poll, postId, me) {
  if (!poll || !Array.isArray(poll.options)) return "";

  const totalVotes = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
  const votesObj = (poll.votes && typeof poll.votes === "object") ? poll.votes : {};
  const hasMyVote = !!(me && Object.prototype.hasOwnProperty.call(votesObj, me.uid));
  const myVote = hasMyVote ? votesObj[me.uid] : null;
  const closed = poll.closed === true;

  return `
    <div class="cp-poll" id="cpPollBlock" data-post-id="${esc(postId)}">
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

function renderComment(c) {
  const imgs = (Array.isArray(c.images) ? c.images : []).filter(u => u && u !== "placeholder");
  return `
    <div class="cp-comment" data-comment-id="${esc(c.id || "")}">
      <div class="cp-comment-head">
        <img class="cp-comment-av" src="${esc(c.createdByAvatar || "/assets/avatar-placeholder.svg")}" alt="" />
        <div>
          <div class="cp-comment-name">${esc(c.createdByName || "User")}${c.createdByIsPrinter ? " 🖨️" : ""}</div>
          <div class="cp-comment-time">${timeAgo(tsMs(c.createdAt))}</div>
        </div>
      </div>
      ${c.text ? `<div class="cp-comment-body">${esc(c.text)}</div>` : ""}
      ${imgs.length ? `
        <div class="cp-comment-images" data-images='${JSON.stringify(imgs).replace(/'/g, "&#039;")}'>
          ${imgs.map((url, i) => `<img class="cp-comment-img" src="${esc(url)}" alt="" data-img-idx="${i}" />`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// ── pending comment files ──────────────────────────────────────────────────

let pendingFiles = [];

function bindCommentFileInput() {
  const fileInput = $("cpCommentFile");
  const preview = $("cpCommentImgPreview");
  if (!fileInput) return;

  if (fileInput.dataset.bound) return;
  fileInput.dataset.bound = "1";

  fileInput.addEventListener("change", () => {
    const newFiles = Array.from(fileInput.files || []).slice(0, 4);
    pendingFiles = [...pendingFiles, ...newFiles].slice(0, 4);
    fileInput.value = "";
    renderPendingPreviews(preview);
  });
}

function renderPendingPreviews(preview) {
  if (!preview) return;

  preview.innerHTML = pendingFiles.map((f, i) => `
    <div class="cp-img-thumb-wrap">
      <img class="cp-img-thumb" src="${URL.createObjectURL(f)}" alt="" />
      <button class="cp-img-thumb-remove" type="button" data-rm="${i}">✕</button>
    </div>
  `).join("");

  preview.querySelectorAll("[data-rm]").forEach(btn => {
    btn.addEventListener("click", () => {
      pendingFiles.splice(parseInt(btn.getAttribute("data-rm"), 10), 1);
      renderPendingPreviews(preview);
    });
  });
}

// ── main post render ───────────────────────────────────────────────────────

function renderPost(post, me, prof) {
  const cat = normalizeCategory(post.category);
  const authorUid = post.createdBy || "";
  const authorName = post.createdByName || prof?.name || "User";
  const authorAvatar = post.createdByAvatar || prof?.avatarUrl || "/assets/avatar-placeholder.svg";
  const authorIsPrinter = post.createdByIsPrinter === true || prof?.isPrinter === true;
  const authorProfileUrl = authorUid
    ? getPublicProfileUrl({
        uid: authorUid,
        isPrinter: authorIsPrinter,
        printerVisible: prof?.printerVisible !== false
      })
    : "#";

  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  const likesCount = likedBy.length;
  const isLiked = !!(me && likedBy.includes(me.uid));
  const mine = !!(me && authorUid === me.uid);

  const realImages = (Array.isArray(post.images) ? post.images : []).filter(u => u && u !== "placeholder");

  document.title = `${post.title || "Postare"} | Comunitate Cere3D`;

  return `
    <div class="cp-post-single">
      <div class="${categoryClass(cat)}">${categoryEmoji(cat)} ${categoryLabel(cat)}</div>
      <h1 class="cp-post-title">${esc(post.title || "Postare")}</h1>

      <div class="cp-author">
        <a href="${esc(authorProfileUrl)}" style="display:flex;align-items:center;gap:12px;text-decoration:none;">
          <img class="cp-author-av" src="${esc(authorAvatar)}" alt="" />
          <div>
            <div class="cp-author-name">${renderNameWithPrinterBadge(authorName, authorIsPrinter, true)}</div>
            <div class="cp-author-meta">
              ${esc(post.city || prof?.printerCity || prof?.city || "Romania")} ·
              ${timeAgo(tsMs(post.createdAt))} ·
              ${mine ? "postarea ta" : "membru comunitate"}
            </div>
          </div>
        </a>
      </div>

      <p class="cp-post-desc">${esc(post.description || "")}</p>

      ${cat === "vanzari" ? (() => {
        const price = safeTrim(post.price);
        const loc = safeTrim(post.location);
        return (price || loc) ? `
          <div class="cp-price-line">
            ${price ? `Pret: ${esc(price)}` : ""}
            ${price && loc ? " · " : ""}
            ${loc ? `Locatie: ${esc(loc)}` : ""}
          </div>
        ` : "";
      })() : ""}

      ${Array.isArray(post.tags) && post.tags.length ? `
        <div class="cp-post-tags">${post.tags.map(t => `<span class="cp-tag">${esc(t)}</span>`).join("")}</div>
      ` : ""}

      ${post.poll ? renderPoll(post.poll, post.id, me) : ""}
      ${realImages.length ? renderImages(realImages) : ""}

      <div class="cp-post-actions">
        <button class="cp-like-btn ${isLiked ? "is-liked" : ""}" id="cpLikeBtn" type="button">
          ${isLiked ? "❤️" : "👍"} <span id="cpLikeCount">${likesCount}</span>
        </button>
        <span style="color:var(--cp-muted);font-size:13px;font-weight:800;">
          💬 <span id="cpCommentCount">${post.commentCount || 0}</span> comentarii
        </span>
        ${cat === "vanzari" && authorUid && !mine ? `
          <button class="btn btn-orange" type="button" id="cpDmBtn">Trimite mesaj</button>
        ` : ""}
      </div>

      <div class="cp-comments-section">
        <h2>Comentarii</h2>
        <div id="cpCommentsList">
          <div class="cp-empty">Se incarca comentariile...</div>
        </div>

        ${me ? `
          <div class="cp-comment-form">
            <img class="cp-comment-av" src="${esc(me.photoURL || "/assets/avatar-placeholder.svg")}" alt="" />
            <div class="cp-comment-input-wrap">
              <textarea id="cpCommentInput" class="cp-comment-input" maxlength="2000"
                placeholder="Scrie un comentariu... (Shift+Enter pentru linie noua)"></textarea>
              <div class="cp-comment-input-actions">
                <label class="cp-attach-btn" title="Adauga imagini la comentariu" for="cpCommentFile">
                  📎
                  <input id="cpCommentFile" type="file" accept="image/*" multiple style="display:none;" />
                </label>
                <button class="btn btn-orange" type="button" id="cpSendComment">Trimite comentariul</button>
              </div>
              <div id="cpCommentImgPreview" class="cp-comment-img-preview"></div>
              <div id="cpCommentStatus" class="small-muted"></div>
            </div>
          </div>
        ` : `
          <div class="cp-comment-form" style="padding-top:18px;border-top:1px solid var(--cp-line);">
            <div class="cp-empty">
              <a href="/auth.html?return=${encodeURIComponent(location.href)}">Autentifica-te</a> pentru a comenta.
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

// ── bind actions ───────────────────────────────────────────────────────────

function bindPostActions(postId, me, postData) {
  const likeBtn = $("cpLikeBtn");
  if (likeBtn && !likeBtn.dataset.bound) {
    likeBtn.dataset.bound = "1";
    likeBtn.addEventListener("click", async () => {
      if (!me) {
        window.location.href = "/auth.html";
        return;
      }

      likeBtn.disabled = true;
      try {
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
      } catch (err) {
        console.error(err);
      } finally {
        likeBtn.disabled = false;
      }
    });
  }

  const dmBtn = $("cpDmBtn");
  if (dmBtn && !dmBtn.dataset.bound) {
    dmBtn.dataset.bound = "1";
    dmBtn.addEventListener("click", async () => {
      try {
        await startDmWith(postData.createdBy);
      } catch (err) {
        alert(err?.message || "Eroare la mesaj.");
      }
    });
  }

  document.querySelectorAll(".cp-image-row").forEach(row => {
    if (row.dataset.boundLb) return;
    row.dataset.boundLb = "1";

    const imgs = JSON.parse(row.dataset.images || "[]");
    row.querySelectorAll(".cp-image-real").forEach(cell => {
      cell.addEventListener("click", () => {
        openLightbox(imgs, parseInt(cell.dataset.imgIdx || "0", 10));
      });
    });
  });

  function bindCommentImageLightboxes() {
    document.querySelectorAll(".cp-comment-images").forEach(wrap => {
      if (wrap.dataset.boundLb) return;
      wrap.dataset.boundLb = "1";

      const imgs = JSON.parse(wrap.dataset.images || "[]");
      wrap.querySelectorAll(".cp-comment-img").forEach(img => {
        img.addEventListener("click", () => {
          openLightbox(imgs, parseInt(img.dataset.imgIdx || "0", 10));
        });
      });
    });
  }

  bindCommentImageLightboxes();
  window.__bindCommentLightboxes = bindCommentImageLightboxes;

 

  const sendBtn = $("cpSendComment");
  if (sendBtn && !sendBtn.dataset.bound) {
    sendBtn.dataset.bound = "1";

    const textInput = $("cpCommentInput");
    if (textInput && !textInput.dataset.boundEnter) {
      textInput.dataset.boundEnter = "1";
      textInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    bindCommentFileInput();

    sendBtn.addEventListener("click", async () => {
      const textInputLocal = $("cpCommentInput");
      const text = safeTrim(textInputLocal?.value);
      const statusEl = $("cpCommentStatus");

      if (!text && !pendingFiles.length) return;

      sendBtn.disabled = true;
      sendBtn.textContent = "Se trimite...";
      if (statusEl) statusEl.textContent = "";

      try {
        const pub = await getUserPublic(me.uid);

        let imageUrls = [];
        if (pendingFiles.length) {
          if (statusEl) statusEl.textContent = "Se incarca imaginile...";
          const tempId = `${me.uid}_${Date.now()}`;
          imageUrls = await uploadImages(pendingFiles, postId, tempId, (i, pct) => {
            if (statusEl) statusEl.textContent = `Imagine ${i + 1}: ${pct}%`;
          });
          if (statusEl) statusEl.textContent = "";
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

        if (textInputLocal) textInputLocal.value = "";
        pendingFiles = [];
        renderPendingPreviews($("cpCommentImgPreview"));
      } catch (err) {
        console.error(err);
        if (statusEl) statusEl.textContent = err?.message || "Eroare la trimitere.";
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Trimite comentariul";
      }
    });
  }
}

// ── live comments listener ─────────────────────────────────────────────────

function watchComments(postId) {
  const q = query(
    collection(db, "comunitatePrintatori", postId, "comments"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  return onSnapshot(q, snap => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const listEl = $("cpCommentsList");
    const countEl = $("cpCommentCount");

    if (countEl) countEl.textContent = comments.length;

    if (listEl) {
      if (!comments.length) {
        listEl.innerHTML = `<div class="cp-empty">Nu exista comentarii inca. Fii primul!</div>`;
      } else {
        listEl.innerHTML = comments.map(c => renderComment(c)).join("");
      }
    }

    if (window.__bindCommentLightboxes) {
      window.__bindCommentLightboxes();
    }
  });
}
function bindPostPollActions(postId, meRef) {
  const pollBlock = $("cpPollBlock");
  if (!pollBlock) return;

  pollBlock.querySelectorAll("[data-vote-option][data-vote-post]").forEach(btn => {
    if (btn.dataset.boundVote === "1") return;
    btn.dataset.boundVote = "1";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const me = meRef.value;
      if (!me) {
        window.location.href = "/auth.html";
        return;
      }

      if (btn.classList.contains("is-readonly")) return;

      const optIdx = parseInt(btn.getAttribute("data-vote-option"), 10);
      const votePostId = btn.getAttribute("data-vote-post");

      if (!votePostId || Number.isNaN(optIdx)) return;

      btn.disabled = true;
      try {
        const ref = doc(db, "comunitatePrintatori", votePostId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data() || {};
        const poll = data.poll;
        if (!poll || !Array.isArray(poll.options)) return;

        const votes = (poll.votes && typeof poll.votes === "object") ? poll.votes : {};
        const prevVote = Object.prototype.hasOwnProperty.call(votes, me.uid) ? votes[me.uid] : null;

        const nextOptions = poll.options.map((o, i) => {
          let nextVotes = o.votes || 0;

          if (prevVote === i) {
            nextVotes = Math.max(0, nextVotes - 1);
          }

          if (prevVote !== optIdx && i === optIdx) {
            nextVotes += 1;
          }

          return {
            ...o,
            votes: nextVotes
          };
        });

        const nextVotesMap = { ...votes };

        if (prevVote === optIdx) {
          delete nextVotesMap[me.uid];
        } else {
          nextVotesMap[me.uid] = optIdx;
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
      } catch (err) {
        console.error("Poll vote failed:", err);
        alert(err?.message || "Nu am putut salva votul.");
      } finally {
        btn.disabled = false;
      }
    });
  });
}
// ── main ───────────────────────────────────────────────────────────────────

export async function initPostPage() {
  document.body.classList.remove("auth-loading");

  const params = new URLSearchParams(location.search);
  const postId = params.get("id");
  const container = $("cpPostContainer");

  if (!postId) {
    if (container) container.innerHTML = `<div class="cp-empty">Postarea nu a fost gasita.</div>`;
    return;
  }

  let currentMe = null;
  let postData = null;
  let commentsUnsubscribe = null;
  let prof = {};
  const meRef = { value: null };

  try {
    const snap = await getDoc(doc(db, "comunitatePrintatori", postId));
    if (!snap.exists()) {
      if (container) container.innerHTML = `<div class="cp-empty">Postarea nu exista sau a fost stearsa.</div>`;
      return;
    }

    postData = { id: snap.id, ...snap.data() };

    if (postData.createdBy) {
      try {
        prof = await getUserPublic(postData.createdBy);
      } catch {}
    }
  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = `<div class="cp-empty">Eroare la incarcarea postarii.</div>`;
    return;
  }

onAuthStateChanged(auth, async me => {
  currentMe = me || null;
  meRef.value = currentMe;

  if (container) {
    container.innerHTML = renderPost(postData, currentMe, prof);
  }

  bindPostActions(postId, currentMe, postData);
  bindPostPollActions(postId, meRef);

  if (commentsUnsubscribe) commentsUnsubscribe();
  commentsUnsubscribe = watchComments(postId);

  setTimeout(() => {
    if (window.__bindCommentLightboxes) window.__bindCommentLightboxes();
  }, 100);
});

  onSnapshot(doc(db, "comunitatePrintatori", postId), snap => {
    if (!snap.exists()) return;
    postData = { id: snap.id, ...snap.data() };

    const likedBy = Array.isArray(postData.likedBy) ? postData.likedBy : [];
    const isLiked = !!(currentMe && likedBy.includes(currentMe.uid));

    const likeBtn = $("cpLikeBtn");
    if (likeBtn) {
      likeBtn.className = `cp-like-btn${isLiked ? " is-liked" : ""}`;
      likeBtn.innerHTML = `${isLiked ? "❤️" : "👍"} <span id="cpLikeCount">${likedBy.length}</span>`;
    }

    const oldPollBlock = $("cpPollBlock");
    if (oldPollBlock && postData.poll) {
      oldPollBlock.outerHTML = renderPoll(postData.poll, postId, currentMe);
      bindPostActions(postId, currentMe, postData);
      bindPostPollActions(postId, meRef);
    }
  });
}