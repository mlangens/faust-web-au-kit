import { formatValue } from "./formatting.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function humanizeId(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function resolveControl(schema, key) {
  return schema.controls.find((entry) => [entry.id, entry.label, entry.shortname].includes(key)) ?? null;
}

function resolveMeter(schema, key) {
  return schema.meters.find((entry) => [entry.id, entry.label].includes(key)) ?? null;
}

function readControlValue(schema, state, key, fallback = 0) {
  const control = resolveControl(schema, key);
  if (!control) {
    return fallback;
  }

  for (const candidate of [control.id, control.label, control.shortname]) {
    if (candidate && state.controls.has(candidate)) {
      return state.controls.get(candidate);
    }
  }

  return control.init ?? fallback;
}

function normalizeUnitValue(value, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (Math.abs(numeric) <= 1 && max > 1) {
    return clamp(numeric, 0, 1);
  }
  return clamp(numeric / max, 0, 1);
}

function normalizeBipolarValue(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -1;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 1;
  if (safeMax === safeMin) {
    return 0.5;
  }
  return clamp((numeric - safeMin) / (safeMax - safeMin), 0, 1);
}

function normalizeFrequencyValue(value, min = 20, max = 20000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0 && numeric <= 1) {
    return clamp(numeric, 0, 1);
  }

  const safeMin = Math.max(Number(min) || 20, 1);
  const safeMax = Math.max(Number(max) || 20000, safeMin + 1);
  return clamp(
    (Math.log10(Math.max(numeric, safeMin)) - Math.log10(safeMin)) / (Math.log10(safeMax) - Math.log10(safeMin)),
    0,
    1
  );
}

function controlValueText(schema, state, label) {
  const control = resolveControl(schema, label);
  if (!control) {
    return "";
  }
  return formatValue(control, readControlValue(schema, state, label, control.init ?? 0), schema.ui);
}

function readoutValueText(schema, state, entry) {
  if (entry.control || entry.label) {
    return controlValueText(schema, state, entry.control || entry.label);
  }
  return typeof entry.value === "string" ? entry.value : "";
}

function normalizePointAxis(schema, state, config, fallback = 0.5, invert = false) {
  if (config.control) {
    const control = resolveControl(schema, config.control);
    if (!control) {
      return clamp(fallback, 0, 1);
    }

    const value = readControlValue(schema, state, config.control, control.init ?? fallback);
    const normalized = control.unit === "Hz" || control.scale === "log" || config.scale === "log"
      ? normalizeFrequencyValue(value, config.min ?? control.min ?? 20, config.max ?? control.max ?? 20000)
      : normalizeBipolarValue(value, config.min ?? control.min ?? 0, config.max ?? control.max ?? 1);
    return invert ? 1 - normalized : normalized;
  }

  if (Number.isFinite(Number(config.value))) {
    return clamp(Number(config.value), 0, 1);
  }

  return clamp(fallback, 0, 1);
}

function surfaceDescription(model) {
  if (typeof model.config.description === "string" && model.config.description.trim()) {
    return model.config.description.trim();
  }

  if (Array.isArray(model.supports) && model.supports.length) {
    return model.supports.map((entry) => humanizeId(entry)).join(" · ");
  }

  return "Shared surface scaffold derived from the resolved UI family preset.";
}

function resolveSurfaceModels(schema) {
  const ui = asObject(schema.ui);
  const surfacePresets = asObject(ui.surfacePresets);
  const analyzerPresets = asObject(ui.analyzerPresets);
  const previewSurfaces = asObject(asObject(ui.preview).surfaces);
  const analyzerIds = Array.isArray(ui.analyzerPresetIds) ? ui.analyzerPresetIds : [];

  return (Array.isArray(ui.surfacePresetIds) ? ui.surfacePresetIds : [])
    .map((surfaceId) => {
      const preset = asObject(surfacePresets[surfaceId]);
      if (!Object.keys(preset).length) {
        return null;
      }

      return {
        id: surfaceId,
        kind: preset.kind || "surface-card",
        title: previewSurfaces[surfaceId]?.title || humanizeId(surfaceId),
        config: asObject(previewSurfaces[surfaceId]),
        preset,
        supports: Array.isArray(preset.supports) ? preset.supports : [],
        analyzers: analyzerIds
          .map((analyzerId) => ({ id: analyzerId, ...asObject(analyzerPresets[analyzerId]) }))
          .filter((entry) => entry.id)
      };
    })
    .filter(Boolean);
}

function resolveToneColor(tone) {
  switch (tone) {
    case "warning":
      return "var(--warning)";
    case "positive":
      return "var(--positive)";
    case "info":
      return "var(--info)";
    default:
      return "var(--accent)";
  }
}

function createSvgElement(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function buildBadge(text, tone = "neutral") {
  const chip = document.createElement("span");
  chip.className = "surface-badge";
  chip.dataset.tone = tone;
  chip.textContent = text;
  return chip;
}

function createSurfaceScaffold(model, className, bodyClass = "surface-card__body") {
  const card = document.createElement("article");
  card.className = className;
  card.dataset.surfaceId = model.id;

  const header = document.createElement("header");
  header.className = "surface-card__header";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = model.title;
  const description = document.createElement("p");
  description.textContent = surfaceDescription(model);
  copy.append(title, description);

  const badges = document.createElement("div");
  badges.className = "surface-badges";
  header.append(copy, badges);

  const body = document.createElement("div");
  body.className = bodyClass;

  card.append(header, body);
  return { card, badges, body };
}

function populateStandardBadges(container, model, analyzerLimit = 2, supportLimit = 3) {
  container.innerHTML = "";
  model.analyzers.slice(0, analyzerLimit).forEach((analyzer, index) => {
    container.append(buildBadge(humanizeId(analyzer.id), index === 0 ? "accent" : "muted"));
  });
  model.supports.slice(0, supportLimit).forEach((support) => {
    container.append(buildBadge(humanizeId(support), "muted"));
  });
}

function populateFocusBadges(container, schema, state, metrics) {
  container.innerHTML = "";
  metrics.forEach((metric) => {
    container.append(buildBadge(`${metric.label}: ${controlValueText(schema, state, metric.control)}`, metric.tone || "accent"));
  });
}

function measureMeterValue(schema, state, meterId, fallback = 0) {
  const meter = resolveMeter(schema, meterId);
  if (!meter) {
    return { meter: null, value: fallback };
  }
  const value = state.simulator?.measure ? state.simulator.measure(state, meter.id, meter) : fallback;
  return { meter, value };
}

function meterPercent(value, meter) {
  if (!meter) {
    return clamp(Number(value) || 0, 0, 1);
  }

  const max = Number(meter.max) || 78;
  if (meter.mode === "gr" || meter.unit === "%" || meter.mode === "depth") {
    return clamp(Number(value) / max, 0, 1);
  }
  return clamp((Number(value) + 72) / max, 0, 1);
}

function formatMeterValue(value, meter) {
  if (!meter) {
    return String(value ?? "");
  }
  return `${Number(value).toFixed(1)} ${meter.unit || "dB"}`;
}

function normalizeControlValue(control, value) {
  if (!control) {
    return 0.5;
  }
  if (control.unit === "Hz" || control.scale === "log") {
    return normalizeFrequencyValue(value, control.min, control.max);
  }
  return normalizeBipolarValue(value, control.min, control.max);
}

function resolveActivity(schema, state, config, fallback = 0.5) {
  if (config.meterId) {
    const { meter, value } = measureMeterValue(schema, state, config.meterId, fallback);
    return meterPercent(value, meter);
  }

  if (config.control) {
    const control = resolveControl(schema, config.control);
    return normalizeControlValue(control, readControlValue(schema, state, config.control, control?.init ?? fallback));
  }

  if (Array.isArray(config.controls) && config.controls.length) {
    const total = config.controls.reduce((sum, controlId) => {
      const control = resolveControl(schema, controlId);
      return sum + normalizeControlValue(control, readControlValue(schema, state, controlId, control?.init ?? fallback));
    }, 0);
    return total / config.controls.length;
  }

  if (Number.isFinite(Number(config.activity))) {
    return clamp(Number(config.activity), 0, 1);
  }

  return fallback;
}

function createReadoutRows(readouts, fallbackControl) {
  return (Array.isArray(readouts) ? readouts : fallbackControl ? [{ control: fallbackControl }] : [])
    .map((entry) => {
      if (typeof entry === "string") {
        return { label: entry, control: entry };
      }
      const control = entry.control || entry.label || fallbackControl;
      return {
        ...entry,
        label: entry.label || humanizeId(control || entry.id || "readout"),
        control
      };
    })
    .filter((entry) => entry.label || entry.control);
}

function createCurvePath(bands) {
  const points = [];
  for (let step = 0; step <= 96; step += 1) {
    const x = step / 96;
    const curveOffset = bands.reduce((sum, band) => sum + bandContribution(band, x), 0);
    const y = clamp(0.5 - curveOffset * 0.22, 0.08, 0.92);
    points.push(`${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`);
  }
  return `M ${points.join(" L ")}`;
}

function createAnalyzerPath(bands, motionPhase, variant = "program") {
  const points = [];
  for (let step = 0; step <= 72; step += 1) {
    const x = step / 72;
    const curveBias = bands.reduce((sum, band) => sum + bandContribution(band, x), 0);
    const harmonic = Math.sin(motionPhase * 0.7 + x * 11) * 0.05;
    const ripple = Math.cos(motionPhase * 1.3 + x * 17) * 0.025;
    const guide = variant === "guide" ? Math.sin(motionPhase * 0.35 + x * 7) * 0.03 : 0;
    const y = clamp(0.54 - curveBias * 0.16 + harmonic + ripple + guide, 0.12, 0.88);
    points.push(`${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`);
  }
  return `M ${points.join(" L ")}`;
}

function createTracePath(level, motionPhase, index, variant = "line") {
  const points = [];
  for (let step = 0; step <= 90; step += 1) {
    const x = step / 90;
    const harmonic = Math.sin(motionPhase * (0.85 + index * 0.08) + x * (7 + index * 1.2)) * (0.035 + level * 0.02);
    const ripple = Math.cos(motionPhase * 1.2 + x * (13 + index * 0.8)) * 0.02;
    const emphasis = variant === "gr"
      ? 0.24 + (1 - level) * 0.38
      : 0.78 - level * 0.48;
    const y = clamp(emphasis + harmonic + ripple, 0.08, 0.92);
    points.push(`${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`);
  }
  return `M ${points.join(" L ")}`;
}

function createTransferPath(input, drive, ceiling) {
  const points = [];
  const threshold = clamp(0.44 - input * 0.18, 0.16, 0.48);
  const ratio = 1.35 + drive * 9.25;
  const ceilingLevel = clamp(0.72 + ceiling * 0.2, 0.54, 0.94);

  for (let step = 0; step <= 90; step += 1) {
    const x = step / 90;
    const compressed = x <= threshold
      ? x
      : threshold + ((x - threshold) / ratio);
    const shaped = compressed + Math.sin(x * Math.PI) * drive * 0.015;
    const output = clamp(Math.min(shaped, ceilingLevel), 0, 1);
    points.push(`${(x * 100).toFixed(2)},${((1 - output) * 100).toFixed(2)}`);
  }

  return { path: `M ${points.join(" L ")}`, threshold, ratio, ceilingLevel };
}

function bandContribution(band, x) {
  const center = band.x;
  const amplitude = clamp((0.5 - band.y) * 2.1, -1.25, 1.25);
  const width = 0.04 + (1 - band.qValue) * 0.15;

  if (band.role === "cut") {
    const curve = 1 / (1 + Math.exp((x - center) * 26));
    return -Math.max(0.18, center * 0.7) * curve;
  }

  if (band.role === "shelf") {
    const slope = 1 / (1 + Math.exp(-(x - center) * 16));
    return (center > 0.5 ? slope : 1 - slope) * amplitude * 0.85;
  }

  return Math.exp(-((x - center) ** 2) / (2 * width ** 2)) * amplitude;
}

function resolveBandState(schema, state, band) {
  const xControl = band.xControl ? resolveControl(schema, band.xControl) : null;
  const yControl = band.yControl ? resolveControl(schema, band.yControl) : null;
  const qControl = band.qControl ? resolveControl(schema, band.qControl) : null;

  const x = xControl
    ? (
      xControl.unit === "Hz" || band.frequencyScale === "log"
        ? normalizeFrequencyValue(
          readControlValue(schema, state, band.xControl, xControl.init ?? xControl.min ?? 200),
          band.xMin ?? xControl.min ?? 20,
          band.xMax ?? xControl.max ?? 20000
        )
        : normalizeBipolarValue(
          readControlValue(schema, state, band.xControl, xControl.init ?? xControl.min ?? 0),
          band.xMin ?? xControl.min ?? 0,
          band.xMax ?? xControl.max ?? 1
        )
    )
    : clamp(Number(band.x ?? 0.5), 0, 1);
  const y = yControl
    ? 1 - normalizeBipolarValue(
      readControlValue(schema, state, band.yControl, yControl.init ?? 0),
      band.yMin ?? yControl.min ?? -1,
      band.yMax ?? yControl.max ?? 1
    )
    : clamp(Number(band.y ?? 0.5), 0.08, 0.92);
  const qValue = qControl
    ? normalizeUnitValue(
      readControlValue(schema, state, band.qControl, qControl.init ?? 1),
      band.qMax ?? qControl.max ?? 8
    )
    : normalizeUnitValue(Number(band.width ?? 0.6), 1);

  return {
    ...band,
    x,
    y,
    qValue,
    readouts: createReadoutRows(band.readouts)
      .map((entry) => ({ ...entry, value: readoutValueText(schema, state, entry) }))
      .filter((entry) => entry.value)
  };
}

function resolveRegionBoundary(schema, state, config, fallback) {
  if (Number.isFinite(Number(config.fixed))) {
    return clamp(Number(config.fixed), 0, 1);
  }

  const control = resolveControl(schema, config.control);
  if (!control) {
    return fallback;
  }

  const value = readControlValue(schema, state, config.control, control.init ?? fallback);
  if (control.unit === "Hz" || control.scale === "log" || config.scale === "log") {
    return normalizeFrequencyValue(value, config.min ?? control.min ?? 20, config.max ?? control.max ?? 20000);
  }
  return normalizeBipolarValue(value, config.min ?? control.min ?? 0, config.max ?? control.max ?? 1);
}

function resolveRegionState(schema, state, region) {
  const start = resolveRegionBoundary(schema, state, {
    control: region.startControl,
    fixed: region.start,
    min: region.xMin,
    max: region.xMax,
    scale: region.frequencyScale
  }, 0);
  const end = resolveRegionBoundary(schema, state, {
    control: region.endControl,
    fixed: region.end,
    min: region.xMin,
    max: region.xMax,
    scale: region.frequencyScale
  }, 1);
  const energy = measureMeterValue(schema, state, region.energyMeterId);
  const reduction = measureMeterValue(schema, state, region.reductionMeterId);

  return {
    ...region,
    start,
    end: Math.max(end, start + 0.06),
    energy,
    reduction,
    readouts: createReadoutRows(region.readouts)
      .map((entry) => ({ ...entry, value: readoutValueText(schema, state, entry) }))
      .filter((entry) => entry.value)
  };
}

function buildGraphSurface(model, schema, state) {
  const bands = Array.isArray(model.config.bands) ? model.config.bands : [];
  if (!bands.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--graph",
    "surface-card__body surface-card__body--graph"
  );
  const graphWrap = document.createElement("div");
  graphWrap.className = "graph-workbench";

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";
  graphWrap.append(badgeRow);

  const canvas = document.createElement("div");
  canvas.className = "graph-canvas";
  const svg = createSvgElement("svg");
  svg.setAttribute("class", "graph-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  const grid = createSvgElement("g");
  grid.setAttribute("class", "graph-grid");
  [10, 22, 35, 50, 65, 78, 90].forEach((x) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("y2", "100");
    grid.append(line);
  });
  [18, 34, 50, 66, 82].forEach((y) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "100");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    grid.append(line);
  });
  svg.append(grid);

  const guidePath = createSvgElement("path");
  guidePath.setAttribute("class", "graph-guide-path");
  svg.append(guidePath);

  const analyzerPath = createSvgElement("path");
  analyzerPath.setAttribute("class", "graph-analyzer-path");
  svg.append(analyzerPath);

  const curvePath = createSvgElement("path");
  curvePath.setAttribute("class", "graph-curve-path");
  svg.append(curvePath);

  const handleLayer = document.createElement("div");
  handleLayer.className = "graph-handle-layer";
  const handleViews = new Map();
  let selectedBandId = String(model.config.selection || bands[0]?.id || "");

  bands.forEach((band) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-band-handle";
    button.dataset.bandId = band.id;
    button.dataset.role = band.role || "band";
    button.style.setProperty("--band-color", resolveToneColor(band.accent));
    button.setAttribute("aria-label", band.label || humanizeId(band.id));
    button.addEventListener("click", () => {
      selectedBandId = String(band.id);
      update();
    });

    const label = document.createElement("span");
    label.className = "graph-band-label";
    label.textContent = band.label || humanizeId(band.id);
    button.append(label);
    handleLayer.append(button);
    handleViews.set(band.id, button);
  });

  const popover = document.createElement("aside");
  popover.className = "graph-popover";
  const popoverTitle = document.createElement("h4");
  const popoverMeta = document.createElement("p");
  const readoutList = document.createElement("div");
  readoutList.className = "graph-readout-list";
  popover.append(popoverTitle, popoverMeta, readoutList);

  canvas.append(svg, handleLayer, popover);
  graphWrap.append(canvas);

  const gridLabels = document.createElement("div");
  gridLabels.className = "graph-grid-labels";
  (Array.isArray(model.config.gridLabels) ? model.config.gridLabels : ["20", "100", "500", "2k", "10k", "20k"]).forEach((label) => {
    const item = document.createElement("span");
    item.textContent = label;
    gridLabels.append(item);
  });
  graphWrap.append(gridLabels);

  const footer = document.createElement("div");
  footer.className = "surface-band-rail";
  const railViews = [];
  bands.forEach((band) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "surface-band-chip";
    chip.addEventListener("click", () => {
      selectedBandId = String(band.id);
      update();
    });
    const label = document.createElement("strong");
    label.textContent = band.label || humanizeId(band.id);
    const value = document.createElement("span");
    chip.append(label, value);
    railViews.push({ band, chip, value });
    footer.append(chip);
  });
  graphWrap.append(footer);

  body.append(graphWrap);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    const bandStates = bands.map((band) => resolveBandState(schema, state, band));
    const selected = bandStates.find((band) => String(band.id) === selectedBandId) ?? bandStates[0];

    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    curvePath.setAttribute("d", createCurvePath(bandStates));
    analyzerPath.setAttribute("d", createAnalyzerPath(bandStates, state.motionPhase, "program"));
    guidePath.setAttribute("d", createAnalyzerPath(bandStates, state.motionPhase, "guide"));

    bandStates.forEach((band) => {
      const handle = handleViews.get(band.id);
      if (!handle) {
        return;
      }
      handle.style.left = `${band.x * 100}%`;
      handle.style.top = `${band.y * 100}%`;
      handle.classList.toggle("is-selected", String(band.id) === String(selected.id));
    });

    railViews.forEach(({ band, chip, value }) => {
      const runtimeBand = bandStates.find((entry) => entry.id === band.id);
      chip.classList.toggle("is-selected", String(runtimeBand?.id) === String(selected.id));
      value.textContent = runtimeBand?.readouts[0]?.value || runtimeBand?.readouts[1]?.value || "";
    });

    popoverTitle.textContent = selected.label || humanizeId(selected.id);
    popoverMeta.textContent = selected.role ? humanizeId(selected.role) : "Band";
    readoutList.innerHTML = "";
    selected.readouts.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "graph-readout-row";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const value = document.createElement("strong");
      value.textContent = entry.value;
      row.append(label, value);
      readoutList.append(row);
    });

    popover.style.left = `${clamp(selected.x * 100 + 6, 12, 78)}%`;
    popover.style.top = `${clamp(selected.y * 100 - 8, 10, 74)}%`;
  };

  return { node: card, update };
}

function buildTraceSurface(model, schema, state) {
  const series = Array.isArray(model.config.series) ? model.config.series : [];
  if (!series.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--trace",
    "surface-card__body surface-card__body--trace"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const canvas = document.createElement("div");
  canvas.className = "trace-canvas";
  const svg = createSvgElement("svg");
  svg.setAttribute("class", "trace-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  const grid = createSvgElement("g");
  grid.setAttribute("class", "trace-grid");
  [10, 30, 50, 70, 90].forEach((x) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("y2", "100");
    grid.append(line);
  });
  [16, 33, 50, 67, 84].forEach((y) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "100");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    grid.append(line);
  });
  svg.append(grid);

  const pathViews = [];
  series.forEach((entry) => {
    const path = createSvgElement("path");
    path.setAttribute("class", "trace-path");
    path.dataset.variant = entry.variant || "line";
    path.style.setProperty("--trace-color", resolveToneColor(entry.tone));
    svg.append(path);
    pathViews.push({ entry, path });
  });

  canvas.append(svg);

  const readouts = document.createElement("div");
  readouts.className = "trace-readouts";
  const readoutViews = series.map((entry) => {
    const row = document.createElement("div");
    row.className = "trace-readout-row";
    const label = document.createElement("span");
    label.textContent = entry.label || humanizeId(entry.id);
    const value = document.createElement("strong");
    row.append(label, value);
    readouts.append(row);
    return { entry, value };
  });

  body.append(badgeRow, canvas, readouts);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    pathViews.forEach(({ entry, path }, index) => {
      const { meter, value } = measureMeterValue(schema, state, entry.meterId, 0);
      const level = entry.meterId
        ? meterPercent(value, meter)
        : resolveActivity(schema, state, entry, 0.5);
      path.setAttribute("d", createTracePath(level, state.motionPhase, index, entry.variant));
    });

    readoutViews.forEach(({ entry, value }) => {
      if (entry.meterId) {
        const measured = measureMeterValue(schema, state, entry.meterId, 0);
        value.textContent = formatMeterValue(measured.value, measured.meter);
        return;
      }
      if (entry.control) {
        value.textContent = controlValueText(schema, state, entry.control);
        return;
      }
      value.textContent = "";
    });
  };

  return { node: card, update };
}

function buildFieldSurface(model, schema, state) {
  const nodes = Array.isArray(model.config.nodes) ? model.config.nodes : [];
  if (!nodes.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--field",
    "surface-card__body surface-card__body--field"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const canvas = document.createElement("div");
  canvas.className = "field-canvas";
  const svg = createSvgElement("svg");
  svg.setAttribute("class", "field-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  const lineLayer = createSvgElement("g");
  lineLayer.setAttribute("class", "field-links");
  svg.append(lineLayer);
  canvas.append(svg);

  const nodeLayer = document.createElement("div");
  nodeLayer.className = "field-node-layer";
  canvas.append(nodeLayer);

  const nodeViews = new Map();
  let selectedNodeId = String(model.config.selection || nodes[0]?.id || "");

  nodes.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-node";
    button.dataset.nodeId = node.id;
    button.style.setProperty("--node-color", resolveToneColor(node.accent));
    button.addEventListener("click", () => {
      selectedNodeId = String(node.id);
      update();
    });

    const label = document.createElement("span");
    label.className = "field-node-label";
    label.textContent = node.label || humanizeId(node.id);
    button.append(label);
    nodeLayer.append(button);
    nodeViews.set(node.id, button);
  });

  const popover = document.createElement("aside");
  popover.className = "graph-popover field-popover";
  const popoverTitle = document.createElement("h4");
  const popoverMeta = document.createElement("p");
  const readoutList = document.createElement("div");
  readoutList.className = "graph-readout-list";
  popover.append(popoverTitle, popoverMeta, readoutList);
  canvas.append(popover);

  const footer = document.createElement("div");
  footer.className = "surface-band-rail";
  const chipViews = [];
  nodes.forEach((node) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "surface-band-chip";
    chip.addEventListener("click", () => {
      selectedNodeId = String(node.id);
      update();
    });
    const label = document.createElement("strong");
    label.textContent = node.label || humanizeId(node.id);
    const value = document.createElement("span");
    chip.append(label, value);
    chipViews.push({ node, chip, value });
    footer.append(chip);
  });

  const linkViews = (Array.isArray(model.config.links) ? model.config.links : []).map((link) => {
    const line = createSvgElement("line");
    line.setAttribute("class", "field-link");
    line.style.setProperty("--trace-color", resolveToneColor(link.tone));
    lineLayer.append(line);
    return { link, line };
  });

  body.append(badgeRow, canvas, footer);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const runtimeNodes = nodes.map((node) => {
      const activity = resolveActivity(schema, state, node, 0.35);
      return {
        ...node,
        activity,
        x: clamp(
          normalizePointAxis(schema, state, {
            control: node.xControl,
            value: node.x,
            min: node.xMin,
            max: node.xMax,
            scale: node.frequencyScale
          }, 0.5, false),
          0.08,
          0.92
        ),
        y: clamp(
          normalizePointAxis(schema, state, {
            control: node.yControl,
            value: node.y,
            min: node.yMin,
            max: node.yMax,
            scale: node.frequencyScale
          }, 0.5, true),
          0.08,
          0.92
        ),
        readouts: createReadoutRows(node.readouts, node.control)
          .map((entry) => ({ ...entry, value: readoutValueText(schema, state, entry) }))
          .filter((entry) => entry.value),
        meterValue: node.meterId ? measureMeterValue(schema, state, node.meterId, 0) : null
      };
    });
    const selected = runtimeNodes.find((node) => String(node.id) === selectedNodeId) ?? runtimeNodes[0];

    runtimeNodes.forEach((node) => {
      const button = nodeViews.get(node.id);
      if (!button) {
        return;
      }
      const size = 58 + node.activity * 44;
      button.style.left = `${node.x * 100}%`;
      button.style.top = `${node.y * 100}%`;
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.style.opacity = String(0.62 + node.activity * 0.38);
      button.classList.toggle("is-selected", String(node.id) === String(selected.id));
    });

    chipViews.forEach(({ node, chip, value }) => {
      const runtimeNode = runtimeNodes.find((entry) => entry.id === node.id);
      chip.classList.toggle("is-selected", String(runtimeNode?.id) === String(selected.id));
      if (runtimeNode?.meterValue?.meter) {
        value.textContent = formatMeterValue(runtimeNode.meterValue.value, runtimeNode.meterValue.meter);
      } else {
        value.textContent = runtimeNode?.readouts[0]?.value || "";
      }
    });

    linkViews.forEach(({ link, line }) => {
      const from = runtimeNodes.find((node) => node.id === link.from);
      const to = runtimeNodes.find((node) => node.id === link.to);
      if (!from || !to) {
        return;
      }
      line.setAttribute("x1", String(from.x * 100));
      line.setAttribute("y1", String(from.y * 100));
      line.setAttribute("x2", String(to.x * 100));
      line.setAttribute("y2", String(to.y * 100));
      line.style.opacity = String(0.22 + ((from.activity + to.activity) / 2) * 0.55);
    });

    popoverTitle.textContent = selected.label || humanizeId(selected.id);
    popoverMeta.textContent = selected.meterValue?.meter
      ? formatMeterValue(selected.meterValue.value, selected.meterValue.meter)
      : humanizeId(selected.mode || selected.kind || "Node");
    readoutList.innerHTML = "";
    selected.readouts.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "graph-readout-row";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const value = document.createElement("strong");
      value.textContent = entry.value;
      row.append(label, value);
      readoutList.append(row);
    });

    popover.style.left = `${clamp(selected.x * 100 + 6, 12, 78)}%`;
    popover.style.top = `${clamp(selected.y * 100 - 8, 10, 74)}%`;
  };

  return { node: card, update };
}

function buildTransferSurface(model, schema, state) {
  const curveControls = Array.isArray(model.config.curveControls) ? model.config.curveControls : [];
  if (!curveControls.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--transfer",
    "surface-card__body surface-card__body--transfer"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const canvas = document.createElement("div");
  canvas.className = "transfer-canvas";
  const svg = createSvgElement("svg");
  svg.setAttribute("class", "transfer-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  const grid = createSvgElement("g");
  grid.setAttribute("class", "transfer-grid");
  [10, 25, 40, 55, 70, 85].forEach((x) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("y2", "100");
    grid.append(line);
  });
  [12, 28, 44, 60, 76, 92].forEach((y) => {
    const line = createSvgElement("line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "100");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    grid.append(line);
  });
  svg.append(grid);

  const guide = createSvgElement("path");
  guide.setAttribute("class", "transfer-guide-path");
  guide.setAttribute("d", "M 0,100 L 100,0");
  svg.append(guide);

  const ceilingLine = createSvgElement("line");
  ceilingLine.setAttribute("class", "transfer-ceiling-line");
  ceilingLine.setAttribute("x1", "0");
  ceilingLine.setAttribute("x2", "100");
  svg.append(ceilingLine);

  const curve = createSvgElement("path");
  curve.setAttribute("class", "transfer-curve-path");
  svg.append(curve);
  canvas.append(svg);

  const handleLayer = document.createElement("div");
  handleLayer.className = "transfer-handle-layer";
  const handleViews = new Map();
  curveControls.forEach((entry) => {
    const handle = document.createElement("div");
    handle.className = "transfer-handle";
    handle.dataset.role = entry.role || entry.control || "control";
    handle.style.setProperty("--handle-color", resolveToneColor(entry.tone));
    const label = document.createElement("span");
    label.className = "transfer-handle__label";
    label.textContent = entry.label || humanizeId(entry.control || entry.role || "control");
    handle.append(label);
    handleLayer.append(handle);
    handleViews.set(entry.role || entry.control || label.textContent, handle);
  });
  canvas.append(handleLayer);

  const sectionGrid = document.createElement("div");
  sectionGrid.className = "transfer-sections";
  const createSection = (titleText) => {
    const section = document.createElement("section");
    section.className = "surface-section-card";
    const title = document.createElement("h4");
    title.textContent = titleText;
    const list = document.createElement("div");
    list.className = "surface-value-list";
    section.append(title, list);
    sectionGrid.append(section);
    return list;
  };

  const curveList = createSection("Curve");
  const timingList = createSection("Timing");
  const detailList = createSection("Detail");
  const monitorList = createSection("Monitor");

  const createValueViews = (items, list) => (Array.isArray(items) ? items : []).map((item) => {
    const row = document.createElement("div");
    row.className = "surface-value-row";
    const label = document.createElement("span");
    label.textContent = item.label || humanizeId(item.control || item.id || "item");
    const value = document.createElement("strong");
    row.append(label, value);
    list.append(row);
    return { item, value };
  });

  const curveViews = createValueViews(curveControls, curveList);
  const timingViews = createValueViews(model.config.timingItems, timingList);
  const detailViews = createValueViews(model.config.detailItems, detailList);
  const monitorItems = [
    ...(model.config.monitor?.control
      ? [{
        label: model.config.monitor.label || humanizeId(model.config.monitor.control),
        control: model.config.monitor.control
      }]
      : []),
    ...((Array.isArray(model.config.meters) ? model.config.meters : []).map((item) => ({
      label: item.label || humanizeId(item.meterId || item.meter || "meter"),
      meterId: item.meterId || item.meter
    })))
  ];
  const monitorViews = createValueViews(monitorItems, monitorList);

  body.append(badgeRow, canvas, sectionGrid);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const controlStates = curveControls.map((entry) => {
      const control = resolveControl(schema, entry.control);
      const value = control ? readControlValue(schema, state, entry.control, control.init ?? 0) : 0;
      return {
        ...entry,
        controlId: entry.control,
        control,
        value,
        normalized: control ? normalizeControlValue(control, value) : 0.5,
        text: control ? formatValue(control, value, schema.ui) : ""
      };
    });

    const inputState = controlStates.find((entry) => entry.role === "input") ?? controlStates[0];
    const driveState = controlStates.find((entry) => entry.role === "drive") ?? controlStates[1] ?? inputState;
    const ceilingState = controlStates.find((entry) => entry.role === "ceiling") ?? controlStates[2] ?? driveState;
    const transfer = createTransferPath(
      inputState?.normalized ?? 0.5,
      driveState?.normalized ?? 0.5,
      ceilingState?.normalized ?? 0.5
    );

    curve.setAttribute("d", transfer.path);
    ceilingLine.setAttribute("y1", String((1 - transfer.ceilingLevel) * 100));
    ceilingLine.setAttribute("y2", String((1 - transfer.ceilingLevel) * 100));

    const handlePositions = {
      input: {
        x: transfer.threshold,
        y: 1 - transfer.threshold
      },
      drive: {
        x: clamp(transfer.threshold + 0.16 + driveState.normalized * 0.14, 0.24, 0.92),
        y: clamp(0.62 - driveState.normalized * 0.3, 0.12, 0.76)
      },
      ceiling: {
        x: 0.9,
        y: 1 - transfer.ceilingLevel
      }
    };

    controlStates.forEach((entry) => {
      const handle = handleViews.get(entry.role || entry.control || entry.label);
      const position = handlePositions[entry.role || "input"];
      if (!handle || !position) {
        return;
      }
      handle.style.left = `${position.x * 100}%`;
      handle.style.top = `${position.y * 100}%`;
      handle.classList.toggle("is-active", entry.role === "drive");
    });

    curveViews.forEach(({ item, value }) => {
      const controlState = controlStates.find((entry) => entry.controlId === item.control);
      value.textContent = controlState?.text || "";
    });

    timingViews.forEach(({ item, value }) => {
      value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
    });

    detailViews.forEach(({ item, value }) => {
      value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
    });

    monitorViews.forEach(({ item, value }) => {
      if (item.meterId) {
        const measured = measureMeterValue(schema, state, item.meterId, 0);
        value.textContent = formatMeterValue(measured.value, measured.meter);
        return;
      }
      value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
    });
  };

  return { node: card, update };
}

function buildLinkedStripSurface(model, schema, state) {
  const bands = Array.isArray(model.config.bands) ? model.config.bands : [];
  if (!bands.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--linked-strip",
    "surface-card__body surface-card__body--linked-strip"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const grid = document.createElement("div");
  grid.className = "linked-strip__grid";
  let selectedBandId = String(model.config.selection || bands[0]?.id || "");
  const bandViews = [];

  bands.forEach((band) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "linked-band-card";
    button.dataset.bandId = band.id;
    button.style.setProperty("--band-accent", resolveToneColor(band.accent));
    button.addEventListener("click", () => {
      selectedBandId = String(band.id);
      update();
    });

    const header = document.createElement("div");
    header.className = "linked-band-card__header";
    const title = document.createElement("strong");
    title.textContent = band.label || humanizeId(band.id);
    const accent = document.createElement("span");
    accent.className = "linked-band-card__accent";
    header.append(title, accent);

    const valueList = document.createElement("div");
    valueList.className = "surface-value-list";
    const itemViews = (Array.isArray(band.items) ? band.items : []).map((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label || humanizeId(item.control || item.id || "item");
      const value = document.createElement("strong");
      row.append(label, value);
      valueList.append(row);
      return { item, value };
    });

    const meterList = document.createElement("div");
    meterList.className = "linked-meter-list";
    const meterViews = (Array.isArray(band.meters) ? band.meters : []).map((item) => {
      const row = document.createElement("div");
      row.className = "linked-meter-row";
      const label = document.createElement("span");
      label.textContent = item.label || humanizeId(item.meterId || item.meter || "meter");
      const track = document.createElement("div");
      track.className = "linked-meter-track";
      const fill = document.createElement("div");
      fill.className = "linked-meter-fill";
      track.append(fill);
      const value = document.createElement("strong");
      row.append(label, track, value);
      meterList.append(row);
      return { item, fill, value };
    });

    button.append(header, valueList, meterList);
    grid.append(button);
    bandViews.push({ band, button, itemViews, meterViews });
  });

  const globalSection = document.createElement("section");
  globalSection.className = "surface-section-card linked-strip__globals";
  const globalTitle = document.createElement("h4");
  globalTitle.textContent = "Shared controls";
  const globalList = document.createElement("div");
  globalList.className = "surface-value-list";
  const globalViews = (Array.isArray(model.config.globalItems) ? model.config.globalItems : []).map((item) => {
    const row = document.createElement("div");
    row.className = "surface-value-row";
    const label = document.createElement("span");
    label.textContent = item.label || humanizeId(item.control || item.id || "item");
    const value = document.createElement("strong");
    row.append(label, value);
    globalList.append(row);
    return { item, value };
  });
  globalSection.append(globalTitle, globalList);

  body.append(badgeRow, grid, globalSection);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    bandViews.forEach((view) => {
      view.button.classList.toggle("is-selected", String(view.band.id) === selectedBandId);
      view.itemViews.forEach(({ item, value }) => {
        value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
      });
      view.meterViews.forEach(({ item, fill, value }) => {
        const measured = measureMeterValue(schema, state, item.meterId || item.meter, 0);
        fill.style.width = `${meterPercent(measured.value, measured.meter) * 100}%`;
        fill.dataset.mode = measured.meter?.mode || "peak";
        value.textContent = formatMeterValue(measured.value, measured.meter);
      });
    });

    globalViews.forEach(({ item, value }) => {
      value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
    });
  };

  return { node: card, update };
}

function buildRegionSurface(model, schema, state) {
  const regions = Array.isArray(model.config.regions) ? model.config.regions : [];
  if (!regions.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--regions",
    "surface-card__body surface-card__body--regions"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const editor = document.createElement("div");
  editor.className = "region-editor";
  const regionViews = new Map();
  let selectedRegionId = String(model.config.selection || regions[0]?.id || "");

  regions.forEach((region) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "region-block";
    button.dataset.regionId = region.id;
    button.style.setProperty("--region-color", resolveToneColor(region.accent));
    button.addEventListener("click", () => {
      selectedRegionId = String(region.id);
      update();
    });

    const label = document.createElement("strong");
    label.className = "region-block__label";
    label.textContent = region.label || humanizeId(region.id);
    const energy = document.createElement("div");
    energy.className = "region-meter";
    const energyFill = document.createElement("div");
    energyFill.className = "region-meter__fill region-meter__fill--energy";
    energy.append(energyFill);
    const reduction = document.createElement("div");
    reduction.className = "region-meter";
    const reductionFill = document.createElement("div");
    reductionFill.className = "region-meter__fill region-meter__fill--reduction";
    reduction.append(reductionFill);
    const summary = document.createElement("span");
    summary.className = "region-block__summary";
    button.append(label, energy, reduction, summary);
    editor.append(button);
    regionViews.set(region.id, { button, energyFill, reductionFill, summary });
  });

  const popover = document.createElement("aside");
  popover.className = "graph-popover region-popover";
  const popoverTitle = document.createElement("h4");
  const popoverMeta = document.createElement("p");
  const readoutList = document.createElement("div");
  readoutList.className = "graph-readout-list";
  popover.append(popoverTitle, popoverMeta, readoutList);
  editor.append(popover);

  const footer = document.createElement("div");
  footer.className = "surface-band-rail";
  const chipViews = [];
  regions.forEach((region) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "surface-band-chip";
    chip.addEventListener("click", () => {
      selectedRegionId = String(region.id);
      update();
    });
    const label = document.createElement("strong");
    label.textContent = region.label || humanizeId(region.id);
    const value = document.createElement("span");
    chip.append(label, value);
    chipViews.push({ region, chip, value });
    footer.append(chip);
  });

  body.append(badgeRow, editor, footer);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const runtimeRegions = regions.map((region) => resolveRegionState(schema, state, region));
    const selected = runtimeRegions.find((region) => String(region.id) === selectedRegionId) ?? runtimeRegions[0];

    runtimeRegions.forEach((region) => {
      const view = regionViews.get(region.id);
      if (!view) {
        return;
      }
      view.button.style.left = `${region.start * 100}%`;
      view.button.style.width = `${Math.max(6, (region.end - region.start) * 100)}%`;
      view.button.classList.toggle("is-selected", String(region.id) === String(selected.id));
      view.energyFill.style.width = `${meterPercent(region.energy.value, region.energy.meter) * 100}%`;
      view.reductionFill.style.width = `${meterPercent(region.reduction.value, region.reduction.meter) * 100}%`;
      view.summary.textContent = region.readouts[0]?.value || region.readouts[1]?.value || "";
    });

    chipViews.forEach(({ region, chip, value }) => {
      const runtimeRegion = runtimeRegions.find((entry) => entry.id === region.id);
      chip.classList.toggle("is-selected", String(runtimeRegion?.id) === String(selected.id));
      value.textContent = runtimeRegion?.readouts[0]?.value || runtimeRegion?.readouts[1]?.value || "";
    });

    popoverTitle.textContent = selected.label || humanizeId(selected.id);
    popoverMeta.textContent = selected.reduction.meter
      ? `${formatMeterValue(selected.reduction.value, selected.reduction.meter)} reduction`
      : humanizeId(selected.role || "Band");
    readoutList.innerHTML = "";
    selected.readouts.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "graph-readout-row";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const value = document.createElement("strong");
      value.textContent = entry.value;
      row.append(label, value);
      readoutList.append(row);
    });

    popover.style.left = `${clamp(((selected.start + selected.end) / 2) * 100, 14, 80)}%`;
    popover.style.top = "18%";
  };

  return { node: card, update };
}

function buildModulationDockSurface(model, schema, state) {
  const sources = Array.isArray(model.config.sources) ? model.config.sources : [];
  const slots = Array.isArray(model.config.slots) ? model.config.slots : [];
  if (!sources.length && !slots.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--mod-dock",
    "surface-card__body surface-card__body--mod-dock"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const sourceRail = document.createElement("div");
  sourceRail.className = "mod-source-rail";
  const sourceViews = sources.map((source) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mod-source-chip";
    chip.style.setProperty("--source-color", resolveToneColor(source.tone || source.accent));
    const label = document.createElement("strong");
    label.textContent = source.label || humanizeId(source.id);
    const value = document.createElement("span");
    chip.append(label, value);
    sourceRail.append(chip);
    return { source, chip, value };
  });

  const slotGrid = document.createElement("div");
  slotGrid.className = "mod-slot-grid";
  const slotViews = slots.map((slot) => {
    const panel = document.createElement("section");
    panel.className = "mod-slot-card";
    panel.style.setProperty("--slot-color", resolveToneColor(slot.tone || slot.accent));

    const header = document.createElement("div");
    header.className = "mod-slot-card__header";
    const title = document.createElement("h4");
    title.textContent = slot.label || humanizeId(slot.id);
    const assignment = document.createElement("span");
    assignment.className = "mod-slot-card__assignment";
    header.append(title, assignment);

    const list = document.createElement("div");
    list.className = "surface-value-list";
    const rowViews = createReadoutRows(slot.readouts, slot.amountControl || slot.control).map((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      row.append(label, value);
      list.append(row);
      return { item, value };
    });

    panel.append(header, list);
    slotGrid.append(panel);
    return { slot, panel, assignment, rowViews };
  });

  body.append(badgeRow, sourceRail, slotGrid);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const sourceStates = sources.map((source) => {
      const control = source.control ? resolveControl(schema, source.control) : null;
      const rawValue = control ? readControlValue(schema, state, source.control, control.init ?? 0) : null;
      const meterSample = source.meterId ? measureMeterValue(schema, state, source.meterId, 0) : null;
      const valueText = meterSample?.meter
        ? formatMeterValue(meterSample.value, meterSample.meter)
        : control
          ? formatValue(control, rawValue, schema.ui)
          : source.value || "";
      const activity = source.meterId
        ? meterPercent(meterSample?.value, meterSample?.meter)
        : control
          ? normalizeControlValue(control, rawValue)
          : resolveActivity(schema, state, source, 0.5);
      return { ...source, control, rawValue, meterSample, valueText, activity };
    });

    sourceViews.forEach(({ source, chip, value }) => {
      const runtimeSource = sourceStates.find((entry) => entry.id === source.id);
      chip.style.opacity = String(0.58 + (runtimeSource?.activity ?? 0.5) * 0.42);
      chip.classList.toggle("is-active", (runtimeSource?.activity ?? 0) > 0.45);
      value.textContent = runtimeSource?.valueText || "";
    });

    slotViews.forEach(({ slot, panel, assignment, rowViews }) => {
      const activity = resolveActivity(schema, state, {
        meterId: slot.meterId,
        control: slot.amountControl,
        controls: slot.activityControls
      }, 0.35);
      panel.style.opacity = String(0.72 + activity * 0.28);
      panel.classList.toggle("is-active", activity > 0.5);

      if (slot.sourceControl) {
        assignment.textContent = controlValueText(schema, state, slot.sourceControl);
      } else if (slot.assignment) {
        assignment.textContent = slot.assignment;
      } else {
        assignment.textContent = "";
      }

      rowViews.forEach(({ item, value }) => {
        if (item.meterId) {
          const measured = measureMeterValue(schema, state, item.meterId, 0);
          value.textContent = formatMeterValue(measured.value, measured.meter);
          return;
        }
        value.textContent = readoutValueText(schema, state, item);
      });
    });
  };

  return { node: card, update };
}

function buildTimelineSurface(model, schema, state) {
  const taps = Array.isArray(model.config.taps) ? model.config.taps : [];
  if (!taps.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--timeline",
    "surface-card__body surface-card__body--timeline"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const canvas = document.createElement("div");
  canvas.className = "timeline-canvas";

  const lanes = Array.isArray(model.config.lanes) && model.config.lanes.length ? model.config.lanes : ["Input", "Echo", "Tail"];
  const laneLabels = document.createElement("div");
  laneLabels.className = "timeline-lane-labels";
  laneLabels.style.gridTemplateRows = `repeat(${lanes.length}, 1fr)`;
  lanes.forEach((lane) => {
    const item = document.createElement("span");
    item.textContent = typeof lane === "string" ? lane : lane.label || humanizeId(lane.id);
    laneLabels.append(item);
  });

  const lineLayer = document.createElement("div");
  lineLayer.className = "timeline-line-layer";
  const tapLayer = document.createElement("div");
  tapLayer.className = "timeline-tap-layer";
  const tapViews = new Map();
  let selectedTapId = String(model.config.selection || taps[0]?.id || "");

  taps.forEach((tap) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-tap";
    button.dataset.tapId = tap.id;
    button.style.setProperty("--tap-color", resolveToneColor(tap.tone || tap.accent));
    button.addEventListener("click", () => {
      selectedTapId = String(tap.id);
      update();
    });
    const label = document.createElement("span");
    label.className = "timeline-tap__label";
    label.textContent = tap.label || humanizeId(tap.id);
    button.append(label);
    tapLayer.append(button);
    tapViews.set(tap.id, button);
  });

  const connectionViews = (Array.isArray(model.config.connections) ? model.config.connections : []).map((connection) => {
    const line = document.createElement("div");
    line.className = "timeline-connection";
    line.style.setProperty("--tap-color", resolveToneColor(connection.tone || connection.accent));
    lineLayer.append(line);
    return { connection, line };
  });

  const popover = document.createElement("aside");
  popover.className = "graph-popover timeline-popover";
  const popoverTitle = document.createElement("h4");
  const popoverMeta = document.createElement("p");
  const readoutList = document.createElement("div");
  readoutList.className = "graph-readout-list";
  popover.append(popoverTitle, popoverMeta, readoutList);
  canvas.append(laneLabels, lineLayer, tapLayer, popover);

  const footer = document.createElement("div");
  footer.className = "surface-band-rail";
  const chipViews = taps.map((tap) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "surface-band-chip";
    chip.addEventListener("click", () => {
      selectedTapId = String(tap.id);
      update();
    });
    const label = document.createElement("strong");
    label.textContent = tap.label || humanizeId(tap.id);
    const value = document.createElement("span");
    chip.append(label, value);
    footer.append(chip);
    return { tap, chip, value };
  });

  body.append(badgeRow, canvas, footer);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const laneCount = Math.max(lanes.length, 1);
  const laneY = (laneIndex) => ((laneIndex + 1) / (laneCount + 1)) * 100;

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const runtimeTaps = taps.map((tap, index) => {
      const control = tap.timeControl ? resolveControl(schema, tap.timeControl) : null;
      const timeValue = control ? readControlValue(schema, state, tap.timeControl, control.init ?? 0) : Number(tap.x ?? index / Math.max(taps.length - 1, 1));
      const x = control
        ? normalizeBipolarValue(timeValue, tap.xMin ?? control.min ?? 0, tap.xMax ?? control.max ?? 1000)
        : clamp(Number(tap.x ?? index / Math.max(taps.length - 1, 1)), 0.05, 0.95);
      const laneIndex = Number.isFinite(Number(tap.lane)) ? Number(tap.lane) : index % laneCount;
      const meterSample = tap.meterId ? measureMeterValue(schema, state, tap.meterId, 0) : null;
      const activity = tap.meterId
        ? meterPercent(meterSample?.value, meterSample?.meter)
        : resolveActivity(schema, state, tap, 0.5);
      const readouts = createReadoutRows(tap.readouts, tap.timeControl)
        .map((entry) => ({
          ...entry,
          value: entry.meterId
            ? formatMeterValue(measureMeterValue(schema, state, entry.meterId, 0).value, measureMeterValue(schema, state, entry.meterId, 0).meter)
            : readoutValueText(schema, state, entry)
        }))
        .filter((entry) => entry.value);
      return {
        ...tap,
        x,
        laneIndex,
        y: laneY(laneIndex),
        meterSample,
        activity,
        readouts
      };
    });

    const selected = runtimeTaps.find((tap) => String(tap.id) === selectedTapId) ?? runtimeTaps[0];

    runtimeTaps.forEach((tap) => {
      const button = tapViews.get(tap.id);
      if (!button) {
        return;
      }
      const size = 20 + tap.activity * 22;
      button.style.left = `${tap.x * 100}%`;
      button.style.top = `${tap.y}%`;
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.classList.toggle("is-selected", String(tap.id) === String(selected.id));
    });

    connectionViews.forEach(({ connection, line }) => {
      const from = runtimeTaps.find((tap) => tap.id === connection.from);
      const to = runtimeTaps.find((tap) => tap.id === connection.to);
      if (!from || !to) {
        return;
      }
      const dx = (to.x - from.x) * 100;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      line.style.left = `${from.x * 100}%`;
      line.style.top = `${from.y}%`;
      line.style.width = `${length}%`;
      line.style.transform = `rotate(${angle}deg)`;
      line.style.opacity = String(0.26 + ((from.activity + to.activity) / 2) * 0.54);
    });

    chipViews.forEach(({ tap, chip, value }) => {
      const runtimeTap = runtimeTaps.find((entry) => entry.id === tap.id);
      chip.classList.toggle("is-selected", String(runtimeTap?.id) === String(selected.id));
      value.textContent = runtimeTap?.readouts[0]?.value
        || (runtimeTap?.meterSample?.meter ? formatMeterValue(runtimeTap.meterSample.value, runtimeTap.meterSample.meter) : "");
    });

    popoverTitle.textContent = selected.label || humanizeId(selected.id);
    popoverMeta.textContent = selected.meterSample?.meter
      ? formatMeterValue(selected.meterSample.value, selected.meterSample.meter)
      : lanes[selected.laneIndex]?.label || lanes[selected.laneIndex] || "Lane";
    readoutList.innerHTML = "";
    selected.readouts.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "graph-readout-row";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const value = document.createElement("strong");
      value.textContent = entry.value;
      row.append(label, value);
      readoutList.append(row);
    });

    popover.style.left = `${clamp(selected.x * 100 + 6, 16, 80)}%`;
    popover.style.top = `${clamp(selected.y - 6, 14, 78)}%`;
  };

  return { node: card, update };
}

function buildRoutingSurface(model, schema, state) {
  const routes = Array.isArray(model.config.routes) ? model.config.routes : [];
  if (!routes.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--routing",
    "surface-card__body surface-card__body--routing"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const matrix = document.createElement("div");
  matrix.className = "routing-matrix";
  const columns = Array.isArray(model.config.columns) ? model.config.columns : [];
  const rows = Array.isArray(model.config.rows) ? model.config.rows : [];
  matrix.style.gridTemplateColumns = `120px repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;

  const corner = document.createElement("span");
  corner.className = "routing-matrix__corner";
  matrix.append(corner);
  columns.forEach((column) => {
    const header = document.createElement("span");
    header.className = "routing-matrix__header";
    header.textContent = column.label || humanizeId(column.id || column);
    matrix.append(header);
  });

  const cellViews = new Map();
  rows.forEach((row) => {
    const label = document.createElement("span");
    label.className = "routing-matrix__header";
    label.textContent = row.label || humanizeId(row.id || row);
    matrix.append(label);
    columns.forEach((column) => {
      const cell = document.createElement("div");
      cell.className = "routing-matrix__cell";
      const key = `${row.id || row}:${column.id || column}`;
      matrix.append(cell);
      cellViews.set(key, cell);
    });
  });

  const routeRail = document.createElement("div");
  routeRail.className = "routing-route-rail";
  const routeViews = routes.map((route) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "surface-band-chip";
    const label = document.createElement("strong");
    label.textContent = route.label || humanizeId(route.id);
    const value = document.createElement("span");
    chip.append(label, value);
    routeRail.append(chip);
    return { route, chip, value };
  });

  const detail = document.createElement("section");
  detail.className = "surface-section-card";
  const detailTitle = document.createElement("h4");
  detailTitle.textContent = "Route detail";
  const detailList = document.createElement("div");
  detailList.className = "surface-value-list";
  detail.append(detailTitle, detailList);

  body.append(badgeRow, matrix, routeRail, detail);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const activeRoute = routes.find((route) => {
      if (!route.control) {
        return false;
      }
      const value = readControlValue(schema, state, route.control, 0);
      const matches = Array.isArray(route.matchValues) ? route.matchValues : [route.matchValue];
      return matches.some((match) => Number(match) === Number(value));
    }) ?? routes[0];

    cellViews.forEach((cell) => {
      cell.classList.remove("is-active");
    });
    (Array.isArray(activeRoute.cells) ? activeRoute.cells : []).forEach((cellDef) => {
      const key = `${cellDef.row}:${cellDef.column}`;
      cellViews.get(key)?.classList.add("is-active");
    });

    routeViews.forEach(({ route, chip, value }) => {
      chip.classList.toggle("is-selected", route.id === activeRoute.id);
      value.textContent = route.control ? controlValueText(schema, state, route.control) : route.summary || "";
    });

    detailList.innerHTML = "";
    createReadoutRows(activeRoute.readouts, activeRoute.control).forEach((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      if (item.meterId) {
        const measured = measureMeterValue(schema, state, item.meterId, 0);
        value.textContent = formatMeterValue(measured.value, measured.meter);
      } else {
        value.textContent = readoutValueText(schema, state, item);
      }
      row.append(label, value);
      detailList.append(row);
    });
  };

  return { node: card, update };
}

function buildSectionGridSurface(model, schema, state) {
  const sections = Array.isArray(model.config.sections) ? model.config.sections : [];
  if (!sections.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--section-grid",
    "surface-card__body surface-card__body--section-grid"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const grid = document.createElement("div");
  grid.className = "section-grid";

  const sectionViews = sections.map((section) => {
    const panel = document.createElement("section");
    panel.className = "surface-section-card section-grid-card";
    panel.style.setProperty("--section-color", resolveToneColor(section.tone || section.accent));

    const header = document.createElement("div");
    header.className = "section-grid-card__header";

    const copy = document.createElement("div");
    copy.className = "section-grid-card__copy";

    const title = document.createElement("h4");
    title.textContent = section.label || humanizeId(section.id);
    copy.append(title);

    if (section.description) {
      const description = document.createElement("p");
      description.textContent = section.description;
      copy.append(description);
    }

    const activityWrap = document.createElement("div");
    activityWrap.className = "section-grid-card__activity";

    const meter = document.createElement("div");
    meter.className = "section-grid-card__meter";

    const meterFill = document.createElement("span");
    meterFill.className = "section-grid-card__meter-fill";
    meter.append(meterFill);

    const activityValue = document.createElement("strong");
    activityWrap.append(meter, activityValue);
    header.append(copy, activityWrap);

    const list = document.createElement("div");
    list.className = "surface-value-list";
    const rowViews = createReadoutRows(section.items, section.control).map((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      row.append(label, value);
      list.append(row);
      return { item, value };
    });

    panel.append(header, list);
    grid.append(panel);
    return { section, panel, meterFill, activityValue, rowViews };
  });

  body.append(badgeRow, grid);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    sectionViews.forEach(({ section, panel, meterFill, activityValue, rowViews }) => {
      const amount = resolveActivity(schema, state, {
        meterId: section.meterId,
        control: section.control,
        controls: section.activityControls
      }, 0.4);
      panel.style.opacity = String(0.68 + amount * 0.32);
      panel.classList.toggle("is-active", amount > 0.56);
      meterFill.style.width = `${amount * 100}%`;

      if (section.meterId) {
        const measured = measureMeterValue(schema, state, section.meterId, 0);
        activityValue.textContent = formatMeterValue(measured.value, measured.meter);
      } else if (section.summaryControl) {
        activityValue.textContent = controlValueText(schema, state, section.summaryControl);
      } else {
        activityValue.textContent = section.summary || "";
      }

      rowViews.forEach(({ item, value }) => {
        if (item.meterId) {
          const measured = measureMeterValue(schema, state, item.meterId, 0);
          value.textContent = formatMeterValue(measured.value, measured.meter);
          return;
        }
        value.textContent = readoutValueText(schema, state, item);
      });
    });
  };

  return { node: card, update };
}

function buildModuleSurface(model, schema, state) {
  const modules = Array.isArray(model.config.modules) ? model.config.modules : [];
  if (!modules.length) {
    return buildSummarySurface(model);
  }

  const className = model.kind === "card-stack"
    ? "surface-card surface-card--module-stack"
    : "surface-card surface-card--module-rack";
  const bodyClass = model.kind === "card-stack"
    ? "surface-card__body surface-card__body--module-stack"
    : "surface-card__body surface-card__body--module-rack";

  const { card, badges, body } = createSurfaceScaffold(model, className, bodyClass);
  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const grid = document.createElement("div");
  grid.className = "module-grid";
  const moduleViews = modules.map((module) => {
    const panel = document.createElement("section");
    panel.className = "module-card";
    panel.style.setProperty("--module-color", resolveToneColor(module.tone || module.accent));
    const header = document.createElement("div");
    header.className = "module-card__header";
    const title = document.createElement("h4");
    title.textContent = module.label || humanizeId(module.id);
    const activity = document.createElement("span");
    activity.className = "module-card__activity";
    header.append(title, activity);

    const list = document.createElement("div");
    list.className = "surface-value-list";
    const rowViews = createReadoutRows(module.readouts, module.control).map((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      row.append(label, value);
      list.append(row);
      return { item, value };
    });

    panel.append(header, list);
    grid.append(panel);
    return { module, panel, activity, rowViews };
  });

  body.append(badgeRow, grid);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    moduleViews.forEach(({ module, panel, activity, rowViews }) => {
      const amount = resolveActivity(schema, state, {
        meterId: module.meterId,
        control: module.control,
        controls: module.activityControls
      }, 0.45);
      panel.style.opacity = String(0.66 + amount * 0.34);
      activity.style.width = `${amount * 100}%`;
      rowViews.forEach(({ item, value }) => {
        if (item.meterId) {
          const measured = measureMeterValue(schema, state, item.meterId, 0);
          value.textContent = formatMeterValue(measured.value, measured.meter);
          return;
        }
        value.textContent = readoutValueText(schema, state, item);
      });
    });
  };

  return { node: card, update };
}

function buildKeyboardSurface(model, schema, state) {
  const keys = Array.isArray(model.config.keys) ? model.config.keys : [];
  if (!keys.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--keyboard",
    "surface-card__body surface-card__body--keyboard"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const strip = document.createElement("div");
  strip.className = "keyboard-strip";
  const keyViews = keys.map((key) => {
    const button = document.createElement("div");
    button.className = "keyboard-key";
    button.dataset.kind = key.kind || "white";
    const label = document.createElement("span");
    label.textContent = key.label || key.note || "";
    button.append(label);
    strip.append(button);
    return { key, button };
  });

  const readoutPanel = document.createElement("section");
  readoutPanel.className = "surface-section-card";
  const readoutTitle = document.createElement("h4");
  readoutTitle.textContent = "Voice state";
  const readoutList = document.createElement("div");
  readoutList.className = "surface-value-list";
  const readoutViews = createReadoutRows(model.config.readouts, model.config.voiceControl).map((item) => {
    const row = document.createElement("div");
    row.className = "surface-value-row";
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("strong");
    row.append(label, value);
    readoutList.append(row);
    return { item, value };
  });
  readoutPanel.append(readoutTitle, readoutList);

  body.append(badgeRow, strip, readoutPanel);
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    const voiceSize = model.config.voiceControl ? Number(readControlValue(schema, state, model.config.voiceControl, 0)) : 0;
    const activeCount = Math.min(keys.length, Math.max(1, Math.round(voiceSize + 1)));
    keyViews.forEach(({ key, button }, index) => {
      const active = index < activeCount || resolveActivity(schema, state, key, 0) > 0.5;
      button.classList.toggle("is-active", active);
    });

    readoutViews.forEach(({ item, value }) => {
      value.textContent = readoutValueText(schema, state, item);
    });
  };

  return { node: card, update };
}

function buildValueSurface(model, schema, state) {
  const items = Array.isArray(model.config.items) ? model.config.items : [];
  if (!items.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(model, "surface-card surface-card--detail");
  const list = document.createElement("div");
  list.className = "surface-value-list";
  const rows = items.map((item) => {
    const row = document.createElement("div");
    row.className = "surface-value-row";
    const label = document.createElement("span");
    label.textContent = item.label || humanizeId(item.control || item.id || "item");
    const value = document.createElement("strong");
    const meta = document.createElement("small");
    if (item.meta) {
      meta.textContent = item.meta;
    }
    row.append(label, value, meta);
    list.append(row);
    return { item, value, meta };
  });

  const supports = document.createElement("div");
  supports.className = "surface-support-list";
  model.supports.forEach((support) => supports.append(buildBadge(humanizeId(support), "muted")));

  body.append(list, supports);

  const update = () => {
    badges.innerHTML = "";
    model.analyzers.slice(0, 1).forEach((analyzer) => {
      badges.append(buildBadge(humanizeId(analyzer.id), "accent"));
    });
    rows.forEach(({ item, value, meta }) => {
      if (item.meterId) {
        const measured = measureMeterValue(schema, state, item.meterId, 0);
        value.textContent = formatMeterValue(measured.value, measured.meter);
      } else {
        value.textContent = item.control ? controlValueText(schema, state, item.control) : item.value || "";
      }
      if (!item.meta && item.control) {
        meta.textContent = humanizeId(resolveControl(schema, item.control)?.unit || model.kind);
      }
    });
  };

  return { node: card, update };
}

function buildSummarySurface(model) {
  const { card, badges, body } = createSurfaceScaffold(model, "surface-card surface-card--summary");
  const supports = document.createElement("div");
  supports.className = "surface-support-list";
  model.supports.forEach((support, index) => {
    supports.append(buildBadge(humanizeId(support), index === 0 ? "accent" : "muted"));
  });
  body.append(supports);

  return {
    node: card,
    update: () => {
      badges.innerHTML = "";
      model.analyzers.slice(0, 2).forEach((analyzer, index) => {
        badges.append(buildBadge(humanizeId(analyzer.id), index === 0 ? "accent" : "muted"));
      });
    }
  };
}

function buildSurfaceCard(model, schema, state) {
  if (Array.isArray(model.config.curveControls) && model.config.curveControls.length) {
    return buildTransferSurface(model, schema, state);
  }
  if (model.kind === "modulation-dock" && Array.isArray(model.config.slots)) {
    return buildModulationDockSurface(model, schema, state);
  }
  if (model.kind === "timeline-editor" && Array.isArray(model.config.taps)) {
    return buildTimelineSurface(model, schema, state);
  }
  if (model.kind === "routing-control" && Array.isArray(model.config.routes)) {
    return buildRoutingSurface(model, schema, state);
  }
  if (model.kind === "section-grid" && Array.isArray(model.config.sections)) {
    return buildSectionGridSurface(model, schema, state);
  }
  if ((model.kind === "card-stack" || model.kind === "card-rack") && Array.isArray(model.config.modules)) {
    return buildModuleSurface(model, schema, state);
  }
  if (model.kind === "keyboard-strip" && Array.isArray(model.config.keys)) {
    return buildKeyboardSurface(model, schema, state);
  }
  if (model.kind === "linked-strip" && Array.isArray(model.config.bands)) {
    return buildLinkedStripSurface(model, schema, state);
  }
  if ((model.kind === "graph-canvas" || model.kind === "hybrid-canvas" || model.kind === "hybrid-strip") && Array.isArray(model.config.bands)) {
    return buildGraphSurface(model, schema, state);
  }
  if (model.kind === "history-trace" && Array.isArray(model.config.series)) {
    return buildTraceSurface(model, schema, state);
  }
  if (model.kind === "region-editor" && Array.isArray(model.config.regions)) {
    return buildRegionSurface(model, schema, state);
  }
  if (model.kind === "hybrid-canvas" && Array.isArray(model.config.nodes)) {
    return buildFieldSurface(model, schema, state);
  }
  if (Array.isArray(model.config.items) && model.config.items.length) {
    return buildValueSurface(model, schema, state);
  }
  return buildSummarySurface(model);
}

function renderSurfaces(root, panel, schema, state) {
  if (!root) {
    state.surfaceViews = [];
    return;
  }

  root.innerHTML = "";
  root.dataset.layoutProfile = schema.ui?.layoutProfile || "default";
  state.surfaceViews = [];

  const models = resolveSurfaceModels(schema).filter((model) => model.kind !== "meter-stack");
  if (!models.length) {
    if (panel) {
      panel.hidden = true;
    }
    return;
  }

  if (panel) {
    panel.hidden = false;
  }

  models.forEach((model) => {
    const surface = buildSurfaceCard(model, schema, state);
    root.append(surface.node);
    state.surfaceViews.push(surface.update);
  });
}

export { renderSurfaces, resolveSurfaceModels };
