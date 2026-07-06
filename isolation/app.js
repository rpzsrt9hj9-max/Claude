// Simulateur d'isolation thermique
// Modèle : mur homogène assimilé à un milieu semi-infini soumis à une
// température de surface sinusoïdale (régime périodique établi).
// T(x,t) = Tmoy + A0 * exp(-x/delta) * cos(omega*(t - hMax) - x/delta)
// avec delta = sqrt(2*alpha/omega), alpha = lambda/(rho*Cp)

const PRESETS = [
  { label: "Personnalisé", lambda: null, rho: null, cp: null },
  { label: "Laine de verre", lambda: 0.035, rho: 20, cp: 1030 },
  { label: "Laine de roche", lambda: 0.038, rho: 60, cp: 1030 },
  { label: "Laine de bois (fibre de bois)", lambda: 0.040, rho: 150, cp: 2100 },
  { label: "Ouate de cellulose", lambda: 0.040, rho: 50, cp: 2000 },
  { label: "Polystyrène expansé (PSE)", lambda: 0.032, rho: 20, cp: 1450 },
  { label: "Polystyrène extrudé (XPS)", lambda: 0.030, rho: 30, cp: 1450 },
  { label: "Polyuréthane (PUR)", lambda: 0.024, rho: 35, cp: 1400 },
  { label: "Béton plein", lambda: 1.75, rho: 2300, cp: 1000 },
  { label: "Brique pleine", lambda: 0.90, rho: 1800, cp: 880 },
  { label: "Bois massif (résineux)", lambda: 0.15, rho: 500, cp: 1800 },
];

const el = (id) => document.getElementById(id);

const inputs = {
  tMax: el("t-max"),
  hMax: el("h-max"),
  tMin: el("t-min"),
  lambda: el("lambda"),
  rho: el("rho"),
  cp: el("cp"),
  thickness: el("thickness"),
};

const presetSelect = el("preset");

function initPresets() {
  PRESETS.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = p.label;
    presetSelect.appendChild(opt);
  });
  presetSelect.value = 3; // Laine de bois par défaut, pour illustrer le déphasage
  applyPreset(3);
}

function applyPreset(index) {
  const p = PRESETS[index];
  if (p.lambda !== null) {
    inputs.lambda.value = p.lambda;
    inputs.rho.value = p.rho;
    inputs.cp.value = p.cp;
  }
}

presetSelect.addEventListener("change", () => {
  applyPreset(Number(presetSelect.value));
  recompute();
});

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", () => {
    presetSelect.value = 0; // passe en "Personnalisé" dès qu'on modifie une valeur
    recompute();
  });
});

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "–");

function computePhysics() {
  const tMax = parseFloat(inputs.tMax.value);
  const hMax = parseFloat(inputs.hMax.value);
  const tMin = parseFloat(inputs.tMin.value);
  const lambda = parseFloat(inputs.lambda.value);
  const rho = parseFloat(inputs.rho.value);
  const cp = parseFloat(inputs.cp.value);
  const thicknessCm = parseFloat(inputs.thickness.value);

  const valid =
    Number.isFinite(tMax) &&
    Number.isFinite(hMax) &&
    Number.isFinite(tMin) &&
    Number.isFinite(lambda) && lambda > 0 &&
    Number.isFinite(rho) && rho > 0 &&
    Number.isFinite(cp) && cp > 0 &&
    Number.isFinite(thicknessCm) && thicknessCm > 0;

  if (!valid) return null;

  const e = thicknessCm / 100; // m
  const R = e / lambda; // m².K/W
  const alpha = lambda / (rho * cp); // m²/s
  const periodSeconds = 24 * 3600;
  const omega = (2 * Math.PI) / periodSeconds; // rad/s
  const delta = Math.sqrt((2 * alpha) / omega); // m (profondeur de pénétration)
  const damping = Math.exp(-e / delta); // sans unité, 0..1
  const phaseRad = e / delta;
  const phaseHours = (phaseRad / omega) / 3600;

  const tMean = (tMax + tMin) / 2;
  const amplitude0 = (tMax - tMin) / 2;
  const amplitudeInt = amplitude0 * damping;

  return { hMax, tMean, amplitude0, amplitudeInt, R, alpha, delta, damping, phaseHours };
}

function outdoorTemp(tHours, tMean, amplitude0, hMax) {
  const omegaHour = (2 * Math.PI) / 24;
  return tMean + amplitude0 * Math.cos(omegaHour * (tHours - hMax));
}

function indoorSurfaceTemp(tHours, tMean, amplitudeInt, hMax, phaseHours) {
  const omegaHour = (2 * Math.PI) / 24;
  return tMean + amplitudeInt * Math.cos(omegaHour * (tHours - hMax - phaseHours));
}

function updateResults(p) {
  if (!p) {
    ["res-r", "res-alpha", "res-delta", "res-damping", "res-phase", "res-amplitude"].forEach(
      (id) => (el(id).textContent = "–")
    );
    return;
  }
  el("res-r").textContent = `${fmt(p.R, 2)} m².K/W`;
  el("res-alpha").textContent = `${(p.alpha * 1e6).toFixed(3)} × 10⁻⁶ m²/s`;
  el("res-delta").textContent = `${(p.delta * 100).toFixed(1)} cm`;
  el("res-damping").textContent = `μ = ${fmt(p.damping, 3)} (${(p.damping * 100).toFixed(1)} % de l'amplitude conservée)`;
  el("res-phase").textContent = `${fmt(p.phaseHours, 1)} h de retard`;
  el("res-amplitude").textContent = `± ${fmt(p.amplitudeInt, 2)} °C (contre ± ${fmt(p.amplitude0, 2)} °C dehors)`;
}

const canvas = el("chart");
const ctx = canvas.getContext("2d");

function drawChart(p) {
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

  if (!p) {
    ctx.fillStyle = textColor;
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Renseigne des paramètres valides pour afficher les courbes.", padLeft, H / 2);
    return;
  }

  const totalHours = 48;
  const samples = [];
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i <= 480; i++) {
    const t = (i / 480) * totalHours;
    const tExt = outdoorTemp(t, p.tMean, p.amplitude0, p.hMax);
    const tInt = indoorSurfaceTemp(t, p.tMean, p.amplitudeInt, p.hMax, p.phaseHours);
    samples.push([t, tExt, tInt]);
    yMin = Math.min(yMin, tExt, tInt);
    yMax = Math.max(yMax, tExt, tInt);
  }
  const yPad = Math.max(1, (yMax - yMin) * 0.15);
  yMin -= yPad;
  yMax += yPad;

  const xToPx = (t) => padLeft + (t / totalHours) * plotW;
  const yToPx = (v) => padTop + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // grille horizontale (température)
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

  // grille verticale (heures), tous les 6h
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

  // axe séparant les deux cycles de 24h
  ctx.strokeStyle = axisColor;
  ctx.beginPath();
  ctx.moveTo(xToPx(24), padTop);
  ctx.lineTo(xToPx(24), padTop + plotH);
  ctx.stroke();

  function drawCurve(idx, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    samples.forEach(([t, tExt, tInt], i) => {
      const v = idx === 1 ? tExt : tInt;
      const px = xToPx(t);
      const py = yToPx(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  drawCurve(1, "#3b82f6"); // bleu, extérieur
  drawCurve(2, "#ef4444"); // rouge, intérieur
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
  const p = computePhysics();
  updateResults(p);
  drawChart(p);
}

initPresets();
recompute();
