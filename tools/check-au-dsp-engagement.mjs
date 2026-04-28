#!/usr/bin/env node
// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeFileAtomically } from "./lib/fs-tools.mjs";
import { createProbeSignalSet } from "./lib/probe-signal-tools.mjs";
import { compareWavFiles, writeAnalysisReport } from "./lib/sonic-analysis-tools.mjs";
import { compileAuProfileHost, listAuHostComponents } from "./lib/uad-plugin-profiler-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (typeof next === "string" && !next.startsWith("--")) {
      index += 1;
      args[key] = next;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/**
 * @param {string} component
 * @returns {string}
 */
function slugify(component) {
  return component.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "component";
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function parameterArgs(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * @param {Record<string, unknown>} comparisonReport
 * @returns {{ normalizedError: number, correlation: number, engaged: boolean }}
 */
function engagementMetrics(comparisonReport) {
  const comparison = /** @type {Record<string, unknown>} */ (comparisonReport.comparison ?? {});
  const normalizedError = Number(comparison.normalizedError ?? 0);
  const correlation = Number(comparison.correlation ?? 1);
  return {
    normalizedError,
    correlation,
    engaged: normalizedError > 0.000001
  };
}

/**
 * @param {string} binaryPath
 * @returns {{ ok: boolean, command: string, linkedFrameworks: string[], forbiddenFrameworks: string[], stdout: string, stderr: string, status: number | null }}
 */
function auditHeadlessBinary(binaryPath) {
  const result = spawnSync("otool", ["-L", binaryPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const stdout = result.stdout ?? "";
  const linkedFrameworks = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes(".framework/"))
    .map((line) => line.split(/\s+/u)[0] ?? line);
  const forbiddenFrameworks = linkedFrameworks.filter((line) =>
    /\/(?:AppKit|Cocoa|WebKit)\.framework\//u.test(line)
  );
  return {
    ok: result.status === 0 && forbiddenFrameworks.length === 0,
    command: `otool -L ${binaryPath}`,
    linkedFrameworks,
    forbiddenFrameworks,
    stdout,
    stderr: result.stderr ?? "",
    status: result.status
  };
}

/**
 * @param {string} command
 * @returns {boolean}
 */
function commandExists(command) {
  return spawnSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

/**
 * @param {unknown} value
 * @returns {Array<Record<string, unknown>>}
 */
function componentArray(value) {
  return Array.isArray(value) ? /** @type {Array<Record<string, unknown>>} */ (value) : [];
}

/**
 * @param {Array<Record<string, unknown>>} components
 * @param {{ component: string, exact?: boolean }} fixture
 * @returns {{ name: string, type: string, subtype: string, manufacturer: string } | null}
 */
function findComponentIdentity(components, fixture) {
  const match = components.find((component) => {
    const name = String(component.name ?? "");
    return fixture.exact ? name === fixture.component : name.toLowerCase().includes(fixture.component.toLowerCase());
  });
  if (!match) {
    return null;
  }
  return {
    name: String(match.name ?? fixture.component),
    type: String(match.type ?? ""),
    subtype: String(match.subtype ?? ""),
    manufacturer: String(match.manufacturer ?? "")
  };
}

/**
 * @param {{ id: string, component: string, exact?: boolean }} fixture
 * @param {Array<Record<string, unknown>>} components
 * @param {string} outputDir
 * @returns {Record<string, unknown>}
 */
function runAuvalValidation(fixture, components, outputDir) {
  const identity = findComponentIdentity(components, fixture);
  if (!identity) {
    return { ok: false, skipped: true, reason: "Component was not found in the AU inventory.", component: fixture.component };
  }
  const logPath = path.join(outputDir, `${slugify(fixture.id)}.auval.log`);
  const result = spawnSync("auval", ["-v", identity.type, identity.subtype, identity.manufacturer], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000
  });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeFileAtomically(logPath, log);
  return {
    ok: result.status === 0,
    command: `auval -v ${identity.type} ${identity.subtype} ${identity.manufacturer}`,
    component: identity,
    logPath,
    status: result.status,
    signal: result.signal ?? null,
    timedOut: result.error?.name === "ETIMEDOUT"
  };
}

/**
 * @param {{
 *   auHostPath: string,
 *   component: string,
 *   exact?: boolean,
 *   inputPath: string,
 *   outputPath: string,
 *   renderMethod: string,
 *   set?: string[]
 * }} options
 * @returns {{ ok: boolean, status: number | null, stdout: string, stderr: string }}
 */
function renderAu(options) {
  const result = spawnSync(
    options.auHostPath,
    [
      "--render",
      "--name",
      options.component,
      ...(options.exact ? ["--exact"] : []),
      "--render-method",
      options.renderMethod,
      "--input",
      options.inputPath,
      "--output",
      options.outputPath,
      "--tail",
      "0",
      ...(options.set ?? []).flatMap((entry) => ["--set", entry])
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

/**
 * @param {{
 *   auHostPath: string,
 *   component: string,
 *   exact?: boolean,
 *   inputPath: string,
 *   outputDir: string,
 *   renderMethods: string[],
 *   set?: string[]
 * }} options
 * @returns {Array<Record<string, unknown>>}
 */
function runFixture(options) {
  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  for (const renderMethod of options.renderMethods) {
    const outputPath = path.join(options.outputDir, `${slugify(options.component)}.${renderMethod}.wav`);
    const render = renderAu({
      auHostPath: options.auHostPath,
      component: options.component,
      exact: options.exact,
      inputPath: options.inputPath,
      outputPath,
      renderMethod,
      set: options.set
    });
    /** @type {Record<string, unknown>} */
    const entry = {
      component: options.component,
      exact: Boolean(options.exact),
      renderMethod,
      outputPath,
      render
    };
    if (render.ok && fs.existsSync(outputPath)) {
      const comparison = compareWavFiles(options.inputPath, outputPath);
      const metrics = engagementMetrics(comparison);
      const comparisonPath = outputPath.replace(/\.wav$/u, ".input-comparison.json");
      writeAnalysisReport(comparisonPath, { metrics, report: comparison });
      entry.metrics = metrics;
      entry.comparisonPath = comparisonPath;
    }
    results.push(entry);
  }
  return results;
}

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(root, String(args.out ?? "generated/profiling/au-dsp-engagement"));
const probesDir = path.join(outputDir, "probes");
fs.mkdirSync(outputDir, { recursive: true });
const auHostPath = compileAuProfileHost(root, outputDir);
const headlessAudit = auditHeadlessBinary(auHostPath);
const manifest = createProbeSignalSet({
  outputDir: probesDir,
  root,
  signalIds: ["log-sweep-fullband", "stepped-sine-level-sweep"]
});

const logSweepPath = path.join(probesDir, manifest.signals?.find((signal) => signal.id === "log-sweep-fullband")?.path ?? "log-sweep-fullband.wav");
const steppedPath = path.join(probesDir, manifest.signals?.find((signal) => signal.id === "stepped-sine-level-sweep")?.path ?? "stepped-sine-level-sweep.wav");
const renderMethods = ["callback", "process", "process-multiple"];
const auHostInventory = listAuHostComponents(auHostPath);
const auHostComponents = componentArray(auHostInventory.components);
const shouldRunAuval = args["skip-auval"] !== true && commandExists("auval");
const fixtures = [
  {
    id: "apple-lowpass",
    required: true,
    component: "Apple: AULowpass",
    exact: true,
    inputPath: logSweepPath,
    set: ["Cutoff Frequency=300", "Resonance=20"]
  },
  {
    id: "uad-1176-rev-a",
    required: false,
    component: "Universal Audio: UAD UA 1176 Rev A",
    exact: true,
    inputPath: steppedPath,
    set: ["Input=0.45", "Output=0.55", "Ratio=4", "Attack=0.8", "Release=0.8", "Power=1"]
  },
  {
    id: "uad-moog-filter",
    required: false,
    component: "Universal Audio: UAD Moog Multimode Filter",
    exact: true,
    inputPath: logSweepPath,
    set: ["Cutoff=0.1", "Resonance=0.8", "Bypass=0", "Mix=1", "Power=1"]
  }
];

const results = fixtures.map((fixture) => {
  const fixtureResult = {
    ...fixture,
    auval: shouldRunAuval
      ? runAuvalValidation(fixture, auHostComponents, outputDir)
      : { ok: false, skipped: true, reason: args["skip-auval"] === true ? "Skipped by --skip-auval." : "auval was not found on PATH." },
    results: runFixture({
      auHostPath,
      component: fixture.component,
      exact: fixture.exact,
      inputPath: fixture.inputPath,
      outputDir,
      renderMethods,
      set: fixture.set
    })
  };
  return fixtureResult;
});

/** @type {Array<Record<string, unknown>>} */
const requiredFailures = results.filter((fixture) => {
  if (!fixture.required) {
    return false;
  }
  return !fixture.results.some((result) => /** @type {Record<string, unknown>} */ (result.metrics ?? {}).engaged === true);
});
if (!headlessAudit.ok) {
  requiredFailures.push({
    id: "headless-binary-audit",
    required: true,
    component: "profile-au-host",
    results: [],
    failure: headlessAudit
  });
}

const report = {
  id: "fwak-au-dsp-engagement-check",
  generatedAt: new Date().toISOString(),
  mode: "headless-audio-unit-cli",
  uiStaging: false,
  auHostPath,
  headlessAudit,
  auval: {
    requested: args["skip-auval"] !== true,
    available: commandExists("auval")
  },
  outputDir,
  results,
  requiredFailures,
  ok: requiredFailures.length === 0
};

writeFileAtomically(path.join(outputDir, "au-dsp-engagement-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
