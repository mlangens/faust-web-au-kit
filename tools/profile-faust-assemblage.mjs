#!/usr/bin/env node
// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import { profileFaustAssemblage } from "./lib/faust-profiling-tools.mjs";

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
const appKey = String(args.app ?? "limiter-lab");
const outputDir = path.resolve(root, String(args.out ?? args.output ?? `generated/profiling/faust/${appKey}`));
const report = await profileFaustAssemblage({
  appKey,
  outputDir,
  root,
  signalLimit: args["signal-limit"] ? Number(args["signal-limit"]) : undefined,
  tailSeconds: args.tail ? Number(args.tail) : undefined
});

console.log(JSON.stringify(report, null, 2));
