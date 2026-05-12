import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultEmulationPilotTargets,
  materializeParameterOverrides,
  scoreSonicComparison,
  selectBestCandidateState,
  selectInstalledAuPlugin,
  summarizeCandidateScores
} from "../../tools/lib/emulation-assembler-tools.mjs";

test("default emulation pilots cover the 1176 proof and a second UAD EQ proof", () => {
  const targetIds = defaultEmulationPilotTargets.map((target) => target.id);

  assert.ok(targetIds.includes("uad-1176-rev-a"));
  assert.ok(targetIds.includes("uad-pultec-eqp-1a"));
  assert.equal(defaultEmulationPilotTargets.find((target) => target.id === "uad-1176-rev-a")?.candidateApp, "fet-76");
  assert.equal(defaultEmulationPilotTargets.find((target) => target.id === "uad-pultec-eqp-1a")?.candidateApp, "omniplugin");
  assert.ok(defaultEmulationPilotTargets.find((target) => target.id === "uad-1176-rev-a")?.primitiveIds.includes("compression.fet-76-gain-cell"));
});

test("parameter override materialization matches host-exposed parameters and clamps values", () => {
  const materialized = materializeParameterOverrides(
    {
      Input: 1.25,
      Ratio: 4,
      Missing: 10
    },
    {
      parameters: [
        { id: 0, name: "Input", min: 0, max: 1 },
        { id: 4, name: "Ratio", min: 0, max: 10 }
      ]
    }
  );

  assert.deepEqual(materialized.args, ["Input=1", "Ratio=4"]);
  assert.deepEqual(materialized.applied, { Input: 1, Ratio: 4 });
  assert.deepEqual(materialized.skipped, ["Missing"]);
});

test("candidate scoring prefers lower sonic residuals", () => {
  const comparisons = [
    { candidateStateId: "rough", signalId: "tone", metrics: { score: 2.5 } },
    { candidateStateId: "fit", signalId: "tone", metrics: { score: 0.7 } },
    { candidateStateId: "fit", signalId: "program", metrics: { score: 0.9 } },
    { candidateStateId: "rough", signalId: "program", metrics: { score: 1.5 } },
    { candidateStateId: "invalid-pass-through", signalId: "program", referenceEngaged: false, metrics: { score: 0 } },
    { candidateStateId: "invalid-nan", signalId: "program", metrics: { score: Number.NaN } }
  ];
  const scores = summarizeCandidateScores(comparisons);
  const best = selectBestCandidateState(scores);

  assert.equal(best?.candidateStateId, "fit");
  assert.equal(best?.signalCount, 2);
  assert.equal(best?.averageScore, 0.8);
  assert.equal(scores.some((entry) => entry.candidateStateId === "invalid-pass-through"), false);
  assert.equal(scores.some((entry) => entry.candidateStateId === "invalid-nan"), false);
});

test("sonic comparison score includes spectral, harmonic, loudness, and correlation residuals", () => {
  const score = scoreSonicComparison({
    comparison: {
      normalizedError: 0.2,
      correlation: 0.75
    },
    reference: {
      mono: { rmsDb: -18 },
      spectralFingerprint: { 1000: -12, 2000: -24 },
      harmonicFingerprint: { h1: -12, h2: -48 }
    },
    candidate: {
      mono: { rmsDb: -20 },
      spectralFingerprint: { 1000: -15, 2000: -30 },
      harmonicFingerprint: { h1: -13, h2: -54 }
    }
  });

  assert.ok(score.score > 0.2);
  assert.equal(score.spectralDistanceDb, 4.5);
  assert.equal(score.harmonicDistanceDb, 3.5);
  assert.equal(score.rmsDeltaDb, 2);
});

test("installed AU selection prefers native UADx AU references for exact pilot matches", () => {
  const target = defaultEmulationPilotTargets.find((entry) => entry.id === "uad-pultec-eqp-1a");
  const selected = selectInstalledAuPlugin(
    [
      {
        id: "vst3:pultec",
        format: "vst3",
        displayName: "UAD Pultec EQP-1A",
        normalizedName: "pultec eqp 1a",
        path: "/Library/Audio/Plug-Ins/VST3/UAD Pultec EQP-1A.vst3"
      },
      {
        id: "au:pultec",
        format: "au",
        displayName: "UAD Pultec EQP-1A",
        normalizedName: "pultec eqp 1a",
        productKey: "pultec eqp 1a",
        runtimeKind: "uad-dsp",
        path: "/Library/Audio/Plug-Ins/Components/UAD Pultec EQP-1A.component"
      },
      {
        id: "au:pultec-uadx",
        format: "au",
        displayName: "uaudio_pultec_eqp-1a",
        normalizedName: "pultec eqp 1a",
        productKey: "pultec eqp 1a",
        runtimeKind: "uadx-native",
        path: "/Library/Audio/Plug-Ins/Components/uaudio_pultec_eqp-1a.component"
      }
    ],
    target
  );

  assert.equal(selected?.id, "au:pultec-uadx");
});
