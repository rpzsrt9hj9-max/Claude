// Simulateur d'isolation thermique — V2
// Chaque solution est une paroi multicouche. Le modèle traite chaque couche
// indépendamment (comme en V1, milieu semi-infini par couche) et compose :
//   - Résistance totale     : R_total = Σ R_i                (série, exact)
//   - Amortissement total   : μ_total = Π μ_i                (approximation :
//   - Déphasage total       : Δt_total = Σ Δt_i                on néglige les
// réflexions aux interfaces liées aux changements d'impédance thermique
// d'une couche à l'autre — approximation standard d'introduction, correcte
// tant que l'onde est déjà bien atténuée par les couches précédentes).
// Conséquence pratique : le résultat ne dépend pas de l'ordre des couches.

const PRESETS = [
  { label: "Personnalisé", lambda: null, rho: null, cp: null },
  { label: "Laine de verre", lambda: 0.035, rho: 20, cp: 1030 },
  { label: "Laine de roche", lambda: 0.038, rho: 60, cp: 1030 },
  { label: "Laine de bois (fibre de bois)", lambda: 0.040, rho: 150, cp: 2100 },
  { label: "Ouate de cellulose", lambda: 0.040, rho: 50, cp: 2000 },
  { label: "Polystyrène expansé (PSE)", lambda: 0.032, rho: 20, cp: 1450 },
  { label: "Polystyrène extrudé (XPS)", lambda: 0.030, rho: 30, cp: 1450 },
  { label: "Polyuréthane / PIR (PUR)", lambda: 0.024, rho: 35, cp: 1400 },
  { label: "Béton plein", lambda: 1.75, rho: 2300, cp: 1000 },
  { label: "Brique pleine", lambda: 0.90, rho: 1800, cp: 880 },
  { label: "Bois massif (résineux)", lambda: 0.15, rho: 500, cp: 1800 },
  { label: "Plaque de plâtre standard (BA13)", lambda: 0.25, rho: 750, cp: 1000 },
  { label: "Plaque de plâtre phonique (haute densité)", lambda: 0.30, rho: 950, cp: 1000 },
];

// index dans PRESETS pour préremplir les exemples de l'utilisateur
const P = {
  BRIQUE: 9,
  LAINE_ROCHE: 2,
  LAINE_BOIS: 3,
  PUR: 7,
};

const SOLUTION_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#a855f7"];

const el = (id) => document.getElementById(id);
const outdoorInputs = { tMax: el("t-max"), hMax: el("h-max"), tMin: el("t-min") };

const solutionsContainer = el("solutions-container");
const layerRowTemplate = el("layer-row-template");
const legendEl = el("legend");
const comparisonTbody = el("comparison-tbody");
const canvas = el("chart");
const ctx = canvas.getContext("2d");

function buildMaterialOptionsHTML() {
  return PRESETS.map((p, i) => `<option value="${i}">${p.label}</option>`).join("");
}

function createSolutionCard(index, name, enabled) {
  const card = document.createElement("div");
  card.className = "solution-card";
  card.dataset.solutionIndex = index;
  card.innerHTML = `
    <div class="solution-header">
      <span class="solution-swatch" style="background:${SOLUTION_COLORS[index]}"></span>
      <input type="checkbox" class="solution-enabled" ${enabled ? "checked" : ""}>
      <input type="text" class="solution-name" value="${name}">
    </div>
    <ul class="layers-list"></ul>
    <button class="add-layer-btn" type="button">+ Ajouter une couche</button>
    <div class="solution-summary"></div>
  `;
  return card;
}

function addLayerRow(layersList, presetIndex, thicknessCm) {
  const frag = layerRowTemplate.content.cloneNode(true);
  const li = frag.querySelector(".layer-row");
  const select = li.querySelector(".layer-material");
  select.innerHTML = buildMaterialOptionsHTML();
  select.value = presetIndex;
  const preset = PRESETS[presetIndex];
  li.querySelector(".layer-lambda").value = preset.lambda ?? "";
  li.querySelector(".layer-rho").value = preset.rho ?? "";
  li.querySelector(".layer-cp").value = preset.cp ?? "";
  li.querySelector(".layer-thickness").value = thicknessCm;
  layersList.appendChild(li);
}

function initSolutions() {
  const defs = [
    { name: "Solution A", enabled: true, layers: [[P.BRIQUE, 20], [P.LAINE_ROCHE, 10]] },
    { name: "Solution B", enabled: true, layers: [[P.BRIQUE, 10], [P.LAINE_BOIS, 14], [P.PUR, 6]] },
    { name: "Solution C", enabled: false, layers: [] },
    { name: "Solution D", enabled: false, layers: [] },
  ];
  defs.forEach((def, i) => {
    const card = createSolutionCard(i, def.name, def.enabled);
    solutionsContainer.appendChild(card);
    const layersList = card.querySelector(".layers-list");
    if (def.layers.length === 0) {
      addLayerRow(layersList, 1, 10); // une couche par défaut pour démarrer
    } else {
      def.layers.forEach(([preset, thickness]) => addLayerRow(layersList, preset, thickness));
    }
  });
}

solutionsContainer.addEventListener("click", (e) => {
  if (e.target.matches(".add-layer-btn")) {
    const card = e.target.closest(".solution-card");
    addLayerRow(card.querySelector(".layers-list"), 1, 10);
    recompute();
  } else if (e.target.matches(".layer-remove")) {
    e.target.closest(".layer-row").remove();
    recompute();
  }
});

solutionsContainer.addEventListener("change", (e) => {
  if (e.target.matches(".layer-material")) {
    const idx = Number(e.target.value);
    const preset = PRESETS[idx];
    if (preset.lambda !== null) {
      const row = e.target.closest(".layer-row");
      row.querySelector(".layer-lambda").value = preset.lambda;
      row.querySelector(".layer-rho").value = preset.rho;
      row.querySelector(".layer-cp").value = preset.cp;
    }
    recompute();
  } else if (e.target.matches(".solution-enabled")) {
    recompute();
  }
});

solutionsContainer.addEventListener("input", (e) => {
  if (e.target.matches(".layer-lambda, .layer-rho, .layer-cp")) {
    e.target.closest(".layer-row").querySelector(".layer-material").value = 0; // Personnalisé
    recompute();
  } else if (e.target.matches(".layer-thickness")) {
    recompute();
  } else if (e.target.matches(".solution-name")) {
    recompute();
  }
});

Object.values(outdoorInputs).forEach((input) => input.addEventListener("input", recompute));

const OMEGA = (2 * Math.PI) / (24 * 3600); // rad/s, période de 24h
const OMEGA_HOUR = (2 * Math.PI) / 24; // rad/heure, pour l'affichage

function layerContribution(lambda, rho, cp, thicknessCm) {
  const e = thicknessCm / 100;
  const R = e / lambda;
  const alpha = lambda / (rho * cp);
  const delta = Math.sqrt((2 * alpha) / OMEGA);
  const mu = Math.exp(-e / delta);
  const phaseHours = (e / delta / OMEGA) / 3600;
  return { R, mu, phaseHours, thicknessCm };
}

function computeSolution(card) {
  const rows = [...card.querySelectorAll(".layer-row")];
  if (rows.length === 0) return null;

  let R = 0;
  let mu = 1;
  let phaseHours = 0;
  let thicknessCm = 0;

  for (const row of rows) {
    const lambda = parseFloat(row.querySelector(".layer-lambda").value);
    const rho = parseFloat(row.querySelector(".layer-rho").value);
    const cp = parseFloat(row.querySelector(".layer-cp").value);
    const thickness = parseFloat(row.querySelector(".layer-thickness").value);
    const valid =
      Number.isFinite(lambda) && lambda > 0 &&
      Number.isFinite(rho) && rho > 0 &&
      Number.isFinite(cp) && cp > 0 &&
      Number.isFinite(thickness) && thickness > 0;
    if (!valid) return null;
    const c = layerContribution(lambda, rho, cp, thickness);
    R += c.R;
    mu *= c.mu;
    phaseHours += c.phaseHours;
    thicknessCm += c.thicknessCm;
  }

  return { R, mu, phaseHours, thicknessCm };
}

function computeOutdoor() {
  const tMax = parseFloat(outdoorInputs.tMax.value);
  const hMax = parseFloat(outdoorInputs.hMax.value);
  const tMin = parseFloat(outdoorInputs.tMin.value);
  if (![tMax, hMax, tMin].every(Number.isFinite)) return null;
  return { tMean: (tMax + tMin) / 2, amplitude0: (tMax - tMin) / 2, hMax };
}

function outdoorTemp(tHours, outdoor) {
  return outdoor.tMean + outdoor.amplitude0 * Math.cos(OMEGA_HOUR * (tHours - outdoor.hMax));
}

function solutionIndoorTemp(tHours, outdoor, sol) {
  const amplitudeInt = outdoor.amplitude0 * sol.mu;
  return outdoor.tMean + amplitudeInt * Math.cos(OMEGA_HOUR * (tHours - outdoor.hMax - sol.phaseHours));
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "–");

function fmtHour(h) {
  let hh = ((h % 24) + 24) % 24;
  const wholeH = Math.floor(hh);
  const mm = Math.round((hh - wholeH) * 60);
  return `${String(wholeH).padStart(2, "0")}h${String(mm).padStart(2, "0")}`;
}

function getSolutionState(card, outdoor) {
  const index = Number(card.dataset.solutionIndex);
  const enabled = card.querySelector(".solution-enabled").checked;
  const name = card.querySelector(".solution-name").value || `Solution ${index + 1}`;
  const sol = computeSolution(card);
  const summaryEl = card.querySelector(".solution-summary");

  if (!sol) {
    summaryEl.textContent = "Renseigne au moins une couche avec des paramètres valides.";
  } else {
    const amplitudeInt = outdoor ? outdoor.amplitude0 * sol.mu : null;
    summaryEl.textContent =
      `Épaisseur totale ${fmt(sol.thicknessCm, 1)} cm · R = ${fmt(sol.R, 2)} m².K/W · ` +
      `amortissement μ = ${fmt(sol.mu, 3)} (${(sol.mu * 100).toFixed(1)} % conservé) · ` +
      `déphasage ${fmt(sol.phaseHours, 1)} h` +
      (amplitudeInt !== null ? ` · amplitude intérieure ± ${fmt(amplitudeInt, 2)} °C` : "");
  }

  return { index, enabled, name, sol, color: SOLUTION_COLORS[index] };
}

function updateLegend(outdoor, activeSolutions) {
  legendEl.innerHTML = "";
  const items = [{ color: "#3b82f6", label: "Température extérieure" }];
  activeSolutions.forEach((s) => items.push({ color: s.color, label: s.name }));
  items.forEach(({ color, label }) => {
    const span = document.createElement("span");
    span.className = "legend-item";
    span.innerHTML = `<span class="swatch" style="background:${color}"></span>${label}`;
    legendEl.appendChild(span);
  });
}

function updateTable(outdoor, allSolutions) {
  comparisonTbody.innerHTML = "";
  const shown = allSolutions.filter((s) => s.enabled);
  if (shown.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="empty-row" colspan="7">Coche au moins une solution pour la voir apparaître ici.</td>`;
    comparisonTbody.appendChild(tr);
    return;
  }
  shown.forEach((s) => {
    const tr = document.createElement("tr");
    if (!s.sol || !outdoor) {
      tr.innerHTML = `<td>${s.name}</td><td class="empty-row" colspan="6">Paramètres invalides ou incomplets</td>`;
    } else {
      const amplitudeInt = outdoor.amplitude0 * s.sol.mu;
      const peakHour = outdoor.hMax + s.sol.phaseHours;
      tr.innerHTML = `
        <td><span class="swatch" style="background:${s.color}"></span> ${s.name}</td>
        <td>${fmt(s.sol.thicknessCm, 1)} cm</td>
        <td>${fmt(s.sol.R, 2)} m².K/W</td>
        <td>${(s.sol.mu * 100).toFixed(1)} %</td>
        <td>${fmt(s.sol.phaseHours, 1)} h</td>
        <td>± ${fmt(amplitudeInt, 2)} °C</td>
        <td>${fmtHour(peakHour)}</td>
      `;
    }
    comparisonTbody.appendChild(tr);
  });
}

function drawChart(outdoor, activeSolutions) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padLeft = 55;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "#3a3f4b" : "#dde1e8";
  const textColor = isDark ? "#c7cbd4" : "#3d4148";
  const axisColor = isDark ? "#5a5f6b" : "#9aa0ab";

  if (!outdoor) {
    ctx.fillStyle = textColor;
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Renseigne des paramètres extérieurs valides pour afficher les courbes.", padLeft, H / 2);
    return;
  }

  const totalHours = 48;
  const nSamples = 480;
  const times = [];
  for (let i = 0; i <= nSamples; i++) times.push((i / nSamples) * totalHours);

  const outdoorSeries = times.map((t) => outdoorTemp(t, outdoor));
  const solutionSeries = activeSolutions
    .filter((s) => s.sol)
    .map((s) => ({ color: s.color, values: times.map((t) => solutionIndoorTemp(t, outdoor, s.sol)) }));

  let yMin = Math.min(...outdoorSeries);
  let yMax = Math.max(...outdoorSeries);
  solutionSeries.forEach((s) => {
    yMin = Math.min(yMin, ...s.values);
    yMax = Math.max(yMax, ...s.values);
  });
  const yPad = Math.max(1, (yMax - yMin) * 0.15);
  yMin -= yPad;
  yMax += yPad;

  const xToPx = (t) => padLeft + (t / totalHours) * plotW;
  const yToPx = (v) => padTop + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = gridColor;
  ctx.fillStyle = textColor;
  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  const yStep = niceStep((yMax - yMin) / 5);
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const py = yToPx(v);
    ctx.beginPath();
    ctx.moveTo(padLeft, py);
    ctx.lineTo(padLeft + plotW, py);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${v.toFixed(0)}°C`, padLeft - 8, py);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let h = 0; h <= totalHours; h += 6) {
    const px = xToPx(h);
    ctx.beginPath();
    ctx.moveTo(px, padTop);
    ctx.lineTo(px, padTop + plotH);
    ctx.stroke();
    const clock = h % 24;
    ctx.fillText(`${h}h (${clock}h)`, px, padTop + plotH + 8);
  }

  ctx.strokeStyle = axisColor;
  ctx.beginPath();
  ctx.moveTo(xToPx(24), padTop);
  ctx.lineTo(xToPx(24), padTop + plotH);
  ctx.stroke();

  function drawSeries(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    values.forEach((v, i) => {
      const px = xToPx(times[i]);
      const py = yToPx(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  drawSeries(outdoorSeries, "#3b82f6");
  solutionSeries.forEach((s) => drawSeries(s.values, s.color));
}

function niceStep(rough) {
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow10;
  let step;
  if (n < 1.5) step = 1;
  else if (n < 3) step = 2;
  else if (n < 7) step = 5;
  else step = 10;
  return step * pow10;
}

function recompute() {
  const outdoor = computeOutdoor();
  const cards = [...solutionsContainer.querySelectorAll(".solution-card")];
  const allSolutions = cards.map((card) => getSolutionState(card, outdoor));
  const activeSolutions = allSolutions.filter((s) => s.enabled && s.sol);

  updateLegend(outdoor, activeSolutions);
  updateTable(outdoor, allSolutions);
  drawChart(outdoor, activeSolutions);
}

initSolutions();
recompute();
