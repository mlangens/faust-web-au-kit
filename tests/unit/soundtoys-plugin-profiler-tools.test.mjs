import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSoundtoysProfilePlan,
  discoverInstalledSoundtoysPlugins,
  inferPrimitiveIdsForSoundtoysName,
  normalizeSoundtoysName,
  soundtoysProductKey
} from "../../tools/lib/soundtoys-plugin-profiler-tools.mjs";

test("Soundtoys plugin name inference maps creative effects to reusable primitives", () => {
  assert.deepEqual(
    inferPrimitiveIdsForSoundtoysName("Soundtoys: Decapitator").primitiveIds,
    [
      "saturation.character-model-bank",
      "saturation.virtual-analog-stage"
    ]
  );
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: EchoBoy").primitiveIds.includes("delay.style-morphing-echo-engine"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Crystallizer").primitiveIds.includes("pitch.granular-reverse-echo"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Little AlterBoy").primitiveIds.includes("pitch.formant-shift-voice-transform"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: MicroShift").primitiveIds.includes("spatial.micro-pitch-widener"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: FilterFreak2").primitiveIds.includes("modulation.resonant-filter-motion"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: PhaseMistress").primitiveIds.includes("modulation.all-pass-phaser-network"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: PanMan").primitiveIds.includes("modulation.rhythmic-auto-pan"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Tremolator").primitiveIds.includes("modulation.rhythmic-amplitude-gate"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Devil-Loc Deluxe").primitiveIds.includes("compression.crush-pump-dynamics"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Radiator").primitiveIds.includes("analog.tube-preamp-drive-stage"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: Little Plate").primitiveIds.includes("space.modulated-plate-reverb"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: PrimalTap").primitiveIds.includes("delay.retro-digital-buffer"));
  assert.ok(inferPrimitiveIdsForSoundtoysName("Soundtoys: EffectRack").primitiveIds.includes("routing.serial-effect-rack"));
});

test("Soundtoys AU discovery uses registry manufacturer identity", () => {
  const entries = discoverInstalledSoundtoysPlugins({
    components: [
      {
        name: "Soundtoys: EchoBoy",
        type: "aufx",
        subtype: "EB  ",
        manufacturer: "SToy"
      },
      {
        name: "Soundtoys: Decapitator",
        type: "aufx",
        subtype: "DEC ",
        manufacturer: "SToy"
      },
      {
        name: "Universal Audio (UADx): UADx 1176 Rev A Compressor",
        type: "aufx",
        subtype: "UA76",
        manufacturer: "UADx"
      }
    ]
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["au:decapitator", "au:echo-boy"]);
  assert.equal(entries[0]?.format, "au");
  assert.equal(entries[0]?.nativeRuntime, true);
});

test("Soundtoys profile plan resolves primitive-specific probes", () => {
  const plan = buildSoundtoysProfilePlan({
    entries: [
      {
        id: "au:crystallizer",
        format: "au",
        displayName: "Soundtoys: Crystallizer",
        normalizedName: normalizeSoundtoysName("Soundtoys: Crystallizer"),
        productKey: soundtoysProductKey("Soundtoys: Crystallizer"),
        runtimeKind: "native",
        path: "Soundtoys: Crystallizer"
      },
      {
        id: "au:tremolator",
        format: "au",
        displayName: "Soundtoys: Tremolator",
        normalizedName: normalizeSoundtoysName("Soundtoys: Tremolator"),
        productKey: soundtoysProductKey("Soundtoys: Tremolator"),
        runtimeKind: "native",
        path: "Soundtoys: Tremolator"
      }
    ],
    signalLimit: 12
  });

  const crystallizer = plan.find((entry) => entry.id === "au:crystallizer");
  const tremolator = plan.find((entry) => entry.id === "au:tremolator");

  assert.ok(crystallizer?.primitiveIds?.includes("pitch.granular-reverse-echo"));
  assert.ok(crystallizer?.signalIds?.includes("steady-sine-wow-flutter"));
  assert.equal(crystallizer?.renderableByBuiltInAuHost, true);
  assert.ok(tremolator?.primitiveIds?.includes("modulation.rhythmic-amplitude-gate"));
  assert.ok(tremolator?.signalIds?.includes("transient-click-train"));
});
