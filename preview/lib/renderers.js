// @ts-check

/**
 * @typedef {import("../../types/framework").BenchmarkReport} BenchmarkReport
 * @typedef {import("../../types/framework").GeneratedControl} GeneratedControl
 * @typedef {import("../../types/framework").GeneratedMeter} GeneratedMeter
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").GeneratedWorkspaceManifest} GeneratedWorkspaceManifest
 * @typedef {import("../../types/framework").PreviewRoots} PreviewRoots
 * @typedef {import("../../types/framework").PreviewState} PreviewState
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 */

import { rememberControlValue } from "./control-store.js";
import { renderControlPanels } from "./control-panels.js";
import { formatValue } from "./formatting.js";
import { controlKey, resolveControlDisplay } from "./schema-ui.js";

/**
 * @param {HTMLElement | null | undefined} node
 * @param {string | null | undefined} value
 * @returns {void}
 */
function setText(node, value) {
  if (node) {
    node.textContent = value || "";
  }
}

/**
 * @param {GeneratedMeter} meter
 * @returns {string}
 */
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

/**
 * @param {GeneratedControl} control
 * @param {ProjectUiManifest} ui
 * @param {PreviewState} state
 * @returns {HTMLElement}
 */
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
  value.textContent = formatValue(control, control.init ?? 0, ui);
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

/**
 * @param {GeneratedControl} control
 * @param {ProjectUiManifest} ui
 * @param {PreviewState} state
 * @returns {HTMLElement}
 */
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
  value.textContent = formatValue(control, control.init ?? 0, ui);
  header.append(title, value);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(control.min ?? 0);
  slider.max = String(control.max ?? 1);
  slider.step = String(control.step ?? 0.01);
  slider.value = String(control.init ?? control.min ?? 0);
  slider.setAttribute("data-control-id", controlKey(control));

  const enumLabels = display.enumLabels;

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    value.textContent = formatValue(control, nextValue, ui);
    rememberControlValue(state, control, nextValue);
    if (enumRail) {
      syncEnumRail(enumRail, enumLabels ?? [], nextValue);
    }
    state.refreshSurfaceViews?.();
  });

  rememberControlValue(state, control, Number(control.init));
  /** @type {HTMLElement | null} */
  let enumRail = null;
  if (enumLabels?.length) {
    card.classList.add("mode-card");
    enumRail = buildEnumRail(enumLabels, Number(control.init ?? 0));
  }

  card.append(header, slider);
  if (enumRail) {
    card.append(enumRail);
  }
  return card;
}

/**
 * @param {string[]} labels
 * @param {number} value
 * @returns {HTMLElement}
 */
function buildEnumRail(labels, value) {
  const rail = document.createElement("div");
  rail.className = "control-enum-rail";
  syncEnumRail(rail, labels, value);
  return rail;
}

/**
 * @param {HTMLElement} rail
 * @param {string[]} labels
 * @param {number} value
 * @returns {void}
 */
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

/**
 * @param {HTMLElement} root
 * @param {GeneratedWorkspaceManifest | null | undefined} workspace
 * @param {string | null | undefined} activeAppKey
 * @returns {void}
 */
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

/**
 * @param {PreviewRoots} roots
 * @param {GeneratedUiSchema} schema
 * @param {Document} [doc=document]
 * @returns {void}
 */
function renderShellChrome(roots, schema, doc = document) {
  const shell = schema.ui?.shell;
  const catalog = schema.ui?.catalog;
  doc.body.dataset.uiFamily = schema.ui?.family || "utility";
  doc.body.dataset.uiVariant = schema.ui?.variant || schema.project?.key || "default";
  doc.body.dataset.themeGroup = schema.ui?.themeGroup || "utility";
  doc.body.dataset.layoutProfile = schema.ui?.layoutProfile || "default";
  doc.body.dataset.uiThemeGroup = schema.ui?.themeGroup || "utility";
  if (typeof catalog?.productId === "string" && catalog.productId) {
    doc.body.dataset.catalogProductId = catalog.productId;
  } else {
    delete doc.body.dataset.catalogProductId;
  }
  if (typeof catalog?.prototypeRole === "string" && catalog.prototypeRole) {
    doc.body.dataset.prototypeRole = catalog.prototypeRole;
  } else {
    delete doc.body.dataset.prototypeRole;
  }
  if (typeof catalog?.referenceProduct === "string" && catalog.referenceProduct) {
    doc.body.dataset.referenceProduct = catalog.referenceProduct;
  } else {
    delete doc.body.dataset.referenceProduct;
  }
  if (Array.isArray(catalog?.featureAnchors) && catalog.featureAnchors.length) {
    doc.body.dataset.featureAnchors = catalog.featureAnchors.join(" | ");
  } else {
    delete doc.body.dataset.featureAnchors;
  }

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

/**
 * @param {HTMLElement} root
 * @param {GeneratedUiSchema} schema
 * @param {PreviewState} state
 * @returns {void}
 */
function renderControls(root, schema, state) {
  renderControlPanels(root, schema, state);
}

/**
 * @param {HTMLElement} root
 * @param {GeneratedUiSchema} schema
 * @param {PreviewState} state
 * @returns {void}
 */
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

/**
 * @param {HTMLElement} root
 * @param {BenchmarkReport | null | undefined} report
 * @returns {void}
 */
function renderBenchmarks(root, report) {
  root.innerHTML = "";
  const results = report?.results ?? [];
  if (!results.length) {
    root.innerHTML = "<article class=\"benchmark-card\"><h3>No Benchmarks</h3><p>Run <code>npm run benchmark</code> to refresh the compile target snapshot for this workspace.</p></article>";
    return;
  }

  results.forEach((entry) => {
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

/**
 * @param {PreviewRoots} roots
 * @param {string} message
 * @returns {void}
 */
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
