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
    fs.readdirSync(scratchDirRoot).filter((entry) => entry.startsWith(`.${path.basename(loadGeneratedProject().runtime.outputDir)}.export-`))
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

  assert.equal(schema.project.key, runtime.appKey);
  assert.ok(Array.isArray(faustUi.ui));
  assert.ok(schema.controls.length > 0);
  assert.equal(fs.existsSync(path.join(runtime.generatedRootDir, "workspace_manifest.json")), true);

  const scratchDirsAfter = new Set(
    fs.readdirSync(scratchDirRoot).filter((entry) => entry.startsWith(`.${path.basename(runtime.outputDir)}.export-`))
  );
  assert.deepEqual(scratchDirsAfter, scratchDirsBefore);
});

test("native export profile skips non-native sidecar targets while keeping schema outputs", { timeout: 120000 }, async () => {
  const scratchRoot = fs.mkdtempSync(path.join(path.dirname(loadGeneratedProject().runtime.outputDir), "native-export-profile."));
  const workspaceFile = path.join(scratchRoot, "workspace.json");
  const generatedRoot = path.join(scratchRoot, "generated");
  const generatedApps = path.join(generatedRoot, "apps");
  const buildApps = path.join(scratchRoot, "build", "apps");
  const distApps = path.join(scratchRoot, "dist", "apps");

  fs.writeFileSync(
    workspaceFile,
    `${JSON.stringify({
      schemaVersion: 1,
      name: "native-export-profile",
      version: "0.0.0",
      defaultApp: "seed-tone",
      paths: {
        generatedRoot,
        generatedApps,
        buildApps,
        distApps
      },
      apps: [
        {
          key: "seed-tone",
          name: "Seed Tone",
          manifest: "apps/seed-tone/project.json"
        }
      ]
    }, null, 2)}\n`
  );

  try {
    await runExport(["--workspace", workspaceFile, "--app", "seed-tone", "--export-profile", "native"]);

    const outputDir = path.join(generatedApps, "seed-tone");
    const targetDir = path.join(outputDir, "targets");

    assert.equal(fs.existsSync(path.join(targetDir, "main.c")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "main.hpp")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "main.ui.json")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "ui_schema.json")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "main.wast")), false);
    assert.equal(fs.existsSync(path.join(targetDir, "main.wasm")), false);
    assert.equal(fs.existsSync(path.join(targetDir, "main.cmajor")), false);
    assert.equal(fs.existsSync(path.join(targetDir, "main.rs")), false);
    assert.equal(fs.existsSync(path.join(generatedRoot, "workspace_manifest.json")), true);
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});
