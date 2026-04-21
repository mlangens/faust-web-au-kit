import { getPreviewRoots } from "./dom.js";
import { renderBenchmarks, renderControls, renderMeters, renderShellChrome, renderWorkspaceNav } from "./renderers.js";
import { normalizeSchema } from "./schema-ui.js";
import { createSimulator, setMeter } from "./simulators.js";
import { applyTheme } from "./theme.js";

const state = {
  controls: new Map(),
  meterViews: new Map(),
  motionPhase: 0,
  animationFrame: 0,
  schema: null,
  simulator: null,
  workspace: null
};

function activeAppKeyFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const appKey = params.get("app");
  if (appKey) {
    return appKey;
  }

  const legacyProjectKey = params.get("project");
  return legacyProjectKey ? legacyProjectKey.replaceAll("_", "-") : null;
}

async function loadWorkspaceManifest() {
  const response = await fetch("/generated/workspace_manifest.json");
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function schemaPathForApp(workspace, appKey) {
  const workspaceEntry = workspace?.apps?.find((app) => app.key === appKey);
  return workspaceEntry?.schemaPath || `/generated/apps/${appKey}/ui_schema.json`;
}

async function loadSchema(workspace) {
  const appKey = activeAppKeyFromLocation() ?? workspace?.defaultApp;
  if (!appKey) {
    throw new Error("No workspace default app is available for preview.");
  }

  const schemaResponse = await fetch(schemaPathForApp(workspace, appKey));
  if (!schemaResponse.ok) {
    if (appKey) {
      throw new Error(`Preview schema for "${appKey}" is unavailable (HTTP ${schemaResponse.status}).`);
    }
    throw new Error(`Default preview schema is unavailable (HTTP ${schemaResponse.status}).`);
  }
  return schemaResponse.json();
}

function startMeterAnimation() {
  cancelAnimationFrame(state.animationFrame);

  const tick = () => {
    state.motionPhase += 0.04;
    state.meterViews.forEach(({ fill, value, meter }, id) => {
      setMeter(fill, value, state.simulator.measure(state, id, meter), meter);
    });
    state.animationFrame = requestAnimationFrame(tick);
  };

  tick();
}

async function bootstrapPreview(doc = document) {
  const roots = getPreviewRoots(doc);

  delete document.body.dataset.previewError;
  state.workspace = await loadWorkspaceManifest();
  renderWorkspaceNav(roots.nav, state.workspace, activeAppKeyFromLocation() ?? state.workspace?.defaultApp);

  const schema = normalizeSchema(await loadSchema(state.workspace));
  state.schema = schema;
  state.simulator = createSimulator(schema);

  applyTheme(schema.ui, doc);
  document.body.dataset.projectKey = schema.project.key;
  renderWorkspaceNav(roots.nav, state.workspace, schema.project.key);
  renderShellChrome(roots, schema);
  renderControls(roots.controls, schema, state);
  renderMeters(roots.meters, schema, state);

  try {
    const fallbackBenchmarkPath = state.workspace?.defaultApp
      ? `/generated/apps/${state.workspace.defaultApp}/benchmark-results.json`
      : "/generated/apps/limiter-lab/benchmark-results.json";
    const benchmarkResponse = await fetch(schema.benchmarkPath || fallbackBenchmarkPath);
    renderBenchmarks(roots.benchmarks, benchmarkResponse.ok ? await benchmarkResponse.json() : null);
  } catch (error) {
    renderBenchmarks(roots.benchmarks, null);
    console.error(error);
  }

  startMeterAnimation();
}

export { bootstrapPreview };
