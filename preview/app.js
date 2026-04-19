const titleRoot = document.querySelector("#productTitle");
const ledeRoot = document.querySelector("#projectDescription");
const statusRoot = document.querySelector("#projectStatus");
const controlsRoot = document.querySelector("#controls");
const metersRoot = document.querySelector("#meters");
const benchmarksRoot = document.querySelector("#benchmarks");

const state = {
  controls: new Map(),
  meterViews: new Map(),
  motionPhase: 0,
  schema: null
};

function controlKey(control) {
  return control.id || control.label;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setMeter(fill, label, rawValue, meter) {
  const percent = meter.mode === "gr"
    ? clamp(rawValue / meter.max, 0, 1) * 100
    : clamp((rawValue + 72) / meter.max, 0, 1) * 100;
  fill.style.width = `${percent}%`;
  label.textContent = `${rawValue.toFixed(1)} dB`;
}

function formatValue(control, value) {
  if (control.label === "Drive Target") {
    return ["Both", "Mid", "Side"][Math.round(value)] ?? "Both";
  }
  if (control.label === "Drive Focus") {
    return ["Full", "Low", "Mid", "High"][Math.round(value)] ?? "Full";
  }
  if (control.isToggle) {
    return value >= 0.5 ? "On" : "Off";
  }
  if (control.unit === "Hz") {
    return `${Math.round(value)} Hz`;
  }
  if (control.unit === "dB") {
    return `${value.toFixed(1)} dB`;
  }
  if (control.unit === "ms") {
    return `${value.toFixed(2)} ms`;
  }
  return value.toFixed(2);
}

function buildToggle(control) {
  const card = document.createElement("article");
  card.className = "control-card toggle-card";
  card.dataset.controlId = controlKey(control);

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
  input.setAttribute("data-control-id", controlKey(control));
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
  card.dataset.controlId = controlKey(control);

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
  slider.setAttribute("data-control-id", controlKey(control));

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    value.textContent = formatValue(control, nextValue);
    state.controls.set(control.label, nextValue);
  });

  state.controls.set(control.label, Number(control.init));
  card.append(header, slider);
  return card;
}

function renderControls(schema) {
  controlsRoot.innerHTML = "";
  schema.controls.forEach((control) => {
    controlsRoot.append(control.isToggle ? buildToggle(control) : buildSlider(control));
  });
}

function renderMeters(schema) {
  metersRoot.innerHTML = "";
  state.meterViews.clear();

  schema.meters.forEach((meter) => {
    const card = document.createElement("div");
    card.className = "meter-card";
    card.dataset.meterId = meter.id;
    const labelRow = document.createElement("div");
    labelRow.className = "meter-label-row";

    const title = document.createElement("span");
    title.textContent = meter.label;
    const value = document.createElement("strong");
    value.textContent = meter.mode === "gr" ? "0.0 dB" : "-72.0 dB";
    labelRow.append(title, value);

    const track = document.createElement("div");
    track.className = "meter-track";
    const fill = document.createElement("div");
    fill.className = `meter-fill ${meter.mode === "gr" ? "meter-gr" : "meter-output"}`;
    track.append(fill);

    card.append(labelRow, track);
    metersRoot.append(card);
    state.meterViews.set(meter.id, { fill, value, meter });
  });
}

function renderBenchmarks(report) {
  benchmarksRoot.innerHTML = "";
  if (!report?.results?.length) {
    benchmarksRoot.innerHTML = "<article class=\"benchmark-card\"><h3>No Benchmarks</h3><p>Run <code>npm run benchmark</code> to refresh the compile target snapshot for this workspace.</p></article>";
    return;
  }

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

function meterValueForId(id) {
  const inputGain = state.controls.get("Input Gain") ?? 0;
  const ceiling = state.controls.get("Ceiling") ?? -1;
  const outputTrim = state.controls.get("Output Trim") ?? 0;
  const vintage = state.controls.get("Vintage Response") ?? 0;
  const bypass = state.controls.get("Bypass") ?? 0;
  const tubeDrive = state.controls.get("Tube Drive") ?? 0;
  const transformerTone = state.controls.get("Transformer Tone") ?? 0;
  const driveTarget = state.controls.get("Drive Target") ?? 0;
  const driveFocus = state.controls.get("Drive Focus") ?? 0;
  const driveLowSplit = state.controls.get("Drive Low Split") ?? 220;
  const driveHighSplit = state.controls.get("Drive High Split") ?? 3000;
  const driveAmount = (tubeDrive + transformerTone) / 200;
  const focusMultiplier = [0.9, 0.65, 0.82, 1.0][Math.round(driveFocus)] ?? 0.9;
  const targetMultiplier = [1.0, 0.72, 0.78][Math.round(driveTarget)] ?? 1.0;
  const splitSpread = clamp((driveHighSplit - driveLowSplit) / 6000, 0.15, 1.5);
  const saturationBias = driveAmount * focusMultiplier * targetMultiplier * splitSpread;

  const inputPeakDb = clamp(-14 + inputGain + Math.sin(state.motionPhase * 1.1) * 5.5, -72, 6);
  const gainReductionDb = clamp(
    (inputGain - ceiling) * 0.55 + vintage * 1.8 + saturationBias * 7.0 - bypass * 4.0 + Math.sin(state.motionPhase * 0.8 + 0.9) * 1.4,
    0,
    24
  );
  const outputPeakDb = clamp(inputPeakDb - gainReductionDb + outputTrim + 0.8, -72, 6);

  switch (id) {
    case "inputPeak":
      return inputPeakDb;
    case "outputPeak":
      return outputPeakDb;
    case "gainReduction":
      return gainReductionDb;
    default:
      return outputPeakDb;
  }
}

function animateMeters() {
  state.motionPhase += 0.04;
  state.meterViews.forEach(({ fill, value, meter }, id) => {
    setMeter(fill, value, meterValueForId(id), meter);
  });
  requestAnimationFrame(animateMeters);
}

function schemaPathFromLocation() {
  const projectKey = new URLSearchParams(window.location.search).get("project");
  return projectKey ? `/generated/${projectKey}/ui_schema.json` : "/generated/ui_schema.json";
}

async function bootstrap() {
  const schemaResponse = await fetch(schemaPathFromLocation());
  const schema = await schemaResponse.json();
  state.schema = schema;
  document.body.dataset.projectKey = schema.project.key;

  titleRoot.textContent = schema.project.name;
  ledeRoot.textContent = schema.project.description;
  statusRoot.textContent = schema.project.statusText;

  renderControls(schema);
  renderMeters(schema);

  try {
    const benchmarkResponse = await fetch(schema.benchmarkPath || "/generated/benchmark-results.json");
    renderBenchmarks(benchmarkResponse.ok ? await benchmarkResponse.json() : null);
  } catch (error) {
    renderBenchmarks(null);
    console.error(error);
  }

  animateMeters();
}

bootstrap().catch((error) => {
  benchmarksRoot.innerHTML = `<article class="benchmark-card"><h3>Preview Error</h3><p>${error.message}</p></article>`;
});
