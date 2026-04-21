import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reservedUiKeys = new Set(["family", "variant", "overrides"]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }
  return value;
}

function mergeUiLayers(...layers) {
  let merged = {};
  for (const layer of layers) {
    if (layer == null) {
      continue;
    }
    if (!isPlainObject(layer)) {
      throw new Error("UI layers must resolve to objects.");
    }
    merged = mergeObjects(merged, layer);
  }
  return merged;
}

function mergeObjects(base, override) {
  const result = { ...cloneValue(base) };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeObjects(current, value);
      continue;
    }
    result[key] = cloneValue(value);
  }
  return result;
}

function normalizeFamilyManifest(manifest) {
  const body =
    !Object.prototype.hasOwnProperty.call(manifest, "defaults") &&
    !Object.prototype.hasOwnProperty.call(manifest, "variants") &&
    isPlainObject(manifest.ui)
      ? manifest.ui
      : manifest;

  const inferredDefaults = { ...body };
  delete inferredDefaults.defaults;
  delete inferredDefaults.variants;

  const defaults = body.defaults ?? inferredDefaults;
  const variants = body.variants ?? {};
  if (!isPlainObject(defaults)) {
    throw new Error("UI family manifest defaults must be an object.");
  }
  if (!isPlainObject(variants)) {
    throw new Error("UI family manifest variants must be an object.");
  }

  return {
    body,
    defaults,
    variants
  };
}

function familyManifestPath(family, resolverRoot = root) {
  return path.resolve(resolverRoot, "ui", "families", family, "manifest.json");
}

function loadUiFamilyManifest(family, options = {}) {
  const resolverRoot = options.root ?? root;
  const manifestPath = familyManifestPath(family, resolverRoot);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`UI family manifest "${family}" was not found at "${manifestPath}".`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!isPlainObject(manifest)) {
    throw new Error(`UI family manifest "${family}" must contain a JSON object.`);
  }

  const normalized = normalizeFamilyManifest(manifest);
  return {
    family,
    manifestPath,
    manifest,
    defaults: normalized.defaults,
    variants: normalized.variants
  };
}

function resolveVariantConfig(variants, variantName, stack = []) {
  if (!variantName) {
    return {};
  }

  const variant = variants[variantName];
  if (!isPlainObject(variant)) {
    const available = Object.keys(variants).sort().join(", ");
    throw new Error(`Unknown UI family variant "${variantName}". Available variants: ${available || "none"}`);
  }

  if (stack.includes(variantName)) {
    throw new Error(`Circular UI family variant inheritance detected: ${[...stack, variantName].join(" -> ")}`);
  }

  const baseName = variant.extends;
  const inherited =
    typeof baseName === "string" && baseName.trim()
      ? resolveVariantConfig(variants, baseName.trim(), [...stack, variantName])
      : {};
  const { extends: _ignored, ...variantBody } = variant;
  return mergeUiLayers(inherited, variantBody);
}

function extractInlineOverrides(projectUi) {
  return Object.fromEntries(Object.entries(projectUi).filter(([key]) => !reservedUiKeys.has(key)));
}

function resolveProjectUi(projectUi, options = {}) {
  const hasProjectUi = projectUi !== undefined;
  if (!isPlainObject(projectUi)) {
    return {
      hasProjectUi,
      family: null,
      variant: null,
      manifestPath: null,
      manifest: null,
      defaults: {},
      variantConfig: {},
      inlineOverrides: {},
      explicitOverrides: {},
      resolved: projectUi
    };
  }

  const family = typeof projectUi.family === "string" && projectUi.family.trim() ? projectUi.family.trim() : null;
  const variant = typeof projectUi.variant === "string" && projectUi.variant.trim() ? projectUi.variant.trim() : null;
  const inlineOverrides = extractInlineOverrides(projectUi);
  const explicitOverrides = projectUi.overrides == null ? {} : projectUi.overrides;

  if (projectUi.overrides != null && !isPlainObject(projectUi.overrides)) {
    throw new Error("project.ui.overrides must be an object when provided.");
  }

  if (!family) {
    return {
      hasProjectUi,
      family: null,
      variant,
      manifestPath: null,
      manifest: null,
      defaults: {},
      variantConfig: {},
      inlineOverrides,
      explicitOverrides,
      resolved: cloneValue(projectUi)
    };
  }

  const familyManifest = loadUiFamilyManifest(family, options);
  const variantConfig = resolveVariantConfig(familyManifest.variants, variant);
  const resolved = mergeUiLayers(familyManifest.defaults, variantConfig, inlineOverrides, explicitOverrides);

  return {
    hasProjectUi,
    family,
    variant,
    manifestPath: familyManifest.manifestPath,
    manifest: familyManifest.manifest,
    defaults: cloneValue(familyManifest.defaults),
    variantConfig,
    inlineOverrides: cloneValue(inlineOverrides),
    explicitOverrides: cloneValue(explicitOverrides),
    resolved
  };
}

export { familyManifestPath, loadUiFamilyManifest, mergeUiLayers, resolveProjectUi };
