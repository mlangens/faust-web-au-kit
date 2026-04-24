import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAudio,
  createNativeHostRequest,
  createSonicFixture,
  evaluateAssertion,
  resolveSonicStages
} from "../../tools/lib/sonic-stage-tools.mjs";
import { loadProjectRuntime } from "../../tools/lib/project-tools.mjs";

test("sonic fixtures are deterministic and produce analyzable audio", () => {
  const left = createSonicFixture({ kind: "pink-noise", seconds: 0.1, seed: 42 }, { sampleRate: 8000 });
  const right = createSonicFixture({ kind: "pink-noise", seconds: 0.1, seed: 42 }, { sampleRate: 8000 });
  const metrics = analyzeAudio(left);

  assert.deepEqual([...left.channels[0].slice(0, 16)], [...right.channels[0].slice(0, 16)]);
  assert.equal(metrics.nanSamples, 0);
  assert.equal(metrics.infSamples, 0);
  assert.ok(Number.isFinite(metrics.rmsDb));
  assert.ok(Number.isFinite(metrics["bandEnergyDb.presence"]));
});

test("sonic fixture catalog covers technical and program-like staging inputs", () => {
  const fixtureKinds = [
    "sine",
    "two-tone",
    "imd-two-tone",
    "sweep",
    "stepped-sine",
    "impulse",
    "step",
    "tone-burst",
    "pulse-train",
    "white-noise",
    "pink-noise",
    "brown-noise",
    "multitone",
    "drum-loop",
    "bass-loop",
    "vocal-sibilance",
    "stereo-ambience"
  ];

  for (const kind of fixtureKinds) {
    const audio = createSonicFixture({ kind, seconds: 0.08, amplitude: 0.25, seed: 123 }, { sampleRate: 8000 });
    const metrics = analyzeAudio(audio);

    assert.equal(audio.channels.length, 2, `${kind} should render stereo by default`);
    assert.ok(audio.channels[0].length > 0, `${kind} should render frames`);
    assert.equal(metrics.nanSamples, 0, `${kind} should not generate NaN samples`);
    assert.equal(metrics.infSamples, 0, `${kind} should not generate infinite samples`);
  }
});

test("sonic assertions compare absolute metrics and render deltas", () => {
  const renders = new Map([
    [
      "baseline",
      {
        id: "baseline",
        metrics: {
          peakDb: -3,
          "bandEnergyDb.presence": -40
        }
      }
    ],
    [
      "feature",
      {
        id: "feature",
        metrics: {
          peakDb: -2,
          "bandEnergyDb.presence": -34
        }
      }
    ]
  ]);

  assert.equal(evaluateAssertion({ render: "feature", metric: "peakDb", lte: 0 }, renders).passed, true);
  assert.equal(
    evaluateAssertion(
      { render: "feature", metric: "bandEnergyDb.presence", reference: "baseline", minDelta: 2 },
      renders
    ).passed,
    true
  );
  assert.equal(
    evaluateAssertion(
      { render: "feature", metric: "bandEnergyDb.presence", reference: "baseline", minDelta: 8 },
      renders
    ).passed,
    false
  );
});

test("sonic stage resolution adds framework smoke and native host request metadata", () => {
  const runtime = loadProjectRuntime(["--app", "headroom"]);
  const stages = resolveSonicStages(runtime);
  const request = createNativeHostRequest(runtime, stages, "vst3");

  assert.equal(stages[0].id, "framework-smoke");
  assert.ok(stages.some((stage) => stage.id === "ceiling-clamps-peaks"));
  assert.equal(request.appKey, "headroom");
  assert.match(request.artifacts.vst3, /Headroom\.vst3$/);
  assert.ok(request.stages.length >= 2);
});
