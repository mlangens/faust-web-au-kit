import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProbeSignalSet,
  loadProbeSignalCorpus,
  readWavAsFloat32,
  resolveProbeSignalIdsForPrimitives
} from "../../tools/lib/probe-signal-tools.mjs";
import { analyzeWavFile } from "../../tools/lib/sonic-analysis-tools.mjs";

test("probe signal corpus resolves primitive assemblages into competent signal coverage", () => {
  const corpus = loadProbeSignalCorpus();
  const signalIds = resolveProbeSignalIdsForPrimitives(corpus, [
    "tape.magnetic-recorder-stage",
    "compression.vintage-compressor-model",
    "phase.all-pass-alignment-network"
  ]);

  assert.ok(signalIds.includes("silence-noise-floor"));
  assert.ok(signalIds.includes("low-sweep-head-bump"));
  assert.ok(signalIds.includes("steady-sine-wow-flutter"));
  assert.ok(signalIds.includes("tone-burst-train"));
  assert.ok(signalIds.includes("phase-null-sweep"));
  assert.ok(signalIds.includes("musical-drum-bass-loop"));
});

test("probe signal generator writes readable float WAVs and analysis reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-probes-"));
  const manifest = createProbeSignalSet({
    outputDir: tempDir,
    signalIds: ["stepped-sine-level-sweep", "phase-null-sweep", "silence-noise-floor"],
    sampleRate: 16000,
    channels: 2
  });

  assert.equal(manifest.signals?.length, 3);
  assert.ok(fs.existsSync(path.join(tempDir, "probe-manifest.json")));

  const stepped = readWavAsFloat32(path.join(tempDir, "stepped-sine-level-sweep.wav"));
  assert.equal(stepped.sampleRate, 16000);
  assert.equal(stepped.channels, 2);
  assert.ok(stepped.frames > 0);

  const analysis = analyzeWavFile(path.join(tempDir, "stepped-sine-level-sweep.wav"), {
    signalId: "stepped-sine-level-sweep",
    signalDefinition: { generator: "stepped-sine", frequencyHz: 1000 }
  });
  assert.equal(analysis.signalId, "stepped-sine-level-sweep");
  assert.ok(Number(analysis.mono?.rms ?? 0) > 0);
  assert.ok(Number(analysis.harmonicFingerprint?.h1 ?? -240) > -80);
});
