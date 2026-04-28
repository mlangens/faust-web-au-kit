import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUadProfilePlan,
  inferPrimitiveIdsForPluginName,
  normalizePluginName
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
