import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUadProfilePlan,
  classifyUadRuntime,
  compareUadProfilingPreference,
  inferPrimitiveIdsForPluginName,
  normalizePluginName,
  scoreAuHostComponent,
  uadProductKey
} from "../../tools/lib/uad-plugin-profiler-tools.mjs";

test("UAD plugin name inference maps owned vintage plugins to sonic primitives", () => {
  assert.deepEqual(
    inferPrimitiveIdsForPluginName("uaudio_studer_a800.vst3").primitiveIds,
    ["tape.magnetic-recorder-stage"]
  );
  assert.ok(inferPrimitiveIdsForPluginName("UAD UA 1176LN Legacy.component").primitiveIds.includes("compression.vintage-compressor-model"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_pultec_eqp-1a.component").primitiveIds.includes("eq.passive-vintage-program-eq"));
  assert.ok(inferPrimitiveIdsForPluginName("UAD Little Labs IBP.component").primitiveIds.includes("phase.all-pass-alignment-network"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_neve_1073.vst3").primitiveIds.includes("analog.preamp-console-stage"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_175_b.component").primitiveIds.includes("compression.tube-vari-mu-stage"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_la3a.component").primitiveIds.includes("compression.opto-program-leveler"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_ssl_g_bus_compressor.component").primitiveIds.includes("compression.vca-bus-detector"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_capitol_chambers.component").primitiveIds.includes("space.recording-room-scene"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_lexicon_224.component").primitiveIds.includes("space.vintage-digital-reverb"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_pure_plate.component").primitiveIds.includes("space.plate-reverb"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_topline_vocal_suite.component").primitiveIds.includes("pitch.vocal-tuning-formant-chain"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_a_type_multiband.component").primitiveIds.includes("saturation.multiband-enhancer-exciter"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_minimoog.component").primitiveIds.includes("instrument.morphing-analog-synth"));
  assert.ok(inferPrimitiveIdsForPluginName("uaudio_little_labs_vog.component").primitiveIds.includes("eq.resonant-subharmonic-enhancer"));
});

test("UAD profile plan assigns primitive-specific probe signals and renderability", () => {
  const plan = buildUadProfilePlan({
    entries: [
      {
        id: "au:little-labs-ibp",
        format: "au",
        displayName: "UAD Little Labs IBP",
        normalizedName: normalizePluginName("UAD Little Labs IBP"),
        path: "/Library/Audio/Plug-Ins/Components/UAD Little Labs IBP.component"
      },
      {
        id: "vst3:studer-a800",
        format: "vst3",
        displayName: "uaudio_studer_a800",
        normalizedName: normalizePluginName("uaudio_studer_a800"),
        path: "/Library/Audio/Plug-Ins/VST3/uaudio_studer_a800.vst3"
      }
    ],
    signalLimit: 12
  });

  const ibp = plan.find((entry) => entry.id === "au:little-labs-ibp");
  const studer = plan.find((entry) => entry.id === "vst3:studer-a800");

  assert.ok(ibp?.primitiveIds?.includes("phase.all-pass-alignment-network"));
  assert.ok(ibp?.signalIds?.includes("phase-null-sweep"));
  assert.equal(ibp?.renderableByBuiltInAuHost, true);
  assert.ok(studer?.primitiveIds?.includes("tape.magnetic-recorder-stage"));
  assert.ok(studer?.signalIds?.includes("steady-sine-wow-flutter"));
  assert.equal(studer?.renderableByBuiltInAuHost, false);
});

test("UAD profiling preference treats UADx native plugins as first-choice references", () => {
  assert.equal(classifyUadRuntime("uaudio_ua_1176_rev_a", "/Library/Audio/Plug-Ins/Components/uaudio_ua_1176_rev_a.component"), "uadx-native");
  assert.equal(classifyUadRuntime("UAD UA 1176 Rev A", "/Library/Audio/Plug-Ins/Components/UAD UA 1176 Rev A.component"), "uad-dsp");
  assert.equal(uadProductKey("Universal Audio (UADx): UADx 1176 Rev A Compressor"), "1176 rev a compressor");
  assert.equal(uadProductKey("uaudio_ua_1176_rev_a.component"), "1176 rev a");
  assert.equal(uadProductKey("Universal Audio (UADx): UADx LA-3A Compressor"), "la3a compressor");
  assert.equal(uadProductKey("uaudio_la3a.component"), "la3a");
  assert.equal(uadProductKey("uaudio_capitol_compressor.component"), "capitol compressor");

  const sorted = [
    {
      id: "au:uad-dsp",
      format: "au",
      displayName: "UAD UA 1176 Rev A",
      normalizedName: "ua 1176 rev a",
      productKey: "1176 rev a",
      runtimeKind: "uad-dsp",
      path: "/Library/Audio/Plug-Ins/Components/UAD UA 1176 Rev A.component"
    },
    {
      id: "au:uadx",
      format: "au",
      displayName: "uaudio_ua_1176_rev_a",
      normalizedName: "ua 1176 rev a",
      productKey: "1176 rev a",
      runtimeKind: "uadx-native",
      path: "/Library/Audio/Plug-Ins/Components/uaudio_ua_1176_rev_a.component"
    }
  ].sort(compareUadProfilingPreference);

  assert.equal(sorted[0]?.id, "au:uadx");
});

test("UAD AU host scoring resolves bundle shorthand to richer registry names", () => {
  const plugin = {
    id: "au:capitol-compressor",
    format: "au",
    displayName: "uaudio_capitol_compressor",
    normalizedName: "capitol compressor",
    productKey: "capitol compressor",
    runtimeKind: "uadx-native",
    path: "/Library/Audio/Plug-Ins/Components/uaudio_capitol_compressor.component"
  };
  const masteringCompressor = {
    name: "Universal Audio (UADx): UADx Capitol Mastering Compressor",
    type: "aufx",
    manufacturer: "UADx"
  };
  const chambers = {
    name: "Universal Audio (UADx): UADx Capitol Chambers",
    type: "aufx",
    manufacturer: "UADx"
  };

  assert.ok(scoreAuHostComponent(masteringCompressor, plugin) > scoreAuHostComponent(chambers, plugin));
  assert.ok(scoreAuHostComponent({
    name: "Universal Audio (UADx): UADx LA-3A Compressor",
    type: "aufx",
    manufacturer: "UADx"
  }, { ...plugin, displayName: "uaudio_la3a" }) > 90);
});
