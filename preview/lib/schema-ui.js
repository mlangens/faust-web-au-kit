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

const LEGACY_ENUM_DISPLAYS = {
  "Drive Target": ["Both", "Mid", "Side"],
  "Drive Focus": ["Full", "Low", "Mid", "High"]
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }
  return value;
}

function deepMerge(base, override) {
  const left = asObject(base);
  const right = asObject(override);
  const merged = { ...cloneValue(left) };

  Object.entries(right).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = value.map(cloneValue);
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

function controlKey(control) {
  return control.id || control.label;
}

function pickFirstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

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

function inferThemeGroup(schema, ui) {
  return pickFirstString(
    ui.group,
    ui.themeGroup,
    schema.project?.kind === "instrument" ? "instrument" : null,
    schema.meters?.some((meter) => meter.mode === "gr") ? "dynamics" : null,
    "utility"
  );
}

function hexToRgba(value, alpha) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) {
    return value;
  }

  const hex = match[1].length === 3
    ? match[1].split("").map((char) => `${char}${char}`).join("")
    : match[1];
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function themeTokensFromVisualLanguage(ui) {
  const visualLanguage = asObject(ui.visualLanguage);
  const palette = asObject(visualLanguage.palette);
  const accentPaletteId = pickFirstString(
    ui.presentation?.accentPaletteId,
    ui.accentPaletteId
  );
  const accentPalette = asObject(asObject(visualLanguage.accentPalettes)[accentPaletteId]);

  if (!Object.keys(palette).length && !Object.keys(accentPalette).length) {
    return {};
  }

  const accent = accentPalette.primary ?? palette.focus;
  return {
    bg: palette.canvas,
    bgDeep: palette.panelInset ?? palette.panel,
    panel: hexToRgba(palette.panel ?? palette.panelElevated, 0.9),
    panelStrong: hexToRgba(palette.panelElevated ?? palette.panel, 0.96),
    ink: palette.textStrong,
    muted: palette.textMuted ?? palette.textDim,
    line: hexToRgba(palette.line ?? "#39414c", 0.32),
    accent,
    accentSoft: accentPalette.secondary ?? palette.info,
    info: palette.info ?? accentPalette.secondary ?? accent ?? "#63b7c8",
    positive: palette.positive ?? "#72bf78",
    warning: palette.warning ?? accentPalette.secondary ?? "#d38a54",
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

function resolveShell(schema, ui) {
  const shell = asObject(ui.shell);
  const shellSections = asObject(shell.sections);
  const sectionAliases = asObject(ui.sections);

  const mergedShell = deepMerge(DEFAULT_SHELL, shell);

  ["surfaces", "controls", "meters", "benchmarks"].forEach((sectionKey) => {
    mergedShell.sections[sectionKey] = deepMerge(
      mergedShell.sections[sectionKey],
      deepMerge(asObject(shell[sectionKey]), asObject(shellSections[sectionKey]))
    );
    mergedShell.sections[sectionKey] = deepMerge(mergedShell.sections[sectionKey], asObject(sectionAliases[sectionKey]));
  });

  const hero = deepMerge(asObject(shell.hero), asObject(ui.hero));

  return {
    eyebrow: pickFirstString(shell.eyebrow, shell.kicker, ui.eyebrow, DEFAULT_SHELL.eyebrow),
    hero: {
      title: pickFirstString(hero.title, shell.title, ui.title, schema.project?.name),
      description: pickFirstString(hero.description, shell.description, ui.description, schema.project?.description),
      status: pickFirstString(hero.status, hero.statusText, shell.statusText, schema.project?.statusText)
    },
    sections: mergedShell.sections
  };
}

function resolveThemeTokens(ui, family) {
  const theme = asObject(ui.theme);
  const directThemeTokens = Object.fromEntries(
    Object.entries(theme).filter(([key]) => !["tokens", "tone", "density", "radius", "family"].includes(key))
  );
  const themeGroup = pickFirstString(ui.themeGroup, family, "utility");

  return deepMerge(
    deepMerge(BASE_THEME_TOKENS, deepMerge(FAMILY_THEME_TOKENS[themeGroup], themeTokensFromVisualLanguage(ui))),
    deepMerge(directThemeTokens, deepMerge(asObject(theme.tokens), deepMerge(asObject(ui.themeTokens), asObject(ui.tokens))))
  );
}

function resolveSimulator(ui, schema, family) {
  const preview = asObject(ui.preview);
  const simulator = preview.simulator ?? ui.simulator ?? ui.meterSimulator ?? ui.simulation ?? {};
  if (typeof simulator === "string") {
    return { id: simulator };
  }
  if (simulator && typeof simulator === "object") {
    return {
      ...simulator,
      id: simulator.id || simulator.kind || simulator.name || simulator.type || simulator.family || schema.project?.key || family
    };
  }
  return { id: schema.project?.key || family || "default" };
}

function normalizeEnumLabels(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return value;
    }
    if (value.every((entry) => entry && typeof entry === "object")) {
      return value
        .slice()
        .sort((left, right) => Number(left.value ?? left.index ?? 0) - Number(right.value ?? right.index ?? 0))
        .map((entry) => entry.label ?? entry.text ?? String(entry.value ?? entry.index ?? ""));
    }
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
        return entry.label ?? entry.text ?? String(entry.value ?? "");
      }
      return String(entry);
    });
  }

  return null;
}

function lookupControlConfig(collection, keyCandidates) {
  if (Array.isArray(collection)) {
    return keyCandidates.reduce((resolved, key) => {
      const match = collection.find((entry) => entry?.id === key || entry?.label === key || entry?.key === key);
      return match ? deepMerge(resolved, match) : resolved;
    }, {});
  }

  return keyCandidates.reduce((resolved, key) => {
    if (collection && Object.hasOwn(collection, key)) {
      return deepMerge(resolved, collection[key]);
    }
    return resolved;
  }, {});
}

function resolveControlDisplay(ui, control) {
  const keyCandidates = [controlKey(control), control.id, control.label, control.shortname].filter(Boolean);
  const uiObject = asObject(ui);

  const displayConfig = [
    asObject(uiObject.controls),
    asObject(uiObject.controlDisplays),
    asObject(uiObject.controlDisplay),
    asObject(asObject(uiObject.display).controls),
    asObject(asObject(uiObject.formatting).controls)
  ].reduce((resolved, collection) => deepMerge(resolved, lookupControlConfig(collection, keyCandidates)), {});

  const enumDisplay = keyCandidates.reduce((resolved, key) => {
    if (resolved) {
      return resolved;
    }
    return (
      asObject(uiObject.enumDisplays)[key]
      || asObject(uiObject.enums)[key]
      || asObject(asObject(uiObject.display).enums)[key]
      || null
    );
  }, null);

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
    )
  };
}

function normalizeSchema(rawSchema) {
  const ui = asObject(rawSchema.ui);
  const family = pickFirstString(ui.family, inferFamily(rawSchema));
  const variant = pickFirstString(ui.variant, rawSchema.project?.key, family);
  const themeGroup = inferThemeGroup(rawSchema, ui);

  return {
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
  };
}

export { controlKey, deepMerge, normalizeSchema, resolveControlDisplay };
