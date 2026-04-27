// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileSync } from "./fs-tools.mjs";
import { loadCatalogRuntime } from "./project-tools.mjs";

/**
 * @typedef {import("../../types/framework").CatalogProduct} CatalogProduct
 * @typedef {import("../../types/framework").DspPrimitive} DspPrimitive
 * @typedef {import("../../types/framework").DspPrimitiveLibrary} DspPrimitiveLibrary
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").ProjectRuntime} ProjectRuntime
 * @typedef {import("../../types/framework").ResolvedPrimitiveSet} ResolvedPrimitiveSet
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultPrimitiveLibraryRelativePath = "framework/primitives/audio-primitives.json";

/**
 * @param {unknown} value
 * @returns {value is JsonObject}
 */
function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => optionalString(entry)).filter(Boolean);
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * @param {string} [resolverRoot]
 * @returns {string}
 */
function primitiveLibraryPath(resolverRoot = root) {
  return path.resolve(resolverRoot, defaultPrimitiveLibraryRelativePath);
}

/**
 * @param {unknown} value
 * @returns {Record<string, JsonObject>}
 */
function objectMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return /** @type {Record<string, JsonObject>} */ (value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, string[]>}
 */
function stringListMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, stringList(entry)])
  );
}

/**
 * @param {{ root?: string }} [options]
 * @returns {DspPrimitiveLibrary}
 */
function loadPrimitiveLibrary(options = {}) {
  const libraryPath = primitiveLibraryPath(options.root ?? root);
  /** @type {DspPrimitiveLibrary} */
  const library = readJsonFileSync(libraryPath);
  if (!isPlainObject(library)) {
    throw new Error(`Primitive library "${libraryPath}" must contain a JSON object.`);
  }
  if (!optionalString(library.id)) {
    throw new Error(`Primitive library "${libraryPath}" must declare an id.`);
  }

  const primitives = objectMap(library.primitives);
  if (!Object.keys(primitives).length) {
    throw new Error(`Primitive library "${libraryPath}" must declare at least one primitive.`);
  }

  for (const [id, primitive] of Object.entries(primitives)) {
    if (!optionalString(primitive.family)) {
      throw new Error(`Primitive "${id}" must declare a family.`);
    }
    if (!optionalString(primitive.title)) {
      throw new Error(`Primitive "${id}" must declare a title.`);
    }
  }

  for (const [mapName, entries] of Object.entries({
    variantPrimitiveMap: stringListMap(library.variantPrimitiveMap),
    categoryPrimitiveMap: stringListMap(library.categoryPrimitiveMap),
    productPrimitiveMap: stringListMap(library.productPrimitiveMap)
  })) {
    for (const [key, ids] of Object.entries(entries)) {
      for (const id of ids) {
        if (!primitives[id]) {
          throw new Error(`Primitive map "${mapName}.${key}" references unknown primitive "${id}".`);
        }
      }
    }
  }

  return library;
}

/**
 * @param {DspPrimitiveLibrary} library
 * @param {"variantPrimitiveMap" | "categoryPrimitiveMap" | "productPrimitiveMap"} mapName
 * @param {string} key
 * @returns {string[]}
 */
function primitiveIdsFromMap(library, mapName, key) {
  if (!key) {
    return [];
  }
  const mapped = stringListMap(library[mapName]);
  return mapped[key] ?? [];
}

/**
 * @param {ProjectRuntime} runtime
 * @param {string} productId
 * @returns {CatalogProduct | null}
 */
function catalogProductForRuntime(runtime, productId) {
  const suiteArg = typeof runtime.args.suite === "string" ? runtime.args.suite : undefined;
  const { catalog } = loadCatalogRuntime(suiteArg);
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const matched = products.find((product) => product?.id === productId || product?.id === runtime.appKey);
  return matched ?? null;
}

/**
 * @param {JsonObject} resolvedUi
 * @returns {JsonObject}
 */
function resolvedCatalog(resolvedUi) {
  return isPlainObject(resolvedUi.catalog) ? resolvedUi.catalog : {};
}

/**
 * @param {ProjectRuntime} runtime
 * @param {DspPrimitiveLibrary} [library]
 * @returns {string[]}
 */
function resolveProjectPrimitiveIds(runtime, library = loadPrimitiveLibrary({ root: runtime.root })) {
  const resolvedUi = isPlainObject(runtime.ui) ? runtime.ui : {};
  const catalog = resolvedCatalog(resolvedUi);
  const productId = optionalString(catalog.productId) || runtime.appKey;
  const catalogProduct = catalogProductForRuntime(runtime, productId);
  const variant = optionalString(resolvedUi.variant) || optionalString(runtime.uiRuntime?.variant) || optionalString(catalogProduct?.variant);
  const category = optionalString(catalog.category) || optionalString(catalogProduct?.category);
  const specificPrimitiveIds = uniqueStrings([
    ...stringList(runtime.rawProject.ui?.primitiveIds),
    ...stringList(resolvedUi.primitiveIds),
    ...stringList(catalog.primitiveIds),
    ...stringList(catalogProduct?.primitiveIds),
    ...primitiveIdsFromMap(library, "productPrimitiveMap", productId),
    ...primitiveIdsFromMap(library, "productPrimitiveMap", runtime.appKey),
    ...primitiveIdsFromMap(library, "variantPrimitiveMap", variant)
  ]);

  return specificPrimitiveIds.length
    ? specificPrimitiveIds
    : uniqueStrings(primitiveIdsFromMap(library, "categoryPrimitiveMap", category));
}

/**
 * @param {ProjectRuntime} runtime
 * @param {DspPrimitiveLibrary} [library]
 * @returns {ResolvedPrimitiveSet}
 */
function resolveProjectPrimitiveSet(runtime, library = loadPrimitiveLibrary({ root: runtime.root })) {
  const primitiveIds = resolveProjectPrimitiveIds(runtime, library);
  const primitives = objectMap(library.primitives);
  /** @type {Record<string, DspPrimitive>} */
  const resolvedPrimitives = {};

  for (const id of primitiveIds) {
    const primitive = primitives[id];
    if (!primitive) {
      throw new Error(`Project "${runtime.appKey}" references unknown primitive "${id}".`);
    }
    resolvedPrimitives[id] = /** @type {DspPrimitive} */ (primitive);
  }

  return {
    library: {
      id: String(library.id),
      displayName: optionalString(library.displayName),
      description: optionalString(library.description),
      sourcePath: defaultPrimitiveLibraryRelativePath,
      researchSources: Array.isArray(library.researchSources) ? library.researchSources : []
    },
    families: objectMap(library.families),
    primitiveIds,
    primitives: resolvedPrimitives
  };
}

export {
  loadPrimitiveLibrary,
  primitiveLibraryPath,
  resolveProjectPrimitiveIds,
  resolveProjectPrimitiveSet
};
