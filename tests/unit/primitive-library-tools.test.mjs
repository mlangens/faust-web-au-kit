import assert from "node:assert/strict";
import test from "node:test";

import { loadProjectRuntime } from "../../tools/lib/project-tools.mjs";
import {
  loadPrimitiveLibrary,
  resolveProjectPrimitiveIds,
  resolveProjectPrimitiveSet
} from "../../tools/lib/primitive-library-tools.mjs";

test("audio primitive library keeps every mapped primitive resolvable", () => {
  const library = loadPrimitiveLibrary();
  const primitiveIds = new Set(Object.keys(library.primitives ?? {}));

  assert.ok(primitiveIds.has("eq.parametric-band"));
  assert.ok(primitiveIds.has("compression.feedforward-sidechain"));
  assert.ok(primitiveIds.has("saturation.memoryless-waveshaper"));

  for (const map of [library.variantPrimitiveMap, library.categoryPrimitiveMap, library.productPrimitiveMap]) {
    for (const [key, ids] of Object.entries(map ?? {})) {
      assert.ok(Array.isArray(ids), `${key} should map to primitive ids`);
      ids.forEach((id) => assert.ok(primitiveIds.has(id), `${key} references unknown primitive ${id}`));
    }
  }
});

test("suite products resolve EQ, compression, and saturation primitive assemblages", () => {
  const library = loadPrimitiveLibrary();
  const atlasIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "atlas-curve"]), library);
  const pressIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "press-deck"]), library);
  const emberIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "ember-drive"]), library);
  const limiterIds = resolveProjectPrimitiveIds(loadProjectRuntime(["--app", "limiter-lab"]), library);

  assert.deepEqual(atlasIds, ["eq.parametric-band", "eq.dynamic-band"]);
  assert.deepEqual(pressIds, ["compression.feedforward-sidechain", "compression.detector-ballistics"]);
  assert.deepEqual(
    emberIds,
    [
      "eq.filterbank-crossover",
      "saturation.multiband-drive",
      "saturation.antialiasing-strategy",
      "saturation.virtual-analog-stage"
    ]
  );
  assert.ok(limiterIds.includes("compression.feedforward-sidechain"));
  assert.ok(limiterIds.includes("saturation.memoryless-waveshaper"));
});

test("resolved primitive sets expose agentic design notes and analysis probes", () => {
  const primitiveSet = resolveProjectPrimitiveSet(loadProjectRuntime(["--app", "split-stack"]));

  assert.equal(primitiveSet.library.id, "fwak-audio-primitives");
  assert.ok(primitiveSet.library.researchSources.length >= 3);
  assert.ok(primitiveSet.primitiveIds.includes("compression.multiband-dynamics"));
  assert.ok(primitiveSet.primitives["compression.multiband-dynamics"]?.analysisProbes?.includes("per-band gain trace"));
  assert.ok(primitiveSet.primitives["eq.filterbank-crossover"]?.agentDesignNotes?.length);
});
