import assert from "node:assert/strict";
import test from "node:test";

import { loadProjectRuntime } from "../../tools/lib/project-tools.mjs";
import {
  loadPrimitiveLibrary,
  resolveProjectPrimitiveIds,
  resolveProjectPrimitiveSet
} from "../../tools/lib/primitive-library-tools.mjs";
import {
  loadReferenceCorpus,
  resolvePrimitiveCorpusEvidence
} from "../../tools/lib/reference-corpus-tools.mjs";

test("audio primitive library keeps every mapped primitive resolvable", () => {
  const library = loadPrimitiveLibrary();
  const primitiveIds = new Set(Object.keys(library.primitives ?? {}));

  assert.ok(primitiveIds.has("eq.parametric-band"));
  assert.ok(primitiveIds.has("compression.feedforward-sidechain"));
  assert.ok(primitiveIds.has("compression.fet-76-gain-cell"));
  assert.ok(primitiveIds.has("saturation.memoryless-waveshaper"));
  assert.ok(primitiveIds.has("phase.all-pass-alignment-network"));

  for (const [primitiveId, primitive] of Object.entries(library.primitives ?? {})) {
    assert.ok(primitive.maturity?.stage, `${primitiveId} should declare a maturity stage`);
    assert.ok(primitive.maturity?.sonicVerification, `${primitiveId} should declare sonic verification status`);
  }

  for (const map of [library.variantPrimitiveMap, library.categoryPrimitiveMap, library.productPrimitiveMap]) {
    for (const [key, ids] of Object.entries(map ?? {})) {
      assert.ok(Array.isArray(ids), `${key} should map to primitive ids`);
      ids.forEach((id) => assert.ok(primitiveIds.has(id), `${key} references unknown primitive ${id}`));
    }
  }
});

test("active products resolve workbench, compression, synth, and limiter primitive assemblages", () => {
  const library = loadPrimitiveLibrary();
  const workbenchIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "omniplugin"]), library);
  const fet76Ids = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "fet-76"]), library);
  const pulseIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "pulse-pad"]), library);
  const limiterIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "limiter-lab"]), library);

  assert.deepEqual(workbenchIds, [
    "eq.parametric-band",
    "eq.dynamic-band",
    "compression.feedforward-sidechain",
    "compression.detector-ballistics",
    "saturation.memoryless-waveshaper",
    "saturation.virtual-analog-stage",
    "analog.preamp-console-stage",
    "spatial.channel-toolkit",
    "compression.true-peak-limiter",
    "metering.analysis-suite"
  ]);
  assert.deepEqual(fet76Ids, [
    "compression.fet-76-gain-cell",
    "compression.vintage-compressor-model",
    "analog.preamp-console-stage",
    "saturation.virtual-analog-stage"
  ]);
  assert.deepEqual(
    pulseIds,
    [
      "eq.parametric-band",
      "saturation.memoryless-waveshaper",
      "saturation.virtual-analog-stage",
      "instrument.oscillator-filter-voice",
      "instrument.electromechanical-keyboard"
    ]
  );
  assert.ok(limiterIds.includes("compression.feedforward-sidechain"));
  assert.ok(limiterIds.includes("saturation.memoryless-waveshaper"));
});

test("resolved primitive sets expose agentic design notes and analysis probes", () => {
  const primitiveSet = resolveProjectPrimitiveSet(loadProjectRuntime(["--app", "fet-76"]));

  assert.equal(primitiveSet.library.id, "fwak-audio-primitives");
  assert.ok(primitiveSet.library.researchSources.length >= 3);
  assert.ok(primitiveSet.primitiveIds.includes("compression.fet-76-gain-cell"));
  assert.ok(primitiveSet.primitives["compression.fet-76-gain-cell"]?.analysisProbes?.includes("tone-burst recovery"));
  assert.ok(primitiveSet.primitives["compression.vintage-compressor-model"]?.agentDesignNotes?.length);
});

test("reference corpus treats outside plugins as primitive evidence and Northline as a sample suite", () => {
  const corpus = loadReferenceCorpus();
  const entries = corpus.entries ?? [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const northline = entries.find((entry) => entry.id === "northline-suite");

  assert.equal(corpus.methodology?.frameworkGoal?.includes("research specimens"), true);
  assert.equal(northline?.referenceType, "sample-suite");
  assert.equal(northline?.role, "throwaway proving suite");
  assert.ok(entryIds.has("dmg-compassion"));
  assert.ok(entryIds.has("dmg-equilibrium"));
  assert.ok(entryIds.has("dmg-limitless"));
  assert.ok(entryIds.has("dmg-pitchfunk"));
  assert.ok(entryIds.has("dmg-track-range"));
  assert.ok(entryIds.has("soundtoys-local-install"));
  assert.ok(entryIds.has("au-local-plugin-harvest"));
  assert.ok(entries.filter((entry) => entry.referenceType === "outside-plugin").length >= 10);
});

test("UAD source pack covers the paginated manual section and vintage primitive derivations", () => {
  const corpus = loadReferenceCorpus();
  const uadEntry = corpus.entries?.find((entry) => entry.id === "uad-plugin-manuals");
  const uadSourcePack = corpus.sourcePacks?.find((entry) => entry.id === "uad-plugin-manuals");

  assert.equal(uadEntry?.referenceType, "outside-plugin-collection");
  assert.equal(uadEntry?.sourcePackId, "uad-plugin-manuals");
  assert.equal(uadSourcePack?.articleCount, 113);
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("tape.magnetic-recorder-stage"));
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("compression.vintage-compressor-model"));
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("amp.cabinet-mic-chain"));
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("cabinet.speaker-mic-simulation"));
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("space.mechanical-room-reverb"));
  assert.ok(uadEntry?.observedPrimitiveIds?.includes("phase.all-pass-alignment-network"));
});

test("reference corpus resolves evidence for broader non-Northline primitives", () => {
  const evidence = resolvePrimitiveCorpusEvidence([
    "compression.true-peak-limiter",
    "compression.crush-pump-dynamics",
    "metering.analysis-suite",
    "modulation.rhythmic-auto-pan",
    "pitch.modulated-feedback-shifter",
    "routing.serial-effect-rack",
    "spatial.channel-toolkit",
    "tape.magnetic-recorder-stage",
    "analog.preamp-console-stage",
    "modulation.vintage-delay-modulation",
    "phase.all-pass-alignment-network",
    "cabinet.speaker-mic-simulation"
  ]);

  assert.equal(evidence.id, "fwak-reference-corpus");
  assert.equal(evidence.sampleSuites.some((entry) => entry.id === "northline-suite"), true);
  assert.ok(evidence.evidenceByPrimitive["compression.true-peak-limiter"].some((entry) => entry.id === "dmg-limitless"));
  assert.ok(evidence.evidenceByPrimitive["compression.crush-pump-dynamics"].some((entry) => entry.id === "soundtoys-local-install"));
  assert.ok(evidence.evidenceByPrimitive["metering.analysis-suite"].some((entry) => entry.id === "dmg-track-range"));
  assert.ok(evidence.evidenceByPrimitive["modulation.rhythmic-auto-pan"].some((entry) => entry.id === "soundtoys-local-install"));
  assert.ok(evidence.evidenceByPrimitive["pitch.modulated-feedback-shifter"].some((entry) => entry.id === "dmg-pitchfunk"));
  assert.ok(evidence.evidenceByPrimitive["routing.serial-effect-rack"].some((entry) => entry.id === "soundtoys-local-install"));
  assert.ok(evidence.evidenceByPrimitive["spatial.channel-toolkit"].some((entry) => entry.id === "dmg-dualism"));
  assert.ok(evidence.evidenceByPrimitive["tape.magnetic-recorder-stage"].some((entry) => entry.id === "uad-plugin-manuals"));
  assert.ok(evidence.evidenceByPrimitive["analog.preamp-console-stage"].some((entry) => entry.sourcePackId === "uad-plugin-manuals"));
  assert.ok(evidence.evidenceByPrimitive["modulation.vintage-delay-modulation"].some((entry) => entry.id === "uad-plugin-manuals"));
  assert.ok(evidence.evidenceByPrimitive["phase.all-pass-alignment-network"].some((entry) => entry.id === "uad-plugin-manuals"));
  assert.ok(evidence.evidenceByPrimitive["cabinet.speaker-mic-simulation"].some((entry) => entry.id === "uad-plugin-manuals"));
});

test("local AU remainder harvest contributes functional primitive evidence", () => {
  const evidence = resolvePrimitiveCorpusEvidence([
    "restoration.spectral-repair-module",
    "mastering.integrated-mastering-chain",
    "utility.signal-source-codec-stage",
    "space.algorithmic-reverb-suite",
    "cabinet.speaker-mic-simulation"
  ]);

  assert.ok(evidence.evidenceByPrimitive["restoration.spectral-repair-module"].some((entry) => entry.id === "au-local-plugin-harvest"));
  assert.ok(evidence.evidenceByPrimitive["mastering.integrated-mastering-chain"].some((entry) => entry.id === "au-local-plugin-harvest"));
  assert.ok(evidence.evidenceByPrimitive["utility.signal-source-codec-stage"].some((entry) => entry.id === "au-local-plugin-harvest"));
  assert.ok(evidence.evidenceByPrimitive["space.algorithmic-reverb-suite"].some((entry) => entry.id === "au-local-plugin-harvest"));
  assert.ok(evidence.evidenceByPrimitive["cabinet.speaker-mic-simulation"].some((entry) => entry.id === "au-local-plugin-harvest"));
});
