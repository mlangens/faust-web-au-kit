import { formatValue } from "../formatting.js";

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

export {
  asObject,
  bandContribution,
  buildBadge,
  buildSummarySurface,
  clamp,
  controlValueText,
  createAnalyzerPath,
  createCurvePath,
  createReadoutRows,
  createSurfaceScaffold,
  createSvgElement,
  createTracePath,
  createTransferPath,
  formatMeterValue,
  humanizeId,
  measureMeterValue,
  meterPercent,
  normalizeBipolarValue,
  normalizeControlValue,
  normalizeFrequencyValue,
  normalizePointAxis,
  normalizeUnitValue,
  populateFocusBadges,
  populateStandardBadges,
  readControlValue,
  readoutValueText,
  resolveActivity,
  resolveBandState,
  resolveControl,
  resolveMeter,
  resolveRegionState,
  resolveSurfaceModels,
  resolveToneColor,
  surfaceDescription
};
