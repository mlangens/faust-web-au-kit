const controlsRoot = document.querySelector("#controls");
const benchmarksRoot = document.querySelector("#benchmarks");

const inputPeakFill = document.querySelector("#inputPeakFill");
const outputPeakFill = document.querySelector("#outputPeakFill");
const gainReductionFill = document.querySelector("#gainReductionFill");
const inputPeakValue = document.querySelector("#inputPeakValue");
const outputPeakValue = document.querySelector("#outputPeakValue");
const gainReductionValue = document.querySelector("#gainReductionValue");

const state = {
  controls: new Map(),
  motionPhase: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dbToPercent(db) {
  return clamp((db + 72) / 78, 0, 1) * 100;
}

function setMeter(fill, label, db, mode = "peak") {
  const percent = mode === "gr" ? clamp(db / 24, 0, 1) * 100 : dbToPercent(db);
  fill.style.width = `${percent}%`;
  label.textContent = `${db.toFixed(1)} dB`;
}

function formatValue(control, value) {
  const unitMeta = (control.meta || []).find((item) => item.unit)?.unit;
  if (control.type === "checkbox") {
    return value >= 0.5 ? "On" : "Off";
  }
  if (unitMeta === "dB") {
    return `${value.toFixed(1)} dB`;
  }
  if (unitMeta === "ms") {
    return `${value.toFixed(2)} ms`;
  }
  return value.toFixed(2);
}

function buildToggle(control) {
  const card = document.createElement("article");
  card.className = "control-card toggle-card";

  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = formatValue(control, control.init || 0);
  copy.append(title, value);

  const wrapper = document.createElement("label");
  wrapper.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(control.init);
  const slider = document.createElement("span");
  wrapper.append(input, slider);

  input.addEventListener("change", () => {
    const nextValue = input.checked ? 1 : 0;
    value.textContent = formatValue(control, nextValue);
    state.controls.set(control.label, nextValue);
  });

  state.controls.set(control.label, input.checked ? 1 : 0);
  card.append(copy, wrapper);
  return card;
}

function buildSlider(control) {
  const card = document.createElement("article");
  card.className = "control-card";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = formatValue(control, control.init);
  header.append(title, value);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = control.min;
  slider.max = control.max;
  slider.step = control.step || 0.01;
  slider.value = control.init;

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    value.textContent = formatValue(control, nextValue);
    state.controls.set(control.label, nextValue);
  });

  state.controls.set(control.label, Number(control.init));
  card.append(header, slider);
  return card;
}

function renderControls(uiJson) {
  const group = uiJson.ui?.[0];
  const items = group?.items || [];
  const ordered = [
    "Input Gain",
    "Ceiling",
    "Attack",
    "Hold",
    "Release",
    "Output Trim",
    "Vintage Character",
    "Bypass"
  ];

  ordered
    .map((label) => items.find((item) => item.label === label))
    .filter(Boolean)
    .forEach((control) => {
      controlsRoot.append(control.type === "checkbox" ? buildToggle(control) : buildSlider(control));
    });
}

function renderBenchmarks(report) {
  benchmarksRoot.innerHTML = "";
  report.results.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "benchmark-card";
    card.innerHTML = `
      <h3>${entry.target}</h3>
      <strong>${entry.realtimeFactor.toFixed(1)}x</strong>
      <p>${entry.nsPerFrame.toFixed(1)} ns/frame<br>${entry.processedFrames.toLocaleString()} processed frames</p>
    `;
    benchmarksRoot.append(card);
  });
}

function animateMeters() {
  const inputGain = state.controls.get("Input Gain") ?? 0;
  const ceiling = state.controls.get("Ceiling") ?? -1;
  const outputTrim = state.controls.get("Output Trim") ?? 0;
  const vintage = state.controls.get("Vintage Character") ?? 0;
  const bypass = state.controls.get("Bypass") ?? 0;

  state.motionPhase += 0.04;

  const inputPeakDb = clamp(-14 + inputGain + Math.sin(state.motionPhase * 1.1) * 5.5, -72, 6);
  const reductionBase = clamp((inputGain - ceiling) * 0.55 + vintage * 1.8 - bypass * 4.0, 0, 18);
  const gainReductionDb = clamp(reductionBase + Math.sin(state.motionPhase * 0.8 + 0.9) * 1.4, 0, 24);
  const outputPeakDb = clamp(inputPeakDb - gainReductionDb + outputTrim + 0.8, -72, 6);

  setMeter(inputPeakFill, inputPeakValue, inputPeakDb);
  setMeter(outputPeakFill, outputPeakValue, outputPeakDb);
  setMeter(gainReductionFill, gainReductionValue, gainReductionDb, "gr");

  requestAnimationFrame(animateMeters);
}

async function bootstrap() {
  const [uiResponse, benchResponse] = await Promise.all([
    fetch("/generated/targets/limiter_lab.ui.json"),
    fetch("/generated/benchmark-results.json")
  ]);

  const uiJson = await uiResponse.json();
  renderControls(uiJson);

  if (benchResponse.ok) {
    renderBenchmarks(await benchResponse.json());
  }

  animateMeters();
}

bootstrap().catch((error) => {
  benchmarksRoot.innerHTML = `<article class="benchmark-card"><h3>Preview Error</h3><p>${error.message}</p></article>`;
});
