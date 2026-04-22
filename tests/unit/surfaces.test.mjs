import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSchema } from "../../preview/lib/schema-ui.js";
import { resolveSurfaceModels } from "../../preview/lib/surfaces.js";
import { SURFACE_BUILDERS, resolveSurfaceBuilder } from "../../preview/lib/surfaces/registry.js";

test("normalizeSchema provides a default shared surfaces section", () => {
  const schema = normalizeSchema({
    project: {
      key: "atlas-curve",
      name: "Atlas Curve",
      description: "Flagship EQ"
    },
    ui: {
      family: "northline-core",
      variant: "spectral-eq"
    },
    controls: [],
    meters: []
  });

  assert.equal(schema.ui.shell.sections.surfaces.title, "Editor Surface");
  assert.match(schema.ui.shell.sections.surfaces.description, /shared ui family/i);
});

test("resolveSurfaceModels preserves graph and auxiliary surface metadata", () => {
  const schema = {
    project: {
      key: "atlas-curve"
    },
    ui: {
      surfacePresetIds: ["eq-canvas", "instance-strip", "output-popover"],
      analyzerPresetIds: ["spectrum"],
      surfacePresets: {
        "eq-canvas": {
          kind: "graph-canvas",
          supports: ["band-create", "analyzer-overlay"]
        },
        "instance-strip": {
          kind: "list-strip",
          supports: ["instance-awareness"]
        },
        "output-popover": {
          kind: "popover-panel",
          supports: ["input-output-trim"]
        }
      },
      analyzerPresets: {
        spectrum: {
          curve: "frequency",
          overlay: "filled-line"
        }
      },
      preview: {
        surfaces: {
          "eq-canvas": {
            title: "Adaptive curve editor",
            bands: [
              {
                id: "bell",
                label: "Bell",
                role: "bell",
                xControl: "Bell Freq",
                yControl: "Bell Gain",
                qControl: "Bell Q",
                readouts: ["Bell Freq", "Bell Gain", "Bell Q"]
              }
            ]
          },
          "instance-strip": {
            items: [
              {
                label: "Open contour",
                meta: "Low cut eased"
              }
            ]
          },
          "output-popover": {
            items: [
              {
                label: "Trim",
                control: "Output Trim"
              }
            ]
          }
        }
      }
    },
    controls: [
      { id: "Bell Freq", label: "Bell Freq", init: 820, min: 20, max: 20000, unit: "Hz" },
      { id: "Bell Gain", label: "Bell Gain", init: -1.8, min: -6, max: 6, unit: "dB" },
      { id: "Bell Q", label: "Bell Q", init: 1.4, min: 0.3, max: 6 },
      { id: "Output Trim", label: "Output Trim", init: 0, min: -12, max: 12, unit: "dB" }
    ],
    meters: []
  };

  const models = resolveSurfaceModels(schema);

  assert.deepEqual(models.map((model) => model.id), ["eq-canvas", "instance-strip", "output-popover"]);
  assert.equal(models[0].kind, "graph-canvas");
  assert.equal(models[0].title, "Adaptive curve editor");
  assert.equal(models[0].config.bands[0].qControl, "Bell Q");
  assert.equal(models[0].analyzers[0].id, "spectrum");
  assert.equal(models[1].config.items[0].label, "Open contour");
  assert.equal(models[2].config.items[0].control, "Output Trim");
});

test("resolveSurfaceModels carries shared transfer, linked-strip, and field configs through unchanged", () => {
  const schema = {
    project: {
      key: "suite-wave"
    },
    ui: {
      surfacePresetIds: ["transfer-curve", "band-inspector", "reverb-space"],
      surfacePresets: {
        "transfer-curve": {
          kind: "hybrid-canvas",
          supports: ["transfer-display"]
        },
        "band-inspector": {
          kind: "linked-strip",
          supports: ["selection-linked-controls"]
        },
        "reverb-space": {
          kind: "hybrid-canvas",
          supports: ["space-control"]
        }
      },
      preview: {
        surfaces: {
          "transfer-curve": {
            curveControls: [
              { role: "input", control: "Input Gain" },
              { role: "drive", control: "Drive" },
              { role: "ceiling", control: "Ceiling" }
            ]
          },
          "band-inspector": {
            bands: [
              { id: "low-band", items: [{ control: "Low Threshold" }] },
              { id: "mid-band", items: [{ control: "Mid Threshold" }] }
            ],
            globalItems: [{ control: "Attack" }]
          },
          "reverb-space": {
            nodes: [
              { id: "tail-core", xControl: "Decay", yControl: "Bloom" }
            ],
            links: [{ from: "tail-core", to: "spread-node" }]
          }
        }
      }
    },
    controls: [],
    meters: []
  };

  const models = resolveSurfaceModels(schema);

  assert.deepEqual(models.map((model) => model.id), ["transfer-curve", "band-inspector", "reverb-space"]);
  assert.deepEqual(models[0].config.curveControls.map((entry) => entry.control), ["Input Gain", "Drive", "Ceiling"]);
  assert.equal(models[1].kind, "linked-strip");
  assert.equal(models[1].config.bands.length, 2);
  assert.equal(models[2].config.nodes[0].xControl, "Decay");
  assert.equal(models[2].config.links[0].to, "spread-node");
});

test("resolveSurfaceModels carries modulation, timeline, routing, module, and keyboard configs through unchanged", () => {
  const schema = {
    project: {
      key: "creative-wave"
    },
    ui: {
      surfacePresetIds: ["delay-timeline", "modulation-dock", "routing-matrix", "oscillator-stack", "keyboard-strip"],
      surfacePresets: {
        "delay-timeline": {
          kind: "timeline-editor",
          supports: ["tap-edit"]
        },
        "modulation-dock": {
          kind: "modulation-dock",
          supports: ["source-rail"]
        },
        "routing-matrix": {
          kind: "routing-control",
          supports: ["serial-parallel"]
        },
        "oscillator-stack": {
          kind: "card-stack",
          supports: ["voice-layering"]
        },
        "keyboard-strip": {
          kind: "keyboard-strip",
          supports: ["note-preview"]
        }
      },
      preview: {
        surfaces: {
          "delay-timeline": {
            taps: [{ id: "main", timeControl: "Time" }],
            connections: [{ from: "input", to: "main" }]
          },
          "modulation-dock": {
            sources: [{ id: "motion", control: "Depth" }],
            slots: [{ id: "shape", amountControl: "Shape" }]
          },
          "routing-matrix": {
            routes: [{ id: "stereo", control: "Routing", matchValue: 0 }]
          },
          "oscillator-stack": {
            modules: [{ id: "voice", readouts: ["Blend"] }]
          },
          "keyboard-strip": {
            keys: [{ label: "C" }, { label: "D" }],
            readouts: ["Attack"]
          }
        }
      }
    },
    controls: [],
    meters: []
  };

  const models = resolveSurfaceModels(schema);

  assert.deepEqual(
    models.map((model) => model.id),
    ["delay-timeline", "modulation-dock", "routing-matrix", "oscillator-stack", "keyboard-strip"]
  );
  assert.equal(models[0].kind, "timeline-editor");
  assert.equal(models[0].config.taps[0].timeControl, "Time");
  assert.equal(models[1].config.slots[0].amountControl, "Shape");
  assert.equal(models[2].kind, "routing-control");
  assert.equal(models[3].config.modules[0].id, "voice");
  assert.equal(models[4].config.keys.length, 2);
});

test("resolveSurfaceModels carries section-grid configs through unchanged", () => {
  const schema = {
    project: {
      key: "reduced-wave"
    },
    ui: {
      surfacePresetIds: ["section-grid"],
      surfacePresets: {
        "section-grid": {
          kind: "section-grid",
          supports: ["panel-groups"]
        }
      },
      preview: {
        surfaces: {
          "section-grid": {
            sections: [
              {
                id: "voice",
                label: "Voice",
                meterId: "voiceLevel",
                items: ["Wave", "Color"]
              },
              {
                id: "tone",
                label: "Tone",
                summaryControl: "Cutoff",
                items: ["Cutoff", "Drive"]
              }
            ]
          }
        }
      }
    },
    controls: [],
    meters: []
  };

  const models = resolveSurfaceModels(schema);

  assert.deepEqual(models.map((model) => model.id), ["section-grid"]);
  assert.equal(models[0].kind, "section-grid");
  assert.equal(models[0].config.sections.length, 2);
  assert.equal(models[0].config.sections[1].summaryControl, "Cutoff");
});

test("surface registry resolves shared builders in priority order", () => {
  const transferBuilder = resolveSurfaceBuilder({
    kind: "hybrid-canvas",
    config: {
      curveControls: [{ control: "Drive" }],
      nodes: [{ id: "field" }]
    }
  });
  const graphBuilder = resolveSurfaceBuilder({
    kind: "hybrid-canvas",
    config: {
      bands: [{ id: "bell" }]
    }
  });
  const fieldBuilder = resolveSurfaceBuilder({
    kind: "hybrid-canvas",
    config: {
      nodes: [{ id: "tail-core" }]
    }
  });
  const summaryBuilder = resolveSurfaceBuilder({
    kind: "surface-card",
    config: {}
  });

  assert.equal(transferBuilder.id, "transfer-curve");
  assert.equal(graphBuilder.id, "graph-canvas");
  assert.equal(fieldBuilder.id, "field-canvas");
  assert.equal(summaryBuilder.id, "summary");
});

test("surface registry keeps all shared preview builders available", () => {
  assert.deepEqual(
    SURFACE_BUILDERS.map((entry) => entry.id),
    [
      "transfer-curve",
      "modulation-dock",
      "timeline-editor",
      "routing-control",
      "section-grid",
      "module-cards",
      "keyboard-strip",
      "linked-strip",
      "graph-canvas",
      "history-trace",
      "region-editor",
      "field-canvas",
      "value-detail",
      "summary"
    ]
  );
});
