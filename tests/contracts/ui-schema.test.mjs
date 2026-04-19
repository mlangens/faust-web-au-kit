import assert from "node:assert/strict";
import test from "node:test";

import { expectedOrderedLabels, loadGeneratedProject } from "../support/generated-projects.mjs";

test("default project schema stays aligned with the current limiter manifest and Faust export", () => {
  const { runtime, schema, faustControls } = loadGeneratedProject();
  const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);

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
  const { runtime, schema, faustControls } = loadGeneratedProject("projects/pulse_pad.json");
  const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);

  assert.equal(schema.project.name, "Pulse Pad");
  assert.equal(schema.project.kind, "instrument");
  assert.deepEqual(schema.controls.map((control) => control.label), expectedLabels);
  assert.deepEqual(
    schema.meters.map((meter) => meter.id),
    ["voiceDensity", "stereoDrift", "outputPeak"]
  );
});
