import assert from "node:assert/strict";
import test from "node:test";

import { expectedOrderedLabels, loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";

test("default app schema stays aligned with the current limiter manifest and Faust export", () => {
  const { runtime, schema, faustControls } = loadGeneratedProject();
  const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);

  assert.equal(schema.project.key, "limiter-lab");
  assert.equal(schema.project.name, runtime.project.productName);
  assert.equal(schema.project.kind, runtime.project.plugin.kind);
  assert.deepEqual(schema.controls.map((control) => control.label), expectedLabels);
  assert.deepEqual(
    schema.meters.map(({ id, label, mode }) => ({ id, label, mode })),
    runtime.project.ui.meters.map(({ id, label, mode }) => ({ id, label, mode }))
  );
  assert.deepEqual(
    new Set(schema.controls.map((control) => control.address)),
    new Set(faustControls.map((control) => control.address))
  );
  assert.equal(schema.benchmarkPath, "/generated/apps/limiter-lab/benchmark-results.json");
});

test("default limiter schema exports the new drive routing controls as stable UI contracts", () => {
  const { schema } = loadGeneratedProject();
  const controlByLabel = new Map(schema.controls.map((control) => [control.label, control]));

  assert.deepEqual(
    ["Drive Target", "Drive Focus", "Drive Low Split", "Drive High Split"].map((label) => controlByLabel.get(label)?.label),
    ["Drive Target", "Drive Focus", "Drive Low Split", "Drive High Split"]
  );
  assert.deepEqual(
    {
      min: controlByLabel.get("Drive Target")?.min,
      max: controlByLabel.get("Drive Target")?.max,
      step: controlByLabel.get("Drive Target")?.step,
      unit: controlByLabel.get("Drive Target")?.unit
    },
    {
      min: 0,
      max: 2,
      step: 1,
      unit: null
    }
  );
  assert.deepEqual(
    {
      min: controlByLabel.get("Drive Focus")?.min,
      max: controlByLabel.get("Drive Focus")?.max,
      step: controlByLabel.get("Drive Focus")?.step,
      unit: controlByLabel.get("Drive Focus")?.unit
    },
    {
      min: 0,
      max: 3,
      step: 1,
      unit: null
    }
  );
  assert.deepEqual(
    {
      unit: controlByLabel.get("Drive Low Split")?.unit,
      scale: controlByLabel.get("Drive Low Split")?.scale
    },
    {
      unit: "Hz",
      scale: "log"
    }
  );
  assert.deepEqual(
    {
      unit: controlByLabel.get("Drive High Split")?.unit,
      scale: controlByLabel.get("Drive High Split")?.scale
    },
    {
      unit: "Hz",
      scale: "log"
    }
  );
});

test("pulse pad schema keeps the preview route in sync with the shared export path", () => {
  const { runtime, schema, faustControls } = loadGeneratedProject("pulse-pad");
  const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);

  assert.equal(schema.project.key, "pulse-pad");
  assert.equal(schema.project.name, "Pulse Pad");
  assert.equal(schema.project.kind, "instrument");
  assert.deepEqual(schema.controls.map((control) => control.label), expectedLabels);
  assert.deepEqual(
    schema.meters.map((meter) => meter.id),
    ["voiceBody", "motionBloom", "outputPeak"]
  );
  assert.equal(schema.benchmarkPath, "/generated/apps/pulse-pad/benchmark-results.json");
});

test("pulse pad schema exports the richer synth controls and peak-based meters", () => {
  const { schema } = loadGeneratedProject("pulse-pad");
  const controlByLabel = new Map(schema.controls.map((control) => [control.label, control]));

  assert.deepEqual(
    ["Texture", "Tone", "Contour", "Motion", "Detune", "Sub", "Drive", "Stereo Width", "Attack", "Release"]
      .map((label) => controlByLabel.get(label)?.label),
    ["Texture", "Tone", "Contour", "Motion", "Detune", "Sub", "Drive", "Stereo Width", "Attack", "Release"]
  );
  assert.deepEqual(
    {
      detuneUnit: controlByLabel.get("Detune")?.unit,
      subUnit: controlByLabel.get("Sub")?.unit,
      driveUnit: controlByLabel.get("Drive")?.unit,
      attackScale: controlByLabel.get("Attack")?.scale
    },
    {
      detuneUnit: "ct",
      subUnit: "%",
      driveUnit: "dB",
      attackScale: "log"
    }
  );
  assert.deepEqual(
    schema.meters.map(({ id, label, mode }) => ({ id, label, mode })),
    [
      { id: "voiceBody", label: "Voice Body", mode: "peak" },
      { id: "motionBloom", label: "Motion Bloom", mode: "peak" },
      { id: "outputPeak", label: "Output Peak", mode: "peak" }
    ]
  );
});

test("workspace manifest exposes the app suite through stable monorepo conventions", () => {
  const workspace = loadGeneratedWorkspace();

  assert.equal(workspace.defaultApp, "limiter-lab");
  assert.deepEqual(
    workspace.apps.map((app) => ({ key: app.key, previewPath: app.previewPath, schemaPath: app.schemaPath })),
    [
      {
        key: "limiter-lab",
        previewPath: "/",
        schemaPath: "/generated/apps/limiter-lab/ui_schema.json"
      },
      {
        key: "pulse-pad",
        previewPath: "/?app=pulse-pad",
        schemaPath: "/generated/apps/pulse-pad/ui_schema.json"
      }
    ]
  );
});
