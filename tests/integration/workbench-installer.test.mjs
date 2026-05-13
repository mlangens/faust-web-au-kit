import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

test("workbench installer builder materializes FET-76 from a scratch assembly payload", () => {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-scratch-assembly-"));
  const scratchAssemblyPath = path.join(scratchRoot, "scratch-assembly.json");
  fs.writeFileSync(scratchAssemblyPath, `${JSON.stringify({
    schemaVersion: 1,
    mode: "scratch-assembly",
    source: "primitive-workbench",
    recipe: "fet-76-rebuild",
    targetRecipeId: "fet-76-rebuild",
    targetLabel: "FET-76",
    slots: [
      {
        slot: 1,
        primitiveId: "analog.preamp-console-stage",
        label: "Input Preamp",
        role: "Tone",
        slotType: 1,
        amount: 54,
        tone: 64,
        mix: 100
      },
      {
        slot: 2,
        primitiveId: "compression.fet-76-gain-cell",
        label: "FET Gain Cell",
        role: "Dynamics",
        slotType: 2,
        amount: 86,
        tone: 66,
        mix: 100
      },
      {
        slot: 3,
        primitiveId: "compression.vintage-compressor-model",
        label: "Vintage Timing",
        role: "Dynamics",
        slotType: 2,
        amount: 68,
        tone: 56,
        mix: 96
      },
      {
        slot: 4,
        primitiveId: "saturation.virtual-analog-stage",
        label: "Output Color",
        role: "Saturation",
        slotType: 3,
        amount: 42,
        tone: 58,
        mix: 88
      }
    ],
    macros: {
      "Macro Intent": 78,
      "Macro Motion": 58,
      "Macro Guard": 70,
      "Output Trim": -1.2
    },
    validation: {
      matchedSlots: 4,
      requiredSlots: 4,
      targetMatched: true
    },
    provenance: {
      createdBy: "preview-drag-drop",
      sourceSurface: "section-grid"
    }
  }, null, 2)}\n`);

  const output = execFileSync(process.execPath, [
    path.join(root, "tools", "build-workbench-installer.mjs"),
    "--assembly-file",
    scratchAssemblyPath,
    "--dry-run"
  ], {
    cwd: root,
    encoding: "utf8"
  });
  const summary = JSON.parse(output);

  assert.equal(summary.recipe, "fet-76-rebuild");
  assert.equal(summary.sourceMode, "scratch-assembly");
  assert.equal(summary.appKey, "fet-76-workbench");

  const project = readJson(summary.project);
  const plan = readJson(summary.plan);
  const dsp = fs.readFileSync(path.join(root, summary.dsp), "utf8");

  assert.equal(project.ui.catalog.sourceMode, "scratch-assembly");
  assert.equal(plan.sourceMode, "scratch-assembly");
  assert.equal(plan.provenance.source, "primitive-workbench");
  assert.equal(plan.provenance.targetRecipeId, "fet-76-rebuild");
  assert.equal(plan.slots[2].primitiveId, "compression.vintage-compressor-model");
  assert.equal(plan.slots[2].amount, 68);
  assert.match(dsp, /Slot 3 Amount \[unit:%\]", 68\.0/u);
});
