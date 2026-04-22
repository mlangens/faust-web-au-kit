import assert from "node:assert/strict";

/** @type {Array<{
  appKey: string,
  name: string,
  kind: string,
  controlLabelsAny: string[],
  surfacePresetIds: string[],
  assertions: (schema: any) => void
}>} */
const appSchemaCases = [
  {
    appKey: "press-deck",
    name: "Press Deck",
    kind: "effect",
    controlLabelsAny: ["Threshold", "Ratio", "Attack", "Release", "Knee", "Mix"],
    surfacePresetIds: ["history-trace", "sidechain-editor", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["sidechain-editor"]?.bands?.length, 3);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Mix", "Output", "Auto Trim", "Audition", "Bypass"]
      );
    }
  },
  {
    appKey: "atlas-curve",
    name: "Atlas Curve",
    kind: "effect",
    controlLabelsAny: ["Low Cut", "Low Shelf", "Bell Freq", "Bell Gain", "Bell Q", "High Shelf", "Analyzer"],
    surfacePresetIds: ["eq-canvas", "instance-strip", "output-popover"],
    assertions(schema) {
      assert.deepEqual(schema.ui.analyzerPresetIds, ["spectrum"]);
      assert.equal(schema.ui.layoutProfile, "hero-canvas");
      assert.equal(schema.ui.analyzerPresets?.spectrum?.curve, "frequency");
      assert.equal(schema.ui.preview?.surfaces?.["eq-canvas"]?.bands?.length, 5);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Guide", "Dynamic", "Output Trim", "Bypass"]
      );
    }
  },
  {
    appKey: "room-bloom",
    name: "Room Bloom",
    kind: "effect",
    controlLabelsAny: ["Space", "Size", "Pre-Delay", "Decay", "Diffusion", "Mix"],
    surfacePresetIds: ["reverb-space", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["reverb-space"]?.nodes?.length, 5);
      assert.equal(schema.ui.preview?.surfaces?.["reverb-space"]?.links?.length, 4);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Ducking", "Duck Release", "Mix", "Output", "Freeze"]
      );
    }
  },
  {
    appKey: "ember-drive",
    name: "Ember Drive",
    kind: "effect",
    controlLabelsAny: ["Low Drive", "Mid Drive", "High Drive", "Glue", "Output Trim"],
    surfacePresetIds: ["multiband-editor", "band-inspector", "modulation-dock", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["multiband-editor"]?.regions?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["band-inspector"]?.bands?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
    }
  },
  {
    appKey: "relay-tape",
    name: "Relay Tape",
    kind: "effect",
    controlLabelsAny: ["Time", "Feedback", "Smear", "Mod Depth", "Mod Rate", "Freeze"],
    surfacePresetIds: ["delay-timeline", "filter-canvas", "modulation-dock", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["delay-timeline"]?.taps?.length, 5);
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
    }
  },
  {
    appKey: "contour-forge",
    name: "Contour Forge",
    kind: "effect",
    controlLabelsAny: ["Mode", "Cutoff", "Resonance", "Drive", "Env Amount", "LFO Depth", "Routing"],
    surfacePresetIds: ["filter-canvas", "routing-matrix", "modulation-dock", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["routing-matrix"]?.routes?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 3);
    }
  },
  {
    appKey: "mirror-field",
    name: "Mirror Field",
    kind: "instrument",
    controlLabelsAny: ["Blend", "Shape", "Tone", "Contour", "Motion", "Mod Amount", "Detune"],
    surfacePresetIds: ["oscillator-stack", "filter-canvas", "module-rack", "modulation-dock", "keyboard-strip"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["oscillator-stack"]?.modules?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["module-rack"]?.modules?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["keyboard-strip"]?.keys?.length, 8);
    }
  },
  {
    appKey: "seed-tone",
    name: "Seed Tone",
    kind: "instrument",
    controlLabelsAny: ["Wave", "Cutoff", "Resonance", "Color", "Sub", "Noise", "Motion"],
    surfacePresetIds: ["section-grid", "meter-stack"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.sections?.length, 4);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["section-grid"]?.sections?.map((section) => section.id),
        ["oscillator", "tone", "motion", "output"]
      );
    }
  },
  {
    appKey: "span-pair",
    name: "Span Pair",
    kind: "effect",
    controlLabelsAny: ["Mode", "Routing", "Filter A Cutoff", "Filter B Cutoff", "Spacing", "Link", "Drive"],
    surfacePresetIds: ["filter-canvas", "routing-matrix", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 2);
      assert.equal(schema.ui.preview?.surfaces?.["routing-matrix"]?.routes?.length, 3);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.label),
        ["Drive", "Mix", "Output", "Span Gap", "Bypass"]
      );
    }
  },
  {
    appKey: "pocket-cut",
    name: "Pocket Cut",
    kind: "effect",
    controlLabelsAny: ["Mode", "Cutoff", "Resonance", "Envelope Follow", "Drive", "Mix"],
    surfacePresetIds: ["filter-canvas", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.selection, "cutoff-core");
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.label),
        ["Envelope", "Envelope Follow", "Drive", "Mix", "Output", "Bypass"]
      );
    }
  },
  {
    appKey: "headroom",
    name: "Headroom",
    kind: "effect",
    controlLabelsAny: ["Ceiling", "Transient", "Lookahead", "Release", "Audition"],
    surfacePresetIds: ["history-trace", "transfer-curve", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
        ["Input Gain", "Drive", "Ceiling"]
      );
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Output Trim", "Loudness Match", "Audition", "Bypass"]
      );
    }
  },
  {
    appKey: "latch-line",
    name: "Latch Line",
    kind: "effect",
    controlLabelsAny: ["Threshold", "Range", "Hold", "Hysteresis", "Detector HP", "Detector LP"],
    surfacePresetIds: ["transfer-curve", "sidechain-editor", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
        ["Threshold", "Range", "Floor"]
      );
      assert.equal(schema.ui.preview?.surfaces?.["sidechain-editor"]?.bands?.length, 3);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Mix", "Output", "Monitor", "Bypass"]
      );
    }
  },
  {
    appKey: "silk-guard",
    name: "Silk Guard",
    kind: "effect",
    controlLabelsAny: ["Threshold", "Range", "Band Frequency", "Lookahead", "Split/Wide"],
    surfacePresetIds: ["history-trace", "detector-filter", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
      assert.equal(schema.ui.preview?.surfaces?.["detector-filter"]?.bands?.length, 2);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Split Depth", "Monitor", "Mix", "Output", "Bypass"]
      );
    }
  },
  {
    appKey: "split-stack",
    name: "Split Stack",
    kind: "effect",
    controlLabelsAny: ["Low Crossover", "High Crossover", "Low Threshold", "Mid Threshold", "High Threshold", "Mix"],
    surfacePresetIds: ["multiband-editor", "band-inspector", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["multiband-editor"]?.regions?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["band-inspector"]?.bands?.length, 3);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["output-popover"]?.items?.map((item) => item.control),
        ["Monitor", "Mix", "Output", "Bypass"]
      );
    }
  }
];

export { appSchemaCases };
