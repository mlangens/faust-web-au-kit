import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTypeCoverage } from "../../tools/check-type-coverage.mjs";

test("type coverage policy tracks every framework JS module", () => {
  const result = evaluateTypeCoverage();

  assert.deepEqual(result.missingCoverage, []);
  assert.deepEqual(result.staleExemptions, []);
  assert.deepEqual(result.redundantExemptions, []);
  assert.deepEqual(result.emptyReasons, []);
  assert.ok(result.typeCheckedFiles.length > 0);
});
