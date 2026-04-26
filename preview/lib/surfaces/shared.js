import {
  readSchemaControlValue as readControlValue,
  rememberControlValue,
  resolveControl,
  resolveMeter
} from "../control-store.js";
import { formatValue } from "../formatting.js";
import { formatMeterValue, meterPercent } from "../meters.js";
import { resolveControlDisplay } from "../schema-ui.js";
import {
  clamp,
  denormalizeFrequencyValue,
  denormalizeRangeValue,
  normalizeFrequencyValue,
  normalizeRangeValue as normalizeBipolarValue,
  normalizeUnitValue
} from "../value-scale.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function humanizeId(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
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

function denormalizePointAxisValue(control, config, normalized, invert = false) {
  if (!control) {
    return Number.isFinite(Number(normalized)) ? Number(normalized) : 0;
  }

  const unit = clamp(invert ? 1 - Number(normalized) : Number(normalized), 0, 1);
  if (control.unit === "Hz" || control.scale === "log" || config.scale === "log" || config.frequencyScale === "log") {
    return denormalizeFrequencyValue(unit, config.min ?? control.min ?? 20, config.max ?? control.max ?? 20000);
  }
  return denormalizeRangeValue(unit, config.min ?? control.min ?? 0, config.max ?? control.max ?? 1);
}

function controlStepPrecision(step) {
  const source = String(step ?? "");
  if (!source.includes(".")) {
    return 0;
  }
  return source.split(".")[1]?.length ?? 0;
}

function coerceControlValue(control, value) {
  if (!control) {
    return value;
  }

  if (control.isToggle || control.type === "checkbox" || control.type === "button") {
    return Number(value) >= 0.5 ? 1 : 0;
  }

  let nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    nextValue = Number(control.init ?? control.min ?? 0);
  }

  const min = Number(control.min);
  const max = Number(control.max);
  if (Number.isFinite(min)) {
    nextValue = Math.max(min, nextValue);
  }
  if (Number.isFinite(max)) {
    nextValue = Math.min(max, nextValue);
  }

  const step = Number(control.step);
  if (Number.isFinite(step) && step > 0) {
    const base = Number.isFinite(min) ? min : 0;
    nextValue = base + Math.round((nextValue - base) / step) * step;
    nextValue = Number(nextValue.toFixed(Math.max(4, controlStepPrecision(control.step))));
  }

  return nextValue;
}

function setSurfaceControlValue(sourceNode, schema, state, key, value) {
  const control = resolveControl(schema, key);
  if (!control) {
    return null;
  }

  const nextValue = coerceControlValue(control, value);
  const doc = sourceNode?.ownerDocument ?? null;
  const input = doc
    ? Array.from(doc.querySelectorAll("input[data-control-id]")).find(
      (node) => node.getAttribute("data-control-id") === (control.id || control.label)
    )
    : null;

  if (input instanceof HTMLInputElement) {
    if (input.type === "checkbox") {
      input.checked = Number(nextValue) >= 0.5;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return nextValue;
    }

    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return nextValue;
  }

  rememberControlValue(state, control, nextValue);
  state.refreshSurfaceViews?.();
  return nextValue;
}

function controlMinValue(control) {
  const min = Number(control?.min);
  return Number.isFinite(min) ? min : 0;
}

function controlMaxValue(control, display = {}) {
  const min = controlMinValue(control);
  const max = Number(control?.max);
  if (Array.isArray(display.enumLabels) && display.enumLabels.length) {
    const enumMax = min + display.enumLabels.length - 1;
    return Number.isFinite(max) ? Math.min(max, enumMax) : enumMax;
  }
  return Number.isFinite(max) ? max : 1;
}

function isDiscreteControl(control, display = {}) {
  if (!control) {
    return false;
  }

  if (control.isToggle || control.type === "checkbox" || control.type === "button") {
    return true;
  }

  if (Array.isArray(display.enumLabels) && display.enumLabels.length) {
    return true;
  }

  const step = Number(control.step);
  const min = Number(control.min);
  const max = Number(control.max);
  return Number.isFinite(step)
    && step >= 1
    && Number.isFinite(min)
    && Number.isFinite(max)
    && (max - min) / step <= 12;
}

function discreteControlStep(control) {
  const step = Number(control?.step);
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function setSurfaceControlNormalizedValue(sourceNode, schema, state, key, normalized) {
  const control = resolveControl(schema, key);
  if (!control) {
    return null;
  }

  const nextValue = denormalizePointAxisValue(control, {
    min: control.min,
    max: control.max,
    scale: control.scale
  }, clamp(normalized, 0, 1), false);
  return setSurfaceControlValue(sourceNode, schema, state, key, nextValue);
}

function stepSurfaceControlValue(sourceNode, schema, state, key, direction = 1) {
  const control = resolveControl(schema, key);
  if (!control) {
    return null;
  }

  const display = resolveControlDisplay(schema.ui, control);
  const current = Number(readControlValue(schema, state, key, control.init ?? control.min ?? 0));
  if (control.isToggle || control.type === "checkbox" || control.type === "button") {
    const nextValue = direction === 0 ? (current >= 0.5 ? 0 : 1) : direction > 0 ? 1 : 0;
    return setSurfaceControlValue(sourceNode, schema, state, key, nextValue);
  }

  if (isDiscreteControl(control, display)) {
    const step = discreteControlStep(control);
    const min = controlMinValue(control);
    const max = controlMaxValue(control, display);
    const base = Number.isFinite(current) ? current : min;
    const nextValue = clamp(base + step * Math.sign(direction || 1), min, max);
    return setSurfaceControlValue(sourceNode, schema, state, key, nextValue);
  }

  const normalized = normalizeControlValue(control, current);
  const nudge = Math.sign(direction || 1) * 0.04;
  return setSurfaceControlNormalizedValue(sourceNode, schema, state, key, normalized + nudge);
}

function enhanceSurfaceReadoutRow(row, sourceNode, schema, state, entry) {
  if (entry?.meterId) {
    return false;
  }

  const controlKey = entry?.control || entry?.label;
  if (!controlKey) {
    return false;
  }

  const control = resolveControl(schema, controlKey);
  if (!control) {
    return false;
  }

  const display = resolveControlDisplay(schema.ui, control);
  const discrete = isDiscreteControl(control, display);
  const parentButton = row.parentElement?.closest("button");
  const interactions = createSurfaceInteractionController(row);
  let suppressClick = false;
  let dragState = null;

  row.classList.add("surface-readout--interactive");
  row.dataset.readoutMode = discrete ? "discrete" : "continuous";
  row.dataset.controlId = control.id || control.label || controlKey;
  row.title = discrete
    ? "Click, drag, scroll, or use arrow keys to change this value."
    : "Drag, scroll, or use arrow keys to adjust this value.";
  if (!parentButton) {
    row.tabIndex = 0;
  }

  const stopInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const readCurrentValue = () => Number(readControlValue(schema, state, controlKey, control.init ?? control.min ?? 0));
  const discreteRange = () => ({
    min: controlMinValue(control),
    max: controlMaxValue(control, display),
    step: discreteControlStep(control)
  });
  const adjustByWheel = (direction) => {
    if (discrete) {
      stepSurfaceControlValue(sourceNode, schema, state, controlKey, direction);
      return;
    }

    const nextNormalized = normalizeControlValue(control, readCurrentValue()) + Math.sign(direction || 1) * 0.035;
    setSurfaceControlNormalizedValue(sourceNode, schema, state, controlKey, nextNormalized);
  };

  const startDrag = (event) => {
    interactions.startDrag(event, {
      captureTarget: row,
      onStart: () => {
        row.classList.add("is-adjusting");
        dragState = {
          value: readCurrentValue(),
          normalized: normalizeControlValue(control, readCurrentValue()),
          changed: false
        };
      },
      onMove: ({ point, startPoint }) => {
        if (!dragState) {
          return;
        }

        const deltaX = point.x - startPoint.x;
        if (discrete) {
          const { min, max, step } = discreteRange();
          const spanSteps = Math.max(1, Math.min(Math.round((max - min) / step), 8));
          const stepDelta = Math.round(deltaX * spanSteps);
          if (stepDelta === 0) {
            return;
          }
          const nextValue = clamp(dragState.value + stepDelta * step, min, max);
          setSurfaceControlValue(sourceNode, schema, state, controlKey, nextValue);
          suppressClick = true;
          dragState.changed = true;
          return;
        }

        const nextNormalized = clamp(dragState.normalized + deltaX * 1.15, 0, 1);
        if (Math.abs(nextNormalized - dragState.normalized) < 0.01) {
          return;
        }
        setSurfaceControlNormalizedValue(sourceNode, schema, state, controlKey, nextNormalized);
        suppressClick = true;
        dragState.changed = true;
      },
      onEnd: () => {
        row.classList.remove("is-adjusting");
        dragState = null;
        if (suppressClick) {
          window.setTimeout(() => {
            suppressClick = false;
          }, 0);
        }
      }
    });
  };

  row.addEventListener("pointerdown", startDrag);
  row.addEventListener("mousedown", startDrag);
  row.addEventListener("click", (event) => {
    if (!discrete) {
      return;
    }
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    stopInteraction(event);
    stepSurfaceControlValue(sourceNode, schema, state, controlKey, event.shiftKey ? -1 : 1);
  });
  row.addEventListener("wheel", (event) => {
    stopInteraction(event);
    const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    adjustByWheel(primaryDelta >= 0 ? 1 : -1);
  }, { passive: false });
  row.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        stopInteraction(event);
        adjustByWheel(-1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        stopInteraction(event);
        adjustByWheel(1);
        break;
      case "Home":
        stopInteraction(event);
        if (discrete) {
          setSurfaceControlValue(sourceNode, schema, state, controlKey, discreteRange().min);
        } else {
          setSurfaceControlNormalizedValue(sourceNode, schema, state, controlKey, 0);
        }
        break;
      case "End":
        stopInteraction(event);
        if (discrete) {
          setSurfaceControlValue(sourceNode, schema, state, controlKey, discreteRange().max);
        } else {
          setSurfaceControlNormalizedValue(sourceNode, schema, state, controlKey, 1);
        }
        break;
      case " ":
      case "Enter":
        if (!discrete) {
          return;
        }
        stopInteraction(event);
        stepSurfaceControlValue(sourceNode, schema, state, controlKey, event.shiftKey ? -1 : 1);
        break;
      default:
        break;
    }
  });

  return true;
}

function resolveSurfacePoint(surface, event) {
  const rect = surface.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
    y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
    rect
  };
}

function createSurfaceInteractionController(surface) {
  let activeDrag = null;
  surface.style.touchAction = "none";

  function dragToken(event) {
    return typeof event.pointerId === "number" ? event.pointerId : "mouse";
  }

  const finishDrag = (event) => {
    if (!activeDrag || dragToken(event) !== activeDrag.pointerId) {
      return;
    }

    if (typeof activeDrag.rawPointerId === "number") {
      activeDrag.captureTarget.releasePointerCapture?.(activeDrag.rawPointerId);
    }
    activeDrag.options.onEnd?.({
      event,
      point: resolveSurfacePoint(surface, event),
      startPoint: activeDrag.startPoint
    });
    surface.classList.remove("is-dragging");
    activeDrag = null;
  };

  const moveDrag = (event) => {
    if (!activeDrag || dragToken(event) !== activeDrag.pointerId) {
      return;
    }

    event.preventDefault();
    activeDrag.options.onMove?.({
      event,
      point: resolveSurfacePoint(surface, event),
      startPoint: activeDrag.startPoint
    });
  };

  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", finishDrag);

  return {
    startDrag(event, options) {
      if (activeDrag) {
        return false;
      }
      if (typeof event.button === "number" && event.button !== 0 && event.pointerType !== "touch") {
        return false;
      }

      const captureTarget = options.captureTarget || event.currentTarget || surface;
      activeDrag = {
        pointerId: dragToken(event),
        rawPointerId: typeof event.pointerId === "number" ? event.pointerId : null,
        captureTarget,
        startPoint: resolveSurfacePoint(surface, event),
        options
      };
      surface.classList.add("is-dragging");
      if (typeof event.pointerId === "number") {
        captureTarget.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      options.onStart?.({
        event,
        point: activeDrag.startPoint,
        startPoint: activeDrag.startPoint
      });
      return true;
    }
  };
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

function surfaceWorkflow(model) {
  if (typeof model.config.workflow === "string" && model.config.workflow.trim()) {
    return model.config.workflow.trim();
  }

  if (model.kind === "graph-canvas" || model.kind === "hybrid-canvas" || model.kind === "hybrid-strip") {
    if (Array.isArray(model.config.curveControls) && model.config.curveControls.length) {
      return "transfer-curve";
    }
    if (Array.isArray(model.config.bands) && model.config.bands.length) {
      return "curve-editor";
    }
    if (Array.isArray(model.config.nodes) && model.config.nodes.length) {
      return "macro-field";
    }
  }

  switch (model.kind) {
    case "history-trace":
      return "meter-history";
    case "timeline-editor":
      return "tap-editor";
    case "region-editor":
      return "band-region-editor";
    case "modulation-dock":
      return "modulation-slots";
    case "routing-control":
      return "routing-matrix";
    case "linked-strip":
      return "linked-inspector";
    case "card-stack":
    case "card-rack":
      return "module-rack";
    case "keyboard-strip":
      return "performance-strip";
    case "section-grid":
      return "section-grid";
    case "popover-panel":
      return "sticky-popover";
    default:
      return "surface";
  }
}

function surfaceCuesForWorkflow(workflow) {
  switch (workflow) {
    case "curve-editor":
      return ["drag bands", "shift shapes", "popover edits"];
    case "macro-field":
      return ["drag nodes", "watch energy", "anchor tone"];
    case "meter-history":
      return ["trace response", "compare detector", "read meters"];
    case "transfer-curve":
      return ["drag response", "watch clamp", "tune timing"];
    case "tap-editor":
      return ["drag taps", "follow lanes", "mod slots"];
    case "band-region-editor":
      return ["drag bands", "resize edges", "meter reduction"];
    case "modulation-slots":
      return ["source rail", "target slots", "live depth"];
    case "routing-matrix":
      return ["click routes", "see paths", "audit detail"];
    case "linked-inspector":
      return ["select band", "edit linked", "watch meters"];
    case "module-rack":
      return ["voice modules", "activity bars", "shared blocks"];
    case "performance-strip":
      return ["voice count", "play state", "envelope"];
    case "section-grid":
      return ["macro blocks", "local meters", "compact edits"];
    case "sticky-popover":
      return ["footer tools", "sticky values", "quick output"];
    default:
      return ["visual first", "shared controls", "live feedback"];
  }
}

function surfaceManualCues(model) {
  if (Array.isArray(model.config.manualCues) && model.config.manualCues.length) {
    return model.config.manualCues.map((cue) => String(cue)).filter(Boolean).slice(0, 4);
  }

  switch (model.id) {
    case "eq-canvas":
      return ["drag bands", "shape Q", "band popover"];
    case "sidechain-editor":
    case "detector-filter":
      return ["focus band", "detector tilt", "audition path"];
    case "history-trace":
      return ["trace detector", "watch reduction", "output recovery"];
    case "reverb-space":
      return ["drag room nodes", "shape tail", "tone window"];
    case "multiband-editor":
      return ["drag regions", "resize crossovers", "meter bands"];
    case "delay-timeline":
      return ["drag taps", "follow lanes", "feedback path"];
    case "filter-canvas":
      return ["drag cutoff", "shape resonance", "motion overlay"];
    case "routing-matrix":
      return ["click routes", "serial parallel", "path audit"];
    case "modulation-dock":
      return ["source rail", "target slots", "live depth"];
    case "oscillator-stack":
    case "module-rack":
      return ["module cards", "voice activity", "shared blocks"];
    case "keyboard-strip":
      return ["voice count", "envelope", "performance"];
    case "section-grid":
      return ["macro blocks", "local meters", "compact edits"];
    case "output-popover":
      return ["footer tools", "sticky values", "quick output"];
    default:
      break;
  }

  return surfaceCuesForWorkflow(surfaceWorkflow(model));
}

function createSurfaceAffordanceBar(model) {
  const workflow = surfaceWorkflow(model);
  const bar = document.createElement("div");
  bar.className = "surface-affordance-bar";
  bar.dataset.workflow = workflow;

  const workflowChip = document.createElement("span");
  workflowChip.className = "surface-affordance-chip surface-affordance-chip--workflow";
  workflowChip.textContent = humanizeId(workflow);
  bar.append(workflowChip);

  surfaceManualCues(model).forEach((cue) => {
    const chip = document.createElement("span");
    chip.className = "surface-affordance-chip";
    chip.textContent = cue;
    bar.append(chip);
  });

  return bar;
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
  card.dataset.surfaceKind = model.kind;
  card.dataset.surfaceWorkflow = surfaceWorkflow(model);

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

  card.append(header, createSurfaceAffordanceBar(model), body);
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
    const fixed = Number(config.fixed);
    if (config.scale === "log") {
      return normalizeFrequencyValue(fixed, config.min ?? 20, config.max ?? 20000);
    }

    const min = Number(config.min);
    const max = Number(config.max);
    if (Number.isFinite(min) && Number.isFinite(max) && (min !== 0 || max !== 1 || fixed < 0 || fixed > 1)) {
      return normalizeBipolarValue(fixed, min, max);
    }

    return clamp(fixed, 0, 1);
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
  createSurfaceAffordanceBar,
  createSurfaceScaffold,
  createSurfaceInteractionController,
  createSvgElement,
  createTracePath,
  createTransferPath,
  denormalizePointAxisValue,
  enhanceSurfaceReadoutRow,
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
  setSurfaceControlNormalizedValue,
  setSurfaceControlValue,
  stepSurfaceControlValue,
  surfaceManualCues,
  surfaceDescription
};
