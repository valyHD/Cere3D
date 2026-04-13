function $(id){ return document.getElementById(id); }

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function scoreFromKeywords(text, map){
  let best = { key: "general", label: "Piesa generala", score: 0 };
  for (const item of map){
    let s = 0;
    for (const kw of item.keywords){
      if (text.includes(kw)) s += 1;
    }
    if (s > best.score) best = { key: item.key, label: item.label, score: s };
  }
  return best;
}

function parseNeeds(text){
  const needs = [];
  if (/(rezist|durab|solid|puternic)/.test(text)) needs.push("Rezistenta mecanica ridicata");
  if (/(caldur|temperatur|motor|soare)/.test(text)) needs.push("Rezistenta la temperatura");
  if (/(finis|aspect|estetic|frumos|decor)/.test(text)) needs.push("Aspect estetic / finisaj");
  if (/(rapid|urgent|azi|maine)/.test(text)) needs.push("Livrare rapida");
  if (/(preciz|tolerant|fix|exact)/.test(text)) needs.push("Precizie dimensionala");
  return needs.length ? needs : ["Necesitati generale (fara constrangeri explicite)"];
}

function estimateFromInput({ title, description, material, qty, l, w, h, imageCount, avgMp }){
  const text = `${title} ${description}`.toLowerCase();

  const pieceType = scoreFromKeywords(text, [
    { key: "auto", label: "Piesa auto", keywords: ["auto", "masina", "grila", "motor", "tablou", "ventilatie"] },
    { key: "bracket", label: "Suport / prindere", keywords: ["suport", "prindere", "bracket", "clema"] },
    { key: "case", label: "Carcasa", keywords: ["carcasa", "capa", "cover", "cutie"] },
    { key: "decor", label: "Decor / cadou", keywords: ["decor", "cadou", "vaza", "figurina", "statueta", "bust"] },
    { key: "prototype", label: "Prototip functional", keywords: ["prototip", "test", "mvp", "validare"] },
    { key: "repair", label: "Refacere piesa", keywords: ["rupt", "refac", "inlocuire", "nu se mai gaseste"] },
  ]);

  const objective = scoreFromKeywords(text, [
    { key: "repair", label: "Reparatie / inlocuire", keywords: ["rupt", "refac", "inlocuire", "repar"] },
    { key: "new", label: "Produs nou / custom", keywords: ["nou", "custom", "personalizat", "de la zero"] },
    { key: "prototype", label: "Prototipare", keywords: ["prototip", "test", "iteratie", "validare"] },
  ]);

  const needs = parseNeeds(text);
  const volCm3 = Math.max(1, (l * w * h) / 1000);
  const maxDimMm = Math.max(l, w, h);
  const minDimMm = Math.min(l, w, h);
  const aspectRatio = maxDimMm / Math.max(1, minDimMm);

  const baseByType = {
    auto: 110,
    bracket: 70,
    case: 85,
    decor: 60,
    prototype: 130,
    repair: 90,
    general: 75,
  };
  const materialMult = {
    PLA: 1,
    PETG: 1.15,
    ABS: 1.25,
    TPU: 1.35,
    Nylon: 1.6,
  };

  const detailDemandMult = (() => {
    if (/(detali|fina|miniatur|figurina|statuet|bust)/.test(text)) return 1.2;
    if (/(test rapid|brut|draft)/.test(text)) return 0.9;
    return 1;
  })();
  const urgencyMult = /(urgent|azi|maine|rapid)/.test(text) ? 1.15 : 1;
  const tallPartMult = maxDimMm >= 300 ? (1 + (maxDimMm - 300) / 500) : 1;
  const slenderRiskMult = aspectRatio >= 4 ? 1.1 : 1;

  const base = baseByType[pieceType.key] || baseByType.general;
  // Fara plafonare agresiva, ca sa reactioneze corect la piese foarte mari/inalte.
  const sizeFactor = 0.95 + Math.pow(volCm3 / 45, 0.62);
  const qtyFactor = 1 + Math.log2(Math.max(1, qty)) * 0.35;

  const complexityText = clamp((description.length / 240) + (needs.length * 0.12), 0.6, 1.7);
  const imageBoost = imageCount ? clamp(1 + Math.min(0.2, imageCount * 0.03) + Math.min(0.12, avgMp * 0.015), 1, 1.35) : 1;

  const materialFactor = materialMult[material] || 1;
  const estimated = base
    * sizeFactor
    * qtyFactor
    * complexityText
    * materialFactor
    * imageBoost
    * detailDemandMult
    * urgencyMult
    * tallPartMult
    * slenderRiskMult;
  const low = Math.round(estimated * 0.82);
  const high = Math.round(estimated * 1.22);
  const printHours = Math.max(1, Math.round((volCm3 * 0.09 + maxDimMm * 0.03) * detailDemandMult));

  const confidence = clamp(
    38
    + Math.min(25, description.length / 10)
    + (imageCount ? Math.min(18, imageCount * 4) : 0)
    + (volCm3 > 1 ? 9 : 0),
    40,
    92
  );

  return {
    pieceType,
    objective,
    needs,
    priceRange: { low, high },
    confidence: Math.round(confidence),
    volCm3: Math.round(volCm3),
    printHours,
  };
}

async function readImagesMeta(files){
  const imgs = Array.from(files || []).filter(f => f.type?.startsWith("image/"));
  if (!imgs.length) return { count: 0, avgMp: 0 };

  const metas = await Promise.all(imgs.map((file) => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 0, h: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  })));

  const avgPx = metas.reduce((s, m) => s + (m.w * m.h), 0) / metas.length;
  return {
    count: metas.length,
    avgMp: avgPx ? (avgPx / 1000000) : 0,
  };
}

function renderResult(res){
  const box = $("quoteResult");
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `
    <div class="quote-kpi-row">
      <div class="quote-kpi"><span>Piesa detectata</span><strong>${res.pieceType.label}</strong></div>
      <div class="quote-kpi"><span>Scop detectat</span><strong>${res.objective.label}</strong></div>
      <div class="quote-kpi"><span>Volum estimat</span><strong>${res.volCm3} cm³</strong></div>
      <div class="quote-kpi"><span>Timp printare</span><strong>~${res.printHours}h</strong></div>
      <div class="quote-kpi"><span>Incredere analiza</span><strong>${res.confidence}%</strong></div>
    </div>
    <div class="quote-price">
      <div class="quote-price-label">Pret estimativ inainte de postare</div>
      <div class="quote-price-value">${res.priceRange.low} - ${res.priceRange.high} RON</div>
      <p>Interval orientativ, calculat din text + imagini + dimensiuni. Pretul final vine din ofertele reale primite dupa postare.</p>
    </div>
    <div class="quote-needs"><strong>Ce a inteles sistemul ca iti doresti:</strong> ${res.needs.join(" · ")}</div>
  `;
}

function init(){
  const form = $("instantQuoteForm");
  const toPostBtn = $("goToPostBtn");
  if (!form || !toPostBtn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = ($("q_title")?.value || "").trim();
    const description = ($("q_description")?.value || "").trim();
    const material = $("q_material")?.value || "PLA";
    const qty = Number($("q_qty")?.value || 1);
    const l = Number($("q_l")?.value || 50);
    const w = Number($("q_w")?.value || 40);
    const h = Number($("q_h")?.value || 20);
    const photos = $("q_photos")?.files || [];

    if (!title || !description) {
      alert("Completeaza titlul si descrierea pentru estimare.");
      return;
    }

    const meta = await readImagesMeta(photos);
    const result = estimateFromInput({
      title, description, material,
      qty: Math.max(1, qty),
      l: Math.max(1, l), w: Math.max(1, w), h: Math.max(1, h),
      imageCount: meta.count,
      avgMp: meta.avgMp,
    });

    renderResult(result);

    localStorage.setItem("instantQuoteDraft", JSON.stringify({
      title,
      description,
      referenceUrl: ($("q_ref")?.value || "").trim(),
      county: ($("q_county")?.value || "").trim(),
      fromInstantQuote: true,
      estimatedLow: result.priceRange.low,
      estimatedHigh: result.priceRange.high,
    }));

    toPostBtn.hidden = false;
  });

  toPostBtn.addEventListener("click", () => {
    location.href = "/cere.html?instant=1";
  });
}

init();
