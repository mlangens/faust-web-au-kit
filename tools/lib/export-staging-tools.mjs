import fs from "node:fs";
import path from "node:path";

import { createTempDir, removePathSync, replaceFileAtomically } from "./fs-tools.mjs";

function createExportStager(outputDir) {
  const stageDir = createTempDir(path.dirname(outputDir), `.${path.basename(outputDir)}.export-`);
  const stagedArtifacts = new Set();

  function stagedPath(relativePath) {
    return path.join(stageDir, relativePath);
  }

  function stageTextArtifact(relativePath, contents) {
    const artifactPath = stagedPath(relativePath);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, contents);
    stagedArtifacts.add(relativePath);
    return artifactPath;
  }

  function markArtifact(relativePath) {
    stagedArtifacts.add(relativePath);
    return stagedPath(relativePath);
  }

  function stagedTargetPath(filename) {
    return stagedPath(path.join("targets", filename));
  }

  function publish() {
    for (const relativePath of [...stagedArtifacts].sort((left, right) => left.localeCompare(right))) {
      replaceFileAtomically(stagedPath(relativePath), path.join(outputDir, relativePath));
    }
  }

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
