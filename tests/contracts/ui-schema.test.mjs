import assert from "node:assert/strict";
import test from "node:test";

import { appSchemaCases } from "./app-schema-cases.mjs";
import { loadSuiteRuntime } from "../../tools/lib/project-tools.mjs";
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

test("default limiter schema reserves the shared mastering-limiter surface contract", () => {
  const { schema } = loadGeneratedProject();

  assert.deepEqual(schema.ui.surfacePresetIds, ["history-trace", "transfer-curve", "meter-stack", "output-popover"]);
  assert.ok(schema.ui.shell?.hero?.status);
  assert.ok(schema.ui.shell?.sections?.controls?.title);
  assert.ok(schema.ui.shell?.sections?.meters?.title);
  assert.deepEqual(schema.ui.display?.enumLabels?.["Drive Target"], ["Both", "Mid", "Side"]);
  assert.deepEqual(schema.ui.display?.enumLabels?.["Drive Focus"], ["Full", "Low", "Mid", "High"]);
  assert.equal(schema.ui.display?.controls?.["Vintage Response"]?.onLabel, "Vintage");
  assert.equal(schema.ui.display?.controls?.["Vintage Response"]?.offLabel, "Modern");
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["history-trace"]?.focusBadges?.map((item) => item.control),
    ["Drive Target", "Drive Focus", "Vintage Response"]
  );
  assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
    ["Input Gain", "Tube Drive", "Ceiling"]
  );
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["transfer-curve"]?.timingItems?.map((item) => item.control),
    ["Attack", "Hold", "Release"]
  );
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Output Trim", "Drive Low Split", "Drive High Split", "Vintage Response", "Bypass"]
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

test("pulse pad schema reserves the shared modular-synth parity contract", () => {
  const { schema } = loadGeneratedProject("pulse-pad");

  assert.equal(schema.ui.catalog?.productId, "pulse-pad");
  assert.ok(schema.ui.shell?.hero?.status);
  assert.equal(schema.ui.shell?.sections?.controls?.title, "Morph Surface");
  assert.equal(schema.ui.shell?.sections?.meters?.title, "Voice Preview");
  assert.equal(schema.ui.display?.controls?.gate?.onLabel, "Held");
  assert.equal(schema.ui.display?.controls?.gate?.offLabel, "Idle");
  assert.deepEqual(
    schema.ui.surfacePresetIds,
    ["oscillator-stack", "filter-canvas", "module-rack", "modulation-dock", "keyboard-strip"]
  );
  assert.equal(schema.ui.layoutProfile, "modules-plus-dock");
  assert.equal(schema.ui.preview?.surfaces?.["oscillator-stack"]?.modules?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["module-rack"]?.modules?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["keyboard-strip"]?.keys?.length, 8);
});

for (const appCase of appSchemaCases) {
  test(`${appCase.appKey} schema reserves the shared export contract`, () => {
    const { schema } = loadGeneratedProject(appCase.appKey);
    const controlLabels = new Set(schema.controls.map((control) => control.label));

    assert.equal(schema.project.key, appCase.appKey);
    assert.equal(schema.project.name, appCase.name);
    assert.equal(schema.project.kind, appCase.kind);
    assert.equal(schema.benchmarkPath, `/generated/apps/${appCase.appKey}/benchmark-results.json`);
    assert.ok(schema.controls.length > 0);
    assert.ok(schema.meters.length > 0);
    assert.ok(
      appCase.controlLabelsAny.some((label) => controlLabels.has(label)),
      `${appCase.name} should expose at least one framework-aligned control from the expected surface family`
    );
    assert.deepEqual(schema.ui.surfacePresetIds, appCase.surfacePresetIds);
    appCase.assertions(schema);
  });
}

test("workspace manifest exposes the app suite through stable monorepo conventions", () => {
  const workspace = loadGeneratedWorkspace();

  assert.equal(workspace.defaultApp, "limiter-lab");
  assert.deepEqual(
    [...workspace.apps]
      .map((app) => ({ key: app.key, previewPath: app.previewPath, schemaPath: app.schemaPath }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    [
      {
        key: "atlas-curve",
        previewPath: "/?app=atlas-curve",
        schemaPath: "/generated/apps/atlas-curve/ui_schema.json"
      },
      {
        key: "contour-forge",
        previewPath: "/?app=contour-forge",
        schemaPath: "/generated/apps/contour-forge/ui_schema.json"
      },
      {
        key: "ember-drive",
        previewPath: "/?app=ember-drive",
        schemaPath: "/generated/apps/ember-drive/ui_schema.json"
      },
      {
        key: "headroom",
        previewPath: "/?app=headroom",
        schemaPath: "/generated/apps/headroom/ui_schema.json"
      },
      {
        key: "latch-line",
        previewPath: "/?app=latch-line",
        schemaPath: "/generated/apps/latch-line/ui_schema.json"
      },
      {
        key: "limiter-lab",
        previewPath: "/",
        schemaPath: "/generated/apps/limiter-lab/ui_schema.json"
      },
      {
        key: "mirror-field",
        previewPath: "/?app=mirror-field",
        schemaPath: "/generated/apps/mirror-field/ui_schema.json"
      },
      {
        key: "pocket-cut",
        previewPath: "/?app=pocket-cut",
        schemaPath: "/generated/apps/pocket-cut/ui_schema.json"
      },
      {
        key: "press-deck",
        previewPath: "/?app=press-deck",
        schemaPath: "/generated/apps/press-deck/ui_schema.json"
      },
      {
        key: "pulse-pad",
        previewPath: "/?app=pulse-pad",
        schemaPath: "/generated/apps/pulse-pad/ui_schema.json"
      },
      {
        key: "relay-tape",
        previewPath: "/?app=relay-tape",
        schemaPath: "/generated/apps/relay-tape/ui_schema.json"
      },
      {
        key: "room-bloom",
        previewPath: "/?app=room-bloom",
        schemaPath: "/generated/apps/room-bloom/ui_schema.json"
      },
      {
        key: "seed-tone",
        previewPath: "/?app=seed-tone",
        schemaPath: "/generated/apps/seed-tone/ui_schema.json"
      },
      {
        key: "silk-guard",
        previewPath: "/?app=silk-guard",
        schemaPath: "/generated/apps/silk-guard/ui_schema.json"
      },
      {
        key: "span-pair",
        previewPath: "/?app=span-pair",
        schemaPath: "/generated/apps/span-pair/ui_schema.json"
      },
      {
        key: "split-stack",
        previewPath: "/?app=split-stack",
        schemaPath: "/generated/apps/split-stack/ui_schema.json"
      }
    ]
  );
});

test("northline suite runtime resolves the clone suite in catalog order", () => {
  const suite = loadSuiteRuntime(["--suite", "northline-suite"]);

  assert.equal(suite.suiteId, "northline-suite");
  assert.equal(suite.suiteName, "Northline Audio");
  assert.deepEqual(
    suite.apps.map((app) => app.appKey),
    [
      "atlas-curve",
      "press-deck",
      "headroom",
      "room-bloom",
      "silk-guard",
      "latch-line",
      "split-stack",
      "ember-drive",
      "relay-tape",
      "contour-forge",
      "mirror-field",
      "seed-tone",
      "span-pair",
      "pocket-cut"
    ]
  );
  assert.equal(suite.apps.some((app) => app.appKey === "limiter-lab"), false);
  assert.equal(suite.apps.some((app) => app.appKey === "pulse-pad"), false);
});

test("northline suite schemas keep shell copy and preview surface descriptions consistent", () => {
  const suite = loadSuiteRuntime(["--suite", "northline-suite"]);

  for (const app of suite.apps) {
    const { schema } = loadGeneratedProject(app.appKey);
    assert.ok(schema.ui.shell?.hero?.status, `${app.appKey} is missing hero status copy.`);
    assert.ok(schema.ui.shell?.sections?.controls?.title, `${app.appKey} is missing controls section title.`);
    assert.ok(schema.ui.shell?.sections?.controls?.description, `${app.appKey} is missing controls section description.`);
    assert.ok(schema.ui.shell?.sections?.meters?.title, `${app.appKey} is missing meters section title.`);
    assert.ok(schema.ui.shell?.sections?.meters?.description, `${app.appKey} is missing meters section description.`);

    const surfaces = Object.entries(schema.ui.preview?.surfaces ?? {});
    assert.ok(surfaces.length > 0, `${app.appKey} should expose at least one preview surface.`);
    for (const [surfaceId, surface] of surfaces) {
      assert.ok(surface?.title, `${app.appKey} surface "${surfaceId}" is missing a title.`);
      assert.ok(surface?.description, `${app.appKey} surface "${surfaceId}" is missing a description.`);
    }
  }
});
