import assert from "node:assert/strict";
import test from "node:test";

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

test("press deck schema reserves the compressor-oriented export contract", () => {
  const { schema } = loadGeneratedProject("press-deck");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "press-deck");
  assert.equal(schema.project.name, "Press Deck");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/press-deck/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Threshold", "Ratio", "Attack", "Release", "Knee", "Mix"].some((label) => controlLabels.has(label)),
    "Press Deck should expose at least one compressor-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["history-trace", "sidechain-editor", "meter-stack", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["sidechain-editor"]?.bands?.length, 3);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Mix", "Output", "Auto Trim", "Audition", "Bypass"]
  );
});

test("atlas curve schema reserves the spectral-eq export contract", () => {
  const { schema } = loadGeneratedProject("atlas-curve");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "atlas-curve");
  assert.equal(schema.project.name, "Atlas Curve");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/atlas-curve/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Low Cut", "Low Shelf", "Bell Freq", "Bell Gain", "Bell Q", "High Shelf", "Analyzer"].some((label) => controlLabels.has(label)),
    "Atlas Curve should expose at least one EQ-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["eq-canvas", "instance-strip", "output-popover"]);
  assert.deepEqual(schema.ui.analyzerPresetIds, ["spectrum"]);
  assert.equal(schema.ui.layoutProfile, "hero-canvas");
  assert.equal(schema.ui.analyzerPresets?.spectrum?.curve, "frequency");
  assert.equal(schema.ui.preview?.surfaces?.["eq-canvas"]?.bands?.length, 5);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Guide", "Dynamic", "Output Trim", "Bypass"]
  );
});

test("room bloom schema reserves the reverb export contract", () => {
  const { schema } = loadGeneratedProject("room-bloom");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "room-bloom");
  assert.equal(schema.project.name, "Room Bloom");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/room-bloom/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Space", "Size", "Pre-Delay", "Decay", "Diffusion", "Mix"].some((label) => controlLabels.has(label)),
    "Room Bloom should expose at least one reverb-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["reverb-space", "meter-stack", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["reverb-space"]?.nodes?.length, 5);
  assert.equal(schema.ui.preview?.surfaces?.["reverb-space"]?.links?.length, 4);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Ducking", "Duck Release", "Mix", "Output", "Freeze"]
  );
});

test("ember drive schema reserves the multiband-saturation export contract", () => {
  const { schema } = loadGeneratedProject("ember-drive");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "ember-drive");
  assert.equal(schema.project.name, "Ember Drive");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/ember-drive/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Low Drive", "Mid Drive", "High Drive", "Glue", "Output Trim"].some((label) => controlLabels.has(label)),
    "Ember Drive should expose at least one multiband-saturation-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["multiband-editor", "band-inspector", "modulation-dock", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["multiband-editor"]?.regions?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["band-inspector"]?.bands?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
});

test("relay tape schema reserves the mod-delay export contract", () => {
  const { schema } = loadGeneratedProject("relay-tape");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "relay-tape");
  assert.equal(schema.project.name, "Relay Tape");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/relay-tape/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Time", "Feedback", "Smear", "Mod Depth", "Mod Rate", "Freeze"].some((label) => controlLabels.has(label)),
    "Relay Tape should expose at least one mod-delay-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["delay-timeline", "filter-canvas", "modulation-dock", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["delay-timeline"]?.taps?.length, 5);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
});

test("contour forge schema reserves the routable-filter export contract", () => {
  const { schema } = loadGeneratedProject("contour-forge");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "contour-forge");
  assert.equal(schema.project.name, "Contour Forge");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/contour-forge/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Mode", "Cutoff", "Resonance", "Drive", "Env Amount", "LFO Depth", "Routing"].some((label) => controlLabels.has(label)),
    "Contour Forge should expose at least one routable-filter-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["filter-canvas", "routing-matrix", "modulation-dock", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["routing-matrix"]?.routes?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 3);
});

test("mirror field schema reserves the modular-synth export contract", () => {
  const { schema } = loadGeneratedProject("mirror-field");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "mirror-field");
  assert.equal(schema.project.name, "Mirror Field");
  assert.equal(schema.project.kind, "instrument");
  assert.equal(schema.benchmarkPath, "/generated/apps/mirror-field/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Blend", "Shape", "Tone", "Contour", "Motion", "Mod Amount", "Detune"].some((label) => controlLabels.has(label)),
    "Mirror Field should expose at least one modular-synth-style control"
  );
  assert.deepEqual(
    schema.ui.surfacePresetIds,
    ["oscillator-stack", "filter-canvas", "module-rack", "modulation-dock", "keyboard-strip"]
  );
  assert.equal(schema.ui.preview?.surfaces?.["oscillator-stack"]?.modules?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["module-rack"]?.modules?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["keyboard-strip"]?.keys?.length, 8);
});

test("seed tone schema reserves the simple-synth export contract", () => {
  const { schema } = loadGeneratedProject("seed-tone");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "seed-tone");
  assert.equal(schema.project.name, "Seed Tone");
  assert.equal(schema.project.kind, "instrument");
  assert.equal(schema.benchmarkPath, "/generated/apps/seed-tone/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Wave", "Cutoff", "Resonance", "Color", "Sub", "Noise", "Motion"].some((label) => controlLabels.has(label)),
    "Seed Tone should expose at least one simple-synth-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["section-grid", "meter-stack"]);
  assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.sections?.length, 4);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["section-grid"]?.sections?.map((section) => section.id),
    ["oscillator", "tone", "motion", "output"]
  );
});

test("span pair schema reserves the dual-filter export contract", () => {
  const { schema } = loadGeneratedProject("span-pair");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "span-pair");
  assert.equal(schema.project.name, "Span Pair");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/span-pair/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Mode", "Routing", "Filter A Cutoff", "Filter B Cutoff", "Spacing", "Link", "Drive"].some((label) => controlLabels.has(label)),
    "Span Pair should expose at least one dual-filter-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["filter-canvas", "routing-matrix", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 2);
  assert.equal(schema.ui.preview?.surfaces?.["routing-matrix"]?.routes?.length, 3);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.label),
    ["Drive", "Mix", "Output", "Span Gap", "Bypass"]
  );
});

test("pocket cut schema reserves the mini-filter export contract", () => {
  const { schema } = loadGeneratedProject("pocket-cut");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "pocket-cut");
  assert.equal(schema.project.name, "Pocket Cut");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/pocket-cut/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Mode", "Cutoff", "Resonance", "Envelope Follow", "Drive", "Mix"].some((label) => controlLabels.has(label)),
    "Pocket Cut should expose at least one mini-filter-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["filter-canvas", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.selection, "cutoff-core");
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.label),
    ["Envelope", "Envelope Follow", "Drive", "Mix", "Output", "Bypass"]
  );
});

test("headroom schema reserves the mastering-limiter export contract", () => {
  const { schema } = loadGeneratedProject("headroom");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "headroom");
  assert.equal(schema.project.name, "Headroom");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/headroom/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Ceiling", "Transient", "Lookahead", "Release", "Audition"].some((label) => controlLabels.has(label)),
    "Headroom should expose at least one mastering-limiter-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["history-trace", "transfer-curve", "meter-stack", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
    ["Input Gain", "Drive", "Ceiling"]
  );
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Output Trim", "Loudness Match", "Audition", "Bypass"]
  );
});

test("latch line schema reserves the gate-expander export contract", () => {
  const { schema } = loadGeneratedProject("latch-line");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "latch-line");
  assert.equal(schema.project.name, "Latch Line");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/latch-line/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Threshold", "Range", "Hold", "Hysteresis", "Detector HP", "Detector LP"].some((label) => controlLabels.has(label)),
    "Latch Line should expose at least one gate-or-expander-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["transfer-curve", "sidechain-editor", "meter-stack", "output-popover"]);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
    ["Threshold", "Range", "Floor"]
  );
  assert.equal(schema.ui.preview?.surfaces?.["sidechain-editor"]?.bands?.length, 3);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Mix", "Output", "Monitor", "Bypass"]
  );
});

test("silk guard schema reserves the de-esser export contract", () => {
  const { schema } = loadGeneratedProject("silk-guard");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "silk-guard");
  assert.equal(schema.project.name, "Silk Guard");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/silk-guard/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Threshold", "Range", "Band Frequency", "Lookahead", "Split/Wide"].some((label) => controlLabels.has(label)),
    "Silk Guard should expose at least one de-esser-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["history-trace", "detector-filter", "meter-stack", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
  assert.equal(schema.ui.preview?.surfaces?.["detector-filter"]?.bands?.length, 2);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Split Depth", "Monitor", "Mix", "Output", "Bypass"]
  );
});

test("split stack schema reserves the multiband-dynamics export contract", () => {
  const { schema } = loadGeneratedProject("split-stack");
  const controlLabels = new Set(schema.controls.map((control) => control.label));

  assert.equal(schema.project.key, "split-stack");
  assert.equal(schema.project.name, "Split Stack");
  assert.equal(schema.project.kind, "effect");
  assert.equal(schema.benchmarkPath, "/generated/apps/split-stack/benchmark-results.json");
  assert.ok(schema.controls.length > 0);
  assert.ok(schema.meters.length > 0);
  assert.ok(
    ["Low Crossover", "High Crossover", "Low Threshold", "Mid Threshold", "High Threshold", "Mix"].some((label) => controlLabels.has(label)),
    "Split Stack should expose at least one multiband-dynamics-style control"
  );
  assert.deepEqual(schema.ui.surfacePresetIds, ["multiband-editor", "band-inspector", "meter-stack", "output-popover"]);
  assert.equal(schema.ui.preview?.surfaces?.["multiband-editor"]?.regions?.length, 3);
  assert.equal(schema.ui.preview?.surfaces?.["band-inspector"]?.bands?.length, 3);
  assert.deepEqual(
    schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
    ["Monitor", "Mix", "Output", "Bypass"]
  );
});

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
