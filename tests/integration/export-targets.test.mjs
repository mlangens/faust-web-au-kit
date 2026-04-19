import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { loadGeneratedProject } from "../support/generated-projects.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function runExport(args = []) {
  await execFileAsync(process.execPath, ["./tools/export-targets.mjs", ...args], {
    cwd: root
  });
}

test("concurrent default exports finish cleanly and leave stable generated artifacts", { timeout: 120000 }, async () => {
  const scratchDirRoot = path.dirname(loadGeneratedProject().runtime.outputDir);
  const scratchDirsBefore = new Set(
    fs.readdirSync(scratchDirRoot).filter((entry) => entry.startsWith(".generated.export-"))
  );

  await Promise.all([runExport(), runExport()]);

  const { runtime, schema, faustUi } = loadGeneratedProject();
  const artifactFiles = [
    path.join(runtime.outputDir, "project_config.h"),
    path.join(runtime.outputDir, "project_config.cmake"),
    path.join(runtime.outputDir, "ui_manifest.h"),
    path.join(runtime.outputDir, "ui_schema.json"),
    path.join(runtime.targetDir, `${runtime.sourceBase}.c`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.hpp`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.wast`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.wasm`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.cmajor`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.rs`),
    path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`)
  ];

  for (const artifactPath of artifactFiles) {
    assert.equal(fs.existsSync(artifactPath), true, `${artifactPath} should exist after concurrent export`);
    assert.ok(fs.statSync(artifactPath).size > 0, `${artifactPath} should not be empty after concurrent export`);
  }

  assert.equal(schema.project.key, runtime.projectKey);
  assert.ok(Array.isArray(faustUi.ui));
  assert.ok(schema.controls.length > 0);

  const scratchDirsAfter = new Set(
    fs.readdirSync(scratchDirRoot).filter((entry) => entry.startsWith(`.${path.basename(runtime.outputDir)}.export-`))
  );
  assert.deepEqual(scratchDirsAfter, scratchDirsBefore);
});
