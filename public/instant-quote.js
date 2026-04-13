function $(id){ return document.getElementById(id); }

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function normalizeText(text){
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKeyword(text, kw){
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(kw)}([^a-z0-9]|$)`, "i");
  return pattern.test(text);
}

function scoreFromKeywords(text, map){
  let best = { key: "general", label: "Piesa generala", score: 0 };
  for (const item of map){
    let s = 0;
    for (const kw of item.keywords){
      if (hasKeyword(text, kw)) s += 1;
    }
    if (s > best.score) best = { key: item.key, label: item.label, score: s };
  }
  return best;
}

function inferMaterialFromText(text, selectedMaterial){
  const rules = [
    { material: "PETG", score: 1.6, regex: /(apa|lichid|umeze|hidro|exterior|uv|soare|rezistent la apa|etans|transparent|translucid|clar|filet)/ },
    { material: "TPU", score: 1.5, regex: /(flexib|elastic|garnitur|amortiz|banda|moale)/ },
    { material: "ABS", score: 1.3, regex: /(motor|capota|temperaturi? ridicate|caldur|peste 70|auto)/ },
    { material: "Nylon", score: 1.35, regex: /(uzura|frecare|angrenaj|roata dintata|rulment|industrial)/ },
    { material: "PLA", score: 1.1, regex: /(decor|figurina|display|prototip vizual|estetic)/ },
  ];

  let best = { material: selectedMaterial, confidence: 0 };
  for (const r of rules){
    const hits = (text.match(new RegExp(r.regex.source, "g")) || []).length;
    const conf = hits * r.score;
    if (conf > best.confidence){
      best = { material: r.material, confidence: conf };
    }
  }

  const inferred = best.confidence >= 1.2 ? best.material : selectedMaterial;
  return {
    inferred,
    confidence: clamp(best.confidence / 3, 0, 1),
  };
}

function buildMaterialAdvice({ text, selectedMaterial, inferredMaterial, needs, pieceType }){
  const needsTransparency = /transparent|translucid|clar|sticla/.test(text) || needs.includes("Transparenta optica");
  const needsFluidSeal = /apa|fluid|etans|filet|presiune|debit/.test(text) || pieceType.key === "fluid";
  const needsFlex = /flexib|elastic|garnitur|amortiz|moale/.test(text);

  let recommendation = inferredMaterial || selectedMaterial;
  const reasons = [];

  if (needsTransparency && needsFluidSeal){
    recommendation = "PETG";
    reasons.push("PETG transparent este, in general, alegerea potrivita pentru piese rigide cu apa + filet.");
  }
  if (needsFlex){
    reasons.push("TPU e util pentru garnituri sau zone flexibile, nu pentru tot tubul filetat.");
  }
  if (!needsFlex && recommendation === "TPU"){
    recommendation = "PETG";
    reasons.push("Pentru piesa rigida curbata la 90° cu filet, TPU poate deforma filetul.");
  }
  if (!reasons.length){
    reasons.push(`${recommendation} pare potrivit pe baza textului introdus.`);
  }

  return { recommendation, reasons };
}

function parseNeeds(text){
  const needs = [];
  if (/(rezist|durab|solid|puternic)/.test(text)) needs.push("Rezistenta mecanica ridicata");
  if (/(caldur|temperatur|motor|soare)/.test(text)) needs.push("Rezistenta la temperatura");
  if (/(finis|aspect|estetic|frumos|decor)/.test(text)) needs.push("Aspect estetic / finisaj");
  if (/(rapid|urgent|azi|maine)/.test(text)) needs.push("Livrare rapida");
  if (/(preciz|tolerant|fix|exact)/.test(text)) needs.push("Precizie dimensionala");
  if (/(transparent|translucid|clar|sticla)/.test(text)) needs.push("Transparenta optica");
  if (/(filet|insurub|etans|fara scurgeri)/.test(text)) needs.push("Etansare / filet functional");
  if (/(masca|fata|ochi|nas|gura|frunte|purtare)/.test(text)) needs.push("Ergonomie pentru contact cu fata");
  return needs.length ? needs : ["Necesitati generale (fara constrangeri explicite)"];
}

function extractMatchedKeywords(text, groups){
  const out = [];
  for (const g of groups){
    const hits = g.keywords.filter((kw) => hasKeyword(text, kw));
    if (hits.length){
      out.push({ label: g.label, hits });
    }
  }
  return out;
}

function safeNum(v, fallback){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function triArea(v0, v1, v2){
  const ax = v1[0] - v0[0];
  const ay = v1[1] - v0[1];
  const az = v1[2] - v0[2];
  const bx = v2[0] - v0[0];
  const by = v2[1] - v0[1];
  const bz = v2[2] - v0[2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return 0.5 * Math.sqrt((cx * cx) + (cy * cy) + (cz * cz));
}

function triSignedVolume(v0, v1, v2){
  return (
    (v0[0] * ((v1[1] * v2[2]) - (v1[2] * v2[1])))
    - (v0[1] * ((v1[0] * v2[2]) - (v1[2] * v2[0])))
    + (v0[2] * ((v1[0] * v2[1]) - (v1[1] * v2[0])))
  ) / 6;
}

function classifyStlGeometry({ spanX, spanY, spanZ, volumeCm3, triangleCount }){
  const maxSpan = Math.max(spanX, spanY, spanZ, 1);
  const minSpan = Math.max(0.1, Math.min(spanX, spanY, spanZ));
  const ratio = maxSpan / minSpan;
  const isFlat = minSpan <= 4 && ratio >= 8;
  const isTall = ratio >= 4 && !isFlat;
  const isTiny = maxSpan < 30 && volumeCm3 < 8;
  const isComplex = triangleCount >= 6000;

  if (isFlat) return { key: "bracket", label: "Piesa plata / suport", keywords: ["suport", "prindere", "placa", "clema"] };
  if (isTall) return { key: "fluid", label: "Piesa alungita", keywords: ["tub", "racord", "conector", "curbat"] };
  if (isTiny) return { key: "repair", label: "Piesa mica de inlocuire", keywords: ["inlocuire", "refacere", "piesa mica"] };
  if (isComplex) return { key: "decor", label: "Geometrie complexa", keywords: ["figurina", "decor", "detalii"] };
  return { key: "general", label: "Piesa tehnica generala", keywords: ["prototip", "carcasa", "piesa functionala"] };
}

async function parseStlFile(file){
  if (!file) return null;
  const buf = await file.arrayBuffer();
  if (!buf || buf.byteLength < 84) return null;

  const bytes = new Uint8Array(buf);
  const header = new TextDecoder("utf-8").decode(bytes.slice(0, Math.min(bytes.length, 160)));
  const looksAscii = /^\s*solid[\s\S]*facet\s+normal/i.test(header);
  const dv = new DataView(buf);

  const triangles = [];
  const readTri = (v0, v1, v2) => {
    if (![v0, v1, v2].flat().every((n) => Number.isFinite(n))) return;
    triangles.push([v0, v1, v2]);
  };

  if (looksAscii){
    const text = new TextDecoder("utf-8").decode(bytes);
    const matches = [...text.matchAll(/vertex\s+([\-+eE0-9.]+)\s+([\-+eE0-9.]+)\s+([\-+eE0-9.]+)/g)];
    for (let i = 0; i + 2 < matches.length; i += 3){
      const v0 = [Number(matches[i][1]), Number(matches[i][2]), Number(matches[i][3])];
      const v1 = [Number(matches[i + 1][1]), Number(matches[i + 1][2]), Number(matches[i + 1][3])];
      const v2 = [Number(matches[i + 2][1]), Number(matches[i + 2][2]), Number(matches[i + 2][3])];
      readTri(v0, v1, v2);
    }
  } else {
    const triCount = dv.getUint32(80, true);
    const expectedLen = 84 + (triCount * 50);
    if (expectedLen <= buf.byteLength && triCount > 0){
      let offset = 84;
      for (let i = 0; i < triCount; i++){
        offset += 12;
        const v0 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)]; offset += 12;
        const v1 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)]; offset += 12;
        const v2 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)]; offset += 12;
        offset += 2;
        readTri(v0, v1, v2);
      }
    }
  }

  if (!triangles.length) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let areaMm2 = 0;
  let signedVolumeMm3 = 0;
  for (const [v0, v1, v2] of triangles){
    for (const v of [v0, v1, v2]){
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    }
    areaMm2 += triArea(v0, v1, v2);
    signedVolumeMm3 += triSignedVolume(v0, v1, v2);
  }

  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  const spanZ = Math.max(0.1, maxZ - minZ);
  const bboxVolumeCm3 = (spanX * spanY * spanZ) / 1000;
  const volumeCm3 = Math.abs(signedVolumeMm3) / 1000;
  const shapeHint = classifyStlGeometry({ spanX, spanY, spanZ, volumeCm3, triangleCount: triangles.length });

  return {
    hasStl: true,
    fileName: file.name,
    triangleCount: triangles.length,
    spanX: Math.round(spanX),
    spanY: Math.round(spanY),
    spanZ: Math.round(spanZ),
    bboxVolumeCm3: Math.round(bboxVolumeCm3),
    volumeCm3: Math.round(volumeCm3),
    areaCm2: Math.round(areaMm2 / 100),
    shapeHint,
  };
}

function weightedChoice(items, rand){
  const total = items.reduce((s, it) => s + Math.max(0, it.weight || 0), 0);
  if (total <= 0) return items[0];
  let r = rand() * total;
  for (const it of items){
    r -= Math.max(0, it.weight || 0);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildScenarioInsights({ text, basePrice, pieceType, objective, hasDimensions, imageCount, description, qty, material, maxDimMm }){
  const scenarioDefs = [
    { key: "wearable", label: "Masca / piesa purtabila", keywords: ["masca", "fata", "ochi", "nas", "gura", "frunte"], baseW: 1.2, priceMult: 1.1 },
    { key: "fluid", label: "Tub / racord fluide", keywords: ["tub", "teava", "furtun", "apa", "fluid", "filet", "etans"], baseW: 1.15, priceMult: 1.08 },
    { key: "support", label: "Suport / prindere functionala", keywords: ["suport", "prindere", "clema", "bracket"], baseW: 1.1, priceMult: 0.92 },
    { key: "auto", label: "Piesa auto de inlocuire", keywords: ["auto", "masina", "grila", "ventilatie", "motor"], baseW: 1.05, priceMult: 1.16 },
    { key: "enclosure", label: "Carcasa / capac", keywords: ["carcasa", "capa", "cover", "cutie"], baseW: 0.95, priceMult: 1.04 },
    { key: "decor", label: "Decor / figurina", keywords: ["decor", "figurina", "miniatur", "bust"], baseW: 0.8, priceMult: 1.1 },
    { key: "prototype", label: "Prototip tehnic", keywords: ["prototip", "test", "iteratie", "validare"], baseW: 1.2, priceMult: 1.2 },
    { key: "repair", label: "Refacere piesa rupta", keywords: ["rupt", "refac", "inlocuire"], baseW: 1.15, priceMult: 1.08 },
  ];

  const seed = hashString(`${text}|${material}|${qty}|${maxDimMm}|${imageCount}`);
  const rand = mulberry32(seed);
  const scenarioStats = {};

  for (const s of scenarioDefs){
    let kwHits = 0;
    for (const kw of s.keywords) if (hasKeyword(text, kw)) kwHits += 1;
    const signalFromDetectedType = pieceType.label.toLowerCase().includes(s.label.split(" ")[0].toLowerCase()) ? 0.25 : 0;
    const signalFromObjective = objective.key === "repair" && s.key === "repair" ? 0.4 : (objective.key === "prototype" && s.key === "prototype" ? 0.35 : 0);
    const signalFromData = (hasDimensions ? 0.18 : 0) + (imageCount >= 2 ? 0.12 : imageCount ? 0.05 : -0.08) + Math.min(0.2, description.length / 1200);
    scenarioStats[s.key] = {
      def: s,
      weight: Math.max(0.05, s.baseW + kwHits * 0.32 + signalFromDetectedType + signalFromObjective + signalFromData),
      samples: [],
    };
  }

  const choices = Object.values(scenarioStats);
  for (let i = 0; i < 1000; i++){
    const chosen = weightedChoice(choices, rand);
    const uncertainty = hasDimensions ? 0.12 : 0.3;
    const randomFactor = 1 + ((rand() * 2 - 1) * uncertainty);
    const detailNoise = 1 + ((rand() * 2 - 1) * (description.length > 140 ? 0.07 : 0.16));
    const imageNoise = 1 + ((rand() * 2 - 1) * (imageCount >= 3 ? 0.05 : 0.14));
    const samplePrice = Math.max(25, basePrice * chosen.def.priceMult * randomFactor * detailNoise * imageNoise);
    chosen.samples.push(samplePrice);
  }

  const ranked = Object.values(scenarioStats).map((s) => {
    const n = s.samples.length || 1;
    const sorted = [...s.samples].sort((a, b) => a - b);
    const avg = s.samples.reduce((sum, v) => sum + v, 0) / n;
    const p10 = sorted[Math.floor((n - 1) * 0.1)] || avg;
    const p90 = sorted[Math.floor((n - 1) * 0.9)] || avg;
    return {
      label: s.def.label,
      probability: s.weight / choices.reduce((w, c) => w + c.weight, 0),
      avgPrice: Math.round(avg),
      p10: Math.round(p10),
      p90: Math.round(p90),
    };
  }).sort((a, b) => b.probability - a.probability);

  const likely = ranked.slice(0, 3);
  const ambiguityQuestions = [];
  if (!hasDimensions){
    ambiguityQuestions.push("Lungime × latime × inaltime aproximative (mm)?");
  }
  if (!/interior|exterior|caldur|temperatur|soare|motor/.test(text)){
    ambiguityQuestions.push("Unde va fi folosita piesa (interior/exterior, temperaturi ridicate)?");
  }
  if (!/surub|filet|click|clips|tolerant|joc/.test(text)){
    ambiguityQuestions.push("Exista puncte de fixare, filet sau tolerante critice?");
  }
  if (/masca|fata|ochi|nas|gura|frunte/.test(text) && !/moale|captuse|burete|elastic/.test(text)){
    ambiguityQuestions.push("Masca atinge direct pielea? Ai nevoie de margini moi/captusite pentru confort?");
  }
  if (/tub|apa|fluid|filet|etans/.test(text) && !/presiune|bar|debit/.test(text)){
    ambiguityQuestions.push("Ce presiune/debit are fluidul si ce tip de etansare iti trebuie?");
  }
  if (imageCount < 2){
    ambiguityQuestions.push("Poti adauga 2-3 poze din unghiuri diferite + poza langa o rigla?");
  }

  const coverage = clamp(
    (hasDimensions ? 35 : 10)
    + Math.min(30, description.length / 8)
    + Math.min(20, imageCount * 6)
    + Math.min(15, qty >= 2 ? 8 : 4),
    15, 95
  );

  return {
    likely,
    ambiguityQuestions: ambiguityQuestions.slice(0, 4),
    simulationCount: 1000,
    dataCoverage: Math.round(coverage),
  };
}

function estimateFromInput({ title, description, material, qty, l, w, h, imageCount, avgMp, avgBrightness = 0, avgContrast = 0, avgSharpness = 0, hasDimensions, stlData = null }){
  const stlText = stlData?.shapeHint?.keywords?.join(" ") || "";
  const text = normalizeText(`${title} ${description} ${stlText}`);

  const pieceType = scoreFromKeywords(text, [
    { key: "wearable", label: "Masca / piesa purtabila", keywords: ["masca", "fata", "ochi", "nas", "gura", "frunte", "viziera"] },
    { key: "fluid", label: "Tub / conectica fluide", keywords: ["tub", "teava", "furtun", "apa", "fluid", "curbat", "90", "filet"] },
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
  const keywordSignals = {
    pieceType: extractMatchedKeywords(text, [
      { label: "Masca / piesa purtabila", keywords: ["masca", "fata", "ochi", "nas", "gura", "frunte", "viziera"] },
      { label: "Tub / conectica fluide", keywords: ["tub", "teava", "furtun", "apa", "fluid", "curbat", "90", "filet"] },
      { label: "Piesa auto", keywords: ["auto", "masina", "grila", "motor", "tablou", "ventilatie"] },
      { label: "Suport / prindere", keywords: ["suport", "prindere", "bracket", "clema"] },
      { label: "Carcasa", keywords: ["carcasa", "capa", "cover", "cutie"] },
      { label: "Decor / cadou", keywords: ["decor", "cadou", "vaza", "figurina", "statueta", "bust"] },
      { label: "Prototip functional", keywords: ["prototip", "test", "mvp", "validare"] },
      { label: "Refacere piesa", keywords: ["rupt", "refac", "inlocuire", "nu se mai gaseste"] },
    ]),
    objective: extractMatchedKeywords(text, [
      { label: "Reparatie / inlocuire", keywords: ["rupt", "refac", "inlocuire", "repar"] },
      { label: "Produs nou / custom", keywords: ["nou", "custom", "personalizat", "de la zero"] },
      { label: "Prototipare", keywords: ["prototip", "test", "iteratie", "validare"] },
    ]),
  };

  const needs = parseNeeds(text);
  const dimVolCm3 = Math.max(1, (l * w * h) / 1000);
  const stlVolCm3 = stlData?.volumeCm3 || 0;
  const volCm3 = stlVolCm3 > 0
    ? Math.max(1, hasDimensions ? ((stlVolCm3 * 0.82) + (dimVolCm3 * 0.18)) : stlVolCm3)
    : dimVolCm3;
  const volM3 = volCm3 / 1000000;
  const maxDimMm = stlData ? Math.max(stlData.spanX || 0, stlData.spanY || 0, stlData.spanZ || 0, l, w, h) : Math.max(l, w, h);
  const minDimMm = stlData ? Math.min(stlData.spanX || l, stlData.spanY || w, stlData.spanZ || h) : Math.min(l, w, h);
  const aspectRatio = maxDimMm / Math.max(1, minDimMm);

  const baseByType = {
    wearable: 55,
    fluid: 52,
    auto: 58,
    bracket: 38,
    case: 45,
    decor: 30,
    prototype: 62,
    repair: 48,
    general: 36,
  };
  const materialMult = {
    PLA: 1,
    PETG: 1.15,
    ABS: 1.25,
    TPU: 1.35,
    Nylon: 1.6,
  };
  const materialInference = inferMaterialFromText(text, material);
  const materialAdvice = buildMaterialAdvice({
    text,
    selectedMaterial: material,
    inferredMaterial: materialInference.inferred,
    needs,
    pieceType,
  });
  const inferredMaterialFactor = materialMult[materialInference.inferred] || 1;

  const detailDemandMult = (() => {
    if (/(detali|fina|miniatur|figurina|statuet|bust)/.test(text)) return 1.2;
    if (/(test rapid|brut|draft)/.test(text)) return 0.9;
    return 1;
  })();
  const urgencyMult = /(urgent|azi|maine|rapid)/.test(text) ? 1.15 : 1;
  const tallPartMult = maxDimMm >= 300 ? (1 + (maxDimMm - 300) / 500) : 1;
  const slenderRiskMult = aspectRatio >= 4 ? 1.1 : 1;

  const base = baseByType[pieceType.key] || baseByType.general;
  const geometryFillFactor = (() => {
    if (pieceType.key === "decor" && aspectRatio >= 4) return 0.2;
    if (pieceType.key === "decor") return 0.35;
    if (aspectRatio >= 6) return 0.28;
    if (aspectRatio >= 4) return 0.4;
    return 0.72;
  })();
  const effectiveVolCm3 = Math.max(1, volCm3 * geometryFillFactor);
  const sizeFactor = 0.72 + Math.pow(effectiveVolCm3 / 90, 0.42);
  const qtyFactor = 1 + Math.log2(Math.max(1, qty)) * 0.22;
  const volumeCalibrationMult = (() => {
    if (effectiveVolCm3 <= 80){
      return clamp(0.42 + (effectiveVolCm3 / 80) * 0.38, 0.42, 0.8);
    }
    if (effectiveVolCm3 <= 300){
      return clamp(0.8 + ((effectiveVolCm3 - 80) / 220) * 0.2, 0.8, 1);
    }
    return 1;
  })();

  const complexityText = clamp((description.length / 260) + (needs.length * 0.11), 0.5, 1.35);
  const imageSignal = imageCount
    ? clamp((avgContrast / 55) * 0.45 + (avgSharpness / 35) * 0.55, 0.55, 1.45)
    : 1;
  const imageBoost = imageCount
    ? clamp(1 + Math.min(0.2, imageCount * 0.03) + Math.min(0.12, avgMp * 0.015) + (imageSignal - 1) * 0.08, 1, 1.38)
    : 1;

  const materialFactor = clamp(
    (materialMult[material] || 1) * (1 - materialInference.confidence * 0.45)
      + inferredMaterialFactor * (materialInference.confidence * 0.45),
    0.9,
    1.8
  );
  const modelingCost = title || description
    ? clamp(12 + description.length * 0.06 + imageCount * 3, 12, 130)
    : clamp(22 + imageCount * 7, 22, 160);
  const setupCost = clamp(10 + Math.max(0, (maxDimMm - 120) * 0.04), 10, 95);
  const riskCost = (imageCount && !(title || description)) ? 35 : 0;
  const segmentationRiskCost = maxDimMm >= 320 ? Math.round(clamp(18 + (maxDimMm - 320) * 0.12, 0, 95)) : 0;
  const postProcessRiskCost = /figurina|statuet|bust|miniatur|detali/.test(text)
    ? Math.round(clamp(12 + maxDimMm * 0.03, 0, 80))
    : 0;
  const failureRiskCost = (aspectRatio >= 5 || maxDimMm >= 360) ? 14 : 0;

  const multiplicativeCore = base
    * sizeFactor
    * qtyFactor
    * complexityText
    * materialFactor
    * imageBoost
    * detailDemandMult
    * urgencyMult
    * tallPartMult
    * slenderRiskMult
    * volumeCalibrationMult;

  const estimated = multiplicativeCore
    + modelingCost
    + setupCost
    + riskCost
    + segmentationRiskCost
    + postProcessRiskCost
    + failureRiskCost;
  const low = Math.round(estimated * 0.82);
  const high = Math.round(estimated * 1.22);
  const printHours = Math.max(1, Math.round((effectiveVolCm3 * 0.0032 + maxDimMm * 0.025) * detailDemandMult * Math.max(1, qty * 0.85)));

  const confidence = clamp(
    38
    + Math.min(25, description.length / 10)
    + (imageCount ? Math.min(18, imageCount * 4) : 0)
    + (imageCount ? clamp((imageSignal - 1) * 12, -4, 8) : 0)
    + (hasDimensions ? 11 : 2)
    + (stlData ? 16 : 0)
    + (volCm3 > 1 ? 9 : 0),
    40,
    92
  );
  const scenarioInsights = buildScenarioInsights({
    text,
    basePrice: estimated,
    pieceType,
    objective,
    hasDimensions,
    imageCount,
    description,
    qty,
    material,
    maxDimMm,
  });

  return {
    pieceType,
    objective,
    needs,
    priceRange: { low, high },
    confidence: Math.round(confidence),
    volCm3: Math.round(volCm3),
    volM3,
    printHours,
    materialAdvice,
    priceBreakdown: {
      corePrintCost: Math.round(multiplicativeCore),
      modelingCost: Math.round(modelingCost),
      setupCost: Math.round(setupCost),
      riskCost: Math.round(riskCost),
      segmentationRiskCost,
      postProcessRiskCost,
      failureRiskCost,
    },
    analysisSignals: {
      keywordSignals,
      imageAnalysis: {
        imageCount,
        avgMp: Number(avgMp.toFixed(2)),
        avgBrightness,
        avgContrast,
        avgSharpness,
        coverage: imageCount >= 3 ? "Buna" : imageCount >= 1 ? "Partiala" : "Fara imagini",
        confidenceImpact: imageCount ? (imageSignal >= 1.05 ? "Creste mult increderea estimarii" : "Creste increderea estimarii") : "Fara suport vizual",
      },
      stlAnalysis: stlData
        ? {
            enabled: true,
            fileName: stlData.fileName,
            triangleCount: stlData.triangleCount,
            bbox: `${stlData.spanX}×${stlData.spanY}×${stlData.spanZ} mm`,
            estimatedVolumeCm3: stlData.volumeCm3,
            estimatedAreaCm2: stlData.areaCm2,
            inferredShape: stlData.shapeHint.label,
          }
        : { enabled: false },
      riskNotes: [
        ...(maxDimMm >= 320 ? [`Dimensiunea maxima ${maxDimMm}mm sugereaza printare in bucati si asamblare.`] : []),
        ...(aspectRatio >= 5 ? ["Geometrie alungita: risc de deformare/instabilitate la print."] : []),
        ...(geometryFillFactor < 0.5 ? ["Forma detectata pare partial goala/segmentata: volumul efectiv a fost ajustat pentru o estimare mai realista."] : []),
        ...(/figurina|statuet|bust|miniatur|detali/.test(text) ? ["Obiect decorativ cu detalii fine: probabil necesita slefuire/finisaj."] : []),
        ...((imageCount && !(title || description)) ? ["Doar poze fara text: risc mai mare de interpretare gresita."] : []),
        ...(materialInference.inferred !== material ? [`Material posibil mai potrivit decat ${material}: ${materialInference.inferred} (dedus din cerinte text).`] : []),
        ...(stlData ? [`Fisier STL analizat (${stlData.triangleCount} triunghiuri) pentru volum/dimensiuni mai realiste.`] : []),
        ...(materialAdvice.recommendation !== materialInference.inferred ? [`Pentru contextul detectat, sugestia finala de material este ${materialAdvice.recommendation}.`] : []),
        ...(!hasDimensions ? ["Dimensiunile lipsesc sau pot fi inexacte: estimarea compenseaza cu marja mai larga."] : []),
      ],
      multipliers: [
        { label: materialInference.inferred !== material ? `Material (selectat ${material}, intuit ${materialInference.inferred})` : "Material", value: materialFactor },
        { label: "Detaliu", value: detailDemandMult },
        { label: "Urgenta", value: urgencyMult },
        { label: "Piesa inalta", value: tallPartMult },
        { label: "Risc geometrie", value: slenderRiskMult },
        { label: "Volum efectiv", value: geometryFillFactor },
        { label: "Calibrare volum mic", value: volumeCalibrationMult },
      ],
      scenarioInsights,
    },
  };
}

async function analyzeImage(url){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (!w || !h){
        resolve({ w, h, brightness: 0, contrast: 0, sharpness: 0 });
        return;
      }
      const maxSide = 420;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx){
        resolve({ w, h, brightness: 0, contrast: 0, sharpness: 0 });
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch).data;
      let sum = 0;
      let sumSq = 0;
      let edge = 0;
      let prev = 0;
      let px = 0;
      for (let i = 0; i < data.length; i += 4){
        const lum = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);
        sum += lum;
        sumSq += lum * lum;
        if (px > 0) edge += Math.abs(lum - prev);
        prev = lum;
        px += 1;
      }
      const mean = sum / Math.max(1, px);
      const variance = Math.max(0, (sumSq / Math.max(1, px)) - (mean * mean));
      const contrast = Math.sqrt(variance);
      const sharpness = edge / Math.max(1, px);
      resolve({ w, h, brightness: mean, contrast, sharpness });
    };
    img.onerror = () => resolve({ w: 0, h: 0, brightness: 0, contrast: 0, sharpness: 0 });
    img.src = url;
  });
}

async function readImagesMeta(files){
  const imgs = Array.from(files || []).filter(f => f.type?.startsWith("image/"));
  if (!imgs.length) return { count: 0, avgMp: 0 };

  const metas = await Promise.all(imgs.map((file) => new Promise(async (resolve) => {
    const url = URL.createObjectURL(file);
    try {
      const info = await analyzeImage(url);
      resolve(info);
      URL.revokeObjectURL(url);
    } catch {
      resolve({ w: 0, h: 0, brightness: 0, contrast: 0, sharpness: 0 });
      URL.revokeObjectURL(url);
    }
  })));

  const avgPx = metas.reduce((s, m) => s + (m.w * m.h), 0) / metas.length;
  const avgBrightness = metas.reduce((s, m) => s + m.brightness, 0) / metas.length;
  const avgContrast = metas.reduce((s, m) => s + m.contrast, 0) / metas.length;
  const avgSharpness = metas.reduce((s, m) => s + m.sharpness, 0) / metas.length;
  return {
    count: metas.length,
    avgMp: avgPx ? (avgPx / 1000000) : 0,
    avgBrightness: Number(avgBrightness.toFixed(1)),
    avgContrast: Number(avgContrast.toFixed(1)),
    avgSharpness: Number(avgSharpness.toFixed(1)),
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
      <div class="quote-kpi"><span>Volum estimat m³</span><strong>${res.volM3.toFixed(6)} m³</strong></div>
      <div class="quote-kpi"><span>Timp printare</span><strong>~${res.printHours}h</strong></div>
      <div class="quote-kpi"><span>Incredere analiza</span><strong>${res.confidence}%</strong></div>
    </div>
    <div class="quote-price">
      <div class="quote-price-label">Pret estimativ inainte de postare</div>
      <div class="quote-price-value">${res.priceRange.low} - ${res.priceRange.high} RON</div>
      <p>Interval orientativ, calculat din text + imagini + dimensiuni. Pretul final vine din ofertele reale primite dupa postare.</p>
    </div>
    <div class="quote-needs"><strong>Costuri incluse:</strong> print efectiv ~${res.priceBreakdown.corePrintCost} RON · modelare/verificare ~${res.priceBreakdown.modelingCost} RON · setup/exploatare ~${res.priceBreakdown.setupCost} RON${res.priceBreakdown.riskCost ? ` · risc estimare din poze ~${res.priceBreakdown.riskCost} RON` : ""}${res.priceBreakdown.segmentationRiskCost ? ` · segmentare piesa mare ~${res.priceBreakdown.segmentationRiskCost} RON` : ""}${res.priceBreakdown.postProcessRiskCost ? ` · post-procesare detalii ~${res.priceBreakdown.postProcessRiskCost} RON` : ""}${res.priceBreakdown.failureRiskCost ? ` · buffer risc esec ~${res.priceBreakdown.failureRiskCost} RON` : ""}</div>
    <div class="quote-needs"><strong>Ce a inteles sistemul ca iti doresti:</strong> ${res.needs.join(" · ")}</div>
    <div class="quote-needs"><strong>Ce a extras din text:</strong> ${res.analysisSignals.keywordSignals.pieceType.length
      ? res.analysisSignals.keywordSignals.pieceType.map((g) => `${g.label} (${g.hits.join(", ")})`).join(" · ")
      : "fara cuvinte-cheie clare"} | <strong>Scop:</strong> ${res.analysisSignals.keywordSignals.objective.length
      ? res.analysisSignals.keywordSignals.objective.map((g) => `${g.label} (${g.hits.join(", ")})`).join(" · ")
      : "general"}</div>
    <div class="quote-needs"><strong>Ce vede in poze (metadate):</strong> ${res.analysisSignals.imageAnalysis.imageCount} imagine(i), ~${res.analysisSignals.imageAnalysis.avgMp} MP mediu, claritate ~${res.analysisSignals.imageAnalysis.avgSharpness}, contrast ~${res.analysisSignals.imageAnalysis.avgContrast}, acoperire: ${res.analysisSignals.imageAnalysis.coverage}, impact: ${res.analysisSignals.imageAnalysis.confidenceImpact}.</div>
    ${res.analysisSignals.stlAnalysis.enabled
      ? `<div class="quote-needs"><strong>Ce a extras din STL:</strong> ${res.analysisSignals.stlAnalysis.fileName} · ${res.analysisSignals.stlAnalysis.triangleCount} triunghiuri · gabarit ${res.analysisSignals.stlAnalysis.bbox} · volum mesh ~${res.analysisSignals.stlAnalysis.estimatedVolumeCm3} cm³ · suprafata ~${res.analysisSignals.stlAnalysis.estimatedAreaCm2} cm² · tip dedus: ${res.analysisSignals.stlAnalysis.inferredShape}.</div>`
      : `<div class="quote-needs"><strong>Analiza STL:</strong> Fara STL incarcat. Pentru estimare mai reala, adauga fisierul STL daca il ai.</div>`}
    <div class="quote-needs"><strong>Sugestie material:</strong> ${res.materialAdvice.recommendation} · ${res.materialAdvice.reasons.join(" ")}</div>
    <div class="quote-needs"><strong>Analiza probabilistica (${res.analysisSignals.scenarioInsights.simulationCount} scenarii):</strong> ${res.analysisSignals.scenarioInsights.likely.map((s) =>
      `${s.label} (${Math.round(s.probability * 100)}% | interval probabil ${s.p10}-${s.p90} RON)`
    ).join(" · ")}</div>
    <div class="quote-needs"><strong>Nivel acoperire date:</strong> ${res.analysisSignals.scenarioInsights.dataCoverage}%</div>
    ${res.analysisSignals.scenarioInsights.ambiguityQuestions.length
      ? `<div class="quote-needs"><strong>Intrebari pe care sistemul si le pune pentru acuratete mai buna:</strong> ${res.analysisSignals.scenarioInsights.ambiguityQuestions.join(" · ")}</div>`
      : ""}
    ${res.analysisSignals.riskNotes.length
      ? `<div class="quote-needs"><strong>Observatii/riscuri detectate:</strong> ${res.analysisSignals.riskNotes.join(" · ")}</div>`
      : ""}
    <div class="quote-needs"><strong>Multiplicatori folositi:</strong> ${res.analysisSignals.multipliers.map((m) => `${m.label} x${m.value.toFixed(2)}`).join(" · ")}</div>
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
    const qty = safeNum($("q_qty")?.value, 1);
    const lRaw = $("q_l")?.value;
    const wRaw = $("q_w")?.value;
    const hRaw = $("q_h")?.value;
    const hasDimensions = !!(String(lRaw || "").trim() && String(wRaw || "").trim() && String(hRaw || "").trim());
    const l = safeNum(lRaw, 60);
    const w = safeNum(wRaw, 40);
    const h = safeNum(hRaw, 20);
    const photos = $("q_photos")?.files || [];
    const stlFile = $("q_stl")?.files?.[0] || null;

    if (!title && !description && !photos.length && !stlFile) {
      alert("Adauga macar text scurt, poze sau fisier STL pentru estimare.");
      return;
    }

    const [meta, stlData] = await Promise.all([
      readImagesMeta(photos),
      parseStlFile(stlFile),
    ]);
    const result = estimateFromInput({
      title: title || "Piesa din poza",
      description: description || "Estimare bazata pe imagini si dimensiuni.",
      material,
      qty: Math.max(1, qty),
      l: Math.max(1, l), w: Math.max(1, w), h: Math.max(1, h),
      imageCount: meta.count,
      avgMp: meta.avgMp,
      avgBrightness: meta.avgBrightness,
      avgContrast: meta.avgContrast,
      avgSharpness: meta.avgSharpness,
      hasDimensions,
      stlData,
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
