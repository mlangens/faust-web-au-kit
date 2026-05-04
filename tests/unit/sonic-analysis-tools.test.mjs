import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRenderEngagement,
  summarizePluginEngagement
} from "../../tools/lib/sonic-analysis-tools.mjs";

function comparison({ normalizedError, correlation, referenceRmsDb = -18, candidateRmsDb = -18, candidatePeakDb = -6 }) {
  return {
    frameDelta: 0,
    comparison: {
      normalizedError,
      correlation,
      rmsErrorDb: -60
    },
    reference: {
      mono: {
        rmsDb: referenceRmsDb
      }
    },
    candidate: {
      mono: {
        rmsDb: candidateRmsDb,
        peakDb: candidatePeakDb
      }
    }
  };
}

test("render engagement flags transformed audio versus dry passthrough", () => {
  const engaged = assessRenderEngagement(comparison({
    normalizedError: 0.22,
    correlation: 0.93,
    candidateRmsDb: -20
  }), { signalId: "program" });
  const passthrough = assessRenderEngagement(comparison({
    normalizedError: 0.0001,
    correlation: 0.99999,
    candidateRmsDb: -18
  }), { signalId: "program" });

  assert.equal(engaged.status, "engaged");
  assert.equal(engaged.needsLicensingCheck, false);
  assert.equal(passthrough.status, "no-transform");
  assert.equal(passthrough.needsLicensingCheck, true);
  assert.deepEqual(passthrough.flags, ["likely-passthrough"]);
});

test("render engagement distinguishes silent output and silent probes", () => {
  const silentOutput = assessRenderEngagement(comparison({
    normalizedError: 1,
    correlation: 0,
    referenceRmsDb: -18,
    candidateRmsDb: -140,
    candidatePeakDb: -140
  }), { signalId: "program" });
  const inputSilent = assessRenderEngagement(comparison({
    normalizedError: 0,
    correlation: 0,
    referenceRmsDb: -240,
    candidateRmsDb: -240,
    candidatePeakDb: -240
  }), { signalId: "silence-noise-floor" });

  assert.equal(silentOutput.status, "silent-output");
  assert.equal(silentOutput.needsLicensingCheck, true);
  assert.equal(inputSilent.status, "input-silent");
  assert.equal(inputSilent.needsLicensingCheck, false);
});

test("plugin engagement summary escalates likely licensing failures", () => {
  const summaries = summarizePluginEngagement([
    {
      pluginId: "au:dry",
      pluginName: "Dry Plugin",
      engagement: assessRenderEngagement(comparison({
        normalizedError: 0,
        correlation: 1
      }), { signalId: "program" })
    },
    {
      pluginId: "au:wet",
      pluginName: "Wet Plugin",
      engagement: assessRenderEngagement(comparison({
        normalizedError: 0.4,
        correlation: 0.8
      }), { signalId: "program" })
    }
  ]);

  const dry = summaries.find((entry) => entry.pluginId === "au:dry");
  const wet = summaries.find((entry) => entry.pluginId === "au:wet");

  assert.equal(dry?.status, "likely-no-transform");
  assert.equal(dry?.needsLicensingCheck, true);
  assert.equal(wet?.status, "engaged");
  assert.equal(wet?.needsLicensingCheck, false);
});
