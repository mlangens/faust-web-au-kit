import { formatValue } from "../formatting.js";
import {
  buildBadge,
  buildSummarySurface,
  clamp,
  controlValueText,
  createSurfaceInteractionController,
  createReadoutRows,
  createSurfaceScaffold,
  denormalizePointAxisValue,
  enhanceSurfaceReadoutRow,
  formatMeterValue,
  humanizeId,
  measureMeterValue,
  meterPercent,
  normalizeBipolarValue,
  normalizeControlValue,
  populateFocusBadges,
  populateStandardBadges,
  readControlValue,
  readoutValueText,
  resolveActivity,
  resolveControl,
  resolveToneColor,
  setSurfaceControlValue
} from "./shared.js";

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
      enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
  canvas.dataset.canvasHint = "Drag tap nodes across lanes; modulation slots track the motion.";

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
  const interactions = createSurfaceInteractionController(canvas);

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
    const startTapDrag = (event) => {
      selectedTapId = String(tap.id);
      update();

      if (!tap.timeControl) {
        return;
      }

      interactions.startDrag(event, {
        captureTarget: button,
        onMove: ({ point }) => {
          const control = resolveControl(schema, tap.timeControl);
          const nextTime = denormalizePointAxisValue(
            control,
            {
              min: tap.xMin ?? control?.min ?? 0,
              max: tap.xMax ?? control?.max ?? 1000,
              scale: tap.frequencyScale
            },
            clamp(point.x, 0.04, 0.96),
            false
          );
          setSurfaceControlValue(card, schema, state, tap.timeControl, nextTime);
        }
      });
    };
    button.addEventListener("pointerdown", startTapDrag);
    button.addEventListener("mousedown", startTapDrag);
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
  const routeByCellKey = new Map();
  routes.forEach((route) => {
    (Array.isArray(route.cells) ? route.cells : []).forEach((cellDef) => {
      routeByCellKey.set(`${cellDef.row}:${cellDef.column}`, route);
    });
  });

  const activateRoute = (route) => {
    if (!route?.control) {
      return;
    }
    const matches = Array.isArray(route.matchValues) ? route.matchValues : [route.matchValue];
    const nextValue = matches.find((value) => Number.isFinite(Number(value)));
    if (!Number.isFinite(Number(nextValue))) {
      return;
    }
    setSurfaceControlValue(card, schema, state, route.control, Number(nextValue));
  };

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
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "routing-matrix__cell";
      const key = `${row.id || row}:${column.id || column}`;
      cell.dataset.rowId = row.id || row;
      cell.dataset.columnId = column.id || column;
      cell.setAttribute("aria-label", `${label.textContent} to ${column.label || humanizeId(column.id || column)}`);
      cell.addEventListener("click", () => {
        activateRoute(routeByCellKey.get(key));
      });
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
    chip.addEventListener("click", () => {
      activateRoute(route);
    });
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
      enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
  const primitivePalette = Array.isArray(model.config.primitivePalette) ? model.config.primitivePalette : [];
  const recipes = Array.isArray(model.config.recipes) ? model.config.recipes : [];
  const primitiveById = new Map(primitivePalette.map((primitive) => [String(primitive.id), primitive]));
  const slotAssignments = new Map();
  const installerCommandText = document.createElement("code");
  const installerStatus = document.createElement("p");
  const installerPackagePath = document.createElement("p");
  const buildRecipeButton = document.createElement("button");
  const recipeViews = [];
  let activeRecipeId = "";
  let activeRecipe = recipes[0] || null;
  let selectedSectionId = String(sections[0]?.id || "");

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--section-grid",
    "surface-card__body surface-card__body--section-grid"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const grid = document.createElement("div");
  grid.className = "section-grid";

  function sectionSlotNumber(section, index = 0) {
    const match = String(section?.id || "").match(/slot-(\d+)/u);
    return match ? Number(match[1]) : index + 1;
  }

  function slotControlLabel(section, suffix, index = 0) {
    return `Slot ${sectionSlotNumber(section, index)} ${suffix}`;
  }

  function selectSection(sectionId) {
    selectedSectionId = String(sectionId || selectedSectionId);
    sectionViews.forEach(({ section, panel }) => {
      panel.classList.toggle("is-selected", String(section.id || "") === selectedSectionId);
    });
  }

  function primitiveTone(primitive) {
    return resolveToneColor(primitive.toneId || primitive.tone || primitive.accent || primitive.role || primitive.id);
  }

  function findSectionViewBySlot(slotNumber) {
    return sectionViews.find(({ section }, index) => sectionSlotNumber(section, index) === Number(slotNumber));
  }

  function assignmentForPrimitive(primitive, sourceLabel = "") {
    return {
      primitiveId: String(primitive.id || ""),
      label: primitive.label || humanizeId(primitive.id),
      role: primitive.role || "",
      description: primitive.description || "",
      sourceLabel
    };
  }

  function setSlotPrimitive(section, primitive, overrides = {}, sourceLabel = "") {
    if (!section || !primitive) {
      return;
    }

    const sectionId = String(section.id || "");
    const slotNumber = sectionSlotNumber(section, sections.indexOf(section));
    const slotType = overrides.slotType ?? primitive.slotType;
    slotAssignments.set(sectionId, assignmentForPrimitive(primitive, sourceLabel));

    if (Number.isFinite(Number(slotType))) {
      setSurfaceControlValue(card, schema, state, slotControlLabel(section, "Type"), Number(slotType));
    }
    for (const [suffix, key] of [["Amount", "amount"], ["Tone", "tone"], ["Mix", "mix"]]) {
      const nextValue = overrides[key] ?? primitive[key];
      if (Number.isFinite(Number(nextValue))) {
        setSurfaceControlValue(card, schema, state, slotControlLabel(section, suffix), Number(nextValue));
      }
    }
    update();
  }

  function setSlotPrimitiveById(section, primitiveId, overrides = {}, sourceLabel = "") {
    const primitive = primitiveById.get(String(primitiveId));
    setSlotPrimitive(section, primitive, overrides, sourceLabel);
  }

  function applyRecipe(recipe) {
    if (!recipe || typeof recipe !== "object") {
      return;
    }

    activeRecipeId = String(recipe.id || "");
    activeRecipe = recipe;
    for (const slot of Array.isArray(recipe.slots) ? recipe.slots : []) {
      const view = findSectionViewBySlot(slot.slot);
      if (view) {
        setSlotPrimitiveById(view.section, slot.primitiveId, slot, recipe.label || recipe.id || "");
      }
    }

    const macros = recipe.macros && typeof recipe.macros === "object" && !Array.isArray(recipe.macros) ? recipe.macros : {};
    Object.entries(macros).forEach(([label, value]) => {
      if (Number.isFinite(Number(value))) {
        setSurfaceControlValue(card, schema, state, label, Number(value));
      }
    });
    installerCommandText.textContent = recipe.installerCommand || `npm run workbench:build-installer -- --recipe ${recipe.id}`;
    installerStatus.textContent = recipe.description || "Recipe applied to the fixed primitive slot contract.";
    installerPackagePath.textContent = recipe.expectedPackagePath
      ? `Expected package: ${recipe.expectedPackagePath}`
      : "Expected package path appears after the workbench installer build completes.";
    update();
  }

  const sectionViews = sections.map((section) => {
    const panel = document.createElement("section");
    panel.className = "surface-section-card section-grid-card";
    panel.tabIndex = 0;
    panel.dataset.sectionId = String(section.id || "");
    panel.setAttribute("aria-label", `${section.label || humanizeId(section.id)} primitive slot`);
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

    const assignment = document.createElement("div");
    assignment.className = "section-grid-card__assignment";
    assignment.textContent = "Drop a primitive here";

    const list = document.createElement("div");
    list.className = "surface-value-list";
    const rowViews = createReadoutRows(section.items, section.control).map((item) => {
      const row = document.createElement("div");
      row.className = "surface-value-row";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      row.append(label, value);
      enhanceSurfaceReadoutRow(row, card, schema, state, item);
      list.append(row);
      return { item, value };
    });

    panel.addEventListener("click", () => {
      selectSection(String(section.id || ""));
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSection(String(section.id || ""));
      }
    });
    panel.addEventListener("dragover", (event) => {
      event.preventDefault();
      panel.classList.add("is-drop-target");
    });
    panel.addEventListener("dragleave", () => {
      panel.classList.remove("is-drop-target");
    });
    panel.addEventListener("drop", (event) => {
      event.preventDefault();
      panel.classList.remove("is-drop-target");
      const primitiveId = event.dataTransfer?.getData("text/plain") || event.dataTransfer?.getData("application/x-fwak-primitive");
      if (primitiveId) {
        activeRecipeId = "";
        setSlotPrimitiveById(section, primitiveId);
        selectSection(String(section.id || ""));
      }
    });

    panel.append(header, assignment, list);
    grid.append(panel);
    return { section, panel, assignment, meterFill, activityValue, rowViews };
  });

  if (primitivePalette.length || recipes.length) {
    const workbench = document.createElement("div");
    workbench.className = "primitive-workbench";

    if (primitivePalette.length) {
      const palette = document.createElement("section");
      palette.className = "primitive-palette";
      const paletteHeader = document.createElement("div");
      paletteHeader.className = "primitive-workbench__header";
      const paletteTitle = document.createElement("h4");
      paletteTitle.textContent = "Primitive Palette";
      const paletteCopy = document.createElement("p");
      paletteCopy.textContent = "Drag a building block into a slot, or click to place it in the selected slot.";
      paletteHeader.append(paletteTitle, paletteCopy);

      const paletteGrid = document.createElement("div");
      paletteGrid.className = "primitive-palette__grid";
      primitivePalette.forEach((primitive) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "primitive-chip";
        chip.draggable = true;
        chip.dataset.primitiveId = String(primitive.id || "");
        chip.style.setProperty("--primitive-color", primitiveTone(primitive));
        let pointerDrag = null;
        let suppressClick = false;
        chip.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("text/plain", String(primitive.id || ""));
          event.dataTransfer?.setData("application/x-fwak-primitive", String(primitive.id || ""));
          event.dataTransfer?.setDragImage(chip, chip.offsetWidth / 2, chip.offsetHeight / 2);
        });
        chip.addEventListener("pointerdown", (event) => {
          if (event.button != null && event.button !== 0) {
            return;
          }
          pointerDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false
          };
          chip.setPointerCapture?.(event.pointerId);
        });
        chip.addEventListener("pointermove", (event) => {
          if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
            return;
          }
          const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
          pointerDrag.moved = pointerDrag.moved || distance > 8;
        });
        chip.addEventListener("pointerup", (event) => {
          if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
            return;
          }
          const wasMoved = pointerDrag.moved;
          pointerDrag = null;
          chip.releasePointerCapture?.(event.pointerId);
          if (!wasMoved) {
            return;
          }
          const dropTarget = chip.ownerDocument
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest(".section-grid-card[data-section-id]");
          const targetView = sectionViews.find(({ panel }) => panel === dropTarget);
          if (!targetView) {
            return;
          }
          suppressClick = true;
          activeRecipeId = "";
          setSlotPrimitive(targetView.section, primitive);
          selectSection(String(targetView.section.id || ""));
          update();
        });
        chip.addEventListener("click", () => {
          if (suppressClick) {
            suppressClick = false;
            return;
          }
          activeRecipeId = "";
          const selectedView = sectionViews.find(({ section }) => String(section.id || "") === selectedSectionId) || sectionViews[0];
          if (selectedView) {
            setSlotPrimitive(selectedView.section, primitive);
            selectSection(String(selectedView.section.id || ""));
          }
        });

        const label = document.createElement("strong");
        label.textContent = primitive.label || humanizeId(primitive.id);
        const role = document.createElement("span");
        role.className = "primitive-chip__role";
        role.textContent = primitive.role || "Primitive";
        const primitiveId = document.createElement("span");
        primitiveId.className = "primitive-chip__id";
        primitiveId.textContent = primitive.id || "";
        chip.append(label, role, primitiveId);
        paletteGrid.append(chip);
      });
      palette.append(paletteHeader, paletteGrid);
      workbench.append(palette);
    }

    if (recipes.length) {
      const recipePanel = document.createElement("section");
      recipePanel.className = "primitive-recipe-panel";
      const recipeHeader = document.createElement("div");
      recipeHeader.className = "primitive-workbench__header";
      const recipeTitle = document.createElement("h4");
      recipeTitle.textContent = "Recipe + Installer";
      const recipeCopy = document.createElement("p");
      recipeCopy.textContent = "Apply a known assemblage, then export the scratch app through the native installer pipeline.";
      recipeHeader.append(recipeTitle, recipeCopy);

      const recipeList = document.createElement("div");
      recipeList.className = "primitive-recipe-list";
      recipes.forEach((recipe) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "recipe-button";
        button.dataset.recipeId = String(recipe.id || "");
        const label = document.createElement("strong");
        label.textContent = recipe.label || humanizeId(recipe.id);
        const summary = document.createElement("span");
        summary.textContent = recipe.description || "Apply primitive recipe";
        button.append(label, summary);
        button.addEventListener("click", () => {
          applyRecipe(recipe);
        });
        recipeViews.push({ recipe, button });
        recipeList.append(button);
      });

      const command = document.createElement("div");
      command.className = "recipe-installer-command";
      installerCommandText.textContent = recipes[0]?.installerCommand || "npm run workbench:build-installer";
      installerPackagePath.className = "recipe-installer-command__path";
      installerPackagePath.textContent = recipes[0]?.expectedPackagePath
        ? `Expected package: ${recipes[0].expectedPackagePath}`
        : "Expected package path appears after the workbench installer build completes.";
      installerStatus.textContent = "Choose a recipe to stage an installable scratch plugin.";
      const actionRow = document.createElement("div");
      actionRow.className = "recipe-installer-actions";
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "recipe-action-button";
      copyButton.textContent = "Copy Command";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard?.writeText(installerCommandText.textContent || "");
          installerStatus.textContent = "Build command copied. Run it from the repo root, or use Build Installer in this local preview.";
        } catch {
          installerStatus.textContent = "Clipboard access is unavailable here; select the command text manually.";
        }
      });
      buildRecipeButton.type = "button";
      buildRecipeButton.className = "recipe-action-button recipe-action-button--primary";
      buildRecipeButton.textContent = "Build Installer";
      buildRecipeButton.addEventListener("click", async () => {
        if (!activeRecipe?.id) {
          installerStatus.textContent = "Choose a recipe before building an installer.";
          return;
        }
        buildRecipeButton.disabled = true;
        installerStatus.textContent = `Building ${activeRecipe.label || activeRecipe.id} through the local preview server...`;
        try {
          const response = await fetch("/api/workbench/build-installer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipe: activeRecipe.id })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.ok === false) {
            throw new Error(result.error || `HTTP ${response.status}`);
          }
          installerStatus.textContent = result.installerPath
            ? `Built installer: ${result.installerPath}`
            : "Installer build completed.";
        } catch (error) {
          installerStatus.textContent = `Build endpoint unavailable or failed. Run the command manually. ${error?.message || ""}`.trim();
        } finally {
          buildRecipeButton.disabled = false;
        }
      });
      actionRow.append(copyButton, buildRecipeButton);
      command.append(installerCommandText, actionRow, installerPackagePath, installerStatus);
      recipePanel.append(recipeHeader, recipeList, command);
      workbench.append(recipePanel);
    }

    body.append(badgeRow, workbench, grid);
  } else {
    body.append(badgeRow, grid);
  }
  const metrics = Array.isArray(model.config.focusBadges) ? model.config.focusBadges : [];

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, metrics);

    sectionViews.forEach(({ section, panel, assignment, meterFill, activityValue, rowViews }) => {
      const amount = resolveActivity(schema, state, {
        meterId: section.meterId,
        control: section.control,
        controls: section.activityControls
      }, 0.4);
      panel.style.opacity = String(0.68 + amount * 0.32);
      panel.classList.toggle("is-active", amount > 0.56);
      panel.classList.toggle("is-selected", String(section.id || "") === selectedSectionId);
      meterFill.style.width = `${amount * 100}%`;

      const slotAssignment = slotAssignments.get(String(section.id || ""));
      panel.classList.toggle("has-primitive", Boolean(slotAssignment));
      if (slotAssignment) {
        assignment.textContent = `${slotAssignment.label} · ${slotAssignment.role || "Primitive"}`;
        assignment.title = slotAssignment.description || slotAssignment.primitiveId;
      } else {
        assignment.textContent = "Drop a primitive here";
        assignment.removeAttribute("title");
      }

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

    recipeViews.forEach(({ recipe, button }) => {
      button.classList.toggle("is-active", String(recipe.id || "") === activeRecipeId);
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
      enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
    enhanceSurfaceReadoutRow(row, card, schema, state, item);
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

function buildFet76FaceplateSurface(model, schema, state) {
  const knobs = Array.isArray(model.config.knobs) ? model.config.knobs : [];
  const ratioButtons = Array.isArray(model.config.ratioButtons) ? model.config.ratioButtons : [];
  if (!knobs.length || !ratioButtons.length) {
    return buildSummarySurface(model);
  }

  const { card, badges, body } = createSurfaceScaffold(
    model,
    "surface-card surface-card--fet76",
    "surface-card__body surface-card__body--fet76"
  );

  const badgeRow = document.createElement("div");
  badgeRow.className = "surface-metric-row";

  const faceplate = document.createElement("div");
  faceplate.className = "fet76-faceplate";
  faceplate.dataset.canvasHint = "Drag knobs, press ratio buttons, and use the VU meter as the primary compressor surface.";

  const leftBank = document.createElement("div");
  leftBank.className = "fet76-knob-bank";
  const rightBank = document.createElement("div");
  rightBank.className = "fet76-knob-bank";
  const center = document.createElement("div");
  center.className = "fet76-center";

  const meter = document.createElement("div");
  meter.className = "fet76-vu";
  const meterScale = document.createElement("div");
  meterScale.className = "fet76-vu__scale";
  meterScale.textContent = "VU";
  const needle = document.createElement("div");
  needle.className = "fet76-vu__needle";
  const meterReadout = document.createElement("strong");
  meterReadout.className = "fet76-vu__readout";
  meter.append(meterScale, needle, meterReadout);

  const ratioBank = document.createElement("div");
  ratioBank.className = "fet76-ratio-bank";
  const ratioLabel = document.createElement("span");
  ratioLabel.textContent = "Ratio";
  ratioBank.append(ratioLabel);
  const ratioViews = ratioButtons.map((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fet76-ratio-button";
    button.textContent = entry.label || humanizeId(entry.value);
    button.addEventListener("click", () => {
      setSurfaceControlValue(card, schema, state, "Ratio", Number(entry.value ?? 0));
    });
    ratioBank.append(button);
    return { entry, button };
  });

  const meterMode = document.createElement("button");
  meterMode.type = "button";
  meterMode.className = "fet76-meter-mode";
  meterMode.addEventListener("click", () => {
    const control = resolveControl(schema, model.config.meter?.modeControl || "Meter");
    if (!control) {
      return;
    }
    const current = Number(readControlValue(schema, state, control.label, control.init ?? 0));
    const min = Number(control.min ?? 0);
    const max = Number(control.max ?? 3);
    const next = current >= max ? min : current + 1;
    setSurfaceControlValue(card, schema, state, control.label, next);
  });

  const powerLamp = document.createElement("button");
  powerLamp.type = "button";
  powerLamp.className = "fet76-power-lamp";
  powerLamp.addEventListener("click", () => {
    const power = resolveControl(schema, "Power");
    if (!power) {
      return;
    }
    const current = Number(readControlValue(schema, state, "Power", power.init ?? 0));
    setSurfaceControlValue(card, schema, state, "Power", current >= 0.5 ? 0 : 1);
  });

  center.append(meter, ratioBank, meterMode, powerLamp);

  const knobViews = knobs.map((entry, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "fet76-knob-wrap";
    wrapper.style.setProperty("--knob-accent", resolveToneColor(entry.tone));

    const knob = document.createElement("button");
    knob.type = "button";
    knob.className = "fet76-knob";
    knob.dataset.role = entry.role || entry.control || "knob";

    const pointer = document.createElement("span");
    pointer.className = "fet76-knob__pointer";
    knob.append(pointer);

    const label = document.createElement("strong");
    label.textContent = entry.label || humanizeId(entry.control);
    const value = document.createElement("span");

    wrapper.append(knob, label, value);
    (index < 2 ? leftBank : rightBank).append(wrapper);

    const interactions = createSurfaceInteractionController(knob);
    let dragStart = 0.5;
    const startKnobDrag = (event) => {
      const control = resolveControl(schema, entry.control);
      if (!control) {
        return;
      }
      const current = Number(readControlValue(schema, state, entry.control, control.init ?? 0));
      dragStart = normalizeControlValue(control, current);
      interactions.startDrag(event, {
        captureTarget: knob,
        onMove: ({ point, startPoint }) => {
          const nextNormalized = clamp(
            dragStart + (startPoint.y - point.y) * 1.28 + (point.x - startPoint.x) * 0.32,
            0,
            1
          );
          const nextValue = denormalizePointAxisValue(control, {
            min: control.min,
            max: control.max,
            scale: control.scale
          }, nextNormalized);
          setSurfaceControlValue(card, schema, state, entry.control, nextValue);
        }
      });
    };

    knob.addEventListener("pointerdown", startKnobDrag);
    knob.addEventListener("mousedown", startKnobDrag);
    return { entry, knob, value };
  });

  const trimPanel = document.createElement("section");
  trimPanel.className = "surface-section-card fet76-trim-panel";
  const trimTitle = document.createElement("h4");
  trimTitle.textContent = "Fit trims";
  const trimList = document.createElement("div");
  trimList.className = "surface-value-list";
  const trimViews = (Array.isArray(model.config.trimItems) ? model.config.trimItems : []).map((item) => {
    const row = document.createElement("div");
    row.className = "surface-value-row";
    const label = document.createElement("span");
    label.textContent = item.label || humanizeId(item.control || item.id || "item");
    const value = document.createElement("strong");
    row.append(label, value);
    enhanceSurfaceReadoutRow(row, card, schema, state, item);
    trimList.append(row);
    return { item, value };
  });
  trimPanel.append(trimTitle, trimList);

  faceplate.append(leftBank, center, rightBank);
  body.append(badgeRow, faceplate, trimPanel);

  const update = () => {
    populateStandardBadges(badges, model);
    populateFocusBadges(badgeRow, schema, state, Array.isArray(model.config.focusBadges) ? model.config.focusBadges : []);

    knobViews.forEach(({ entry, knob, value }) => {
      const control = resolveControl(schema, entry.control);
      const current = control ? readControlValue(schema, state, entry.control, control.init ?? 0) : 0;
      const normalized = control ? normalizeControlValue(control, Number(current)) : 0.5;
      knob.style.setProperty("--knob-angle", `${-132 + normalized * 264}deg`);
      value.textContent = control ? formatValue(control, current, schema.ui) : "";
    });

    const ratioControl = resolveControl(schema, "Ratio");
    const ratioValue = Number(readControlValue(schema, state, "Ratio", ratioControl?.init ?? 0));
    ratioViews.forEach(({ entry, button }) => {
      button.classList.toggle("is-active", Number(entry.value ?? 0) === ratioValue);
    });

    const measured = measureMeterValue(schema, state, model.config.meter?.meterId || "gainReduction", 0);
    const percent = meterPercent(measured.value, measured.meter);
    needle.style.setProperty("--needle-angle", `${-42 + percent * 84}deg`);
    meterReadout.textContent = formatMeterValue(measured.value, measured.meter);
    meterMode.textContent = controlValueText(schema, state, model.config.meter?.modeControl || "Meter") || "GR";

    const powerControl = resolveControl(schema, "Power");
    const powerOn = Number(readControlValue(schema, state, "Power", powerControl?.init ?? 0)) >= 0.5;
    powerLamp.classList.toggle("is-on", powerOn);
    powerLamp.textContent = powerOn ? "Power On" : "Power Off";

    trimViews.forEach(({ item, value }) => {
      value.textContent = item.control ? controlValueText(schema, state, item.control) : "";
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
    enhanceSurfaceReadoutRow(row, card, schema, state, item);
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

export {
  buildFet76FaceplateSurface,
  buildKeyboardSurface,
  buildModuleSurface,
  buildModulationDockSurface,
  buildRoutingSurface,
  buildSectionGridSurface,
  buildTimelineSurface,
  buildValueSurface
};
