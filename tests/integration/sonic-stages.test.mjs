import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function createScratchWorkspace(appKey) {
  const scratchParent = path.join(root, "test-results");
  fs.mkdirSync(scratchParent, { recursive: true });
  const scratchRoot = fs.mkdtempSync(path.join(scratchParent, "sonic-stage."));
  const workspaceFile = path.join(scratchRoot, "workspace.json");
  const generatedRoot = path.join(scratchRoot, "generated");
  const generatedApps = path.join(generatedRoot, "apps");

  fs.writeFileSync(
    workspaceFile,
    `${JSON.stringify({
      schemaVersion: 1,
      name: "sonic-stage-scratch",
      version: "0.0.0",
      defaultApp: appKey,
      paths: {
        generatedRoot,
        generatedApps,
        buildApps: path.join(scratchRoot, "build", "apps"),
        distApps: path.join(scratchRoot, "dist", "apps")
      },
      apps: [
        {
          key: appKey,
          name: appKey,
          manifest: `apps/${appKey}/project.json`
        }
      ]
    }, null, 2)}\n`
  );

  return { scratchRoot, workspaceFile, generatedApps };
}

async function runSonic(args, options = {}) {
  return execFileAsync(process.execPath, ["./tools/run-sonic-stages.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    ...options
  });
}

test("sonic stage runner renders deterministic DSP smoke and writes a report", { timeout: 180000 }, async () => {
  const appKey = "pocket-cut";
  const { scratchRoot, workspaceFile, generatedApps } = createScratchWorkspace(appKey);

  try {
    await runSonic(["--workspace", workspaceFile, "--app", appKey, "--profile", "smoke", "--format", "json"]);

    const reportPath = path.join(generatedApps, appKey, "sonic-report.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

    assert.equal(report.appKey, appKey);
    assert.equal(report.mode, "cpp-direct");
    assert.equal(report.passed, true);
    assert.deepEqual(report.stages.map((stage) => stage.id), ["framework-smoke"]);
    assert.ok(report.stages[0].renders[0].metrics.frames > 0);
    assert.equal(report.stages[0].renders[0].metrics.nanSamples, 0);
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("native sonic plan writes agent-observable host and screenshot contracts", { timeout: 120000 }, async () => {
  const appKey = "seed-tone";
  const { scratchRoot, workspaceFile, generatedApps } = createScratchWorkspace(appKey);

  try {
    await runSonic(["--workspace", workspaceFile, "--app", appKey, "--profile", "smoke", "--mode", "vst3", "--dry-run"]);

    const outputDir = path.join(generatedApps, appKey);
    const request = JSON.parse(fs.readFileSync(path.join(outputDir, "sonic-host-request.json"), "utf8"));
    const session = JSON.parse(fs.readFileSync(path.join(outputDir, "sonic-agent-session.json"), "utf8"));
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, "sonic-report.json"), "utf8"));

    assert.equal(request.mode, "vst3");
    assert.match(request.artifacts.vst3, /SeedTone\.vst3$/);
    assert.equal(session.requestFile, path.join(outputDir, "sonic-host-request.json"));
    assert.deepEqual(
      session.screenshotTargets.map((target) => target.id),
      ["web-preview", "standalone-plugin", "vst3-host"]
    );
    assert.equal(report.passed, true);
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});
