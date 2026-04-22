import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function runExport(args = []) {
  await execFileAsync(process.execPath, ["./tools/export-targets.mjs", ...args], {
    cwd: root
  });
}

async function runPrepare() {
  await execFileAsync(process.execPath, ["./tools/prepare-test-artifacts.mjs"], {
    cwd: root
  });
}

function createScratchWorkspace(appKeys) {
  const scratchRoot = fs.mkdtempSync(path.join(path.dirname(loadGeneratedProject().runtime.outputDir), "native-manifest."));
  const workspaceFile = path.join(scratchRoot, "workspace.json");
  const generatedRoot = path.join(scratchRoot, "generated");
  const generatedApps = path.join(generatedRoot, "apps");
  const buildApps = path.join(scratchRoot, "build", "apps");
  const distApps = path.join(scratchRoot, "dist", "apps");

  fs.writeFileSync(
    workspaceFile,
    `${JSON.stringify({
      schemaVersion: 1,
      name: "native-manifest-scratch",
      version: "0.0.0",
      defaultApp: appKeys[0],
      paths: {
        generatedRoot,
        generatedApps,
        buildApps,
        distApps
      },
      apps: appKeys.map((key) => ({
        key,
        name: key,
        manifest: `apps/${key}/project.json`
      }))
    }, null, 2)}\n`
  );

  return { scratchRoot, workspaceFile, generatedApps };
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

test("native ui manifests carry hero status, enum labels, and toggle display labels", { timeout: 120000 }, async () => {
  const { scratchRoot, workspaceFile, generatedApps } = createScratchWorkspace(["pulse-pad", "mirror-field", "limiter-lab"]);

  try {
    for (const appKey of ["pulse-pad", "mirror-field", "limiter-lab"]) {
      await runExport(["--workspace", workspaceFile, "--app", appKey, "--export-profile", "native"]);
    }

    const pulseHeader = fs.readFileSync(path.join(generatedApps, "pulse-pad", "ui_manifest.h"), "utf8");
    const mirrorHeader = fs.readFileSync(path.join(generatedApps, "mirror-field", "ui_manifest.h"), "utf8");
    const limiterHeader = fs.readFileSync(path.join(generatedApps, "limiter-lab", "ui_manifest.h"), "utf8");

    assert.match(
      pulseHeader,
      /#define FWAK_STATUS_TEXT "Compact morph synth with texture-led oscillator color, contour sweep, stereo motion, and drive-aware output in the shared Northline instrument shell\."/
    );
    assert.equal(
      pulseHeader.includes("MIDI-ready synth voice with morphable oscillators, contour sweep, stereo drift, and drive-aware band activity."),
      false
    );
    assert.equal(pulseHeader.includes("\"Idle\", \"Held\", 0, 0u"), true);

    assert.equal(mirrorHeader.includes("FWAK_PARAM_ENUM_LABELS_"), true);
    assert.equal(mirrorHeader.includes("\"Mono\""), true);
    assert.equal(mirrorHeader.includes("\"Stack\""), true);
    assert.equal(mirrorHeader.includes("\"Orbit\""), true);

    assert.equal(limiterHeader.includes("\"Modern\", \"Vintage\", 0, 0u"), true);
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("prepare-test-artifacts refreshes the workspace manifest and Pulse Pad parity schema", { timeout: 360000 }, async () => {
  await runPrepare();

  const workspace = loadGeneratedWorkspace();
  const { schema } = loadGeneratedProject("pulse-pad");

  assert.ok(Array.isArray(workspace.apps));
  assert.ok(workspace.apps.some((app) => app.key === "pulse-pad"));
  assert.equal(schema.project.key, "pulse-pad");
  assert.equal(schema.ui.catalog?.productId, "pulse-pad");
  assert.deepEqual(
    schema.ui.surfacePresetIds,
    ["oscillator-stack", "filter-canvas", "module-rack", "modulation-dock", "keyboard-strip"]
  );
  assert.equal(schema.ui.preview?.surfaces?.["filter-canvas"]?.bands?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["modulation-dock"]?.slots?.length, 4);
  assert.equal(schema.ui.preview?.surfaces?.["keyboard-strip"]?.keys?.length, 8);
});
