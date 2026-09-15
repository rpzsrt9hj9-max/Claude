const STORAGE_KEY = "pret-immo-app-state";

const NOTAIRE_DEFAULTS = { ancien: 8, neuf: 3 };

const el = (id) => document.getElementById(id);

const inputs = {
  prixAffiche: el("prix-affiche"),
  prixNegocie: el("prix-negocie"),
  montantPretSimple: el("montant-pret-simple"),
  prixAchat: el("prix-achat"),
  fraisAgence: el("frais-agence"),
  tauxNotaire: el("taux-notaire"),
  montantNotaire: el("montant-notaire"),
  travaux: el("travaux"),
  fraisDossier: el("frais-dossier"),
  apport: el("apport"),
  tauxInteret: el("taux-interet"),
  dureeMois: el("duree-mois"),
  differeMois: el("differe-mois"),
};

const els = {
  negotiationResult: el("negotiation-result"),
  negotiationPercent: el("negotiation-percent"),
  negotiationDiff: el("negotiation-diff"),
  modeSimple: el("mode-simple"),
  modeDetail: el("mode-detail"),
  panelSimple: el("panel-simple"),
  panelDetail: el("panel-detail"),
  montantPretDetail: el("montant-pret-detail"),
  notaireToggle: el("notaire-toggle"),
  dureeNote: el("duree-note"),
  differeToggle: el("differe-toggle"),
  differeDureeRow: el("differe-duree-row"),
  differeHint: el("differe-hint"),
  resCapital: el("res-capital"),
  resMensualite: el("res-mensualite"),
  resMensualiteDiffereItem: el("res-mensualite-differe-item"),
  resMensualiteDiffere: el("res-mensualite-differe"),
  resInterets: el("res-interets"),
  resCoutTotal: el("res-cout-total"),
  amortTbody: el("amort-tbody"),
  btnExportCsv: el("btn-export-csv"),
  btnExportPdf: el("btn-export-pdf"),
  printView: el("print-view"),
};

let montantMode = "detail"; // "simple" | "detail"
let notaireType = "ancien"; // "ancien" | "neuf" | "custom"
let differeType = "aucun"; // "aucun" | "partiel" | "total"
let lastResult = null;

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurFmt2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function num(input) {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? v : 0;
}

function setReadonly(input, value) {
  input.value = Math.round(value * 100) / 100;
}

// ---------- Négociation ----------

function updatePrixRetenu() {
  const affiche = num(inputs.prixAffiche);
  const negocie = num(inputs.prixNegocie);
  const retenu = negocie > 0 ? negocie : affiche;

  if (negocie > 0 && affiche > 0) {
    const diff = affiche - negocie;
    const pct = (diff / affiche) * 100;
    els.negotiationResult.classList.remove("hidden");
    els.negotiationPercent.textContent = `${pctFmt.format(pct)} %`;
    els.negotiationDiff.textContent = eurFmt.format(Math.abs(diff));
  } else {
    els.negotiationResult.classList.add("hidden");
  }

  setReadonly(inputs.prixAchat, retenu);
  return retenu;
}

// ---------- Montant du prêt ----------

function setMontantMode(mode) {
  montantMode = mode;
  els.modeSimple.classList.toggle("active", mode === "simple");
  els.modeDetail.classList.toggle("active", mode === "detail");
  els.panelSimple.classList.toggle("hidden", mode !== "simple");
  els.panelDetail.classList.toggle("hidden", mode !== "detail");
  recalculate();
  saveState();
}

function setNotaireType(type, { keepCustomValue = false } = {}) {
  notaireType = type;
  [...els.notaireToggle.querySelectorAll(".chip")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.notaireType === type);
  });
  if (type !== "custom" && !keepCustomValue) {
    inputs.tauxNotaire.value = NOTAIRE_DEFAULTS[type];
  }
}

function computeMontantPret(prixRetenu) {
  const tauxNotaire = num(inputs.tauxNotaire);
  const montantNotaire = (prixRetenu * tauxNotaire) / 100;
  setReadonly(inputs.montantNotaire, montantNotaire);

  const fraisAgence = num(inputs.fraisAgence);
  const travaux = num(inputs.travaux);
  const fraisDossier = num(inputs.fraisDossier);
  const apport = num(inputs.apport);

  const montantDetail = Math.max(0, prixRetenu + fraisAgence + montantNotaire + travaux + fraisDossier - apport);
  els.montantPretDetail.textContent = eurFmt.format(montantDetail);

  return montantMode === "simple" ? Math.max(0, num(inputs.montantPretSimple)) : montantDetail;
}

// ---------- Différé ----------

function setDiffereType(type) {
  differeType = type;
  [...els.differeToggle.querySelectorAll(".chip")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.differeType === type);
  });
  els.differeDureeRow.classList.toggle("hidden", type === "aucun");

  const hints = {
    aucun: "Aucun différé : le remboursement du capital et des intérêts démarre dès le premier mois.",
    partiel: "Différé partiel : seuls les intérêts sont payés pendant le différé, le capital reste intact puis s'amortit ensuite.",
    total: "Différé total : aucune mensualité pendant le différé. Les intérêts s'accumulent et s'ajoutent au capital à rembourser.",
  };
  els.differeHint.textContent = hints[type];

  if (type === "aucun") {
    inputs.differeMois.value = 0;
  } else if (num(inputs.differeMois) === 0) {
    inputs.differeMois.value = 12;
  }
}

// ---------- Amortissement ----------

function computeAmortization({ capital, tauxAnnuelPct, dureeMoisTotal, differeType, differeMois }) {
  const i = tauxAnnuelPct / 100 / 12;
  const dureeTotal = Math.max(1, Math.round(dureeMoisTotal));
  const nDiffere = differeType === "aucun" ? 0 : Math.max(0, Math.min(Math.round(differeMois), dureeTotal - 1));
  const nAmort = dureeTotal - nDiffere;

  const rows = [];
  let capitalRestant = capital;
  let mensualiteDiffere = 0;

  for (let m = 1; m <= nDiffere; m++) {
    const interet = capitalRestant * i;
    let mensualite;
    let capitalRembourse;
    let fin;
    if (differeType === "total") {
      mensualite = 0;
      capitalRembourse = 0;
      fin = capitalRestant + interet;
    } else {
      mensualite = interet;
      capitalRembourse = 0;
      fin = capitalRestant;
    }
    if (m === 1) mensualiteDiffere = mensualite;
    rows.push({ mois: m, debut: capitalRestant, interet, capital: capitalRembourse, mensualite, fin, phase: "differe" });
    capitalRestant = fin;
  }

  const mensualiteAmort = nAmort > 0
    ? (i === 0 ? capitalRestant / nAmort : (capitalRestant * i) / (1 - Math.pow(1 + i, -nAmort)))
    : 0;

  for (let m = 1; m <= nAmort; m++) {
    const interet = capitalRestant * i;
    let mensualite = mensualiteAmort;
    let capitalRembourse = mensualite - interet;
    let fin = capitalRestant - capitalRembourse;
    if (m === nAmort) {
      capitalRembourse = capitalRestant;
      fin = 0;
      mensualite = capitalRembourse + interet;
    }
    rows.push({ mois: nDiffere + m, debut: capitalRestant, interet, capital: capitalRembourse, mensualite, fin, phase: "amortissement" });
    capitalRestant = fin;
  }

  const totalInterets = rows.reduce((s, r) => s + r.interet, 0);
  const coutTotal = capital + totalInterets;

  return { rows, totalInterets, coutTotal, mensualiteAmort, mensualiteDiffere, nDiffere, nAmort };
}

// ---------- Rendu ----------

function renderTable(rows) {
  const html = rows.map((r) => `
    <tr class="${r.phase === "differe" ? "phase-differe" : ""}">
      <td>${r.mois}</td>
      <td>${eurFmt2.format(r.debut)}</td>
      <td>${eurFmt2.format(r.interet)}</td>
      <td>${eurFmt2.format(r.capital)}</td>
      <td>${eurFmt2.format(r.mensualite)}</td>
      <td>${eurFmt2.format(Math.max(0, r.fin))}</td>
    </tr>`).join("");
  els.amortTbody.innerHTML = html;
}

function renderResults(capital, result) {
  els.resCapital.textContent = eurFmt.format(capital);
  els.resMensualite.textContent = eurFmt2.format(result.mensualiteAmort);
  els.resInterets.textContent = eurFmt.format(result.totalInterets);
  els.resCoutTotal.textContent = eurFmt.format(result.coutTotal);

  const showDiffere = differeType === "partiel" && result.nDiffere > 0;
  els.resMensualiteDiffereItem.classList.toggle("hidden", !showDiffere);
  if (showDiffere) {
    els.resMensualiteDiffere.textContent = eurFmt2.format(result.mensualiteDiffere);
  }
}

function recalculate() {
  const prixRetenu = updatePrixRetenu();
  const capital = computeMontantPret(prixRetenu);

  const dureeMoisTotal = Math.max(1, Math.round(num(inputs.dureeMois)));
  const years = Math.floor(dureeMoisTotal / 12);
  const months = dureeMoisTotal % 12;
  els.dureeNote.textContent = `= ${years} an${years > 1 ? "s" : ""}${months ? ` et ${months} mois` : ""}`;

  if (differeType !== "aucun") {
    const maxDiffere = dureeMoisTotal - 1;
    if (num(inputs.differeMois) > maxDiffere) {
      inputs.differeMois.value = Math.max(0, maxDiffere);
    }
  }

  const result = computeAmortization({
    capital,
    tauxAnnuelPct: num(inputs.tauxInteret),
    dureeMoisTotal,
    differeType,
    differeMois: num(inputs.differeMois),
  });

  lastResult = { capital, prixRetenu, dureeMoisTotal, result };

  renderResults(capital, result);
  renderTable(result.rows);
}

// ---------- Persistance ----------

function saveState() {
  const state = { montantMode, notaireType, differeType, values: {} };
  Object.entries(inputs).forEach(([key, input]) => {
    if (!input.readOnly) state.values[key] = input.value;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const state = JSON.parse(raw);
    Object.entries(state.values || {}).forEach(([key, value]) => {
      if (inputs[key] && !inputs[key].readOnly) inputs[key].value = value;
    });
    setMontantModeSilent(state.montantMode === "simple" ? "simple" : "detail");
    setNotaireType(state.notaireType === "neuf" || state.notaireType === "custom" ? state.notaireType : "ancien", { keepCustomValue: true });
    setDiffereType(["partiel", "total"].includes(state.differeType) ? state.differeType : "aucun");
    return true;
  } catch {
    return false;
  }
}

function setMontantModeSilent(mode) {
  montantMode = mode;
  els.modeSimple.classList.toggle("active", mode === "simple");
  els.modeDetail.classList.toggle("active", mode === "detail");
  els.panelSimple.classList.toggle("hidden", mode !== "simple");
  els.panelDetail.classList.toggle("hidden", mode !== "detail");
}

// ---------- Export CSV ----------

function csvNum(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

function differeLabel() {
  if (differeType === "aucun") return "Aucun";
  const label = differeType === "partiel" ? "Partiel" : "Total";
  return `${label} (${Math.round(num(inputs.differeMois))} mois)`;
}

function exportCsv() {
  if (!lastResult) return;
  const { capital, prixRetenu, dureeMoisTotal, result } = lastResult;
  const lines = [];
  const push = (...cols) => lines.push(cols.join(";"));

  push("Calculateur de prêt immobilier");
  push("Date d'export", new Date().toLocaleDateString("fr-FR"));
  push("");
  push("Paramètres du prêt");
  if (montantMode === "detail") {
    push("Prix d'achat retenu (€)", csvNum(prixRetenu));
    push("Frais d'agence (€)", csvNum(num(inputs.fraisAgence)));
    push("Taux frais de notaire (%)", csvNum(num(inputs.tauxNotaire)));
    push("Frais de notaire (€)", csvNum(num(inputs.montantNotaire)));
    push("Travaux estimés (€)", csvNum(num(inputs.travaux)));
    push("Frais de dossier (€)", csvNum(num(inputs.fraisDossier)));
    push("Apport personnel (€)", csvNum(num(inputs.apport)));
  }
  push("Montant du prêt (€)", csvNum(capital));
  push("Taux d'intérêt annuel (%)", csvNum(num(inputs.tauxInteret)));
  push("Durée totale (mois)", dureeMoisTotal);
  push("Différé", differeLabel());
  push("Mensualité hors différé (€)", csvNum(result.mensualiteAmort));
  push("Total des intérêts (€)", csvNum(result.totalInterets));
  push("Coût total du crédit (€)", csvNum(result.coutTotal));
  push("");
  push("Tableau d'amortissement");
  push("Mois", "Capital dû début (€)", "Intérêts (€)", "Capital remboursé (€)", "Mensualité (€)", "Capital dû fin (€)");
  result.rows.forEach((r) => {
    push(r.mois, csvNum(r.debut), csvNum(r.interet), csvNum(r.capital), csvNum(r.mensualite), csvNum(Math.max(0, r.fin)));
  });

  const csvContent = "﻿" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tableau-amortissement-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Export PDF (impression navigateur) ----------

function exportPdf() {
  if (!lastResult) return;
  const { capital, prixRetenu, dureeMoisTotal, result } = lastResult;

  const params = [];
  if (montantMode === "detail") {
    params.push(["Prix d'achat retenu", eurFmt.format(prixRetenu)]);
    params.push(["Frais d'agence", eurFmt.format(num(inputs.fraisAgence))]);
    params.push(["Frais de notaire", `${eurFmt.format(num(inputs.montantNotaire))} (${csvNum(num(inputs.tauxNotaire)).replace(",", ".")} %)`]);
    params.push(["Travaux estimés", eurFmt.format(num(inputs.travaux))]);
    params.push(["Frais de dossier", eurFmt.format(num(inputs.fraisDossier))]);
    params.push(["Apport personnel", eurFmt.format(num(inputs.apport))]);
  }
  params.push(["Montant du prêt", eurFmt.format(capital)]);
  params.push(["Taux d'intérêt annuel", `${csvNum(num(inputs.tauxInteret)).replace(",", ".")} %`]);
  params.push(["Durée totale", `${dureeMoisTotal} mois`]);
  params.push(["Différé", differeLabel()]);
  params.push(["Mensualité (hors différé)", eurFmt2.format(result.mensualiteAmort)]);
  params.push(["Total des intérêts", eurFmt.format(result.totalInterets)]);
  params.push(["Coût total du crédit", eurFmt.format(result.coutTotal)]);

  const paramsHtml = params.map(([label, value]) =>
    `<div><span class="label">${label}</span><span>${value}</span></div>`).join("");

  const rowsHtml = result.rows.map((r) => `
    <tr>
      <td>${r.mois}</td>
      <td>${eurFmt2.format(r.debut)}</td>
      <td>${eurFmt2.format(r.interet)}</td>
      <td>${eurFmt2.format(r.capital)}</td>
      <td>${eurFmt2.format(r.mensualite)}</td>
      <td>${eurFmt2.format(Math.max(0, r.fin))}</td>
    </tr>`).join("");

  els.printView.innerHTML = `
    <h1>Calculateur de prêt immobilier</h1>
    <p class="print-sub">Édité le ${new Date().toLocaleDateString("fr-FR")}</p>
    <h2>Hypothèses du prêt</h2>
    <div class="print-params">${paramsHtml}</div>
    <h2>Tableau d'amortissement</h2>
    <table>
      <thead>
        <tr>
          <th>Mois</th>
          <th>Capital dû (début)</th>
          <th>Intérêts</th>
          <th>Capital remboursé</th>
          <th>Mensualité</th>
          <th>Capital dû (fin)</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  window.print();
}

// ---------- Événements ----------

els.modeSimple.addEventListener("click", () => setMontantMode("simple"));
els.modeDetail.addEventListener("click", () => setMontantMode("detail"));

els.notaireToggle.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    setNotaireType(btn.dataset.notaireType);
    recalculate();
    saveState();
  });
});

inputs.tauxNotaire.addEventListener("input", () => {
  if (notaireType !== "custom") setNotaireType("custom", { keepCustomValue: true });
  recalculate();
  saveState();
});

els.differeToggle.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    setDiffereType(btn.dataset.differeType);
    recalculate();
    saveState();
  });
});

Object.values(inputs).forEach((input) => {
  if (input === inputs.tauxNotaire || input.readOnly) return;
  input.addEventListener("input", () => {
    recalculate();
    saveState();
  });
});

els.btnExportCsv.addEventListener("click", exportCsv);
els.btnExportPdf.addEventListener("click", exportPdf);

// ---------- Initialisation ----------

function setDefaults() {
  inputs.prixAffiche.value = 250000;
  inputs.fraisAgence.value = 0;
  inputs.tauxNotaire.value = NOTAIRE_DEFAULTS.ancien;
  inputs.travaux.value = 0;
  inputs.fraisDossier.value = 800;
  inputs.apport.value = 20000;
  inputs.tauxInteret.value = 3.5;
  inputs.dureeMois.value = 240;
  inputs.differeMois.value = 0;
}

setDefaults();
const restored = loadState();
if (!restored) {
  setNotaireType("ancien");
  setDiffereType("aucun");
}
recalculate();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("service-worker.js", {
        updateViaCache: "none",
      });

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            window.location.reload();
          }
        });
      });

      reg.update();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update();
        }
      });
    } catch {
      // service worker unavailable, app still works without offline caching
    }
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}
