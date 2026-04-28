#!/usr/bin/env node
// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEmulationPilots } from "./lib/emulation-assembler-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string[]} argv
 * @returns {Record<string, string | boolean | string[]>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean | string[]>} */
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    let value = /** @type {string | boolean} */ (true);
    if (typeof next === "string" && !next.startsWith("--")) {
      index += 1;
      value = next;
    }
    if (args[key]) {
      const existing = Array.isArray(args[key]) ? args[key] : [String(args[key])];
      existing.push(String(value));
      args[key] = existing;
    } else {
      args[key] = value;
    }
  }
  return args;
}

/**
 * @param {string | boolean | string[] | undefined} value
 * @returns {string[]}
 */
function listArg(value) {
  if (!value || value === true) {
    return [];
  }
  return (Array.isArray(value) ? value : String(value).split(",")).map((entry) => entry.trim()).filter(Boolean);
}

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(root, String(args.out ?? args.output ?? "generated/profiling/emulation-pilots"));
const report = await runEmulationPilots({
  candidateLimit: args["candidate-limit"] ? Number(args["candidate-limit"]) : undefined,
  outputDir,
  root,
  renderMethod: typeof args["render-method"] === "string" ? args["render-method"] : undefined,
  signalLimit: args["signal-limit"] ? Number(args["signal-limit"]) : undefined,
  stateLimit: args["state-limit"] ? Number(args["state-limit"]) : undefined,
  targetIds: listArg(args.target),
  tailSeconds: args.tail ? Number(args.tail) : undefined
});

console.log(JSON.stringify(report, null, 2));
