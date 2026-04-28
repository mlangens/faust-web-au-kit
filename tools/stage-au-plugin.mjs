#!/usr/bin/env node
// @ts-check

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const args = parseArgs(process.argv.slice(2));
const name = typeof args.name === "string" ? args.name : "";
if (!name || args["allow-gui"] !== true) {
  console.error("Usage: npm run stage:au-plugin -- --allow-gui --name <component name> [--exact] [--seconds N]");
  console.error("This command intentionally opens an Audio Unit editor window. Profiling commands remain headless.");
  process.exit(1);
}

const outputDir = path.resolve(root, String(args.out ?? "generated/profiling/au-gui-stage"));
const binaryPath = path.join(outputDir, "stage-au-gui-host");
fs.mkdirSync(outputDir, { recursive: true });
execFileSync(
  "clang",
  [
    "-fobjc-arc",
    "-O2",
    path.join(root, "src", "stage_au_gui_host.m"),
    "-framework",
    "AudioToolbox",
    "-framework",
    "AudioUnit",
    "-framework",
    "Cocoa",
    "-framework",
    "CoreFoundation",
    "-framework",
    "Foundation",
    "-o",
    binaryPath
  ],
  { cwd: root, stdio: "inherit" }
);

const child = spawn(
  binaryPath,
  [
    "--name",
    name,
    ...(args.exact === true ? ["--exact"] : []),
    ...(args.seconds ? ["--seconds", String(args.seconds)] : [])
  ],
  {
    cwd: root,
    detached: args.detach === true,
    stdio: args.detach === true ? "ignore" : "inherit"
  }
);

if (args.detach === true) {
  child.unref();
  console.log(JSON.stringify({ ok: true, detached: true, pid: child.pid, binaryPath }, null, 2));
} else {
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}
