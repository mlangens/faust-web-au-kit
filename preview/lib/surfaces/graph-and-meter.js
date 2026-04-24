import { formatValue } from "../formatting.js";
import {
  buildSummarySurface,
  clamp,
  controlValueText,
  createAnalyzerPath,
  createCurvePath,
  createReadoutRows,
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
  normalizePointAxis,
  populateFocusBadges,
  populateStandardBadges,
  readControlValue,
  readoutValueText,
  resolveActivity,
  resolveBandState,
  resolveControl,
  resolveRegionState,
  resolveToneColor,
  setSurfaceControlValue
} from "./shared.js";

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
  const interactions = createSurfaceInteractionController(canvas);

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
    const startBandDrag = (event) => {
      selectedBandId = String(band.id);
      update();

      if (!band.xControl && !band.yControl && !band.qControl) {
        return;
      }

      const bandState = resolveBandState(schema, state, band);
      const shapeMode = Boolean(event.shiftKey && band.qControl);
      interactions.startDrag(event, {
        captureTarget: button,
        onMove: ({ point, startPoint }) => {
          if (shapeMode && band.qControl) {
            const qControl = resolveControl(schema, band.qControl);
            const nextQ = denormalizePointAxisValue(
              qControl,
              {
                min: band.qMin ?? qControl?.min ?? 0,
                max: band.qMax ?? qControl?.max ?? 8
              },
              clamp(bandState.qValue + (startPoint.y - point.y), 0, 1),
              false
            );
            setSurfaceControlValue(card, schema, state, band.qControl, nextQ);
            return;
          }

          if (band.xControl) {
            const xControl = resolveControl(schema, band.xControl);
            const nextX = denormalizePointAxisValue(
              xControl,
              {
                min: band.xMin ?? xControl?.min ?? 0,
                max: band.xMax ?? xControl?.max ?? 1,
                scale: band.frequencyScale
              },
              clamp(point.x, 0.04, 0.96),
              false
            );
            setSurfaceControlValue(card, schema, state, band.xControl, nextX);
          }

          if (band.yControl) {
            const yControl = resolveControl(schema, band.yControl);
            const nextY = denormalizePointAxisValue(
              yControl,
              {
                min: band.yMin ?? yControl?.min ?? -1,
                max: band.yMax ?? yControl?.max ?? 1
              },
              clamp(point.y, 0.04, 0.96),
              true
            );
            setSurfaceControlValue(card, schema, state, band.yControl, nextY);
          }
        }
      });
    };
    button.addEventListener("pointerdown", startBandDrag);
    button.addEventListener("mousedown", startBandDrag);

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
      enhanceSurfaceReadoutRow(row, card, schema, state, entry);
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
    enhanceSurfaceReadoutRow(row, card, schema, state, entry);
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
  const interactions = createSurfaceInteractionController(canvas);

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
    const startNodeDrag = (event) => {
      selectedNodeId = String(node.id);
      update();

      if (!node.xControl && !node.yControl) {
        return;
      }

      interactions.startDrag(event, {
        captureTarget: button,
        onMove: ({ point }) => {
          if (node.xControl) {
            const xControl = resolveControl(schema, node.xControl);
            const nextX = denormalizePointAxisValue(
              xControl,
              {
                min: node.xMin ?? xControl?.min ?? 0,
                max: node.xMax ?? xControl?.max ?? 1,
                scale: node.frequencyScale
              },
              clamp(point.x, 0.08, 0.92),
              false
            );
            setSurfaceControlValue(card, schema, state, node.xControl, nextX);
          }

          if (node.yControl) {
            const yControl = resolveControl(schema, node.yControl);
            const nextY = denormalizePointAxisValue(
              yControl,
              {
                min: node.yMin ?? yControl?.min ?? 0,
                max: node.yMax ?? yControl?.max ?? 1,
                scale: node.frequencyScale
              },
              clamp(point.y, 0.08, 0.92),
              true
            );
            setSurfaceControlValue(card, schema, state, node.yControl, nextY);
          }
        }
      });
    };
    button.addEventListener("pointerdown", startNodeDrag);
    button.addEventListener("mousedown", startNodeDrag);

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
      enhanceSurfaceReadoutRow(row, card, schema, state, entry);
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
  const interactions = createSurfaceInteractionController(canvas);

  const handleLayer = document.createElement("div");
  handleLayer.className = "transfer-handle-layer";
  const handleViews = new Map();
  const normalizedTransferValue = (role, point) => {
    switch (role) {
      case "input":
        return clamp((0.44 - clamp(point.x, 0.16, 0.48)) / 0.18, 0, 1);
      case "drive":
        return clamp((0.62 - clamp(point.y, 0.12, 0.76)) / 0.3, 0, 1);
      case "ceiling":
        return clamp((0.28 - clamp(point.y, 0.08, 0.28)) / 0.2, 0, 1);
      default:
        return clamp(1 - point.y, 0, 1);
    }
  };
  curveControls.forEach((entry) => {
    const handle = document.createElement("div");
    handle.className = "transfer-handle";
    handle.dataset.role = entry.role || entry.control || "control";
    handle.style.setProperty("--handle-color", resolveToneColor(entry.tone));
    const startHandleDrag = (event) => {
      if (!entry.control) {
        return;
      }

      interactions.startDrag(event, {
        captureTarget: handle,
        onMove: ({ point }) => {
          const control = resolveControl(schema, entry.control);
          if (!control) {
            return;
          }
          const nextValue = denormalizePointAxisValue(
            control,
            {
              min: control.min,
              max: control.max,
              scale: control.scale
            },
            normalizedTransferValue(entry.role, point),
            false
          );
          setSurfaceControlValue(card, schema, state, entry.control, nextValue);
        }
      });
    };
    handle.addEventListener("pointerdown", startHandleDrag);
    handle.addEventListener("mousedown", startHandleDrag);
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
    enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
      enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
    enhanceSurfaceReadoutRow(row, card, schema, state, item);
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
  const interactions = createSurfaceInteractionController(editor);

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
    const startRegionDrag = (event) => {
      selectedRegionId = String(region.id);
      update();

      const runtimeRegion = resolveRegionState(schema, state, region);
      const buttonRect = button.getBoundingClientRect();
      const edgeThreshold = Math.min(24, Math.max(12, buttonRect.width * 0.18));
      const localX = event.clientX - buttonRect.left;
      const minWidth = 0.06;
      let dragMode = "select";

      if (region.startControl && localX <= edgeThreshold) {
        dragMode = "resize-start";
      } else if (region.endControl && localX >= buttonRect.width - edgeThreshold) {
        dragMode = "resize-end";
      } else if (region.startControl && region.endControl) {
        dragMode = "move";
      } else if (region.endControl) {
        dragMode = "resize-end";
      } else if (region.startControl) {
        dragMode = "resize-start";
      }

      if (dragMode === "select") {
        return;
      }

      interactions.startDrag(event, {
        captureTarget: button,
        onMove: ({ point, startPoint }) => {
          const delta = point.x - startPoint.x;
          let nextStart = runtimeRegion.start;
          let nextEnd = runtimeRegion.end;

          if (dragMode === "resize-start") {
            nextStart = clamp(runtimeRegion.start + delta, 0, runtimeRegion.end - minWidth);
          } else if (dragMode === "resize-end") {
            nextEnd = clamp(runtimeRegion.end + delta, runtimeRegion.start + minWidth, 1);
          } else if (dragMode === "move") {
            const width = runtimeRegion.end - runtimeRegion.start;
            nextStart = clamp(runtimeRegion.start + delta, 0, 1 - width);
            nextEnd = nextStart + width;
          }

          if (region.startControl) {
            const startControl = resolveControl(schema, region.startControl);
            const nextStartValue = denormalizePointAxisValue(
              startControl,
              {
                min: region.xMin ?? startControl?.min ?? 20,
                max: region.xMax ?? startControl?.max ?? 20000,
                scale: region.frequencyScale
              },
              nextStart,
              false
            );
            setSurfaceControlValue(card, schema, state, region.startControl, nextStartValue);
          }

          if (region.endControl) {
            const endControl = resolveControl(schema, region.endControl);
            const nextEndValue = denormalizePointAxisValue(
              endControl,
              {
                min: region.xMin ?? endControl?.min ?? 20,
                max: region.xMax ?? endControl?.max ?? 20000,
                scale: region.frequencyScale
              },
              nextEnd,
              false
            );
            setSurfaceControlValue(card, schema, state, region.endControl, nextEndValue);
          }
        }
      });
    };
    button.addEventListener("pointerdown", startRegionDrag);
    button.addEventListener("mousedown", startRegionDrag);

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
      enhanceSurfaceReadoutRow(row, card, schema, state, entry);
      readoutList.append(row);
    });

    popover.style.left = `${clamp(((selected.start + selected.end) / 2) * 100, 14, 80)}%`;
    popover.style.top = "18%";
  };

  return { node: card, update };
}

export {
  buildFieldSurface,
  buildGraphSurface,
  buildLinkedStripSurface,
  buildRegionSurface,
  buildTraceSurface,
  buildTransferSurface
};
