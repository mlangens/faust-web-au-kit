// @ts-check

import { loadProjectRuntime } from "./lib/project-tools.mjs";

/**
 * @typedef {import("../types/framework").RuntimeEnvironmentExports} RuntimeEnvironmentExports
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function shellQuote(value) {
  return `'${String(value ?? "").replaceAll("'", `'\\''`)}'`;
}

const runtime = loadProjectRuntime();
/** @type {RuntimeEnvironmentExports} */
const exportsMap = {
  FWAK_APP_KEY: runtime.appKey,
  FWAK_APP_NAME: runtime.project.productName,
  FWAK_APP_MANIFEST: runtime.projectFile,
  FWAK_ARTIFACT_STEM: runtime.project.artifactStem,
  FWAK_PROJECT_VERSION: runtime.project.version,
  FWAK_PACKAGE_ID: `${runtime.project.bundleId}.installer`,
  FWAK_GENERATED_DIR: runtime.outputDir,
  FWAK_TARGET_DIR: runtime.targetDir,
  FWAK_BUILD_DIR: runtime.buildDir,
  FWAK_DIST_DIR: runtime.distDir,
  FWAK_AU_TYPE: runtime.project.au.type,
  FWAK_AU_SUBTYPE: runtime.project.au.subtype,
  FWAK_AU_MANUFACTURER: runtime.project.au.manufacturer
};

for (const [key, value] of Object.entries(exportsMap)) {
  process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
}
