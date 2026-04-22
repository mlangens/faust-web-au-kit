// @ts-check

/**
 * @typedef {import("../../types/framework").DisplayConfig} DisplayConfig
 * @typedef {import("../../types/framework").GeneratedControl} GeneratedControl
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").JsonValue} JsonValue
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 * @typedef {import("../../types/framework").ProjectUiSectionCopy} ProjectUiSectionCopy
 * @typedef {import("../../types/framework").ProjectUiShellConfig} ProjectUiShellConfig
 * @typedef {import("../../types/framework").ProjectUiSimulatorManifest} ProjectUiSimulatorManifest
 */

/**
 * @typedef {DisplayConfig & { enumLabels?: string[] }} ResolvedControlDisplay
 * @typedef {Record<string, string | undefined>} ThemeTokens
 * @typedef {ProjectUiSimulatorManifest & { id: string }} ResolvedSimulator
 */

/** @type {ProjectUiShellConfig} */
const DEFAULT_SHELL = {
  eyebrow: "Web Preview Only",
  hero: {},
  sections: {
    surfaces: {
      title: "Editor Surface",
      description: "Reusable graph and editor surfaces resolved from the shared UI family manifest."
    },
    controls: {
      title: "Control Surface",
      description: "Generated from Faust metadata so layout experiments stay tied to the real DSP surface."
    },
    meters: {
      title: "Meter Preview",
      description: "Schema-driven motion for layout tuning only. Runtime metering still lives in the native wrapper."
    },
    benchmarks: {
      title: "Compile Target Snapshot",
      description: "Latest local benchmark data from the generated preview harness."
    }
  }
};

/** @type {ThemeTokens} */
const BASE_THEME_TOKENS = {
  bg: "#ebeee7",
  bgDeep: "#d7ddd1",
  panel: "rgba(249, 250, 247, 0.86)",
  panelStrong: "rgba(250, 251, 249, 0.94)",
  ink: "#1f2420",
  muted: "#616b63",
  line: "rgba(20, 26, 20, 0.11)",
  accent: "#2f6f80",
  accentSoft: "#82aeb8",
  info: "#2f6f80",
  positive: "#417f59",
  warning: "#d38a54",
  accentTint: "rgba(47, 111, 128, 0.13)",
  accentLine: "rgba(47, 111, 128, 0.28)",
  meterIn: "linear-gradient(90deg, #f7bd51, #ea7d44)",
  meterOut: "linear-gradient(90deg, #81d69a, #338465)",
  meterGr: "linear-gradient(90deg, #8491ff, #4656cf)",
  card: "rgba(255, 255, 255, 0.64)",
  controlTrack: "rgba(30, 36, 32, 0.1)",
  shadow: "0 20px 44px rgba(25, 31, 25, 0.09)",
  heroGlow: "rgba(255, 255, 255, 0.55)"
};

/** @type {Record<string, ThemeTokens>} */
const FAMILY_THEME_TOKENS = {
  dynamics: {
    accent: "#9f5e2a",
    accentSoft: "#d5a272",
    info: "#8a82ff",
    positive: "#417f59",
    warning: "#ef7f3a",
    accentTint: "rgba(159, 94, 42, 0.12)",
    accentLine: "rgba(159, 94, 42, 0.26)",
    meterIn: "linear-gradient(90deg, #f5c059, #ef7f3a)",
    meterOut: "linear-gradient(90deg, #9ed88b, #417f59)",
    meterGr: "linear-gradient(90deg, #8a82ff, #5447d1)"
  },
  instrument: {
    accent: "#257178",
    accentSoft: "#7eb6b2",
    info: "#28737b",
    positive: "#79d4cb",
    warning: "#d96d4d",
    accentTint: "rgba(37, 113, 120, 0.12)",
    accentLine: "rgba(37, 113, 120, 0.26)",
    meterIn: "linear-gradient(90deg, #f1b65a, #d96d4d)",
    meterOut: "linear-gradient(90deg, #79d4cb, #28737b)",
    meterGr: "linear-gradient(90deg, #9492ff, #4c5ce2)"
  },
  utility: {
    accent: "#526b88",
    accentSoft: "#9db0c7",
    info: "#526b88",
    positive: "#6a8e72",
    warning: "#a56f4d",
    accentTint: "rgba(82, 107, 136, 0.12)",
    accentLine: "rgba(82, 107, 136, 0.24)"
  }
};

/** @type {Record<string, string[]>} */
const LEGACY_ENUM_DISPLAYS = {
  "Drive Target": ["Both", "Mid", "Side"],
  "Drive Focus": ["Full", "Low", "Mid", "High"]
};

/**
 * @param {unknown} value
 * @returns {JsonObject}
 */
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? /** @type {JsonObject} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {JsonValue | undefined}
 */
function cloneValue(value) {
  if (Array.isArray(value)) {
    return /** @type {JsonValue[]} */ (value.map((entry) => cloneValue(entry)));
  }
  if (value && typeof value === "object") {
    return /** @type {JsonObject} */ (Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])));
  }
  return /** @type {JsonValue | undefined} */ (value);
}

/**
 * @param {unknown} base
 * @param {unknown} override
 * @returns {JsonObject}
 */
function deepMerge(base, override) {
  const left = asObject(base);
  const right = asObject(override);
  const merged = { ...asObject(cloneValue(left)) };

  Object.entries(right).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = /** @type {JsonValue[]} */ (value.map((entry) => cloneValue(entry)));
      return;
    }
    if (value && typeof value === "object") {
      merged[key] = deepMerge(left[key], value);
      return;
    }
    merged[key] = value;
  });

  return merged;
}

/**
 * @param {GeneratedControl} control
 * @returns {string}
 */
function controlKey(control) {
  return control.id || control.label;
}

/**
 * @param {...unknown} values
 * @returns {string | undefined}
 */
function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function maybeString(value) {
  return typeof value === "string" ? value : undefined;
}

/**
 * @param {GeneratedUiSchema} schema
 * @returns {string}
 */
function inferFamily(schema) {
  if (typeof schema.ui?.family === "string" && schema.ui.family.trim().length > 0) {
    return schema.ui.family;
  }
  if (schema.project?.kind === "instrument") {
    return "instrument";
  }
  if (schema.meters?.some((meter) => meter.mode === "gr")) {
    return "dynamics";
  }
  return "utility";
}

/**
 * @param {GeneratedUiSchema} schema
 * @param {ProjectUiManifest} ui
 * @returns {string}
 */
function inferThemeGroup(schema, ui) {
  return pickFirstString(
    ui.group,
    ui.themeGroup,
    schema.project?.kind === "instrument" ? "instrument" : null,
    schema.meters?.some((meter) => meter.mode === "gr") ? "dynamics" : null,
    "utility"
  ) ?? "utility";
}

/**
 * @param {unknown} value
 * @param {number} alpha
 * @returns {string}
 */
function hexToRgba(value, alpha) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) {
    return normalized;
  }

  const hexSource = match[1] ?? "";
  if (!hexSource) {
    return normalized;
  }
  const hex = hexSource.length === 3
    ? hexSource.split("").map((char) => `${char}${char}`).join("")
    : hexSource;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * @param {ProjectUiManifest} ui
 * @returns {ThemeTokens}
 */
function themeTokensFromVisualLanguage(ui) {
  const visualLanguage = asObject(ui.visualLanguage);
  const palette = asObject(visualLanguage.palette);
  const accentPaletteId = pickFirstString(
    ui.presentation?.accentPaletteId,
    ui.accentPaletteId
  );
  const accentPalette = accentPaletteId
    ? asObject(asObject(visualLanguage.accentPalettes)[accentPaletteId])
    : {};

  if (!Object.keys(palette).length && !Object.keys(accentPalette).length) {
    return {};
  }

  const accent = pickFirstString(accentPalette.primary, palette.focus);
  return {
    bg: maybeString(palette.canvas),
    bgDeep: pickFirstString(palette.panelInset, palette.panel),
    panel: hexToRgba(palette.panel ?? palette.panelElevated, 0.9),
    panelStrong: hexToRgba(palette.panelElevated ?? palette.panel, 0.96),
    ink: maybeString(palette.textStrong),
    muted: pickFirstString(palette.textMuted, palette.textDim),
    line: hexToRgba(palette.line ?? "#39414c", 0.32),
    accent,
    accentSoft: pickFirstString(accentPalette.secondary, palette.info),
    info: pickFirstString(palette.info, accentPalette.secondary, accent, "#63b7c8"),
    positive: pickFirstString(palette.positive, "#72bf78"),
    warning: pickFirstString(palette.warning, accentPalette.secondary, "#d38a54"),
    accentTint: hexToRgba(accent ?? palette.focus, 0.14),
    accentLine: hexToRgba(accent ?? palette.focus, 0.3),
    card: hexToRgba(palette.panelElevated ?? palette.panel ?? "#272d35", 0.84),
    controlTrack: hexToRgba(palette.lineSoft ?? palette.line ?? "#2d333c", 0.78),
    heroGlow: hexToRgba(accentPalette.surfaceTint ?? accent ?? "#ffffff", 0.18),
    meterIn: `linear-gradient(90deg, ${palette.warning ?? accentPalette.secondary ?? "#d38a54"}, ${accent ?? "#d9a64a"})`,
    meterOut: `linear-gradient(90deg, ${palette.positive ?? accentPalette.secondary ?? "#72bf78"}, ${palette.info ?? accent ?? "#63b7c8"})`,
    meterGr: `linear-gradient(90deg, ${palette.info ?? "#63b7c8"}, ${accent ?? "#d9a64a"})`
  };
}

/**
 * @param {GeneratedUiSchema} schema
 * @param {ProjectUiManifest} ui
 * @returns {ProjectUiShellConfig}
 */
function resolveShell(schema, ui) {
  const shell = asObject(ui.shell);
  const shellSections = asObject(shell.sections);
  const sectionAliases = asObject(ui.sections);
  const hero = deepMerge(asObject(shell.hero), asObject(ui.hero));
  /** @type {Record<string, ProjectUiSectionCopy>} */
  const sections = {};

  ["surfaces", "controls", "meters", "benchmarks"].forEach((sectionKey) => {
    sections[sectionKey] = /** @type {ProjectUiSectionCopy} */ (deepMerge(
      deepMerge(DEFAULT_SHELL.sections?.[sectionKey], deepMerge(asObject(shell[sectionKey]), asObject(shellSections[sectionKey]))),
      asObject(sectionAliases[sectionKey])
    ));
  });

  return {
    eyebrow: pickFirstString(shell.eyebrow, shell.kicker, ui.eyebrow, DEFAULT_SHELL.eyebrow),
    hero: {
      title: pickFirstString(hero.title, shell.title, ui.title, schema.project?.name),
      description: pickFirstString(hero.description, shell.description, ui.description, schema.project?.description),
      status: pickFirstString(hero.status, hero.statusText, shell.statusText, schema.project?.statusText)
    },
    sections
  };
}

/**
 * @param {ProjectUiManifest} ui
 * @param {string} family
 * @returns {ThemeTokens}
 */
function resolveThemeTokens(ui, family) {
  const theme = asObject(ui.theme);
  const directThemeTokens = /** @type {ThemeTokens} */ (Object.fromEntries(
    Object.entries(theme).filter(([key]) => !["tokens", "tone", "density", "radius", "family"].includes(key))
  ));
  const themeGroup = pickFirstString(ui.themeGroup, family, "utility") ?? "utility";

  return /** @type {ThemeTokens} */ (deepMerge(
    deepMerge(BASE_THEME_TOKENS, deepMerge(FAMILY_THEME_TOKENS[themeGroup], themeTokensFromVisualLanguage(ui))),
    deepMerge(directThemeTokens, deepMerge(asObject(theme.tokens), deepMerge(asObject(ui.themeTokens), asObject(ui.tokens))))
  ));
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedUiSchema} schema
 * @param {string} family
 * @returns {ResolvedSimulator}
 */
function resolveSimulator(ui, schema, family) {
  const preview = asObject(ui.preview);
  const simulator = preview.simulator ?? ui.simulator ?? ui.meterSimulator ?? ui.simulation ?? {};
  if (typeof simulator === "string") {
    return { id: simulator };
  }
  if (simulator && typeof simulator === "object") {
    const simulatorObject = asObject(simulator);
    return /** @type {ResolvedSimulator} */ ({
      ...simulatorObject,
      id: pickFirstString(
        simulatorObject.id,
        simulatorObject.kind,
        simulatorObject.name,
        simulatorObject.type,
        simulatorObject.family,
        schema.project?.key,
        family,
        "default"
      ) ?? "default"
    });
  }
  return { id: schema.project?.key || family || "default" };
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * @param {unknown} value
 * @returns {value is JsonObject[]}
 */
function isObjectArray(value) {
  return Array.isArray(value) && value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

/**
 * @param {unknown} value
 * @returns {string[] | null}
 */
function normalizeEnumLabels(value) {
  if (!value) {
    return null;
  }

  if (isStringArray(value)) {
    return value;
  }
  if (isObjectArray(value)) {
    return value
      .slice()
      .sort((left, right) => Number(left.value ?? left.index ?? 0) - Number(right.value ?? right.index ?? 0))
      .map((entry) => pickFirstString(entry.label, entry.text, String(entry.value ?? entry.index ?? "")) ?? "");
  }

  const objectValue = asObject(value);

  if (Array.isArray(objectValue.labels)) {
    return normalizeEnumLabels(objectValue.labels);
  }
  if (Array.isArray(objectValue.values)) {
    return normalizeEnumLabels(objectValue.values);
  }
  if (Array.isArray(objectValue.options)) {
    return normalizeEnumLabels(objectValue.options);
  }

  const numericEntries = Object.entries(objectValue)
    .filter(([key]) => Number.isFinite(Number(key)))
    .sort((left, right) => Number(left[0]) - Number(right[0]));

  if (numericEntries.length) {
    return numericEntries.map(([, entry]) => {
      if (entry && typeof entry === "object") {
        const entryObject = asObject(entry);
        return String(entryObject.label ?? entryObject.text ?? entryObject.value ?? "");
      }
      return String(entry);
    });
  }

  return null;
}

/**
 * @param {unknown} collection
 * @param {string[]} keyCandidates
 * @returns {JsonObject}
 */
function lookupControlConfig(collection, keyCandidates) {
  if (Array.isArray(collection)) {
    return keyCandidates.reduce((resolved, key) => {
      const match = collection.find((entry) => {
        const entryObject = asObject(entry);
        return entryObject.id === key || entryObject.label === key || entryObject.key === key;
      });
      return match ? deepMerge(resolved, match) : resolved;
    }, {});
  }

  const collectionObject = asObject(collection);
  return keyCandidates.reduce((resolved, key) => {
    if (Object.hasOwn(collectionObject, key)) {
      return deepMerge(resolved, collectionObject[key]);
    }
    return resolved;
  }, {});
}

/**
 * @param {ProjectUiManifest} ui
 * @param {GeneratedControl} control
 * @returns {ResolvedControlDisplay}
 */
function resolveControlDisplay(ui, control) {
  const keyCandidates = [controlKey(control), control.id, control.label, control.shortname].filter(
    /**
     * @param {string | undefined} key
     * @returns {key is string}
     */
    (key) => typeof key === "string" && key.length > 0
  );
  const uiObject = asObject(ui);

  const displayConfig = [
    asObject(uiObject.controls),
    asObject(uiObject.controlDisplays),
    asObject(uiObject.controlDisplay),
    asObject(asObject(uiObject.display).controls),
    asObject(asObject(uiObject.formatting).controls)
  ].reduce((resolved, collection) => deepMerge(resolved, lookupControlConfig(collection, keyCandidates)), {});

  let enumDisplay = null;
  for (const key of keyCandidates) {
    enumDisplay = (
      asObject(uiObject.enumDisplays)[key]
      || asObject(uiObject.enums)[key]
      || asObject(asObject(uiObject.display).enums)[key]
      || null
    );
    if (enumDisplay) {
      break;
    }
  }

  return {
    ...displayConfig,
    enumLabels: normalizeEnumLabels(
      displayConfig.enumLabels
      || displayConfig.enum
      || asObject(displayConfig.display).enumLabels
      || asObject(displayConfig.display).enum
      || control.enumLabels
      || asObject(control.display).enumLabels
      || asObject(control.display).enum
      || enumDisplay
      || LEGACY_ENUM_DISPLAYS[control.label]
    ) ?? undefined
  };
}

/**
 * @param {GeneratedUiSchema} rawSchema
 * @returns {GeneratedUiSchema}
 */
function normalizeSchema(rawSchema) {
  const ui = /** @type {ProjectUiManifest} */ (asObject(rawSchema.ui));
  const family = pickFirstString(ui.family, inferFamily(rawSchema)) ?? "utility";
  const variant = pickFirstString(ui.variant, rawSchema.project?.key, family) ?? family;
  const themeGroup = inferThemeGroup(rawSchema, ui);

  return /** @type {GeneratedUiSchema} */ ({
    ...rawSchema,
    ui: {
      ...ui,
      family,
      themeGroup,
      variant,
      shell: resolveShell(rawSchema, ui),
      theme: {
        ...asObject(ui.theme),
        tokens: resolveThemeTokens({ ...ui, themeGroup }, themeGroup)
      },
      simulator: resolveSimulator({ ...ui, themeGroup }, rawSchema, family)
    }
  });
}

export { controlKey, deepMerge, normalizeSchema, resolveControlDisplay };
