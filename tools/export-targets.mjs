import path from "node:path";

import { loadProjectRuntime } from "./lib/project-tools.mjs";
import { exportFaustTarget, exportJsonMetadata, exportTargetsForProfile, resolveExportProfile } from "./lib/export-faust-tools.mjs";
import { buildProjectConfigArtifacts, buildUiManifestArtifacts, writeWorkspaceManifest } from "./lib/export-manifest-tools.mjs";
import { createExportStager } from "./lib/export-staging-tools.mjs";

const runtime = loadProjectRuntime();
const exportProfile = resolveExportProfile(runtime.args);
const stager = createExportStager(runtime.outputDir);

try {
  const projectConfig = buildProjectConfigArtifacts(runtime);
  stager.stageTextArtifact("project_config.h", projectConfig.header);
  stager.stageTextArtifact("project_config.cmake", projectConfig.cmake);

  for (const target of exportTargetsForProfile(exportProfile)) {
    exportFaustTarget(runtime, stager, target);
  }

  const canReuseCachedMetadata = exportProfile === "preview" || exportProfile === "sonic";
  const uiJsonPath = exportJsonMetadata(runtime, stager, {
    allowCachedFallback: canReuseCachedMetadata,
    preferCached: canReuseCachedMetadata
  });
  const uiArtifacts = buildUiManifestArtifacts(runtime, uiJsonPath);
  stager.stageTextArtifact("ui_manifest.h", uiArtifacts.header);
  stager.stageTextArtifact("ui_schema.json", `${JSON.stringify(uiArtifacts.schema, null, 2)}\n`);

  stager.publish();
  writeWorkspaceManifest(runtime);

  console.log(`Exported Faust targets into ${path.relative(runtime.root, runtime.targetDir)}`);
} finally {
  stager.cleanup();
}
