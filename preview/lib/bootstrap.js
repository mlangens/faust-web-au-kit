// @ts-check

/**
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").PreviewState} PreviewState
 */

import { getPreviewRoots } from "./dom.js";
import { setMeter } from "./meters.js";
import { activeAppKeyFromLocation, loadBenchmarkReport, loadPreviewSchema, loadWorkspaceManifest } from "./preview-data.js";
import { renderBenchmarks, renderControls, renderMeters, renderShellChrome, renderWorkspaceNav } from "./renderers.js";
import { normalizeSchema } from "./schema-ui.js";
import { createSimulator } from "./simulators.js";
import { renderSurfaces } from "./surfaces.js";
import { applyTheme } from "./theme.js";

/** @type {PreviewState} */
const state = {
  controls: new Map(),
  meterViews: new Map(),
  surfaceViews: [],
  motionPhase: 0,
  animationFrame: 0,
  schema: null,
  simulator: null,
  workspace: null
};

/**
 * @param {Document} doc
 * @returns {void}
 */
function resetPreviewState(doc) {
  delete doc.body.dataset.previewError;
  delete doc.body.dataset.simulatorId;
  state.controls.clear();
  state.meterViews.clear();
  state.surfaceViews = [];
  state.motionPhase = 0;
  state.refreshSurfaceViews = () => {
    state.surfaceViews.forEach((update) => update());
  };
}

/**
 * @returns {void}
 */
function refreshPreviewMotion() {
  state.refreshSurfaceViews?.();
  if (!state.simulator) {
    return;
  }
  state.meterViews.forEach(({ fill, value, meter }, id) => {
    setMeter(fill, value, state.simulator.measure(state, id, meter), meter);
  });
}

/**
 * @returns {void}
 */
function startMeterAnimation() {
  cancelAnimationFrame(state.animationFrame);

  const tick = () => {
    state.motionPhase += 0.04;
    refreshPreviewMotion();
    state.animationFrame = requestAnimationFrame(tick);
  };

  tick();
}

/**
 * @param {Document} [doc=document]
 * @returns {Promise<void>}
 */
async function bootstrapPreview(doc = document) {
  const roots = getPreviewRoots(doc);
  const location = doc.defaultView?.location;

  resetPreviewState(doc);
  state.workspace = await loadWorkspaceManifest();
  renderWorkspaceNav(roots.nav, state.workspace, activeAppKeyFromLocation(location) ?? state.workspace?.defaultApp ?? null);

  const schema = /** @type {GeneratedUiSchema} */ (normalizeSchema(await loadPreviewSchema(state.workspace, location)));
  state.schema = schema;
  state.simulator = createSimulator(schema);

  applyTheme(schema.ui, doc);
  doc.body.dataset.simulatorId = state.simulator.id;
  doc.body.dataset.projectKey = schema.project.key;
  renderWorkspaceNav(roots.nav, state.workspace, schema.project.key);
  renderShellChrome(roots, schema, doc);
  renderControls(roots.controls, schema, state);
  renderSurfaces(roots.surfaces, roots.surfacePanel, schema, state);
  renderMeters(roots.meters, schema, state);
  state.refreshSurfaceViews();

  try {
    renderBenchmarks(roots.benchmarks, await loadBenchmarkReport(schema, state.workspace));
  } catch (error) {
    renderBenchmarks(roots.benchmarks, null);
    console.error(error);
  }

  startMeterAnimation();
}

export { bootstrapPreview };
