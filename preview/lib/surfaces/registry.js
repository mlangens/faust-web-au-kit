import { buildSummarySurface } from "./shared.js";
import {
  buildFieldSurface,
  buildGraphSurface,
  buildLinkedStripSurface,
  buildRegionSurface,
  buildTraceSurface,
  buildTransferSurface
} from "./graph-and-meter.js";
import {
  buildKeyboardSurface,
  buildModuleSurface,
  buildModulationDockSurface,
  buildRoutingSurface,
  buildSectionGridSurface,
  buildTimelineSurface,
  buildValueSurface
} from "./detail.js";

const SURFACE_BUILDERS = [
  {
    id: "transfer-curve",
    matches: (model) => Array.isArray(model.config.curveControls) && model.config.curveControls.length,
    build: buildTransferSurface
  },
  {
    id: "modulation-dock",
    matches: (model) => model.kind === "modulation-dock" && Array.isArray(model.config.slots),
    build: buildModulationDockSurface
  },
  {
    id: "timeline-editor",
    matches: (model) => model.kind === "timeline-editor" && Array.isArray(model.config.taps),
    build: buildTimelineSurface
  },
  {
    id: "routing-control",
    matches: (model) => model.kind === "routing-control" && Array.isArray(model.config.routes),
    build: buildRoutingSurface
  },
  {
    id: "section-grid",
    matches: (model) => model.kind === "section-grid" && Array.isArray(model.config.sections),
    build: buildSectionGridSurface
  },
  {
    id: "module-cards",
    matches: (model) => (model.kind === "card-stack" || model.kind === "card-rack") && Array.isArray(model.config.modules),
    build: buildModuleSurface
  },
  {
    id: "keyboard-strip",
    matches: (model) => model.kind === "keyboard-strip" && Array.isArray(model.config.keys),
    build: buildKeyboardSurface
  },
  {
    id: "linked-strip",
    matches: (model) => model.kind === "linked-strip" && Array.isArray(model.config.bands),
    build: buildLinkedStripSurface
  },
  {
    id: "graph-canvas",
    matches: (model) => (
      model.kind === "graph-canvas"
      || model.kind === "hybrid-canvas"
      || model.kind === "hybrid-strip"
    ) && Array.isArray(model.config.bands),
    build: buildGraphSurface
  },
  {
    id: "history-trace",
    matches: (model) => model.kind === "history-trace" && Array.isArray(model.config.series),
    build: buildTraceSurface
  },
  {
    id: "region-editor",
    matches: (model) => model.kind === "region-editor" && Array.isArray(model.config.regions),
    build: buildRegionSurface
  },
  {
    id: "field-canvas",
    matches: (model) => model.kind === "hybrid-canvas" && Array.isArray(model.config.nodes),
    build: buildFieldSurface
  },
  {
    id: "value-detail",
    matches: (model) => Array.isArray(model.config.items) && model.config.items.length,
    build: buildValueSurface
  },
  {
    id: "summary",
    matches: () => true,
    build: buildSummarySurface
  }
];

function resolveSurfaceBuilder(model) {
  return SURFACE_BUILDERS.find((entry) => entry.matches(model)) || SURFACE_BUILDERS[SURFACE_BUILDERS.length - 1];
}

function buildSurfaceCard(model, schema, state) {
  const builder = resolveSurfaceBuilder(model);
  return builder.build(model, schema, state);
}

export { SURFACE_BUILDERS, buildSurfaceCard, resolveSurfaceBuilder };
