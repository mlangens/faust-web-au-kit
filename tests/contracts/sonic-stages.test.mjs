import assert from "node:assert/strict";
import test from "node:test";

import { resolveSonicStages, validateSonicStage } from "../../tools/lib/sonic-stage-tools.mjs";
import { loadSuiteRuntime } from "../../tools/lib/project-tools.mjs";
import { loadGeneratedProject } from "../support/generated-projects.mjs";

function manifestControls(runtime) {
  return loadGeneratedProject(runtime.appKey).faustControls.map((control, index) => ({
    type: "hslider",
    label: control.label,
    address: control.address,
    index
  }));
}

test("framework studio declares feature-level sonic stages for every active app", () => {
  const suite = loadSuiteRuntime(["--suite", "framework-studio"]);

  assert.deepEqual(suite.apps.map((runtime) => runtime.appKey), ["omniplugin", "fet-76", "pulse-pad", "limiter-lab"]);
  for (const runtime of suite.apps) {
    const declaredStages = runtime.project.sonicStages ?? [];
    const stages = resolveSonicStages(runtime);
    const controls = manifestControls(runtime);
    const featureStages = stages.filter((stage) => stage.id !== "framework-smoke");

    assert.ok(declaredStages.length > 0, `${runtime.appKey} should declare at least one feature sonic stage`);
    assert.equal(stages[0].id, "framework-smoke", `${runtime.appKey} should inherit the framework smoke stage`);
    assert.ok(featureStages.length > 0, `${runtime.appKey} should expose a feature behavior stage`);

    for (const stage of stages) {
      assert.deepEqual(validateSonicStage(runtime, stage, controls), [], `${runtime.appKey}/${stage.id} should validate`);
      assert.ok(stage.fixture, `${runtime.appKey}/${stage.id} should declare a fixture`);
      if (stage.id === "framework-smoke") {
        assert.ok(stage.renders.some((render) => render.id === "baseline"), `${runtime.appKey}/${stage.id} should have a baseline render`);
      } else {
        assert.ok(stage.renders.length >= 2, `${runtime.appKey}/${stage.id} should compare at least two feature states`);
      }
      assert.ok(stage.assertions.some((assertion) => assertion.metric === "nanSamples"), `${runtime.appKey}/${stage.id} should guard invalid samples`);
    }

    for (const stage of featureStages) {
      assert.ok(
        stage.assertions.some((assertion) => assertion.reference === "baseline" || assertion.metric !== "nanSamples"),
        `${runtime.appKey}/${stage.id} should assert sonic behavior beyond invalid-sample smoke`
      );
    }
  }
});

test("sonic smoke profile limits execution to fast framework stages", () => {
  const suite = loadSuiteRuntime(["--suite", "framework-studio"]);

  for (const runtime of suite.apps) {
    const stages = resolveSonicStages(runtime, { profile: "smoke" });
    assert.deepEqual(stages.map((stage) => stage.id), ["framework-smoke"]);
  }
});
