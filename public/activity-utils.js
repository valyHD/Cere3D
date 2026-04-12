// activity-utils.js

function toInt(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export function getOwnerUnreadOffers(r) {
  return toInt(r?.ownerUnreadOffers);
}

export function getOwnerUnreadChat(r) {
  return toInt(r?.ownerUnreadChat);
}

export function getOwnerUnreadTotal(r) {
  return getOwnerUnreadOffers(r) + getOwnerUnreadChat(r);
}

function tsToMs(x) {
  try {
    if (!x) return 0;
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function getDisplayStatus(r) {
  const isSolved = !!(r?.solved || r?.status === "solved");
  const activity = (r?.activityStatus || "").toLowerCase();

  const lastOwnerReplyMs = tsToMs(r?.lastOwnerReplyAt);
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  const discutieExpirata =
    activity === "in_discutie" &&
    lastOwnerReplyMs > 0 &&
    (Date.now() - lastOwnerReplyMs) > fiveDaysMs;

  if (isSolved) {
    if (activity === "printator_ales" || r?.selectedMakerUid) {
      return { key: "solved", label: "Printator ales" };
    }
    return { key: "solved", label: "Rezolvata" };
  }

  if (activity === "in_discutie" && !discutieExpirata) {
    return { key: "urgent", label: "In discutie" };
  }

  if (activity === "printator_ales") {
    return { key: "solved", label: "Printator ales" };
  }

  return { key: "open", label: "Deschisa" };
}

export function buildGlobalActivityText({
  dmUnread = 0,
  offerUnread = 0,
  requestChatUnread = 0
}) {
  const parts = [];

  if (dmUnread > 0) {
    parts.push(`${dmUnread} conversatii private necitite`);
  }

  if (offerUnread > 0) {
    parts.push(`${offerUnread} oferte noi`);
  }

  if (requestChatUnread > 0) {
    parts.push(`${requestChatUnread} mesaje noi pe cererile tale`);
  }

  if (!parts.length) return "";

  return `Ai activitate noua: ${parts.join(" • ")}`;
}

export function buildCerereOwnerBanner(r) {
  const lastOwnerReplyMs = tsToMs(r?.lastOwnerReplyAt);
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  const discutieExpirata =
    (r?.activityStatus || "").toLowerCase() === "in_discutie" &&
    lastOwnerReplyMs > 0 &&
    (Date.now() - lastOwnerReplyMs) > fiveDaysMs;
  const offersUnread = getOwnerUnreadOffers(r);
  const chatUnread = getOwnerUnreadChat(r);
  const offersCount = Number(r?.offersCount || 0);
  const hasChosen = !!r?.selectedMakerUid;
  const isSolved = !!(r?.solved || r?.status === "solved");

  if (isSolved && hasChosen) {
    return {
      tone: "success",
      text: "Ai ales un printator. Urmatorul pas bun este sa lasi review dupa ce se finalizeaza."
    };
  }

  if (isSolved && !hasChosen) {
    return {
      tone: "success",
      text: "Cererea este inchisa ca rezolvata."
    };
  }

  if (offersUnread > 0 && chatUnread > 0) {
    return {
      tone: "attention",
      text: `Ai ${offersUnread} oferte noi si ${chatUnread} mesaje noi pe aceasta cerere. Raspunde repede ca sa pastrezi interesul.`
    };
  }

  if (offersUnread > 0) {
    return {
      tone: "attention",
      text: `Ai ${offersUnread} oferte noi. Intra acum si verifica ofertele primite.`
    };
  }

  if (chatUnread > 0) {
    return {
      tone: "attention",
      text: `Ai ${chatUnread} mesaje noi pe aceasta cerere. Cererile active primesc mai multe raspunsuri.`
    };
  }
  if (discutieExpirata) {
    return {
      tone: "soft",
      text: "Cererea este din nou deschisa. Daca vrei sa avansezi, scrie din nou in chat sau contacteaza un printator din oferte."
    };
  }
  if ((r?.activityStatus || "").toLowerCase() === "in_discutie") {
    return {
      tone: "soft",
      text: "Cererea este in discutie. Continua conversatia ca sa o rezolvi mai repede."
    };
  }

  if (offersCount >= 1) {
    return {
      tone: "soft",
      text: "Ai deja interes pe cerere. Daca nu raspunzi, unii printatori pot trece la alte cereri."
    };
  }

  return {
    tone: "soft",
    text: "Cererea ta este activa. Urmareste mesajele si ofertele. Printatorii raspund mai repede la cererile active."
  };
}

