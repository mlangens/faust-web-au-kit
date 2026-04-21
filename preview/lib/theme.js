function tokenToCssVariable(token) {
  if (token.startsWith("--")) {
    return token;
  }

  return `--${token
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()}`;
}

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
  body.dataset.simulatorId = ui?.simulator?.id || "default";
}

export { applyTheme };
