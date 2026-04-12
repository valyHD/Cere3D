// cereri-filters.js (FINAL) — filtre locale peste lista din cereri-feed.js
// IMPORTANT: nu mai randam HTML aici. Trimitem lista filtrata catre cereri-feed.js prin events.

function $(id){ return document.getElementById(id); }

function norm(s){
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// parse buget din texte de genul "Sub 50", "50–100", "100–200", "Peste 200"
function parseBudgetRange(b){
  const x = norm(b);
  if(!x) return null;
  if (x.includes("nu stiu")) return null;

  // suport pentru formatul din cereri.html (Sub 50 lei / 50–100 lei etc.)
  if (x.includes("sub 50")) return { min: 0, max: 50 };
  if (x.includes("50") && x.includes("100")) return { min: 50, max: 100 };
  if (x.includes("100") && x.includes("200")) return { min: 100, max: 200 };
  if (x.includes("peste 200")) return { min: 200, max: Infinity };

  // suport pentru formatul din cere.html (Sub 50 / 50–100 / ...)
  if (x === "sub 50") return { min: 0, max: 50 };
  if (x === "50–100" || x === "50-100") return { min: 50, max: 100 };
  if (x === "100–200" || x === "100-200") return { min: 100, max: 200 };
  if (x.includes("peste 200")) return { min: 200, max: Infinity };

  return null;
}

// extrage prima cifra din string buget user (daca user scrie "150 lei" etc.)
function extractBudgetNumber(b){
  const m = (b ?? "").toString().match(/(\d+([.,]\d+)?)/);
  if(!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function matchesBudget(docBudget, selectedBudget){
  const range = parseBudgetRange(selectedBudget);
  if(!range) return true; // daca nu filtrezi buget

  const n = extractBudgetNumber(docBudget);
  if(n == null) return false;

  return n >= range.min && n <= range.max;
}

function matchesMaterial(docMaterial, selectedMaterial){
  const s = norm(selectedMaterial);
  if(!s) return true;
  return norm(docMaterial).includes(s);
}

function matchesDeadline(docDeadline, selectedDeadline){
  const s = norm(selectedDeadline);
  if(!s) return true;
  return norm(docDeadline) === s;
}

function matchesQueryText(doc, q){
  const qq = norm(q);
  if(!qq) return true;

  const blob = [
    doc.title,
    doc.description,
    doc.category,
    // doc.material,   // SCOATE linia asta
    doc.city,
    doc.county
  ].map(norm).join(" ");

  return blob.includes(qq);
}

// oras: prefix match pe cityLower (diacritice off)
function matchesCity(docCityLower, inputCity){
  const c = norm(inputCity);
  if(!c) return true;
  const d = (docCityLower ?? "").toString();
  return d.startsWith(c) || d.includes(c);
}

function matchesCounty(docCounty, selectedCounty){
  const c = norm(selectedCounty);
  if(!c) return true;
  return norm(docCounty) === c;
}

export function initCereriFilters(){
  const qEl = $("f_q");
  const countyEl = $("f_county");     // optional (daca ai judet select)
  const cityEl = $("f_city");         // optional (oras select / input)
  const deadlineEl = $("f_deadline");
  const budgetEl = $("f_budget");

  const btnApply = $("btnApplyFilters");
  const btnReset = $("btnResetFilters");
  const statusEl = $("cereriStatus");

  function setStatus(t){
    if(statusEl) statusEl.textContent = t || "";
  }

  function getLoadedList(){
    // lista principala incarcata de cereri-feed.js
    const list = window.__CERERI_ALL__;
    return Array.isArray(list) ? list : [];
  }

  function apply(){
    try{
      const loaded = getLoadedList();
      if(!loaded.length){
        setStatus("Se incarca cererile...");
        return;
      }

      const qText   = qEl ? qEl.value : "";
      const county  = countyEl ? countyEl.value : "";
      const city    = cityEl ? cityEl.value : "";
      const deadline= deadlineEl ? deadlineEl.value : "";
      const budget  = budgetEl ? budgetEl.value : "";

      const filtered = loaded.filter(r => {
        if(!matchesQueryText(r, qText)) return false;
        if(!matchesCounty(r.county || "", county)) return false;
        if(!matchesDeadline(r.deadline, deadline)) return false;
        if(!matchesBudget(r.budget, budget)) return false;

        if(city){
          const cl = r.cityLower || norm(r.city || "");
          if(!matchesCity(cl, city)) return false;
        }

        return true;
      });

      // Trimitem lista filtrata catre cereri-feed.js (care randeaza IDENTIC)
      window.dispatchEvent(new CustomEvent("cereri:filter", { detail: filtered }));

      setStatus(filtered.length
        ? `Afisez ${filtered.length} cereri (din ${loaded.length} incarcate).`
        : `Nu am gasit rezultate. Incearca sa scoti unele filtre.`
      );
    }catch(err){
      console.warn("[cereri-filters] apply failed:", err);
      setStatus("Eroare: " + (err?.message || String(err)));
    }
  }

  function reset(){
    if(qEl) qEl.value = "";
    if(countyEl) countyEl.value = "";
    if(cityEl) cityEl.value = "";
    if(deadlineEl) deadlineEl.value = "";
    if(budgetEl) budgetEl.value = "";

    window.dispatchEvent(new CustomEvent("cereri:filterReset"));
    setStatus("");

    // optional: reaplica (afiseaza lista completa deja incarcata)
    apply();
  }

  if(btnApply) btnApply.addEventListener("click", apply);
  if(btnReset) btnReset.addEventListener("click", reset);

  // aplica la change + input (cauta live)
  [countyEl, cityEl, deadlineEl, budgetEl].forEach(el => {
    if(!el) return;
    el.addEventListener("change", apply);
  });

  if(qEl){
    let t = null;
    qEl.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(apply, 150);
    });
  }

  // IMPORTANT:
  // Cand cereri-feed.js incarca pagini noi, trimite event "cereri:updated".
  // Reaplicam filtrele automat ca sa includa si cererile noi.
  window.addEventListener("cereri:updated", () => {
    // daca user a setat ceva (oricare filtru), reaplica.
    const any =
      (qEl && qEl.value.trim()) ||
      (countyEl && countyEl.value) ||
      (cityEl && cityEl.value.trim()) ||
      (deadlineEl && deadlineEl.value) ||
      (budgetEl && budgetEl.value);

    if(any) apply();
  });

  // initial: doar afiseaza status daca nu sunt cereri inca
  apply();
}