// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {import("../types/framework").CatalogManifest} CatalogManifest
 * @typedef {import("../types/framework").ProjectManifest} ProjectManifest
 * @typedef {import("../types/framework").WorkspaceManifest} WorkspaceManifest
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceFile = path.join(root, "fwak.workspace.json");
const genericBasenames = new Set(["common", "helper", "helpers", "misc", "stuff", "util", "utils"]);
const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const filenamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?:test|spec))?\.(?:js|mjs|json|css|html|md|sh|zsh)$/u;
const declarationPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.d\.ts$/u;
const appDirPattern = /^apps\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const indexFilenamePattern = /^index\.(?:js|mjs)$/u;

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

/**
 * @param {string} filePath
 * @returns {unknown}
 */
function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isKebabCase(value) {
  return kebabCasePattern.test(value);
}

/**
 * @param {string[]} errors
 * @param {string} relativeDir
 * @param {{ recursive?: boolean, allowIndex?: boolean }} [options]
 */
function checkNamedFiles(errors, relativeDir, options = {}) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const normalizedRelative = normalizePath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      if (!isKebabCase(entry.name) && !appDirPattern.test(normalizedRelative)) {
        errors.push(`Directory "${normalizedRelative}" must use lowercase kebab-case.`);
      }
      if (options.recursive) {
        checkNamedFiles(errors, normalizedRelative, options);
      }
      continue;
    }

    const allowIndex = Boolean(options.allowIndex) && relativeDir.includes("/") && indexFilenamePattern.test(entry.name);
    if (!allowIndex && !filenamePattern.test(entry.name) && !declarationPattern.test(entry.name)) {
      errors.push(`File "${normalizedRelative}" must use lowercase kebab-case naming.`);
    }

    const basename = entry.name.replace(/\.[^.]+$/u, "");
    if (!allowIndex && genericBasenames.has(basename)) {
      errors.push(`File "${normalizedRelative}" uses a generic basename that the framework forbids.`);
    }
  }
}

/** @type {WorkspaceManifest} */
const workspace = /** @type {WorkspaceManifest} */ (loadJson(workspaceFile));
/** @type {string[]} */
const errors = [];

if (!Array.isArray(workspace.apps) || workspace.apps.length === 0) {
  errors.push(`Workspace "${normalizePath(workspaceFile)}" must declare at least one app.`);
}

const appKeys = new Set();
for (const entry of workspace.apps ?? []) {
  const key = String(entry.key ?? "");
  const manifest = String(entry.manifest ?? "");
  const expectedManifest = `apps/${key}/project.json`;
  const manifestPath = path.join(root, expectedManifest);
  const dspPath = path.join(root, "apps", key, "dsp", "main.dsp");

  if (!isKebabCase(key)) {
    errors.push(`Workspace app key "${key}" must use lowercase kebab-case.`);
  }
  if (appKeys.has(key)) {
    errors.push(`Workspace app key "${key}" is declared more than once.`);
  }
  appKeys.add(key);

  if (manifest !== expectedManifest) {
    errors.push(`Workspace app "${key}" must point to "${expectedManifest}", found "${manifest}".`);
  }
  if (!fs.existsSync(manifestPath)) {
    errors.push(`Manifest file "${expectedManifest}" is missing.`);
    continue;
  }
  if (!fs.existsSync(dspPath)) {
    errors.push(`App "${key}" must include "apps/${key}/dsp/main.dsp".`);
  }

  /** @type {ProjectManifest} */
  const project = /** @type {ProjectManifest} */ (loadJson(manifestPath));
  if (project.name !== key) {
    errors.push(`App manifest "${expectedManifest}" must set "name" to "${key}", found "${project.name}".`);
  }
  if (project.faust?.source !== "./dsp/main.dsp") {
    errors.push(`App manifest "${expectedManifest}" must use "./dsp/main.dsp" as the Faust source.`);
  }
}

for (const catalogName of fs.readdirSync(path.join(root, "ui", "catalog"))) {
  if (!catalogName.endsWith(".json")) {
    continue;
  }
  const catalogPath = path.join(root, "ui", "catalog", catalogName);
  /** @type {CatalogManifest} */
  const catalog = /** @type {CatalogManifest} */ (loadJson(catalogPath));
  const catalogId = String(catalog.id ?? catalogName.replace(/\.json$/u, ""));
  if (!isKebabCase(catalogId)) {
    errors.push(`Catalog "${normalizePath(catalogPath)}" must use a kebab-case id.`);
  }
  for (const product of catalog.products ?? []) {
    const productId = String(product.id ?? "");
    if (!appKeys.has(productId)) {
      errors.push(`Catalog "${catalogId}" references unknown app "${productId}".`);
    }
  }
}

[
  "apps",
  "preview/lib",
  "scripts",
  "scripts/lib",
  "tests/contracts",
  "tests/integration",
  "tests/playwright",
  "tests/support",
  "tests/unit",
  "tools",
  "tools/lib",
  "types"
].forEach((relativeDir) => checkNamedFiles(
  errors,
  relativeDir,
  ["preview/lib", "tests/contracts", "tests/integration", "tests/playwright", "tests/support", "tests/unit", "tools", "tools/lib"].includes(relativeDir)
    ? { recursive: true, allowIndex: true }
    : {}
));

if (errors.length) {
  console.error("Framework structure check failed:");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Framework structure check passed.");
}
