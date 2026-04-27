// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileSync } from "./fs-tools.mjs";
import { loadPrimitiveLibrary } from "./primitive-library-tools.mjs";

/**
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").ReferenceCorpus} ReferenceCorpus
 * @typedef {import("../../types/framework").ReferenceCorpusEvidence} ReferenceCorpusEvidence
 * @typedef {import("../../types/framework").ReferenceCorpusEntry} ReferenceCorpusEntry
 * @typedef {import("../../types/framework").ResolvedReferenceCorpusEvidence} ResolvedReferenceCorpusEvidence
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultReferenceCorpusRelativePath = "framework/reference-corpus/plugin-references.json";

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
  return Array.isArray(value) ? value.map((entry) => optionalString(entry)).filter(Boolean) : [];
}

/**
 * @param {string} [resolverRoot]
 * @returns {string}
 */
function referenceCorpusPath(resolverRoot = root) {
  return path.resolve(resolverRoot, defaultReferenceCorpusRelativePath);
}

/**
 * @param {{ root?: string }} [options]
 * @returns {ReferenceCorpus}
 */
function loadReferenceCorpus(options = {}) {
  const resolverRoot = options.root ?? root;
  const corpusPath = referenceCorpusPath(resolverRoot);
  /** @type {ReferenceCorpus} */
  const corpus = readJsonFileSync(corpusPath);
  if (!isPlainObject(corpus)) {
    throw new Error(`Reference corpus "${corpusPath}" must contain a JSON object.`);
  }
  if (!optionalString(corpus.id)) {
    throw new Error(`Reference corpus "${corpusPath}" must declare an id.`);
  }
  if (!Array.isArray(corpus.entries) || corpus.entries.length === 0) {
    throw new Error(`Reference corpus "${corpusPath}" must declare entries.`);
  }

  const primitiveLibrary = loadPrimitiveLibrary({ root: resolverRoot });
  const primitiveIds = new Set(Object.keys(primitiveLibrary.primitives ?? {}));
  const entryIds = new Set();
  for (const entry of corpus.entries) {
    const entryId = optionalString(entry.id);
    if (!entryId) {
      throw new Error(`Reference corpus "${corpusPath}" contains an entry without an id.`);
    }
    if (entryIds.has(entryId)) {
      throw new Error(`Reference corpus "${corpusPath}" declares duplicate entry "${entryId}".`);
    }
    entryIds.add(entryId);
    if (!optionalString(entry.referenceType)) {
      throw new Error(`Reference corpus entry "${entryId}" must declare a referenceType.`);
    }
    if (!optionalString(entry.productName)) {
      throw new Error(`Reference corpus entry "${entryId}" must declare a productName.`);
    }
    const observedPrimitiveIds = stringList(entry.observedPrimitiveIds);
    if (!observedPrimitiveIds.length) {
      throw new Error(`Reference corpus entry "${entryId}" must observe at least one primitive.`);
    }
    for (const primitiveId of observedPrimitiveIds) {
      if (!primitiveIds.has(primitiveId)) {
        throw new Error(`Reference corpus entry "${entryId}" references unknown primitive "${primitiveId}".`);
      }
    }
  }

  return corpus;
}

/**
 * @param {ReferenceCorpusEntry} entry
 * @returns {ReferenceCorpusEvidence}
 */
function evidenceFromEntry(entry) {
  return {
    id: String(entry.id),
    referenceType: optionalString(entry.referenceType),
    vendor: optionalString(entry.vendor),
    productName: optionalString(entry.productName),
    role: optionalString(entry.role),
    extractionStatus: optionalString(entry.extractionStatus),
    manualUrl: typeof entry.manualUrl === "string" ? entry.manualUrl : null,
    featureSignals: stringList(entry.featureSignals),
    extractionNotes: optionalString(entry.extractionNotes)
  };
}

/**
 * @param {string[]} primitiveIds
 * @param {{ root?: string, corpus?: ReferenceCorpus }} [options]
 * @returns {ResolvedReferenceCorpusEvidence}
 */
function resolvePrimitiveCorpusEvidence(primitiveIds, options = {}) {
  const corpus = options.corpus ?? loadReferenceCorpus({ root: options.root ?? root });
  /** @type {Record<string, ReferenceCorpusEvidence[]>} */
  const evidenceByPrimitive = {};
  const requestedIds = [...new Set(primitiveIds)];

  for (const primitiveId of requestedIds) {
    evidenceByPrimitive[primitiveId] = [];
  }

  for (const entry of corpus.entries ?? []) {
    const observedIds = new Set(stringList(entry.observedPrimitiveIds));
    for (const primitiveId of requestedIds) {
      if (observedIds.has(primitiveId)) {
        evidenceByPrimitive[primitiveId]?.push(evidenceFromEntry(entry));
      }
    }
  }

  const sampleSuites = (corpus.entries ?? [])
    .filter((entry) => entry.referenceType === "sample-suite")
    .map(evidenceFromEntry);
  const referenceCount = Object.values(evidenceByPrimitive).reduce((total, entries) => total + entries.length, 0);

  return {
    id: String(corpus.id),
    displayName: optionalString(corpus.displayName),
    sourcePath: defaultReferenceCorpusRelativePath,
    methodology: isPlainObject(corpus.methodology) ? corpus.methodology : {},
    sampleSuites,
    referenceCount,
    evidenceByPrimitive
  };
}

export {
  loadReferenceCorpus,
  referenceCorpusPath,
  resolvePrimitiveCorpusEvidence
};
