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

export {
  buildKeyboardSurface,
  buildModuleSurface,
  buildModulationDockSurface,
  buildRoutingSurface,
  buildSectionGridSurface,
  buildTimelineSurface,
  buildValueSurface
};
