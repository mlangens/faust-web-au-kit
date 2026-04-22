// @ts-check

import path from "node:path";

import { readJsonFileSync } from "../../tools/lib/fs-tools.mjs";
import { gatherControls, loadProjectRuntime, loadWorkspaceRuntime } from "../../tools/lib/project-tools.mjs";

/**
 * @typedef {import("../../types/framework").FaustControlItem} FaustControlItem
 * @typedef {import("../../types/framework").FaustUiExport} FaustUiExport
 * @typedef {import("../../types/framework").GeneratedProjectFixture} GeneratedProjectFixture
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").GeneratedWorkspaceManifest} GeneratedWorkspaceManifest
 * @typedef {import("../../types/framework").ProjectManifest} ProjectManifest
 */

/**
 * @param {string | null} [appKey]
 * @returns {GeneratedProjectFixture}
 */
function loadGeneratedProject(appKey = null) {
  const runtime = loadProjectRuntime(appKey ? ["--app", appKey] : []);
  const schemaPath = path.join(runtime.outputDir, "ui_schema.json");
  const faustUiPath = path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
  /** @type {GeneratedUiSchema} */
  const schema = readJsonFileSync(schemaPath);
  /** @type {FaustUiExport} */
  const faustUi = readJsonFileSync(faustUiPath);
  const faustControls = gatherControls(faustUi.ui);

  return {
    runtime,
    schema,
    faustUi,
    faustControls
  };
}

/**
 * @returns {GeneratedWorkspaceManifest}
 */
function loadGeneratedWorkspace() {
  const workspaceRuntime = loadWorkspaceRuntime();
  return readJsonFileSync(path.join(workspaceRuntime.generatedRootDir, "workspace_manifest.json"));
}

/**
 * @param {ProjectManifest} project
 * @param {FaustControlItem[]} faustControls
 * @returns {string[]}
 */
function expectedOrderedLabels(project, faustControls) {
  const faustLabels = new Set(faustControls.map((control) => control.label));
  return [
    ...(project.ui?.controlOrder ?? []).filter((label) => faustLabels.has(label)),
    ...faustControls.map((control) => control.label).filter((label) => !(project.ui?.controlOrder ?? []).includes(label))
  ];
}

export { expectedOrderedLabels, loadGeneratedProject, loadGeneratedWorkspace };
