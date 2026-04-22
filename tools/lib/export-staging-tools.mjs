// @ts-check

import fs from "node:fs";
import path from "node:path";

import { createTempDir, removePathSync, replaceFileAtomically } from "./fs-tools.mjs";

/**
 * @typedef {{
 *   outputDir: string,
 *   stageDir: string,
 *   stageTargetDir: string,
 *   cleanup: () => void,
 *   markArtifact: (relativePath: string) => string,
 *   publish: () => void,
 *   stageTextArtifact: (relativePath: string, contents: string) => string,
 *   stagedPath: (relativePath: string) => string,
 *   stagedTargetPath: (filename: string) => string
 * }} ExportStager
 */

/**
 * @param {string} outputDir
 * @returns {ExportStager}
 */
function createExportStager(outputDir) {
  const stageDir = createTempDir(path.dirname(outputDir), `.${path.basename(outputDir)}.export-`);
  const stagedArtifacts = new Set();

  /**
   * @param {string} relativePath
   * @returns {string}
   */
  function stagedPath(relativePath) {
    return path.join(stageDir, relativePath);
  }

  /**
   * @param {string} relativePath
   * @param {string} contents
   * @returns {string}
   */
  function stageTextArtifact(relativePath, contents) {
    const artifactPath = stagedPath(relativePath);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, contents);
    stagedArtifacts.add(relativePath);
    return artifactPath;
  }

  /**
   * @param {string} relativePath
   * @returns {string}
   */
  function markArtifact(relativePath) {
    stagedArtifacts.add(relativePath);
    return stagedPath(relativePath);
  }

  /**
   * @param {string} filename
   * @returns {string}
   */
  function stagedTargetPath(filename) {
    return stagedPath(path.join("targets", filename));
  }

  /**
   * @returns {void}
   */
  function publish() {
    for (const relativePath of [...stagedArtifacts].sort((left, right) => left.localeCompare(right))) {
      replaceFileAtomically(stagedPath(relativePath), path.join(outputDir, relativePath));
    }
  }

  /**
   * @returns {void}
   */
  function cleanup() {
    removePathSync(stageDir);
  }

  return {
    outputDir,
    stageDir,
    stageTargetDir: stagedPath("targets"),
    cleanup,
    markArtifact,
    publish,
    stageTextArtifact,
    stagedPath,
    stagedTargetPath
  };
}

export { createExportStager };
