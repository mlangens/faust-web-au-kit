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
  if (control.isToggle) {
    return value >= 0.5 ? "On" : "Off";
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
  const vintage = state.controls.get("Vintage Character") ?? 0;
  const bypass = state.controls.get("Bypass") ?? 0;
  const tone = state.controls.get("Tone") ?? 0.55;
  const motion = state.controls.get("Motion") ?? 0.35;
  const drive = state.controls.get("Drive") ?? 3.0;
  const stereoWidth = state.controls.get("Stereo Width") ?? 0.75;

  const inputPeakDb = clamp(-14 + inputGain + Math.sin(state.motionPhase * 1.1) * 5.5, -72, 6);
  const gainReductionDb = clamp(
    (inputGain - ceiling) * 0.55 + vintage * 1.8 - bypass * 4.0 + Math.sin(state.motionPhase * 0.8 + 0.9) * 1.4,
    0,
    24
  );
  const outputPeakDb = clamp(inputPeakDb - gainReductionDb + outputTrim + 0.8, -72, 6);
  const synthDensity = clamp((tone + motion) * 8.0 + Math.sin(state.motionPhase * 0.9) * 2.2 + drive * 0.3, 0, 24);
  const stereoDrift = clamp(stereoWidth * 16.0 + Math.sin(state.motionPhase * 1.4 + 1.2) * 2.0, 0, 24);
  const synthOutput = clamp(-18 + tone * 10 + drive * 0.7 + Math.sin(state.motionPhase * 1.1) * 4.0, -72, 6);

  switch (id) {
    case "inputPeak":
      return inputPeakDb;
    case "outputPeak":
      return state.schema?.project?.kind === "instrument" ? synthOutput : outputPeakDb;
    case "gainReduction":
      return gainReductionDb;
    case "voiceDensity":
      return synthDensity;
    case "stereoDrift":
      return stereoDrift;
    default:
      return state.schema?.project?.kind === "instrument" ? synthOutput : outputPeakDb;
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
