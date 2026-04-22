import { resolveSurfaceModels } from "./shared.js";
import { buildSurfaceCard } from "./registry.js";

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

export { buildSurfaceCard, renderSurfaces, resolveSurfaceModels };
