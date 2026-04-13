// presence.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  getCountFromServer,
  query,
  collection,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const LS_SESSION = "cere3d_presence_sid_v1";

function getSessionId() {
  let sid = "";
  try { sid = localStorage.getItem(LS_SESSION) || ""; } catch {}
  if (!sid) {
    sid = "s_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
    try { localStorage.setItem(LS_SESSION, sid); } catch {}
  }
  return sid;
}

let started = false;
let lastPingMs = 0;
let uidCached = null;

async function pingPresence({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPingMs < 20000) return;
  lastPingMs = now;

  const sid = getSessionId();
  const ref = doc(db, "presence", sid);

  const payload = {
    sid,
    uid: uidCached || null,
    path: location.pathname || "",
    lastSeen: serverTimestamp(),
    firstSeen: serverTimestamp()
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch {}

  // optional: daca e logat, tine "ultima activitate" si pe profil
  if (uidCached) {
    try {
      await setDoc(
        doc(db, "users", uidCached),
        {
          lastActiveAt: serverTimestamp(),
          lastSeenAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch {}
  }
}

export function initPresence() {
  if (started) return;
  started = true;

  onAuthStateChanged(auth, (u) => {
    uidCached = u?.uid || null;
    pingPresence({ force: true });
  });

  pingPresence({ force: true });
  setInterval(() => pingPresence(), 25000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pingPresence();
  });

  window.addEventListener("focus", () => pingPresence());
  window.addEventListener("mousemove", () => pingPresence(), { passive: true });
  window.addEventListener("keydown", () => pingPresence(), { passive: true });
}

export function initLiveStats(elId = "liveStats") {
  const el = document.getElementById(elId);
  if (!el) return;

  // --- Config ---
  const REAL_THRESHOLD = 10;     // daca real > asta, arata numarul real (altfel simuleaza)
  const SIM_MIN = 3;             // live simulat minim
  const SIM_MAX = 10;            // live simulat maxim
  const MAX_STEP = 2;            // variatie tick (±2)
  const BONUS_TODAY = 18;        // bonus peste maximul real observat azi
  const TICK_INTERVAL = 120000;  // 2 minute

  const LS_LIVE  = "cere3d_stats_live_v1";
  const LS_TICK  = "cere3d_stats_tick_v1";
  const LS_MAX24 = "cere3d_stats_max24_v1";
  const LS_DAY   = "cere3d_stats_day_v1";

  // cheie de zi LOCALA (nu UTC) ca resetul sa fie corect in Romania
  function dayKeyLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- Stare persistata ---
  function loadState() {
    try {
      return {
        simLive:    parseInt(localStorage.getItem(LS_LIVE))  || null,
        lastTick:   parseInt(localStorage.getItem(LS_TICK))  || 0,
        maxToday:   parseInt(localStorage.getItem(LS_MAX24)) || 0,
        dayKey:     localStorage.getItem(LS_DAY) || ""
      };
    } catch {
      return { simLive: null, lastTick: 0, maxToday: 0, dayKey: "" };
    }
  }

  function saveState(simLive, lastTick, maxToday, dayKey) {
    try {
      localStorage.setItem(LS_LIVE,  String(simLive));
      localStorage.setItem(LS_TICK,  String(lastTick));
      localStorage.setItem(LS_MAX24, String(maxToday));
      localStorage.setItem(LS_DAY,   String(dayKey));
    } catch {}
  }

  let state = loadState();

  // init simLive daca lipseste
  if (!Number.isFinite(state.simLive) || state.simLive < SIM_MIN || state.simLive > SIM_MAX) {
    state.simLive = randInt(SIM_MIN, SIM_MAX);
  }

  // reset "azi" la inceput de zi (00:00 local)
  const todayKey = dayKeyLocal();
  if (state.dayKey !== todayKey) {
    state.dayKey = todayKey;
    state.maxToday = 0;
    // salveaza imediat resetul ca sa nu ramana vechi pana la primul tick
    saveState(state.simLive, state.lastTick || 0, state.maxToday, state.dayKey);
  }

  let realLive = 0;
  let realToday = 0;

  function nextSimLive(current) {
    const step = randInt(-MAX_STEP, MAX_STEP); // -2..+2
    let next = current + step;

    if (next < SIM_MIN) next = SIM_MIN + randInt(0, 1);
    if (next > SIM_MAX) next = SIM_MAX - randInt(0, 1);

    // safety clamp
    next = Math.max(SIM_MIN, Math.min(SIM_MAX, next));
    return next;
  }

  function render() {
    // LIVE: real doar daca depaseste pragul, altfel sim
    const liveDisplay = (realLive > REAL_THRESHOLD) ? realLive : state.simLive;

    // TODAY: max real observat azi + bonus (si mereu > live)
    if (realToday > state.maxToday) state.maxToday = realToday;

    let displayToday = state.maxToday > 0
      ? state.maxToday + BONUS_TODAY
      : liveDisplay + 12;

    if (displayToday <= liveDisplay) displayToday = liveDisplay + 10;

    el.innerHTML = `
      Useri activi acum: <span class="stat-live">${liveDisplay}</span>
      <span class="stat-sep">•</span>
      Azi: <span class="stat-24h">${displayToday}</span>
    `;
    el.style.display = "";
  }

  let fetching = false;
  async function fetchRealCounts() {
    if (fetching) return;
    fetching = true;

    try {
      const now = Date.now();
      const onlineCutoff = Timestamp.fromMillis(now - 5 * 60 * 1000);

      // Azi de la 00:00 local
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const dayCutoff = Timestamp.fromDate(startOfDay);

      const [cOnline, cToday] = await Promise.all([
        getCountFromServer(query(collection(db, "presence"), where("lastSeen", ">=", onlineCutoff))),
        getCountFromServer(query(collection(db, "presence"), where("lastSeen", ">=", dayCutoff)))
      ]);

      realLive = cOnline.data().count || 0;
      realToday = cToday.data().count || 0;
    } catch {
      // silent: pastram valorile anterioare
    } finally {
      fetching = false;
    }
  }

  async function tick() {
    // daca s-a schimbat ziua intre timp, reseteaza
    const k = dayKeyLocal();
    if (state.dayKey !== k) {
      state.dayKey = k;
      state.maxToday = 0;
    }

    await fetchRealCounts();

    // actualizeaza simularea doar cand suntem sub prag
    if (realLive <= REAL_THRESHOLD) {
      state.simLive = nextSimLive(state.simLive);
    } else {
      // NU sincronizam simLive cu real (altfel iti sare peste 10 si ramane acolo)
      // state.simLive ramane in intervalul 3..10
    }

    state.lastTick = Date.now();
    saveState(state.simLive, state.lastTick, state.maxToday, state.dayKey);
    render();
  }

  // start
  const msSinceLastTick = Date.now() - (state.lastTick || 0);

  if (msSinceLastTick >= TICK_INTERVAL) {
    tick();
    setInterval(tick, TICK_INTERVAL);
  } else {
    // afiseaza imediat (fara sa schimbi simLive), apoi tick cand vine randul
    fetchRealCounts().then(() => {
      render();
      saveState(state.simLive, state.lastTick || Date.now(), state.maxToday, state.dayKey);
    });

    const remaining = TICK_INTERVAL - msSinceLastTick;
    setTimeout(() => {
      tick();
      setInterval(tick, TICK_INTERVAL);
    }, remaining);
  }
}
