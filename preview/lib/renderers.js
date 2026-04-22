import { formatValue } from "./formatting.js";
import { controlKey, resolveControlDisplay } from "./schema-ui.js";

function rememberControlValue(state, control, value) {
  if (control.id) {
    state.controls.set(control.id, value);
  }
  if (control.label) {
    state.controls.set(control.label, value);
  }
  if (control.shortname) {
    state.controls.set(control.shortname, value);
  }
}

function setText(node, value) {
  if (node) {
    node.textContent = value || "";
  }
}

function initialMeterValueText(meter) {
  const unit = meter.unit || "dB";
  if (meter.mode === "gr") {
    return `0.0 ${unit}`;
  }
  if (unit === "%") {
    return "0.0 %";
  }
  return `-72.0 ${unit}`;
}

function buildToggle(control, ui, state) {
  const card = document.createElement("article");
  card.className = "control-card toggle-card";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlType = "toggle";

  const copy = document.createElement("div");
  copy.className = "control-copy";
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = formatValue(control, control.init || 0, ui);
  copy.append(title, value);

  const wrapper = document.createElement("label");
  wrapper.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(control.init);
  input.setAttribute("data-control-id", controlKey(control));
  const slider = document.createElement("span");
  slider.setAttribute("aria-hidden", "true");
  wrapper.append(input, slider);

  input.addEventListener("change", () => {
    const nextValue = input.checked ? 1 : 0;
    value.textContent = formatValue(control, nextValue, ui);
    rememberControlValue(state, control, nextValue);
    state.refreshSurfaceViews?.();
  });

  rememberControlValue(state, control, input.checked ? 1 : 0);
  card.append(copy, wrapper);
  return card;
}

function buildSlider(control, ui, state) {
  const display = resolveControlDisplay(ui, control);
  const card = document.createElement("article");
  card.className = "control-card";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlType = "slider";
  card.dataset.scale = control.scale || "linear";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = formatValue(control, control.init, ui);
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
    value.textContent = formatValue(control, nextValue, ui);
    rememberControlValue(state, control, nextValue);
    if (enumRail) {
      syncEnumRail(enumRail, display.enumLabels, nextValue);
    }
    state.refreshSurfaceViews?.();
  });

  rememberControlValue(state, control, Number(control.init));
  let enumRail = null;
  if (display.enumLabels?.length) {
    card.classList.add("mode-card");
    enumRail = buildEnumRail(display.enumLabels, Number(control.init));
  }

  card.append(header, slider);
  if (enumRail) {
    card.append(enumRail);
  }
  return card;
}

function buildEnumRail(labels, value) {
  const rail = document.createElement("div");
  rail.className = "control-enum-rail";
  syncEnumRail(rail, labels, value);
  return rail;
}

function syncEnumRail(rail, labels, value) {
  rail.innerHTML = "";
  const activeIndex = Math.round(Number(value));
  labels.forEach((label, index) => {
    const chip = document.createElement("span");
    chip.className = "control-enum-chip";
    if (index === activeIndex) {
      chip.classList.add("is-active");
    }
    chip.textContent = label;
    rail.append(chip);
  });
}

function renderWorkspaceNav(root, workspace, activeAppKey) {
  root.innerHTML = "";
  if (!workspace?.apps?.length) {
    return;
  }

  workspace.apps.forEach((app) => {
    const link = document.createElement("a");
    link.href = app.previewPath;
    link.textContent = app.name;
    if (app.key === activeAppKey) {
      link.classList.add("is-active");
    }
    root.append(link);
  });
}

function renderShellChrome(roots, schema) {
  const shell = schema.ui?.shell;
  document.body.dataset.themeGroup = schema.ui?.themeGroup || "utility";
  document.body.dataset.layoutProfile = schema.ui?.layoutProfile || "default";
  document.body.dataset.uiVariant = schema.ui?.variant || schema.project?.key || "default";

  setText(roots.eyebrow, shell?.eyebrow);
  setText(roots.title, shell?.hero?.title || schema.project?.name);
  setText(roots.description, shell?.hero?.description || schema.project?.description);
  setText(roots.status, shell?.hero?.status || schema.project?.statusText);
  setText(roots.surfacesTitle, shell?.sections?.surfaces?.title);
  setText(roots.surfacesDescription, shell?.sections?.surfaces?.description);
  setText(roots.controlsTitle, shell?.sections?.controls?.title);
  setText(roots.controlsDescription, shell?.sections?.controls?.description);
  setText(roots.metersTitle, shell?.sections?.meters?.title);
  setText(roots.metersDescription, shell?.sections?.meters?.description);
  setText(roots.benchmarksTitle, shell?.sections?.benchmarks?.title);
  setText(roots.benchmarksDescription, shell?.sections?.benchmarks?.description);
}

function renderControls(root, schema, state) {
  root.innerHTML = "";
  state.controls.clear();
  root.dataset.themeGroup = schema.ui?.themeGroup || "utility";
  root.dataset.layoutProfile = schema.ui?.layoutProfile || "default";
  root.dataset.controlCount = String(schema.controls.length);

  schema.controls.forEach((control) => {
    root.append(control.isToggle ? buildToggle(control, schema.ui, state) : buildSlider(control, schema.ui, state));
  });
}

function renderMeters(root, schema, state) {
  root.innerHTML = "";
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
    value.textContent = initialMeterValueText(meter);
    labelRow.append(title, value);

    const track = document.createElement("div");
    track.className = "meter-track";
    const fill = document.createElement("div");
    fill.className = `meter-fill ${meter.mode === "gr" ? "meter-gr" : "meter-output"}`;
    track.append(fill);

    card.append(labelRow, track);
    root.append(card);
    state.meterViews.set(meter.id, { fill, value, meter });
  });
}

function renderBenchmarks(root, report) {
  root.innerHTML = "";
  if (!report?.results?.length) {
    root.innerHTML = "<article class=\"benchmark-card\"><h3>No Benchmarks</h3><p>Run <code>npm run benchmark</code> to refresh the compile target snapshot for this workspace.</p></article>";
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
    root.append(card);
  });
}

function renderPreviewError(roots, message) {
  document.body.dataset.previewError = "true";
  setText(roots.title, "Preview Error");
  setText(roots.description, message);
  setText(roots.status, "The preview could not load its generated schema. Re-export the project artifacts and try again.");
  if (roots.surfacePanel) {
    roots.surfacePanel.hidden = true;
  }
  if (roots.surfaces) {
    roots.surfaces.innerHTML = "";
  }
  roots.controls.innerHTML = "";
  roots.meters.innerHTML = "";
  roots.benchmarks.innerHTML = `<article class="benchmark-card"><h3>Preview Error</h3><p>${message}</p></article>`;
}

export { renderBenchmarks, renderControls, renderMeters, renderPreviewError, renderShellChrome, renderWorkspaceNav };
