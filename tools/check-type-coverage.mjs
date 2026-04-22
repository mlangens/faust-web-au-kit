// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tsconfigPath = path.join(root, "tsconfig.check.json");
const policyPath = path.join(root, "tools", "type-coverage-policy.json");

/**
 * @typedef {{
 *   trackedRoots?: string[],
 *   trackedExtensions?: string[],
 *   exemptions?: Record<string, string>
 * }} TypeCoveragePolicy
 */

/**
 * @returns {TypeCoveragePolicy}
 */
function readPolicy() {
  return /** @type {TypeCoveragePolicy} */ (JSON.parse(fs.readFileSync(policyPath, "utf8")));
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

/**
 * @param {string} startPath
 * @param {string[]} trackedExtensions
 * @param {string[]} [files=[]]
 * @returns {string[]}
 */
function walkTrackedFiles(startPath, trackedExtensions, files = []) {
  const entries = fs.readdirSync(startPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      walkTrackedFiles(entryPath, trackedExtensions, files);
      continue;
    }
    if (trackedExtensions.includes(path.extname(entry.name))) {
      files.push(normalizePath(entryPath));
    }
  }
  return files;
}

/**
 * @returns {Set<string>}
 */
function resolveTypeCheckedFiles() {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], {
      getCanonicalFileName: (value) => value,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    }));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, undefined, tsconfigPath);
  if (parsedConfig.errors.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(parsedConfig.errors, {
      getCanonicalFileName: (value) => value,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    }));
  }

  return new Set(parsedConfig.fileNames.map(normalizePath));
}

/**
 * @returns {{
 *   trackedFiles: string[],
 *   typeCheckedFiles: string[],
 *   exemptFiles: string[],
 *   missingCoverage: string[],
 *   staleExemptions: string[],
 *   redundantExemptions: string[],
 *   emptyReasons: string[]
 * }}
 */
function evaluateTypeCoverage() {
  const policy = readPolicy();
  const trackedExtensions = Array.isArray(policy.trackedExtensions) ? policy.trackedExtensions : [".js", ".mjs"];
  const trackedRoots = Array.isArray(policy.trackedRoots) ? policy.trackedRoots : [];
  const exemptions = policy.exemptions && typeof policy.exemptions === "object" ? policy.exemptions : {};
  const typeCheckedFiles = resolveTypeCheckedFiles();
  const trackedFiles = trackedRoots
    .flatMap((relativeRoot) => walkTrackedFiles(path.join(root, relativeRoot), trackedExtensions))
    .sort((left, right) => left.localeCompare(right));

  const missingCoverage = trackedFiles.filter((relativePath) => !typeCheckedFiles.has(relativePath) && !Object.hasOwn(exemptions, relativePath));
  const staleExemptions = Object.keys(exemptions)
    .filter((relativePath) => !trackedFiles.includes(relativePath))
    .sort((left, right) => left.localeCompare(right));
  const redundantExemptions = Object.keys(exemptions)
    .filter((relativePath) => typeCheckedFiles.has(relativePath))
    .sort((left, right) => left.localeCompare(right));
  const emptyReasons = Object.entries(exemptions)
    .filter(([, reason]) => typeof reason !== "string" || reason.trim().length === 0)
    .map(([relativePath]) => relativePath)
    .sort((left, right) => left.localeCompare(right));

  return {
    trackedFiles,
    typeCheckedFiles: trackedFiles.filter((relativePath) => typeCheckedFiles.has(relativePath)),
    exemptFiles: trackedFiles.filter((relativePath) => Object.hasOwn(exemptions, relativePath)),
    missingCoverage,
    staleExemptions,
    redundantExemptions,
    emptyReasons
  };
}

function main() {
  const result = evaluateTypeCoverage();
  if (
    result.missingCoverage.length
    || result.staleExemptions.length
    || result.redundantExemptions.length
    || result.emptyReasons.length
  ) {
    if (result.missingCoverage.length) {
      console.error("Type coverage is missing for:");
      result.missingCoverage.forEach((relativePath) => console.error(`  - ${relativePath}`));
    }
    if (result.staleExemptions.length) {
      console.error("Type coverage exemptions reference files outside the tracked roots:");
      result.staleExemptions.forEach((relativePath) => console.error(`  - ${relativePath}`));
    }
    if (result.redundantExemptions.length) {
      console.error("Type coverage exemptions should be removed because these files are already checked:");
      result.redundantExemptions.forEach((relativePath) => console.error(`  - ${relativePath}`));
    }
    if (result.emptyReasons.length) {
      console.error("Type coverage exemptions require non-empty reasons:");
      result.emptyReasons.forEach((relativePath) => console.error(`  - ${relativePath}`));
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Type coverage check passed: ${result.typeCheckedFiles.length} checked, ${result.exemptFiles.length} exempt, ${result.trackedFiles.length} tracked.`
  );
}

export { evaluateTypeCoverage };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
