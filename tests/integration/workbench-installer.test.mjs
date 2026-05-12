import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("workbench installer builder materializes FET-76 from primitive recipe", () => {
  const output = execFileSync(process.execPath, [
    path.join(root, "tools", "build-workbench-installer.mjs"),
    "--recipe",
    "fet-76-rebuild",
    "--dry-run"
  ], {
    cwd: root,
    encoding: "utf8"
  });
  const summary = JSON.parse(output);

  assert.equal(summary.recipe, "fet-76-rebuild");
  assert.equal(summary.appKey, "fet-76-workbench");
  assert.equal(summary.expectedInstaller, "dist/workbench-assemblies/fet-76-rebuild/fet-76-workbench/FET76Workbench-0.1.0.pkg");
  assert.ok(fs.existsSync(path.join(root, summary.workspace)));
  assert.ok(fs.existsSync(path.join(root, summary.project)));
  assert.ok(fs.existsSync(path.join(root, summary.dsp)));
  assert.ok(fs.existsSync(path.join(root, summary.plan)));

  const workspace = readJson(summary.workspace);
  const project = readJson(summary.project);
  const plan = readJson(summary.plan);
  const dsp = fs.readFileSync(path.join(root, summary.dsp), "utf8");

  assert.equal(workspace.defaultApp, "fet-76-workbench");
  assert.equal(project.productName, "FET-76 Workbench Rebuild");
  assert.equal(project.artifactStem, "FET76Workbench");
  assert.equal(project.au.subtype, "F7WB");
  assert.deepEqual(project.ui.primitiveIds, [
    "analog.preamp-console-stage",
    "compression.fet-76-gain-cell",
    "compression.vintage-compressor-model",
    "saturation.virtual-analog-stage"
  ]);
  assert.equal(plan.slots.length, 4);
  assert.equal(plan.slots[1].primitiveId, "compression.fet-76-gain-cell");
  assert.match(dsp, /declare name "FET-76 Workbench Rebuild";/u);
  assert.match(dsp, /Slot 2 Amount \[unit:%\]", 86\.0/u);

  execFileSync(process.execPath, [
    path.join(root, "tools", "export-targets.mjs"),
    "--workspace",
    summary.workspace,
    "--app",
    summary.appKey,
    "--export-profile",
    "preview"
  ], {
    cwd: root,
    encoding: "utf8"
  });
  const generatedSchema = readJson("generated/workbench-assemblies/fet-76-rebuild/generated/apps/fet-76-workbench/ui_schema.json");
  assert.equal(generatedSchema.project.name, "FET-76 Workbench Rebuild");
  assert.equal(generatedSchema.ui.preview.surfaces["section-grid"].defaultRecipe, "fet-76-rebuild");
});
