import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuProfilePlan,
  discoverInstalledAuPlugins,
  inferPrimitiveIdsForAuName,
  normalizeAuPluginName,
  preferDistinctAuProducts,
  summarizeFunctionalPrimitiveCoverage
} from "../../tools/lib/au-plugin-profiler-tools.mjs";

test("generic AU inference maps remaining vendor plugins to framework primitives", () => {
  assert.ok(inferPrimitiveIdsForAuName("iZotope: RX 11 Dialogue Isolate").primitiveIds.includes("restoration.source-separation-focus"));
  assert.ok(inferPrimitiveIdsForAuName("iZotope: RX 11 De-click").primitiveIds.includes("restoration.spectral-repair-module"));
  assert.ok(inferPrimitiveIdsForAuName("iZotope: Ozone 11").primitiveIds.includes("mastering.integrated-mastering-chain"));
  assert.ok(inferPrimitiveIdsForAuName("iZotope: Ozone 11 Stabilizer").primitiveIds.includes("mastering.spectral-balance-shaper"));
  assert.ok(inferPrimitiveIdsForAuName("FabFilter: Pro-Q 4").primitiveIds.includes("eq.circuit-model-topology"));
  assert.ok(inferPrimitiveIdsForAuName("FabFilter: Pro-C 3").primitiveIds.includes("compression.vintage-compressor-model"));
  assert.ok(inferPrimitiveIdsForAuName("FabFilter: Pro-L 2").primitiveIds.includes("compression.true-peak-limiter"));
  assert.ok(inferPrimitiveIdsForAuName("Apple: AUDelay").primitiveIds.includes("delay.style-morphing-echo-engine"));
  assert.ok(inferPrimitiveIdsForAuName("Apple: AUDistortion").primitiveIds.includes("saturation.virtual-analog-stage"));
  assert.ok(inferPrimitiveIdsForAuName("Apple: AURoundTripAAC").primitiveIds.includes("utility.signal-source-codec-stage"));
  assert.ok(inferPrimitiveIdsForAuName("iZotope: Relay").primitiveIds.includes("routing.plugin-host-shell"));
  assert.ok(inferPrimitiveIdsForAuName("Native Instruments: Reaktor 6 MFX").primitiveIds.includes("instrument.virtual-analog-workstation"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: RCompressor (s)").primitiveIds.includes("compression.vintage-compressor-model"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: Q10 (s)").primitiveIds.includes("eq.circuit-model-topology"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: RVerb (s)").primitiveIds.includes("space.algorithmic-reverb-suite"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: MaxxBass (s)").primitiveIds.includes("saturation.multiband-enhancer-exciter"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: Reel ADT2V (s)").primitiveIds.includes("spatial.stereo-image-matrix"));
  assert.ok(inferPrimitiveIdsForAuName("Native Instruments: Transient Master").primitiveIds.includes("compression.transient-shaper"));
  assert.ok(inferPrimitiveIdsForAuName("Waves: C1 gate (s)").primitiveIds.includes("compression.gate-expander"));
  assert.ok(inferPrimitiveIdsForAuName("SIR Audio Tools: StandardCLIP").primitiveIds.includes("saturation.clip-limiter-stage"));
  assert.ok(inferPrimitiveIdsForAuName("Valhalla DSP, LLC: ValhallaVintageVerb").primitiveIds.includes("space.algorithmic-reverb-suite"));
  assert.ok(inferPrimitiveIdsForAuName("TAL-Togu Audio Line: TAL-Chorus-LX").primitiveIds.includes("modulation.ensemble-chorus"));
  assert.ok(inferPrimitiveIdsForAuName("Sonarworks: SoundID Reference Plugin").primitiveIds.includes("utility.room-correction-reference"));
  assert.ok(inferPrimitiveIdsForAuName("DDMF: Metaplugin").primitiveIds.includes("routing.plugin-host-shell"));
  assert.ok(inferPrimitiveIdsForAuName("Synchro Arts: VocAlign Project 5 AU").primitiveIds.includes("pitch.vocal-time-alignment"));
});

test("generic AU discovery filters manufacturers and component types", () => {
  const entries = discoverInstalledAuPlugins({
    excludeManufacturers: ["UADx", "SToy"],
    typeFilter: ["aufx", "aumf"],
    components: [
      { name: "iZotope: Ozone 11", type: "aufx", subtype: "OZ11", manufacturer: "iZtp" },
      { name: "Soundtoys: Decapitator", type: "aufx", subtype: "DEC ", manufacturer: "SToy" },
      { name: "Arturia: Mini V3", type: "aumu", subtype: "Mini", manufacturer: "Artu" }
    ]
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["au:iztp-ozone-11"]);
  assert.equal(entries[0]?.manufacturer, "iZtp");
  assert.equal(entries[0]?.vendor, "iZotope");
});

test("generic AU product preference collapses duplicate channel variants", () => {
  const entries = discoverInstalledAuPlugins({
    components: [
      { name: "Waves: H-Delay (m)", type: "aufx", subtype: "HDlm", manufacturer: "ksWV" },
      { name: "Waves: H-Delay (s)", type: "aufx", subtype: "HDls", manufacturer: "ksWV" },
      { name: "Waves: H-Delay (m->s)", type: "aufx", subtype: "HDlS", manufacturer: "ksWV" },
      { name: "Waves: H-Reverb (s)", type: "aufx", subtype: "HRVs", manufacturer: "ksWV" }
    ]
  });

  const distinct = preferDistinctAuProducts(entries);

  assert.deepEqual(distinct.map((entry) => entry.displayName), ["Waves: H-Delay (s)", "Waves: H-Reverb (s)"]);
});

test("generic AU discovery keeps distinct vendors with matching product labels", () => {
  const entries = preferDistinctAuProducts(discoverInstalledAuPlugins({
    components: [
      { name: "Vendor A: Analyzer (s)", type: "aufx", subtype: "Anlz", manufacturer: "VNDA" },
      { name: "Vendor B: Analyzer (s)", type: "aufx", subtype: "Anlz", manufacturer: "VNDB" }
    ]
  }));

  assert.equal(entries.length, 2);
});

test("generic AU plan can force active engagement signals", () => {
  const plan = buildAuProfilePlan({
    entries: [
      {
        id: "au:iztp-ozone-11",
        format: "au",
        displayName: "iZotope: Ozone 11",
        normalizedName: normalizeAuPluginName("iZotope: Ozone 11"),
        runtimeKind: "native",
        path: "iZotope: Ozone 11"
      }
    ],
    signalIds: ["log-sweep-fullband", "musical-drum-bass-loop"],
    signalLimit: 2
  });

  assert.deepEqual(plan[0]?.signalIds, ["log-sweep-fullband", "musical-drum-bass-loop"]);
  assert.ok(plan[0]?.primitiveIds?.includes("mastering.integrated-mastering-chain"));
});

test("functional primitive coverage only counts engaged plugins", () => {
  const coverage = summarizeFunctionalPrimitiveCoverage(
    [
      {
        id: "au:wet",
        format: "au",
        displayName: "Wet",
        normalizedName: "wet",
        manufacturer: "Wet",
        path: "Wet",
        primitiveIds: ["space.algorithmic-reverb-suite"]
      },
      {
        id: "au:dry",
        format: "au",
        displayName: "Dry",
        normalizedName: "dry",
        manufacturer: "Dry",
        path: "Dry",
        primitiveIds: ["metering.analysis-suite"]
      }
    ],
    [
      { pluginId: "au:wet", status: "engaged" },
      { pluginId: "au:dry", status: "likely-no-transform" }
    ]
  );

  assert.equal(coverage.functionalPluginCount, 1);
  assert.deepEqual(coverage.functionalPluginIds, ["au:wet"]);
  assert.equal(coverage.primitiveCounts["space.algorithmic-reverb-suite"], 1);
  assert.equal(coverage.primitiveCounts["metering.analysis-suite"], undefined);
});
