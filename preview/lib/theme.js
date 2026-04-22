// @ts-check

/**
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 */

/**
 * @param {ProjectUiManifest | null | undefined} ui
 * @returns {string}
 */
function simulatorIdFromUi(ui) {
  const simulator = ui?.simulator;
  if (!simulator || typeof simulator !== "object" || Array.isArray(simulator)) {
    return "default";
  }
  return typeof simulator.id === "string" && simulator.id.trim().length > 0 ? simulator.id : "default";
}

/**
 * @param {string} token
 * @returns {string}
 */
function tokenToCssVariable(token) {
  if (token.startsWith("--")) {
    return token;
  }

  return `--${token
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()}`;
}

/**
 * @param {ProjectUiManifest | null | undefined} ui
 * @param {Document} [doc=document]
 * @returns {void}
 */
function applyTheme(ui, doc = document) {
  const root = doc.documentElement;
  const body = doc.body;
  const tokens = ui?.theme?.tokens ?? {};

  Object.entries(tokens).forEach(([token, value]) => {
    root.style.setProperty(tokenToCssVariable(token), String(value));
  });

  body.dataset.uiFamily = ui?.family || "default";
  body.dataset.uiVariant = ui?.variant || ui?.family || "default";
  body.dataset.uiThemeGroup = ui?.themeGroup || "default";
  body.dataset.simulatorId = simulatorIdFromUi(ui);
}

export { applyTheme };
