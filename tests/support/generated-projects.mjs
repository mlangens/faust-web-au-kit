import fs from "node:fs";
import path from "node:path";

import { gatherControls, loadProjectRuntime } from "../../tools/lib/project-tools.mjs";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadGeneratedProject(projectFile = null) {
  const runtime = loadProjectRuntime(projectFile ? ["--project", projectFile] : []);
  const schemaPath = path.join(runtime.outputDir, "ui_schema.json");
  const faustUiPath = path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
  const schema = loadJson(schemaPath);
  const faustUi = loadJson(faustUiPath);
  const faustControls = gatherControls(faustUi.ui);

  return {
    runtime,
    schema,
    faustUi,
    faustControls
  };
}

function expectedOrderedLabels(project, faustControls) {
  const faustLabels = new Set(faustControls.map((control) => control.label));
  return [
    ...(project.ui?.controlOrder ?? []).filter((label) => faustLabels.has(label)),
    ...faustControls.map((control) => control.label).filter((label) => !(project.ui?.controlOrder ?? []).includes(label))
  ];
}

export { expectedOrderedLabels, loadGeneratedProject };
