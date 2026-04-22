// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileSync } from "./fs-tools.mjs";

/**
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").JsonValue} JsonValue
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 * @typedef {import("../../types/framework").ProjectUiRuntime} ProjectUiRuntime
 * @typedef {import("../../types/framework").UiFamilyManifest} UiFamilyManifest
 * @typedef {import("../../types/framework").UiFamilyRuntime} UiFamilyRuntime
 * @typedef {import("../../types/framework").UiFamilyVariantConfig} UiFamilyVariantConfig
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reservedUiKeys = new Set(["family", "variant", "overrides"]);

/**
 * @param {unknown} value
 * @returns {value is JsonObject}
 */
function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {JsonValue | undefined} value
 * @returns {JsonValue | undefined}
 */
function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => /** @type {JsonValue} */ (cloneValue(entry) ?? null));
  }
  if (isPlainObject(value)) {
    return /** @type {JsonObject} */ (
      Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]))
    );
  }
  return value;
}

/**
 * @param {...(JsonObject | null | undefined)} layers
 * @returns {JsonObject}
 */
function mergeUiLayers(...layers) {
  /** @type {JsonObject} */
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

/**
 * @param {JsonObject} base
 * @param {JsonObject} override
 * @returns {JsonObject}
 */
function mergeObjects(base, override) {
  const result = { ...base };
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

/**
 * @param {UiFamilyManifest} manifest
 * @returns {{ body: ProjectUiManifest, defaults: ProjectUiManifest, variants: Record<string, UiFamilyVariantConfig> }}
 */
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
    body: /** @type {ProjectUiManifest} */ (body),
    defaults: /** @type {ProjectUiManifest} */ (defaults),
    variants: /** @type {Record<string, UiFamilyVariantConfig>} */ (variants)
  };
}

/**
 * @param {string} family
 * @param {string} [resolverRoot]
 * @returns {string}
 */
function familyManifestPath(family, resolverRoot = root) {
  return path.resolve(resolverRoot, "ui", "families", family, "manifest.json");
}

/**
 * @param {string} family
 * @param {{ root?: string }} [options]
 * @returns {UiFamilyRuntime}
 */
function loadUiFamilyManifest(family, options = {}) {
  const resolverRoot = options.root ?? root;
  const manifestPath = familyManifestPath(family, resolverRoot);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`UI family manifest "${family}" was not found at "${manifestPath}".`);
  }

  /** @type {UiFamilyManifest} */
  const manifest = readJsonFileSync(manifestPath);
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

/**
 * @param {Record<string, UiFamilyVariantConfig>} variants
 * @param {string | null} variantName
 * @param {string[]} [stack]
 * @returns {UiFamilyVariantConfig}
 */
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
  return /** @type {UiFamilyVariantConfig} */ (mergeUiLayers(inherited, variantBody));
}

/**
 * @param {ProjectUiManifest} projectUi
 * @returns {JsonObject}
 */
function extractInlineOverrides(projectUi) {
  return /** @type {JsonObject} */ (
    Object.fromEntries(Object.entries(projectUi).filter(([key]) => !reservedUiKeys.has(key)))
  );
}

/**
 * @param {ProjectUiManifest | undefined} projectUi
 * @param {{ root?: string }} [options]
 * @returns {ProjectUiRuntime}
 */
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
      resolved: projectUi ?? null
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
      resolved: cloneValue(projectUi) ?? null
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
    defaults: /** @type {JsonObject} */ (cloneValue(familyManifest.defaults) ?? {}),
    variantConfig,
    inlineOverrides: /** @type {JsonObject} */ (cloneValue(inlineOverrides) ?? {}),
    explicitOverrides: /** @type {JsonObject} */ (cloneValue(explicitOverrides) ?? {}),
    resolved
  };
}

export { familyManifestPath, loadUiFamilyManifest, mergeUiLayers, resolveProjectUi };
