// @ts-check

/**
 * @typedef {import("../../types/framework").DisplayConfig} DisplayConfig
 * @typedef {import("../../types/framework").GeneratedControl} GeneratedControl
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").PreviewControlLayout} PreviewControlLayout
 * @typedef {import("../../types/framework").PreviewControlLayoutItem} PreviewControlLayoutItem
 * @typedef {import("../../types/framework").PreviewControlSection} PreviewControlSection
 * @typedef {import("../../types/framework").PreviewState} PreviewState
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 */

import { rememberControlValue } from "./control-store.js";
import { formatValue } from "./formatting.js";
import { controlKey, resolveControlDisplay } from "./schema-ui.js";

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function maybeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function maybeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

/**
 * @param {unknown} value
 * @returns {boolean | undefined}
 */
function maybeBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

/**
 * @param {GeneratedControl} control
 * @returns {number}
 */
function controlMin(control) {
  return Number.isFinite(Number(control.min)) ? Number(control.min) : 0;
}

/**
 * @param {GeneratedControl} control
 * @returns {number}
 */
function controlMax(control) {
  return Number.isFinite(Number(control.max)) ? Number(control.max) : 1;
}

/**
 * @param {GeneratedControl} control
 * @returns {number}
 */
function controlInit(control) {
  return Number.isFinite(Number(control.init)) ? Number(control.init) : controlMin(control);
}

/**
 * @param {GeneratedControl} control
 * @returns {number}
 */
function controlSpan(control) {
  return Math.max(controlMax(control) - controlMin(control), 0.0001);
}

/**
 * @param {GeneratedControl} control
 * @returns {number}
 */
function controlStep(control) {
  const parsed = Number(control.step);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return controlSpan(control) / 100;
}

/**
 * @param {GeneratedControl} control
 * @param {number} value
 * @returns {number}
 */
function quantizeControlValue(control, value) {
  if (control.isToggle) {
    return value >= 0.5 ? 1 : 0;
  }

  const min = controlMin(control);
  const max = controlMax(control);
  const step = controlStep(control);
  let nextValue = clamp(value, min, max);

  if (Number.isFinite(step) && step > 0) {
    const precisionSource = String(control.step ?? "");
    const precision = precisionSource.includes(".") ? precisionSource.split(".")[1]?.length ?? 0 : 0;
    nextValue = min + Math.round((nextValue - min) / step) * step;
    nextValue = Number(nextValue.toFixed(Math.max(precision, 4)));
  }

  return clamp(nextValue, min, max);
}

/**
 * @param {GeneratedControl} control
 * @param {number} value
 * @returns {number}
 */
function normalizeControlValue(control, value) {
  return clamp((value - controlMin(control)) / controlSpan(control), 0, 1);
}

/**
 * @param {GeneratedControl} control
 * @param {number} normalized
 * @returns {number}
 */
function denormalizeControlValue(control, normalized) {
  return controlMin(control) + clamp(normalized, 0, 1) * controlSpan(control);
}

/**
 * @param {HTMLElement} node
 * @param {string} eventName
 * @returns {void}
 */
function dispatchBubbledEvent(node, eventName) {
  node.dispatchEvent(new Event(eventName, { bubbles: true }));
}

/**
 * @param {GeneratedControl} control
 * @returns {HTMLInputElement}
 */
function createBackingInput(control) {
  const input = document.createElement("input");
  input.className = "control-input-proxy";
  input.hidden = true;
  input.setAttribute("data-control-id", controlKey(control));

  if (control.isToggle) {
    input.type = "checkbox";
    input.checked = controlInit(control) >= 0.5;
    return input;
  }

  input.type = "range";
  input.min = String(controlMin(control));
  input.max = String(controlMax(control));
  input.step = String(control.step ?? controlStep(control));
  input.value = String(controlInit(control));
  return input;
}

/**
 * @param {GeneratedControl} control
 * @param {ProjectUiManifest} ui
 * @param {PreviewState} state
 * @param {HTMLInputElement} input
 * @param {(value: number) => void} render
 * @returns {{ input: HTMLInputElement, setValue: (value: number) => void, readValue: () => number }}
 */
function bindControl(control, ui, state, input, render) {
  /**
   * @param {boolean} refresh
   * @returns {number}
   */
  const sync = (refresh) => {
    const nextValue = control.isToggle ? (input.checked ? 1 : 0) : Number(input.value);
    rememberControlValue(state, control, nextValue);
    render(nextValue);
    if (refresh) {
      state.refreshSurfaceViews?.();
    }
    return nextValue;
  };

  input.addEventListener(control.isToggle ? "change" : "input", () => {
    sync(true);
  });

  sync(false);

  return {
    input,
    setValue(value) {
      const nextValue = quantizeControlValue(control, value);
      if (control.isToggle) {
        input.checked = nextValue >= 0.5;
        dispatchBubbledEvent(input, "change");
        return;
      }
      input.value = String(nextValue);
      dispatchBubbledEvent(input, "input");
    },
    readValue() {
      return control.isToggle ? (input.checked ? 1 : 0) : Number(input.value);
    }
  };
}

/**
 * @param {GeneratedControl} control
 * @param {{ setValue: (value: number) => void, readValue: () => number }} binding
 * @param {HTMLElement} target
 * @param {"vertical" | "horizontal"} axis
 * @returns {void}
 */
function attachContinuousInteractions(control, binding, target, axis) {
  /** @type {number | null} */
  let pointerId = null;
  let startValue = 0;
  let startX = 0;
  let startY = 0;

  /**
   * @param {PointerEvent} event
   * @returns {void}
   */
  const handleMove = (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const distance = axis === "vertical"
      ? startY - event.clientY
      : event.clientX - startX;
    const scalar = event.shiftKey ? 0.32 : 1;
    const span = axis === "vertical" ? 180 : 240;
    const nextValue = startValue + (distance / span) * controlSpan(control) * scalar;
    binding.setValue(nextValue);
  };

  /**
   * @param {PointerEvent} event
   * @returns {void}
   */
  const finish = (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    target.releasePointerCapture?.(event.pointerId);
    pointerId = null;
  };

  target.addEventListener("pointerdown", (event) => {
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }
    pointerId = event.pointerId;
    startValue = binding.readValue();
    startX = event.clientX;
    startY = event.clientY;
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  target.addEventListener("pointermove", handleMove);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
  target.addEventListener("dblclick", () => {
    binding.setValue(controlInit(control));
  });
  target.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const scalar = event.shiftKey ? 0.25 : 1;
    binding.setValue(binding.readValue() + controlStep(control) * direction * scalar);
  }, { passive: false });
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {DisplayConfig} display
 * @returns {HTMLElement}
 */
function buildSliderCard(ui, control, state, display) {
  const card = document.createElement("article");
  card.className = "control-card control-card--slider";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlWidget = "slider";
  card.dataset.controlType = control.isToggle ? "toggle" : "slider";
  card.dataset.scale = control.scale || "linear";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  header.append(title, value);

  const input = createBackingInput(control);
  input.hidden = false;
  if (!control.isToggle) {
    input.classList.add("control-slider");
  }

  /** @type {HTMLElement | null} */
  let enumRail = null;
  const binding = bindControl(control, ui, state, input, (nextValue) => {
    value.textContent = formatValue(control, nextValue, ui);
    if (enumRail) {
      syncSegmentedRail(enumRail, display.enumLabels ?? [], controlMin(control), nextValue);
    }
  });

  if (!control.isToggle && Array.isArray(display.enumLabels) && display.enumLabels.length) {
    enumRail = document.createElement("div");
    enumRail.className = "control-enum-rail";
    syncSegmentedRail(enumRail, display.enumLabels, controlMin(control), binding.readValue());
  }

  card.append(header, input);
  if (enumRail) {
    card.append(enumRail);
  }
  return card;
}

/**
 * @param {HTMLElement} rail
 * @param {string[]} labels
 * @param {number} baseValue
 * @param {number} value
 * @returns {void}
 */
function syncSegmentedRail(rail, labels, baseValue, value) {
  rail.innerHTML = "";
  const activeIndex = Math.round(value - baseValue);
  labels.forEach((label, index) => {
    const chip = document.createElement("span");
    chip.className = "control-enum-chip";
    chip.textContent = label;
    if (index === activeIndex) {
      chip.classList.add("is-active");
    }
    rail.append(chip);
  });
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {DisplayConfig} display
 * @returns {HTMLElement}
 */
function buildSegmentedCard(ui, control, state, display) {
  const labels = Array.isArray(display.enumLabels) ? display.enumLabels : [];
  if (!labels.length) {
    return buildSliderCard(ui, control, state, display);
  }

  const card = document.createElement("article");
  card.className = "control-card control-card--segment";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlWidget = "segment";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  header.append(title, value);

  const input = createBackingInput(control);
  const rail = document.createElement("div");
  rail.className = "control-segment-rail";

  const buttons = labels.map((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-segment-chip";
    button.textContent = label;
    button.addEventListener("click", () => {
      binding.setValue(controlMin(control) + index);
    });
    rail.append(button);
    return button;
  });

  const binding = bindControl(control, ui, state, input, (nextValue) => {
    value.textContent = formatValue(control, nextValue, ui);
    const activeIndex = Math.round(nextValue - controlMin(control));
    buttons.forEach((button, index) => {
      button.classList.toggle("is-active", index === activeIndex);
    });
  });

  card.append(header, rail, input);
  return card;
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {DisplayConfig} display
 * @returns {HTMLElement}
 */
function buildToggleCard(ui, control, state, display) {
  const offLabel = maybeString(display.offLabel) ?? "Off";
  const onLabel = maybeString(display.onLabel) ?? "On";

  const card = document.createElement("article");
  card.className = "control-card control-card--toggle";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlWidget = "toggle";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  header.append(title, value);

  const input = createBackingInput(control);
  const rail = document.createElement("div");
  rail.className = "control-segment-rail control-segment-rail--toggle";

  const offButton = document.createElement("button");
  offButton.type = "button";
  offButton.className = "control-segment-chip";
  offButton.textContent = offLabel;

  const onButton = document.createElement("button");
  onButton.type = "button";
  onButton.className = "control-segment-chip";
  onButton.textContent = onLabel;

  const binding = bindControl(control, ui, state, input, (nextValue) => {
    value.textContent = formatValue(control, nextValue, ui);
    offButton.classList.toggle("is-active", nextValue < 0.5);
    onButton.classList.toggle("is-active", nextValue >= 0.5);
  });

  offButton.addEventListener("click", () => binding.setValue(0));
  onButton.addEventListener("click", () => binding.setValue(1));
  rail.append(offButton, onButton);

  card.append(header, rail, input);
  return card;
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {DisplayConfig} display
 * @returns {HTMLElement}
 */
function buildDialCard(ui, control, state, display) {
  const card = document.createElement("article");
  card.className = "control-card control-card--dial";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlWidget = "dial";
  card.dataset.accent = maybeString(display.tone) ?? "accent";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = control.label;
  const value = document.createElement("div");
  value.className = "value";
  header.append(title, value);

  const input = createBackingInput(control);
  const body = document.createElement("div");
  body.className = "control-dial";

  const knob = document.createElement("button");
  knob.type = "button";
  knob.className = "control-dial__knob";
  knob.setAttribute("aria-label", control.label);

  const arc = document.createElement("div");
  arc.className = "control-dial__arc";
  const face = document.createElement("div");
  face.className = "control-dial__face";
  const pointer = document.createElement("div");
  pointer.className = "control-dial__pointer";
  face.append(pointer);
  knob.append(arc, face);

  const footer = document.createElement("div");
  footer.className = "control-dial__labels";
  const minLabel = document.createElement("span");
  minLabel.textContent = formatValue(control, controlMin(control), ui);
  const maxLabel = document.createElement("span");
  maxLabel.textContent = formatValue(control, controlMax(control), ui);
  footer.append(minLabel, maxLabel);

  const binding = bindControl(control, ui, state, input, (nextValue) => {
    const normalized = normalizeControlValue(control, nextValue);
    const angle = -135 + normalized * 270;
    value.textContent = formatValue(control, nextValue, ui);
    knob.style.setProperty("--dial-angle", `${angle}deg`);
    knob.style.setProperty("--dial-fill", String(normalized));
  });

  attachContinuousInteractions(control, binding, knob, "vertical");
  body.append(knob, input);
  card.append(header, body, footer);
  return card;
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {DisplayConfig} display
 * @returns {HTMLElement}
 */
function buildFaderCard(ui, control, state, display) {
  const card = document.createElement("article");
  card.className = "control-card control-card--fader";
  card.dataset.controlId = controlKey(control);
  card.dataset.controlWidget = "fader";
  card.dataset.accent = maybeString(display.tone) ?? "accent";

  const title = document.createElement("h3");
  title.textContent = control.label;

  const body = document.createElement("div");
  body.className = "control-fader";
  const track = document.createElement("div");
  track.className = "control-fader__track";
  const fill = document.createElement("div");
  fill.className = "control-fader__fill";
  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "control-fader__thumb";
  thumb.setAttribute("aria-label", control.label);
  track.append(fill, thumb);

  const value = document.createElement("div");
  value.className = "value";

  const footer = document.createElement("div");
  footer.className = "control-fader__footer";
  footer.append(title, value);

  const input = createBackingInput(control);

  const binding = bindControl(control, ui, state, input, (nextValue) => {
    const normalized = normalizeControlValue(control, nextValue);
    value.textContent = formatValue(control, nextValue, ui);
    track.style.setProperty("--fader-fill", String(normalized));
    thumb.style.bottom = `${normalized * 100}%`;
    fill.style.height = `${normalized * 100}%`;
  });

  /**
   * @param {PointerEvent} event
   * @returns {void}
   */
  const setFromPoint = (event) => {
    const rect = track.getBoundingClientRect();
    const normalized = 1 - clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
    binding.setValue(denormalizeControlValue(control, normalized));
  };

  track.addEventListener("pointerdown", (event) => {
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }
    setFromPoint(event);
  });

  attachContinuousInteractions(control, binding, thumb, "vertical");
  body.append(track, input);
  card.append(body, footer);
  return card;
}

/**
 * @param {PreviewControlSection} section
 * @returns {number}
 */
function defaultSectionColumns(section) {
  switch (section.kind) {
    case "segmented-strip":
      return 1;
    case "toggle-bank":
      return 2;
    case "fader-bank":
      return 6;
    case "dial-grid":
      return 4;
    default:
      return 3;
  }
}

/**
 * @param {GeneratedUiSchema} schema
 * @returns {PreviewControlLayout}
 */
function resolveControlLayout(schema) {
  const preview = asObject(schema.ui?.preview);
  const controls = asObject(preview.controls);
  /** @type {Record<string, unknown>[]} */
  const sections = Array.isArray(controls.sections)
    ? controls.sections.map((section) => asObject(section))
    : [];
  return {
    layout: maybeString(controls.layout) ?? (sections.length ? "sectioned" : "flat"),
    sections: /** @type {PreviewControlSection[]} */ (sections.map((section) => ({
      ...section,
      id: maybeString(section.id) ?? maybeString(section.title),
      title: maybeString(section.title),
      description: maybeString(section.description),
      kind: maybeString(section.kind) ?? "mixed-grid",
      columns: maybeNumber(section.columns),
      items: Array.isArray(section.items)
        ? /** @type {PreviewControlLayoutItem[]} */ (section.items.map((item) => {
          const itemObject = asObject(item);
          return {
            ...itemObject,
            control: maybeString(itemObject.control) ?? "",
            widget: maybeString(itemObject.widget),
            accent: maybeString(itemObject.accent),
            span: maybeNumber(itemObject.span),
            surfaceOnly: maybeBoolean(itemObject.surfaceOnly)
          };
        }))
        : []
    }))),
    supplementalTitle: maybeString(controls.supplementalTitle),
    supplementalDescription: maybeString(controls.supplementalDescription)
  };
}

/**
 * @param {GeneratedUiSchema} schema
 * @returns {{
 *   layout: PreviewControlLayout,
 *   sections: PreviewControlSection[],
 *   controlIndex: Map<string, GeneratedControl>,
 *   configuredItems: GeneratedControl[],
 *   configuredControls: GeneratedControl[],
 *   configuredControlKeys: Set<string>,
 *   surfaceOnlyControls: GeneratedControl[],
 *   surfaceOnlyControlKeys: Set<string>,
 *   visibleControls: GeneratedControl[]
 * }}
 */
function summarizeControlLayout(schema) {
  const layout = resolveControlLayout(schema);
  const sections = layout.sections ?? [];
  const controlIndex = indexControls(schema.controls);
  /** @type {GeneratedControl[]} */
  const configuredItems = [];
  /** @type {GeneratedControl[]} */
  const configuredControls = [];
  const configuredControlKeys = new Set();
  /** @type {GeneratedControl[]} */
  const surfaceOnlyControls = [];
  const surfaceOnlyControlKeys = new Set();

  sections.forEach((section) => {
    const items = Array.isArray(section.items) ? section.items.filter((item) => maybeString(item.control)) : [];
    items.forEach((item) => {
      const control = item.control ? controlIndex.get(item.control) : null;
      if (!control) {
        return;
      }

      const key = controlKey(control);
      configuredItems.push(control);
      if (!configuredControlKeys.has(key)) {
        configuredControlKeys.add(key);
        configuredControls.push(control);
      }

      if (item.surfaceOnly && !surfaceOnlyControlKeys.has(key)) {
        surfaceOnlyControlKeys.add(key);
        surfaceOnlyControls.push(control);
      }
    });
  });

  return {
    layout,
    sections,
    controlIndex,
    configuredItems,
    configuredControls,
    configuredControlKeys,
    surfaceOnlyControls,
    surfaceOnlyControlKeys,
    visibleControls: sections.length
      ? schema.controls.filter((control) => !surfaceOnlyControlKeys.has(controlKey(control)))
      : [...schema.controls]
  };
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<typeof summarizeControlLayout>} summary
 * @returns {void}
 */
function renderSurfaceOwnershipSummary(root, summary) {
  if (!summary.surfaceOnlyControls.length) {
    return;
  }

  const panel = document.createElement("aside");
  panel.className = "control-surface-summary";
  panel.dataset.surfaceOwnedCount = String(summary.surfaceOnlyControls.length);

  const eyebrow = document.createElement("span");
  eyebrow.className = "control-surface-summary__eyebrow";
  eyebrow.textContent = "Surface-owned";

  const copy = document.createElement("p");
  copy.textContent = `${summary.surfaceOnlyControls.length} of ${summary.configuredControls.length} mapped parameters now live on the visual editors instead of the fallback control dock.`;

  const list = document.createElement("div");
  list.className = "control-surface-summary__chips";
  summary.surfaceOnlyControls.slice(0, 6).forEach((control) => {
    const chip = document.createElement("span");
    chip.textContent = control.label;
    list.append(chip);
  });

  panel.append(eyebrow, copy, list);
  root.append(panel);
}

/**
 * @param {GeneratedControl} control
 * @param {DisplayConfig} display
 * @param {PreviewControlSection} section
 * @param {PreviewControlLayoutItem} item
 * @returns {string}
 */
function resolveWidget(control, display, section, item) {
  const explicit = maybeString(item.widget) ?? maybeString(display.widget);
  if (explicit) {
    return explicit;
  }
  if (control.isToggle) {
    return "toggle";
  }
  if (Array.isArray(display.enumLabels) && display.enumLabels.length) {
    return "segment";
  }

  switch (section.kind) {
    case "fader-bank":
      return "fader";
    case "dial-grid":
      return "dial";
    case "toggle-bank":
      return "toggle";
    default:
      return "dial";
  }
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @param {PreviewState} state
 * @param {PreviewControlSection} section
 * @param {PreviewControlLayoutItem} item
 * @returns {HTMLElement}
 */
function buildConfiguredCard(ui, control, state, section, item) {
  const display = resolveControlDisplay(ui, control);
  const widget = resolveWidget(control, display, section, item);
  const controlNode = (
    widget === "segment" ? buildSegmentedCard(ui, control, state, display)
      : widget === "toggle" ? buildToggleCard(ui, control, state, display)
        : widget === "fader" ? buildFaderCard(ui, control, state, display)
          : widget === "dial" ? buildDialCard(ui, control, state, display)
            : buildSliderCard(ui, control, state, display)
  );

  const span = maybeNumber(item.span);
  if (span && span > 1) {
    controlNode.style.setProperty("--control-span", String(span));
  }
  if (item.accent) {
    controlNode.dataset.accent = item.accent;
  }
  return controlNode;
}

/**
 * @param {GeneratedControl[]} controls
 * @returns {Map<string, GeneratedControl>}
 */
function indexControls(controls) {
  return new Map(
    controls.flatMap((control) => {
      const keys = [control.id, control.label, control.shortname].filter(
        /**
         * @param {string | undefined | null} key
         * @returns {key is string}
         */
        (key) => typeof key === "string" && key.trim().length > 0
      );
      return keys.map((key) => [key, control]);
    })
  );
}

/**
 * @param {HTMLElement} root
 * @param {GeneratedUiSchema} schema
 * @param {PreviewState} state
 * @returns {void}
 */
function renderControlPanels(root, schema, state) {
  root.innerHTML = "";
  root.dataset.themeGroup = schema.ui?.themeGroup || "utility";
  root.dataset.layoutProfile = schema.ui?.layoutProfile || "default";
  const summary = summarizeControlLayout(schema);
  const { controlIndex, layout, sections, visibleControls } = summary;
  root.dataset.controlCount = String(schema.controls.length);
  root.dataset.visibleControlCount = String(visibleControls.length);
  root.dataset.surfaceOnlyControlCount = String(summary.surfaceOnlyControls.length);
  root.dataset.configuredControlCount = String(summary.configuredControls.length);
  root.dataset.controlLayout = layout.layout || "flat";
  const surfaceOwnedRatio = summary.configuredControls.length
    ? summary.surfaceOnlyControls.length / summary.configuredControls.length
    : 0;
  root.dataset.surfaceOwnedRatio = surfaceOwnedRatio >= 0.5 ? "high" : surfaceOwnedRatio >= 0.25 ? "balanced" : "low";
  state.controls.clear();
  renderSurfaceOwnershipSummary(root, summary);

  if (!sections.length) {
    visibleControls.forEach((control) => {
      const display = resolveControlDisplay(schema.ui, control);
      root.append(control.isToggle ? buildToggleCard(schema.ui, control, state, display) : buildSliderCard(schema.ui, control, state, display));
    });
    return;
  }

  const rendered = new Set();

  sections.forEach((section) => {
    const items = Array.isArray(section.items) ? section.items.filter((item) => maybeString(item.control)) : [];
    if (!items.length) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "control-section";
    panel.dataset.sectionKind = section.kind || "mixed-grid";
    if (section.id) {
      panel.dataset.sectionId = section.id;
    }

    const header = document.createElement("header");
    header.className = "control-section__header";
    if (section.title) {
      const title = document.createElement("h3");
      title.textContent = section.title;
      header.append(title);
    }
    if (section.description) {
      const description = document.createElement("p");
      description.textContent = section.description;
      header.append(description);
    }
    if (header.children.length) {
      panel.append(header);
    }

    const grid = document.createElement("div");
    grid.className = "control-section__grid";
    grid.dataset.sectionKind = section.kind || "mixed-grid";
    grid.style.setProperty("--section-columns", String(section.columns ?? defaultSectionColumns(section)));

    items.forEach((item) => {
      const control = item.control ? controlIndex.get(item.control) : null;
      if (!control) {
        return;
      }
      const key = controlKey(control);
      if (item.surfaceOnly) {
        return;
      }
      rendered.add(key);
      grid.append(buildConfiguredCard(schema.ui, control, state, section, item));
    });

    if (grid.childElementCount) {
      panel.append(grid);
      root.append(panel);
    }
  });

  const remainingControls = schema.controls.filter((control) => {
    const key = controlKey(control);
    return !summary.configuredControlKeys.has(key) && !rendered.has(key);
  });
  if (!remainingControls.length) {
    return;
  }

  const fallbackSection = /** @type {PreviewControlSection} */ ({
    id: "supplemental-controls",
    title: layout.supplementalTitle ?? "Supplemental Controls",
    description: layout.supplementalDescription ?? "Any unmapped parameters stay available here so the preview never loses coverage while layouts evolve.",
    kind: "mixed-grid",
    items: []
  });

  const panel = document.createElement("section");
  panel.className = "control-section control-section--supplemental";
  panel.dataset.sectionId = "supplemental-controls";
  panel.dataset.sectionKind = "mixed-grid";

  const header = document.createElement("header");
  header.className = "control-section__header";
  const title = document.createElement("h3");
  title.textContent = fallbackSection.title || "Supplemental Controls";
  const description = document.createElement("p");
  description.textContent = fallbackSection.description || "";
  header.append(title, description);

  const grid = document.createElement("div");
  grid.className = "control-section__grid";
  grid.dataset.sectionKind = "mixed-grid";
  grid.style.setProperty("--section-columns", "3");

  remainingControls.forEach((control) => {
    const display = resolveControlDisplay(schema.ui, control);
    const widget = control.isToggle ? "toggle" : Array.isArray(display.enumLabels) && display.enumLabels.length ? "segment" : "slider";
    const item = /** @type {PreviewControlLayoutItem} */ ({ control: control.label, widget });
    grid.append(buildConfiguredCard(schema.ui, control, state, fallbackSection, item));
  });

  panel.append(header, grid);
  root.append(panel);
}

export { renderControlPanels, resolveControlLayout, summarizeControlLayout };
