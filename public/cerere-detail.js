// cerere-detail.js
import { db, auth } from "./firebase-init.js";
import {
  startDmWith,
  getUserPublic as getUserPublicShared,
  getPublicProfileUrl,
  renderNameWithPrinterBadge
} from "./dm-utils.js";
import { initPostChat } from "./cerere-chat.js";
import { buildCerereOwnerBanner } from "./activity-utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  collection,
  onSnapshot,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ========= meaningful helpers (hide cards for old requests) ========= */
function normText(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function isDefaultLike(x) {
  const s = normText(x);
  if (!s) return true;
  if (s === "-" || s === "—" || s === "--") return true;
  if (s === "nu stiu" || s === "nu știu" || s === "nustiu") return true;
  if (s === "nu") return true;
  if (s === "normal" || s === "normala" || s === "interior") return true;
  if (s === "1 bucata" || s === "1 buc") return true;
  return false;
}

function hasAnyDimsMeaningful(dim) {
  if (!dim || typeof dim !== "object") return false;

  const nums = [dim.length, dim.width, dim.height].map((v) => Number(v));
  if (nums.some((n) => Number.isFinite(n) && n > 0)) return true;

  if (!isDefaultLike(dim.tolerance)) return true;
  if (!isDefaultLike(dim.screws)) return true;
  if (!isDefaultLike(dim.qty)) return true;

  return false;
}

function hasAnyCondsMeaningful(c) {
  if (!c || typeof c !== "object") return false;
  const keys = ["whereUse", "strength", "temperature", "water", "uv"];
  return keys.some((k) => !isDefaultLike(c[k]));
}

function hasMaterialMeaningful(r) {
  return !isDefaultLike(r?.material);
}

function hasRefUrlMeaningful(r) {
  const s = (r?.referenceUrl || "").toString().trim();
  return s.length > 0;
}

/* ========= small helpers ========= */
function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tsMillisSafe(x) {
  try {
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  } catch {
    return 0;
  }
}

function timeAgoFromMs(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "acum 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ore`;
  const d = Math.floor(h / 24);
  if (d < 30) return `acum ${d} zile`;
  const dt = new Date(ms);
  return dt.toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

async function getUserPublic(uid) {
  if (!uid) {
    return {
      uid: "",
      name: "User",
      avatarUrl: "",
      isPrinter: false,
      printerVisible: false
    };
  }

  try {
    const pub = await getUserPublicShared(uid);
    return {
      uid,
      name: pub.name || "User",
      avatarUrl: pub.avatarUrl || "",
      isPrinter: pub.isPrinter === true,
      printerVisible: pub.printerVisible !== false
    };
  } catch {}

  return {
    uid,
    name: "User",
    avatarUrl: "",
    isPrinter: false,
    printerVisible: false
  };
}

/* ========= image loading ========= */
function safeImg(
  imgEl,
  url,
  { placeholder = "/assets/img-ph.svg", timeoutMs = 12000, retry = true } = {}
) {
  if (!imgEl) return;

  let done = false;
  let timer = null;

  const finishFail = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    imgEl.src = placeholder;
    imgEl.classList.add("img-failed");
    imgEl.dataset.loaded = "1";
  };

  const finishOk = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    imgEl.classList.remove("img-failed");
    imgEl.dataset.loaded = "1";
  };

  timer = setTimeout(() => {
    finishFail();
    if (retry && url) {
      done = false;
      imgEl.classList.remove("img-failed");
      imgEl.dataset.loaded = "0";
      const u = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
      timer = setTimeout(finishFail, timeoutMs);
      imgEl.src = u;
    }
  }, timeoutMs);

  imgEl.onload = finishOk;
  imgEl.onerror = finishFail;

  imgEl.dataset.loaded = "0";
  imgEl.src = url || placeholder;
}

function storagePathFromFirebaseUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/o/");
    if (parts.length < 2) return "";
    const encodedPath = parts[1];
    return decodeURIComponent(encodedPath);
  } catch {
    return "";
  }
}

function forceDownload(url, filename) {
  if ((url || "").includes("/dl?path=")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "image";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const path = storagePathFromFirebaseUrl(url);
  if (!path) {
    window.open(url, "_blank", "noopener");
    return;
  }

  const dlUrl = `/dl?path=${encodeURIComponent(path)}&name=${encodeURIComponent(filename || "image")}`;
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename || "image";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ensureFullscreenModal() {
  let root = document.getElementById("fsModal");
  if (root) return root;

  root = document.createElement("div");
  root.id = "fsModal";
  root.className = "fs-modal";
  root.innerHTML = `
    <div class="fs-backdrop" data-close="1"></div>
    <div class="fs-panel" role="dialog" aria-modal="true">
      <div class="fs-topbar">
        <div class="fs-title" id="fsTitle">Imagine</div>
        <div class="fs-buttons">
          <button class="fs-btn" id="fsDownload" type="button">Download</button>
          <a class="fs-btn" id="fsOpenTab" href="#" target="_blank" rel="noopener">Open</a>
          <button class="fs-btn" id="fsClose" type="button">Close</button>
        </div>
      </div>
      <div class="fs-stage">
        <img id="fsImg" alt="Imagine fullscreen" />
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const close = () => root.classList.remove("open");

  root.addEventListener("click", (e) => {
    if (e.target?.dataset?.close || e.target?.id === "fsClose" || e.target?.id === "fsImg") {
      close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return root;
}

function openImageFullscreen(url, filename = "image") {
  const modal = ensureFullscreenModal();
  const img = modal.querySelector("#fsImg");
  const title = modal.querySelector("#fsTitle");
  const dlBtn = modal.querySelector("#fsDownload");
  const openTab = modal.querySelector("#fsOpenTab");

  title.textContent = filename;
  openTab.href = url;

  safeImg(img, url, {
    placeholder: "/assets/img-ph.svg",
    timeoutMs: 15000,
    retry: true
  });

  dlBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    forceDownload(url, filename);
  };

  modal.classList.add("open");
}

function guessFilenameFromUrl(url) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname || "");
    const base = path.split("/").pop() || "image";
    return base.includes(".") ? base : "image";
  } catch {
    return "image";
  }
}

/* ========= flags row ========= */
function renderFlagsRow(r) {
  const wrap = document.getElementById("d_flags");
  if (!wrap) return;

  const flags = r?.flags || {};
  const urgent = !!flags.urgent;
  const highPay = !!flags.highPay;
  const solved = !!(r?.solved || r?.status === "solved");

  const items = [];
  if (urgent) items.push(`<span class="flag-badge flag-urgent"><span class="dot"></span>Urgent</span>`);
  if (highPay) items.push(`<span class="flag-badge flag-highpay"><span class="dot"></span>Platesc bine</span>`);
  if (solved) items.push(`<span class="flag-badge flag-solved"><span class="dot"></span>Rezolvat</span>`);

  wrap.innerHTML = items.length ? items.join("") : "";
}

/* ========= owner flags controls ========= */
function initOwnerFlags({ cerereRef, cerereData }) {
  const ownerControls = document.getElementById("ownerControls");
  const ownerStatus = document.getElementById("ownerStatus");
  const flagUrgent = document.getElementById("flagUrgent");
  const flagHighPay = document.getElementById("flagHighPay");
  const flagSolved = document.getElementById("flagSolved");
  const solvedHint = document.getElementById("solvedHint");

  if (!ownerControls || !flagUrgent || !flagHighPay || !flagSolved) return;

  const updateHint = () => {
    if (!solvedHint) return;
    const solved = !!flagSolved.checked;
    const hasChosen = !!cerereData?.selectedMakerUid;

    flagSolved.disabled = false;
    flagSolved.title = "";

    if (solved) {
      solvedHint.style.display = "block";

      if (hasChosen) {
        solvedHint.innerHTML = `Ai ales deja un printator. Daca vrei sa alegi altul, poti selecta direct din lista.`;
      } else {
        solvedHint.innerHTML = `Poti inchide cererea si fara sa alegi un printator. Daca exista oferte, recomandarea este sa alegi una.`;
      }
    } else {
      solvedHint.style.display = "none";
      solvedHint.textContent = "";
    }
  };

  window.__cerereUpdateSolvedHint = updateHint;

  onAuthStateChanged(auth, (me) => {
    const isOwner = !!me && cerereData?.createdBy && me.uid === cerereData.createdBy;
    ownerControls.style.display = isOwner ? "" : "none";
    if (!isOwner) return;

    flagUrgent.checked = !!cerereData?.flags?.urgent;
    flagHighPay.checked = !!cerereData?.flags?.highPay;
    flagSolved.checked = !!(cerereData?.solved || cerereData?.status === "solved");

    updateHint();

    const saveFlags = async () => {
      try {
        if (ownerStatus) ownerStatus.textContent = "Se salveaza...";

        const urgent = !!flagUrgent.checked;
        const highPay = !!flagHighPay.checked;
        const solved = !!flagSolved.checked;
        const hasChosen = !!cerereData?.selectedMakerUid;

        if (solved && !hasChosen) {
          const ok = confirm(
            "Esti sigur ca inchizi cererea fara sa alegi un printator din oferte?\n\nDaca vrei, poti lasa cererea deschisa si sa alegi ulterior un printator."
          );

          if (!ok) {
            flagSolved.checked = false;
            updateHint();
            if (ownerStatus) ownerStatus.textContent = "Cererea a ramas deschisa.";
            return;
          }
        }

        const payload = {
          flags: { urgent, highPay },
          solved,
          status: solved ? "solved" : "open",
          solvedAt: solved ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
          activityStatus: solved
            ? (cerereData?.selectedMakerUid ? "printator_ales" : "rezolvata")
            : (cerereData?.ownerHasReplied ? "in_discutie" : "open")
        };

        if (!solved) {
          payload.selectedMakerUid = null;
          payload.selectedMakerName = null;
          payload.selectedOfferPrice = null;
          payload.selectedOfferNote = null;
          payload.selectedAt = null;
          payload.ownerUnreadOffers = 0;
          payload.ownerUnreadChat = 0;
        }

        await updateDoc(cerereRef, payload);

        cerereData.flags = { urgent, highPay };
        cerereData.solved = solved;
        cerereData.status = solved ? "solved" : "open";

        if (!solved) {
          cerereData.selectedMakerUid = null;
          cerereData.selectedMakerName = null;
          cerereData.selectedOfferPrice = null;
          cerereData.selectedOfferNote = null;
          cerereData.selectedAt = null;
        }

        renderFlagsRow(cerereData);
        updateHint();

        if (ownerStatus) ownerStatus.textContent = "Salvat.";
      } catch (e) {
        console.error(e);
        if (ownerStatus) ownerStatus.textContent = "Eroare: " + (e?.message || e);
      }
    };

    flagUrgent.onchange = saveFlags;
    flagHighPay.onchange = saveFlags;
    flagSolved.onchange = saveFlags;
  });
}

/* ========= oferte system ========= */
function initOferteSystem({ cerereId, cerereRef, cerereData }) {
  const printerOfferCard = document.getElementById("printerOfferCard");
  const ownerOffersCard = document.getElementById("ownerOffersCard");
  const offersList = document.getElementById("offersList");
  const publicOffersCountPill = document.getElementById("publicOffersCountPill");
  const publicOffersInfoText = document.getElementById("publicOffersInfoText");

  if (!printerOfferCard && !ownerOffersCard && !offersList) {
    console.warn("[oferte] lipsesc elementele din HTML (printerOfferCard/ownerOffersCard/offersList)");
    return;
  }

  const offerPrice = document.getElementById("offerPrice");
  const offerNote = document.getElementById("offerNote");
  const btnSaveOffer = document.getElementById("btnSaveOffer");
  const offerStatus = document.getElementById("offerStatus");

  const ownerToolsOld = document.getElementById("ownerTools");
  if (ownerToolsOld) ownerToolsOld.style.display = "none";

  const chosenBox = document.getElementById("chosenBox");
  const chosenName = document.getElementById("chosenName");
  const chosenMeta = document.getElementById("chosenMeta");
  const btnGoDmChosen = document.getElementById("btnGoDmChosen");

  function updatePublicOffersInfo(count) {
    const safeCount = Math.max(0, Number(count || 0) || 0);
    const label = safeCount === 1 ? "oferta" : "oferte";

    if (publicOffersCountPill) {
      publicOffersCountPill.textContent = String(safeCount);
    }

    if (publicOffersInfoText) {
      publicOffersInfoText.textContent = `Clientul a primit: ${safeCount} ${label}`;
    }
  }

  function renderPublicCountFromDoc() {
    updatePublicOffersInfo(Number(cerereData?.offersCount || 0));
  }

  function setOfferMsg(txt, ok = false) {
    if (!offerStatus) return;
    offerStatus.textContent = txt || "";
    offerStatus.style.color = ok ? "#00ff78" : "";
    offerStatus.style.fontWeight = ok ? "900" : "";
  }

  renderPublicCountFromDoc();

  async function showChosen(uid, name, price) {
    if (!chosenBox) return;

    if (chosenName) {
      const chosenProfile = await getUserPublic(uid);
      chosenName.innerHTML = `
        <a href="${getPublicProfileUrl(chosenProfile)}" style="text-decoration:underline;color:#111;font-weight:950;">
          ${renderNameWithPrinterBadge(name, chosenProfile.isPrinter === true, true)}
        </a>
      `;
    }

    if (chosenMeta) {
      const p = Number(price || 0);
      chosenMeta.textContent = p > 0 ? `Pret ales: ${p} lei` : "";
    }

    if (btnGoDmChosen) {
      btnGoDmChosen.onclick = async () => {
        try {
          await startDmWith(uid);
        } catch (e) {
          alert("Eroare DM: " + (e?.message || e));
        }
      };
    }

    chosenBox.style.display = "";
  }

  const renderOffersForOwner = async (items) => {
    const countPill = document.getElementById("offersCountPill");
    if (countPill) {
      countPill.style.display = items.length ? "" : "none";
      countPill.textContent = String(items.length);
    }

    if (!offersList) return;

    const selectedUid = (cerereData?.selectedMakerUid || "").toString();
    const isSolved = !!(cerereData?.solved || cerereData?.status === "solved");

    if (!items.length) {
      offersList.innerHTML = `<div class="small-muted">Momentan nu ai oferte.</div>`;
      return;
    }

    const enriched = await Promise.all(items.map(async (o) => {
      const uid = o.printerUid || "";
      if (!uid) {
        return {
          ...o,
          __profileUrl: "#",
          __nameHtml: escapeHtml(o.printerName || "User")
        };
      }

      const pub = await getUserPublic(uid);
      return {
        ...o,
        __profileUrl: getPublicProfileUrl(pub),
        __nameHtml: renderNameWithPrinterBadge(
          o.printerName || pub.name || "User",
          pub.isPrinter === true,
          true
        )
      };
    }));

    offersList.innerHTML = enriched.map((o) => {
      const price = Number(o.price || 0);
      const note = (o.note || "").toString().trim();
      const name = o.printerName || "User";
      const uid = o.printerUid || "";
      const isSelected = selectedUid && uid && uid === selectedUid;

      return `
        <div class="offer-item ${isSelected ? "offer-selected" : ""}">
          <div class="offer-top">
            <div style="min-width:0;">
              <div class="offer-name">
                <a href="${escapeHtml(o.__profileUrl || `/profil.html?uid=${encodeURIComponent(uid)}`)}" style="text-decoration:underline;color:#111;">
                  ${o.__nameHtml || escapeHtml(name)}
                </a>
                ${isSelected ? `<span class="mat-badge mat-pla" style="margin-left:8px;">ALES</span>` : ``}
                ${isSolved && !isSelected && selectedUid ? `<span class="small-muted" style="margin-left:8px;">(cerere inchisa)</span>` : ``}
              </div>
              <div class="small-muted" style="margin-top:4px;">
                Pret: <span class="offer-price">${escapeHtml(String(price))} lei</span>
              </div>
            </div>

            <div class="offer-actions">
              <button class="btn btn-blue btn-soft" data-dm="${escapeHtml(uid)}" type="button">Mesaj</button>

              <button class="btn btn-orange"
                data-choose="${escapeHtml(uid)}"
                data-name="${escapeHtml(name)}"
                data-price="${escapeHtml(String(price))}"
                data-note="${escapeHtml(note)}"
                type="button">
                ${isSelected ? "Selectat" : "Alege printator"}
              </button>
            </div>
          </div>

          ${note ? `<div class="small-muted" style="margin-top:10px;">${escapeHtml(note)}</div>` : ``}
        </div>
      `;
    }).join("");

    offersList.querySelectorAll("button[data-dm]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.getAttribute("data-dm");
        if (!uid) return;

        try {
          await startDmWith(uid);

          if (!(cerereData?.solved || cerereData?.status === "solved")) {
            await updateDoc(cerereRef, {
              ownerHasReplied: true,
              ownerUnreadOffers: 0,
              updatedAt: serverTimestamp(),
              activityStatus: "in_discutie"
            });

            cerereData.activityStatus = "in_discutie";
            cerereData.ownerHasReplied = true;
            cerereData.ownerUnreadOffers = 0;
          }
        } catch (err) {
          console.error("[DM] startDmWith FAILED:", err);
          alert("Eroare DM: " + (err?.message || err));
        }
      });
    });

    offersList.querySelectorAll("button[data-choose]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.getAttribute("data-choose") || "";
        const name = btn.getAttribute("data-name") || "User";
        const price = Number(btn.getAttribute("data-price") || "0") || 0;
        const note = btn.getAttribute("data-note") || "";

        if (!uid) return;

        const wasSolved = !!(cerereData?.solved || cerereData?.status === "solved");
        const msg = wasSolved
          ? `Cererea este deja marcata Rezolvat.\nVrei sa setezi/actualizezi printatorul ales la: ${name} (pret ${price} lei)?`
          : `Confirmi alegerea printatorului: ${name} (pret ${price} lei)?\nCererea se inchide.`;

        const ok = confirm(msg);
        if (!ok) return;

        try {
          await updateDoc(cerereRef, {
            selectedMakerUid: uid,
            selectedMakerName: name,
            selectedOfferPrice: price,
            selectedOfferNote: note,
            selectedAt: serverTimestamp(),
            solved: true,
            status: "solved",
            solvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ownerUnreadOffers: 0,
            ownerUnreadChat: 0,
            activityStatus: "printator_ales"
          });

          cerereData.selectedMakerUid = uid;
          cerereData.selectedMakerName = name;
          cerereData.selectedOfferPrice = price;
          cerereData.selectedOfferNote = note;
          cerereData.selectedAt = new Date();
          cerereData.solved = true;
          cerereData.status = "solved";

          await showChosen(uid, name, price);
          renderFlagsRow(cerereData);

          const flagSolved = document.getElementById("flagSolved");
          if (flagSolved) {
            flagSolved.checked = true;
            flagSolved.disabled = false;
          }

          const goReview = confirm(
            `Gata. Ai ales printatorul: ${name}.\nVrei sa lasi o recenzie acum?`
          );

          if (goReview) {
            window.location.href =
              `/profil-printator.html?uid=${encodeURIComponent(uid)}&leaveReview=1&fromCerere=${encodeURIComponent(cerereId)}#reviewsSection`;
          } else {
            alert("Cererea a fost inchisa. Poti lasa recenzie oricand din profilul printatorului.");
          }
        } catch (e) {
          console.error(e);
          alert("Eroare la alegere: " + (e?.message || e));
        }
      });
    });
  };

  let unsubOffers = null;

  const stopOffersListener = () => {
    if (typeof unsubOffers === "function") {
      unsubOffers();
      unsubOffers = null;
    }
  };

  const startOffersListener = () => {
    if (unsubOffers) return;

    const qOffers = query(
      collection(db, "cereri", cerereId, "oferte"),
      orderBy("price", "asc")
    );

    console.log("[oferte] start listener", { cerereId });

    unsubOffers = onSnapshot(
      qOffers,
      async (snap) => {
        const items = [];
        snap.forEach((d) => items.push(d.data() || {}));

        console.log("[oferte] snapshot items", items.length);
        await renderOffersForOwner(items);
      },
      (err) => {
        console.error("[oferte] snapshot failed:", err);
        if (offersList) offersList.textContent = "Eroare la incarcare oferte.";
      }
    );
  };

  const applyState = async (me) => {
    const isOwner = !!me && cerereData?.createdBy && me.uid === cerereData.createdBy;
    const isSolved = !!(cerereData?.solved || cerereData?.status === "solved");

    if (ownerOffersCard) ownerOffersCard.style.display = isOwner ? "" : "none";

    const showOfferForm = !!me && !isOwner && !isSolved;
    if (printerOfferCard) printerOfferCard.style.display = showOfferForm ? "" : "none";

    if (isSolved && cerereData?.selectedMakerUid) {
      await showChosen(
        cerereData.selectedMakerUid,
        cerereData.selectedMakerName || "User",
        cerereData.selectedOfferPrice || 0
      );
    } else {
      if (chosenBox) chosenBox.style.display = "none";
    }

    if (isOwner) {
      startOffersListener();
    } else {
      stopOffersListener();
    }

    if (showOfferForm) {
      try {
        const myOfferRef = doc(db, "cereri", cerereId, "oferte", me.uid);
        const mySnap = await getDoc(myOfferRef);

        if (mySnap.exists()) {
          const o = mySnap.data() || {};
          if (offerPrice) offerPrice.value = String(o.price || "");
          if (offerNote) offerNote.value = o.note || "";
          setOfferMsg("Ai deja o oferta salvata. O poti modifica si salva din nou.", true);
        }

        if (btnSaveOffer) {
          btnSaveOffer.onclick = async () => {
            const price = Number((offerPrice?.value || "").trim());
            const note = (offerNote?.value || "").toString().trim();

            if (!Number.isFinite(price) || price <= 0) {
              setOfferMsg("Scrie un pret valid (ex: 100).");
              return;
            }

            const prevOffersCount = Number(cerereData.offersCount || 0);
            let nextOffersCount = prevOffersCount;

            try {
              setOfferMsg("Se salveaza...");
              const u = await getUserPublic(me.uid);

              const myOfferRef2 = doc(db, "cereri", cerereId, "oferte", me.uid);
              const snapNow = await getDoc(myOfferRef2);
              const existsAlready = snapNow.exists();

              nextOffersCount = Math.max(
                0,
                prevOffersCount + (existsAlready ? 0 : 1)
              );

              const payload = {
                printerUid: me.uid,
                printerName: (u?.name || me.displayName || "User").toString(),
                price,
                currency: "RON",
                note,
                updatedAt: serverTimestamp()
              };
              if (!existsAlready) payload.createdAt = serverTimestamp();

              await setDoc(myOfferRef2, payload, { merge: true });

              // update optimist imediat in UI local
              cerereData.hasAnyOffer = true;
              cerereData.offersCount = nextOffersCount;
              cerereData.ownerUnreadOffers = Number(cerereData.ownerUnreadOffers || 0) + 1;
              cerereData.activityStatus = cerereData?.ownerHasReplied ? "in_discutie" : "are_interes";
              updatePublicOffersInfo(cerereData.offersCount);

              await updateDoc(cerereRef, {
                hasAnyOffer: true,
                offersCount: existsAlready ? increment(0) : increment(1),
                ownerUnreadOffers: increment(1),
                lastActivityAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                activityStatus: cerereData?.ownerHasReplied ? "in_discutie" : "are_interes"
              });

              console.log("[oferte] saved", {
                cerereId,
                uid: me.uid,
                price,
                existsAlready,
                localOffersCount: cerereData.offersCount
              });

              setOfferMsg("Oferta salvata.", true);
            } catch (e) {
              console.error(e);

              // revert local daca a picat requestul
              cerereData.offersCount = prevOffersCount;
              updatePublicOffersInfo(cerereData.offersCount);

              setOfferMsg("Eroare: " + (e?.message || e));
            }
          };
        }
      } catch (e) {
        console.warn("[oferte] load my offer failed:", e);
      }
    }
  };

  onAuthStateChanged(auth, async (me) => {
    await applyState(me);
  });

  onSnapshot(cerereRef, async (snap) => {
    if (!snap.exists()) return;

    Object.assign(cerereData, snap.data() || {});
    renderPublicCountFromDoc();
    renderFlagsRow(cerereData);

    const solved = !!(cerereData.solved || cerereData.status === "solved");
    const solvedInfo = document.getElementById("solvedInfo");
    const solvedName = document.getElementById("solvedName");

    if (solved) {
      const nm = cerereData.selectedMakerName || "—";
      const uid = cerereData.selectedMakerUid || "";

      if (solvedName) {
        if (uid) {
          const pub = await getUserPublic(uid);
          solvedName.innerHTML = `
            <a href="${getPublicProfileUrl(pub)}" style="color:#111;font-weight:950;text-decoration:underline;">
              ${renderNameWithPrinterBadge(nm, pub.isPrinter === true, true)}
            </a>
          `;
        } else {
          solvedName.textContent = nm;
        }
      }

      if (solvedInfo) solvedInfo.style.display = "";
    } else {
      if (solvedInfo) solvedInfo.style.display = "none";
    }

    const flagSolved = document.getElementById("flagSolved");
    if (flagSolved) {
      flagSolved.checked = solved;
      const hasChosen = !!cerereData.selectedMakerUid;
      flagSolved.disabled = !hasChosen && !solved;
      flagSolved.title = !hasChosen
        ? "Alege un printator din Oferte ca sa poti marca Rezolvat."
        : "";
    }

    if (typeof window.__cerereUpdateSolvedHint === "function") {
      window.__cerereUpdateSolvedHint();
    }

    console.log("[cerere] state changed", {
      cerereId,
      offersCount: cerereData.offersCount || 0,
      solved,
      selectedMakerUid: cerereData.selectedMakerUid || null
    });

    renderCerereActivityBanner(
      cerereData,
      !!auth.currentUser && cerereData?.createdBy && auth.currentUser.uid === cerereData.createdBy
    );

    const me = auth.currentUser;
    const isOwner = !!me && cerereData?.createdBy && me.uid === cerereData.createdBy;
    const isSolved = !!(cerereData?.solved || cerereData?.status === "solved");

    if (ownerOffersCard) ownerOffersCard.style.display = isOwner ? "" : "none";
    if (printerOfferCard) printerOfferCard.style.display = !!me && !isOwner && !isSolved ? "" : "none";

    if (isSolved && cerereData?.selectedMakerUid) {
      await showChosen(
        cerereData.selectedMakerUid,
        cerereData.selectedMakerName || "User",
        cerereData.selectedOfferPrice || 0
      );
    } else {
      if (chosenBox) chosenBox.style.display = "none";
    }
  });
}

/* ========= meta tags ========= */
function setMetaForCerere(cerereId, r) {
  try {
    const title = (r?.title || "Cerere 3D").toString().trim();
    const county = (r?.county || "").toString().trim();
    const budget = (r?.budget || "").toString().trim();
    const deadline = (r?.deadline || "").toString().trim();

    const parts = [];
    if (county) parts.push(county);
    if (budget) parts.push("Buget: " + budget);
    if (deadline) parts.push("Termen: " + deadline);

    const descBase = (r?.description || "").toString().trim();
    const descShort = descBase.length > 150 ? descBase.slice(0, 149) + "…" : descBase;
    const desc = descShort || (parts.length ? parts.join(" · ") : "Detalii cerere pentru printare 3D.");

    const pageTitle = `Cere3D - ${title}`;
    document.title = pageTitle;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    const url = `https://cere3d.ro/cerere.html?id=${encodeURIComponent(cerereId)}`;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", pageTitle);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", desc);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);

    const photosRaw = Array.isArray(r?.photos) ? r.photos : [];
    const firstPhoto = photosRaw.length
      ? (typeof photosRaw[0] === "string" ? photosRaw[0] : (photosRaw[0]?.url || ""))
      : "";
    const ogImgUrl = firstPhoto || "https://cere3d.ro/assets/og-default.jpg";

    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) ogImg.setAttribute("content", ogImgUrl);

    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute("content", pageTitle);

    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute("content", desc);

    const twImg = document.querySelector('meta[name="twitter:image"]');
    if (twImg) twImg.setAttribute("content", ogImgUrl);
  } catch (e) {
    console.warn("[meta] setMetaForCerere failed:", e);
  }
}

function ensureCerereActivityBanner() {
  let el = document.getElementById("cerereActivityBanner");
  if (el) return el;

  const detailHead = document.querySelector(".detail-head");
  const detailGrid = document.querySelector(".detail-grid");

  el = document.createElement("div");
  el.id = "cerereActivityBanner";
  el.className = "cerere-activity-banner";

  if (detailHead && detailHead.parentNode) {
    detailHead.insertAdjacentElement("afterend", el);
  } else if (detailGrid && detailGrid.parentNode) {
    detailGrid.parentNode.insertBefore(el, detailGrid);
  }

  return el;
}

function renderCerereActivityBanner(r, isOwner) {
  const el = ensureCerereActivityBanner();
  if (!el) return;

  if (!isOwner) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }

  const data = buildCerereOwnerBanner(r);
  el.className = `cerere-activity-banner cerere-activity-banner--${data.tone}`;
  el.innerHTML = `
    <div class="cerere-activity-banner__dot"></div>
    <div class="cerere-activity-banner__text">${escapeHtml(data.text)}</div>
  `;
  el.style.display = "";
}

/* ========= main ========= */
export async function initCerereDetail() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (!id) return;

  const titleEl = document.getElementById("d_title");
  const badgeEl = document.getElementById("d_badge");
  const metaEl = document.getElementById("d_meta");
  const descEl = document.getElementById("d_desc");
  const dimsEl = document.getElementById("d_dims");
  const condEl = document.getElementById("d_cond");
  const photosEl = document.getElementById("d_photos");
  const filesEl = document.getElementById("d_files");

  const sideTitle = document.getElementById("s_title");
  const sideDesc = document.getElementById("s_desc");

  const refDoc = doc(db, "cereri", id);
  const snap = await getDoc(refDoc);

  if (!snap.exists()) {
    if (titleEl) titleEl.textContent = "Cerere inexistenta";
    if (descEl) descEl.textContent = "Nu am gasit cererea cu acest ID.";
    return;
  }

  let cerereData = { ...(snap.data() || {}) };
  setMetaForCerere(id, cerereData);
  let ownerSeenMarked = false;

  onAuthStateChanged(auth, async (me) => {
    const isOwner = !!me && cerereData.createdBy && me.uid === cerereData.createdBy;

    renderCerereActivityBanner(cerereData, isOwner);

    if (isOwner && !ownerSeenMarked) {
      ownerSeenMarked = true;
      try {
        await updateDoc(refDoc, {
          ownerUnreadOffers: 0,
          ownerUnreadChat: 0,
          ownerLastSeenAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        cerereData.ownerUnreadOffers = 0;
        cerereData.ownerUnreadChat = 0;
      } catch (e) {
        console.warn("[cerere] owner seen mark failed:", e);
      }
    }
  });

  const dim = cerereData.dimensions || {};
  const cond = cerereData.conditions || {};

  const dimsCard = dimsEl
    ? (dimsEl.closest(".card") || dimsEl.closest("section") || dimsEl.parentElement)
    : null;
  const condCard = condEl
    ? (condEl.closest(".card") || condEl.closest("section") || condEl.parentElement)
    : null;

  const showDims = hasAnyDimsMeaningful(dim);
  const showCond =
    hasAnyCondsMeaningful(cond) ||
    hasMaterialMeaningful(cerereData) ||
    hasRefUrlMeaningful(cerereData);

  if (dimsCard) dimsCard.style.display = showDims ? "" : "none";
  if (condCard) condCard.style.display = showCond ? "" : "none";

  function fmt(ts) {
    if (!ts || !ts.toDate) return "";
    const d = ts.toDate();
    return d.toLocaleString("ro-RO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  const lastEditedEl = document.getElementById("lastEditedLine");
  if (lastEditedEl) {
    const createdAt = cerereData.createdAt || null;
    const updatedAt = cerereData.updatedAt || null;

    if (
      updatedAt &&
      updatedAt.toMillis &&
      (!createdAt || !createdAt.toMillis || updatedAt.toMillis() - createdAt.toMillis() > 60 * 1000)
    ) {
      lastEditedEl.style.display = "block";
      lastEditedEl.textContent = `Last edited: ${fmt(updatedAt)}`;
    } else {
      lastEditedEl.style.display = "none";
    }
  }

  const btnEdit = document.getElementById("btnEditCerere");
  if (btnEdit) {
    btnEdit.style.display = "none";
    onAuthStateChanged(auth, (me) => {
      const isOwner = !!me && cerereData.createdBy && me.uid === cerereData.createdBy;
      btnEdit.style.display = isOwner ? "inline-flex" : "none";
      if (isOwner) {
        btnEdit.onclick = () => {
          location.href = `/editare-cerere.html?id=${encodeURIComponent(id)}`;
        };
      }
    });
  }

  const btnGoChat = document.getElementById("btnGoChat");
  if (btnGoChat) {
    btnGoChat.style.display = "none";
    onAuthStateChanged(auth, (me) => {
      const isOwner = !!me && cerereData.createdBy && me.uid === cerereData.createdBy;
      btnGoChat.style.display = isOwner ? "inline-flex" : "none";
      if (isOwner) {
        btnGoChat.onclick = () => {
          const el = document.getElementById("postChatText") || document.getElementById("postChatMsgs");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      }
    });
  }

  try {
    initPostChat(id, cerereData);
  } catch {}

  const authorUid = cerereData.createdBy || "";
  let authorName = cerereData.createdByName || "";
  let authorAvatar = cerereData.createdByAvatar || "";
  let authorIsPrinter = false;

  if (authorUid) {
    const p = await getUserPublic(authorUid);
    authorName = authorName || p.name || "User";
    authorAvatar = authorAvatar || p.avatarUrl || "";
    authorIsPrinter = p.isPrinter === true;
    cerereData.createdByIsPrinter = authorIsPrinter;
  }

  if (!authorName) authorName = "User";
  if (!authorAvatar) authorAvatar = "/assets/avatar-placeholder.svg";

  const aLink = document.getElementById("authorLink");
  const aName = document.getElementById("authorName");
  const aAv = document.getElementById("authorAv");

  if (aLink && authorUid) {
    aLink.href = getPublicProfileUrl({
      uid: authorUid,
      isPrinter: authorIsPrinter,
      printerVisible: true
    });
  }

  if (aName) {
    aName.innerHTML = renderNameWithPrinterBadge(authorName, authorIsPrinter, true);
  }

  if (aAv) {
    safeImg(aAv, authorAvatar, {
      placeholder: "/assets/avatar-placeholder.svg",
      timeoutMs: 8000,
      retry: true
    });
  }

  const bindDmBtn = (btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!authorUid) return;

      try {
        await startDmWith(authorUid);
      } catch (err) {
        console.error("[DM] startDmWith FAILED:", err);
        alert("Eroare DM: " + (err?.message || err));
      }
    });
  };

  bindDmBtn("btnDmAuthor");
  bindDmBtn("btnDmAuthorSide");

  const solvedInfo = document.getElementById("solvedInfo");
  const solvedName = document.getElementById("solvedName");
  if (cerereData.solved || cerereData.status === "solved") {
    const nm = cerereData.selectedMakerName || "—";
    const uid = cerereData.selectedMakerUid || "";

    if (solvedName) {
      if (uid) {
        const pub = await getUserPublic(uid);
        solvedName.innerHTML = `
          <a href="${getPublicProfileUrl(pub)}" style="color:#111;font-weight:950;text-decoration:underline;">
            ${renderNameWithPrinterBadge(nm, pub.isPrinter === true, true)}
          </a>
        `;
      } else {
        solvedName.textContent = nm;
      }
    }

    if (solvedInfo) solvedInfo.style.display = "";
  } else {
    if (solvedInfo) solvedInfo.style.display = "none";
  }

  renderFlagsRow(cerereData);

  initOwnerFlags({ cerereRef: refDoc, cerereData });
  initOferteSystem({ cerereId: id, cerereRef: refDoc, cerereData });

  const title = (cerereData.title || "Cerere").toString();
  if (titleEl) titleEl.textContent = title;

  if (badgeEl) {
    badgeEl.style.display = "none";
  }

  if (metaEl) {
    const county = (cerereData.county || "").toString().trim();
    const posted = timeAgoFromMs(tsMillisSafe(cerereData.createdAt));

    const pills = [];
    if (county) pills.push(`<span class="meta-pill">${escapeHtml(county)}</span>`);
    if (posted) pills.push(`<span class="meta-pill">Postata ${escapeHtml(posted)}</span>`);

    metaEl.innerHTML = pills.length ? pills.join("") : `<span class="meta-pill">—</span>`;
  }

  if (descEl) descEl.textContent = cerereData.description || "—";

  if (dimsEl && showDims) {
    const len = dim.length ?? "—";
    const wid = dim.width ?? "—";
    const hei = dim.height ?? "—";
    const tol = dim.tolerance ?? "—";
    const scr = dim.screws ?? "—";
    const qty = dim.qty ?? "—";

    const mm = (v) => (v === "—" || v === "-" || v === "--" ? "" : " mm");

    dimsEl.innerHTML = `
      <div class="kv"><div class="k">Lungime</div><div class="v">${escapeHtml(len)}${mm(len)}</div></div>
      <div class="kv"><div class="k">Latime</div><div class="v">${escapeHtml(wid)}${mm(wid)}</div></div>
      <div class="kv"><div class="k">Inaltime</div><div class="v">${escapeHtml(hei)}${mm(hei)}</div></div>
      <div class="kv"><div class="k">Toleranta</div><div class="v">${escapeHtml(tol)}</div></div>
      <div class="kv"><div class="k">Gauri / suruburi</div><div class="v">${escapeHtml(scr)}</div></div>
      <div class="kv"><div class="k">Cantitate</div><div class="v">${escapeHtml(qty)}</div></div>
    `;
  }

  if (condEl && showCond) {
    const rows = [];

    if (hasAnyCondsMeaningful(cond)) {
      rows.push(`
        <div class="kv"><div class="k">Unde</div><div class="v">${escapeHtml(cond.whereUse || "—")}</div></div>
        <div class="kv"><div class="k">Rezistenta</div><div class="v">${escapeHtml(cond.strength || "—")}</div></div>
        <div class="kv"><div class="k">Temperatura</div><div class="v">${escapeHtml(cond.temperature || "—")}</div></div>
        <div class="kv"><div class="k">Apa</div><div class="v">${escapeHtml(cond.water || "—")}</div></div>
        <div class="kv"><div class="k">Soare / UV</div><div class="v">${escapeHtml(cond.uv || "—")}</div></div>
      `);
    }

    if (hasRefUrlMeaningful(cerereData)) {
      const refUrlRaw = (cerereData.referenceUrl || "").toString().trim();
      const href = /^https?:\/\//i.test(refUrlRaw) ? refUrlRaw : "https://" + refUrlRaw;
      rows.push(`
        <div class="kv">
          <div class="k">Link referinta</div>
          <div class="v">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;">
              ${escapeHtml(refUrlRaw)}
            </a>
          </div>
        </div>
      `);
    }

    condEl.innerHTML = rows.length
      ? rows.join("")
      : `<div class="small-muted">Nu sunt alte detalii.</div>`;
  }

  if (sideTitle) sideTitle.textContent = title || "—";

  function clip(s, n) {
    const t = (s ?? "").toString().trim();
    if (!t) return "—";
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }

  if (sideDesc) sideDesc.textContent = clip(cerereData.description || "", 220);

  if (filesEl) {
    let mf = null;

    if (cerereData.modelFile) {
      if (typeof cerereData.modelFile === "string") {
        mf = { url: cerereData.modelFile, name: "model" };
      } else if (typeof cerereData.modelFile === "object" && cerereData.modelFile.url) {
        mf = cerereData.modelFile;
      }
    }

    if (!mf || !mf.url) {
      filesEl.innerHTML = `<div class="small-muted">Nu sunt fisiere atasate.</div>`;
    } else {
      const name = mf.name || "model.3mf";
      filesEl.innerHTML = `
        <div class="attach-item">
          <div class="attach-left">
            <div class="attach-name">${escapeHtml(name)}</div>
            <div class="attach-meta">${escapeHtml(mf.contentType || "")}</div>
          </div>
          <div class="attach-actions">
            <a class="btn-mini" href="${escapeHtml(mf.url)}" download="${escapeHtml(name)}">Download</a>
            <a class="btn-mini" href="${escapeHtml(mf.url)}" target="_blank" rel="noopener">Open</a>
          </div>
        </div>
      `;
    }
  }

  const photosRaw = Array.isArray(cerereData.photos) ? cerereData.photos : [];
  const photos = photosRaw
    .map((p) => (typeof p === "string" ? p : p && typeof p === "object" ? (p.url || "") : ""))
    .filter(Boolean);

  if (photosEl) {
    if (!photos.length) {
      photosEl.innerHTML = `
        <div class="photo ph-empty"><div>
          <div class="ph-ico">📷</div>
          <div class="ph-txt">Nu sunt poze la aceasta cerere</div>
        </div></div>
      `;
    } else {
      photosEl.innerHTML = photos.map((url, idx) => {
        const safe = escapeHtml(url);
        return `
          <div class="photo">
            <img data-photo="1" data-url="${safe}" data-idx="${idx}"
                 alt="poza cerere"
                 loading="lazy" decoding="async"
                 style="width:100%;height:100%;object-fit:cover;display:block;">
          </div>
        `;
      }).join("");

      photosEl.querySelectorAll("img[data-photo='1']").forEach((img) => {
        const url = img.getAttribute("data-url") || "";
        safeImg(img, url, {
          placeholder: "/assets/img-ph.svg",
          timeoutMs: 12000,
          retry: true
        });

        img.addEventListener("click", () => {
          const u = img.getAttribute("data-url") || img.src;
          const fn = guessFilenameFromUrl(u);
          openImageFullscreen(u, fn);
        });
      });
    }
  }
}