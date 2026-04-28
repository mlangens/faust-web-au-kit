import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUadProfilePlan,
  classifyUadRuntime,
  compareUadProfilingPreference,
  inferPrimitiveIdsForPluginName,
  normalizePluginName,
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
  assert.equal(uadProductKey("Universal Audio (UADx): UADx 1176 Rev A Compressor"), "1176 rev a");
  assert.equal(uadProductKey("uaudio_ua_1176_rev_a.component"), "1176 rev a");

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
