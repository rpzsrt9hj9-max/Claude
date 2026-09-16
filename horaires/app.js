const STORAGE_KEY = "horaires-app-state";

const btnNow = document.getElementById("btn-now");
const btnManual = document.getElementById("btn-manual");
const startTimeInput = document.getElementById("start-time-input");
const guessTimeInput = document.getElementById("guess-time-input");
const stepsList = document.getElementById("steps-list");
const btnAddStep = document.getElementById("btn-add-step");
const stepTemplate = document.getElementById("step-template");
const resultTime = document.getElementById("result-time");
const deltaRow = document.getElementById("delta-row");
const deltaValue = document.getElementById("delta-value");

let startMode = "now";

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseHHMM(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes) {
  const dayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const days = Math.floor(totalMinutes / 1440);
  const h = Math.floor(dayMinutes / 60);
  const m = dayMinutes % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return days > 0 ? `${time} (+${days}j)` : time;
}

function formatDurationDelta(deltaMinutes) {
  const sign = deltaMinutes > 0 ? "+" : deltaMinutes < 0 ? "-" : "";
  const abs = Math.abs(deltaMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${sign}${h} h ${String(m).padStart(2, "0")}` : `${sign}${m} min`;
}

function isRowFilled(row) {
  const desc = row.querySelector(".step-desc").value.trim();
  const hours = row.querySelector(".step-hours").value;
  const minutes = row.querySelector(".step-minutes").value;
  return desc !== "" || hours !== "" || minutes !== "";
}

function handleStepInput(row) {
  recalculate();
  saveState();

  const isLastRow = row === stepsList.lastElementChild;
  if (isLastRow && isRowFilled(row)) {
    addStepRow();
  }
}

function addStepRow(data) {
  const fragment = stepTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".step-row");
  const desc = row.querySelector(".step-desc");
  const hours = row.querySelector(".step-hours");
  const minutes = row.querySelector(".step-minutes");
  const removeBtn = row.querySelector(".step-remove");

  if (data) {
    desc.value = data.desc ?? "";
    hours.value = data.hours ?? "";
    minutes.value = data.minutes ?? "";
  }

  [desc, hours, minutes].forEach((el) => {
    el.addEventListener("input", () => handleStepInput(row));
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    recalculate();
    saveState();
  });

  stepsList.appendChild(row);
  return desc;
}

function setStartMode(mode) {
  startMode = mode;
  btnNow.classList.toggle("active", mode === "now");
  btnManual.classList.toggle("active", mode === "manual");
  startTimeInput.disabled = mode === "now";
  if (mode === "manual" && !startTimeInput.value) {
    startTimeInput.value = nowHHMM();
  }
  recalculate();
  saveState();
}

function getStartMinutes() {
  if (startMode === "now") {
    return parseHHMM(nowHHMM());
  }
  if (startTimeInput.value) {
    return parseHHMM(startTimeInput.value);
  }
  return null;
}

function updateDelta(stepsDurationTotal, startMinutes) {
  if (!guessTimeInput.value) {
    deltaRow.classList.add("hidden");
    return;
  }

  const guessRaw = parseHHMM(guessTimeInput.value);
  let guessDuration = guessRaw - startMinutes;
  if (guessDuration < 0) {
    guessDuration += 1440;
  }

  const deltaMinutes = stepsDurationTotal - guessDuration;
  const percent = guessDuration > 0 ? (deltaMinutes / guessDuration) * 100 : null;

  let text = formatDurationDelta(deltaMinutes);
  if (percent !== null) {
    const percentSign = percent > 0 ? "+" : "";
    text += ` (${percentSign}${percent.toFixed(0)}%)`;
  }

  deltaRow.classList.remove("hidden");
  deltaValue.textContent = text;
  deltaValue.classList.toggle("over", deltaMinutes > 0);
  deltaValue.classList.toggle("under", deltaMinutes < 0);
}

function recalculate() {
  const startMinutes = getStartMinutes();
  if (startMinutes === null) {
    resultTime.textContent = "--:--";
    deltaRow.classList.add("hidden");
    return;
  }

  let stepsDurationTotal = 0;
  stepsList.querySelectorAll(".step-row").forEach((row) => {
    const h = parseInt(row.querySelector(".step-hours").value, 10) || 0;
    const m = parseInt(row.querySelector(".step-minutes").value, 10) || 0;
    stepsDurationTotal += h * 60 + m;
  });

  resultTime.textContent = formatMinutes(startMinutes + stepsDurationTotal);
  updateDelta(stepsDurationTotal, startMinutes);
}

function saveState() {
  const steps = Array.from(stepsList.querySelectorAll(".step-row")).map((row) => ({
    desc: row.querySelector(".step-desc").value,
    hours: row.querySelector(".step-hours").value,
    minutes: row.querySelector(".step-minutes").value,
  }));

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      startMode,
      manualStartTime: startTimeInput.value,
      guessTime: guessTimeInput.value,
      steps,
    })
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    addStepRow();
    return;
  }

  try {
    const state = JSON.parse(raw);
    if (state.manualStartTime) {
      startTimeInput.value = state.manualStartTime;
    }
    if (state.guessTime) {
      guessTimeInput.value = state.guessTime;
    }
    setStartMode(state.startMode === "manual" ? "manual" : "now");

    if (Array.isArray(state.steps) && state.steps.length > 0) {
      state.steps.forEach((step) => addStepRow(step));
    } else {
      addStepRow();
    }
  } catch {
    addStepRow();
  }
}

btnNow.addEventListener("click", () => setStartMode("now"));
btnManual.addEventListener("click", () => setStartMode("manual"));
startTimeInput.addEventListener("input", () => {
  recalculate();
  saveState();
});
guessTimeInput.addEventListener("input", () => {
  recalculate();
  saveState();
});

btnAddStep.addEventListener("click", () => {
  const desc = addStepRow();
  desc.focus();
  saveState();
});

loadState();
recalculate();

setInterval(() => {
  if (startMode === "now") {
    recalculate();
  }
}, 15000);

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
