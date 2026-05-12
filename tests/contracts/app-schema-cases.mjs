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
    appKey: "omniplugin",
    name: "Primitive Workbench",
    kind: "effect",
    controlLabelsAny: ["Slot 1 Type", "Slot 2 Amount", "Macro Intent", "Macro Guard"],
    surfacePresetIds: ["section-grid", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.catalog?.category, "meta-workbench");
      assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.sections?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.workflow, "primitive-assembler");
      assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.primitivePalette?.length >= 6, true);
      assert.equal(
        schema.ui.preview?.surfaces?.["section-grid"]?.recipes?.some((recipe) => recipe.id === "fet-76-rebuild"),
        true
      );
      assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.recipes?.[0]?.expectedPackagePath?.endsWith("FET76Workbench-0.1.0.pkg"), true);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["section-grid"]?.sections?.map((section) => section.id),
        ["slot-1", "slot-2", "slot-3", "slot-4"]
      );
      assert.deepEqual(
        schema.ui.display?.enumLabels?.["Slot 1 Type"],
        ["Bypass", "Tone", "Dynamics", "Saturation", "Space", "Guard"]
      );
      assert.ok(schema.ui.primitiveIds.includes("metering.analysis-suite"));
    }
  },
  {
    appKey: "fet-76",
    name: "FET-76",
    kind: "effect",
    controlLabelsAny: ["Input", "Output", "Ratio", "Attack", "Release", "Bias", "Sidechain HP"],
    surfacePresetIds: ["fet-76-faceplate", "transfer-curve", "history-trace", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["fet-76-faceplate"]?.knobs?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["fet-76-faceplate"]?.ratioButtons?.length, 5);
      assert.deepEqual(schema.ui.display?.enumLabels?.Ratio, ["4", "8", "12", "20", "All"]);
      assert.ok(schema.ui.primitiveIds.includes("compression.fet-76-gain-cell"));
    }
  },
  {
    appKey: "pulse-pad",
    name: "Pulse Pad",
    kind: "instrument",
    controlLabelsAny: ["Texture", "Detune", "Sub", "Motion"],
    surfacePresetIds: ["oscillator-stack", "filter-canvas", "module-rack", "modulation-dock", "keyboard-strip"],
    assertions(schema) {
      assert.equal(schema.ui.preview?.surfaces?.["oscillator-stack"]?.modules?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["module-rack"]?.modules?.length, 3);
      assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
      assert.equal(schema.ui.preview?.surfaces?.["keyboard-strip"]?.keys?.length, 8);
    }
  },
  {
    appKey: "limiter-lab",
    name: "Limiter Lab",
    kind: "effect",
    controlLabelsAny: ["Input Gain", "Ceiling", "Drive Target", "Output Trim"],
    surfacePresetIds: ["history-trace", "transfer-curve", "meter-stack", "output-popover"],
    assertions(schema) {
      assert.deepEqual(schema.ui.display?.enumLabels?.["Drive Target"], ["Both", "Mid", "Side"]);
      assert.deepEqual(schema.ui.display?.enumLabels?.["Drive Focus"], ["Full", "Low", "Mid", "High"]);
      assert.equal(schema.ui.preview?.surfaces?.["history-trace"]?.series?.length, 5);
      assert.deepEqual(
        schema.ui.preview?.surfaces?.["transfer-curve"]?.curveControls?.map((item) => item.control),
        ["Input Gain", "Tube Drive", "Ceiling"]
      );
    }
  }
];

export { appSchemaCases };
