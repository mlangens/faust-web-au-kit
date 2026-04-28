#!/usr/bin/env node
// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createUadPluginProfile } from "./lib/uad-plugin-profiler-tools.mjs";

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
const outputDir = path.resolve(root, String(args.out ?? args.output ?? "generated/profiling/uad"));
const render = Boolean(args.render);
const report = createUadPluginProfile({
  auHost: args["no-au-host"] !== true,
  formatFilter: listArg(args.format),
  limit: args.limit ? Number(args.limit) : undefined,
  outputDir,
  pluginFilter: listArg(args.plugin),
  preferProducts: args["prefer-products"] === true,
  parameterOverrides: listArg(args.set),
  render,
  renderCommand: typeof args["render-command"] === "string" ? args["render-command"] : process.env.FWAK_PROFILE_RENDER_COMMAND,
  renderLimit: args["render-limit"] ? Number(args["render-limit"]) : undefined,
  renderMethod: typeof args["render-method"] === "string" ? args["render-method"] : undefined,
  root,
  runtimeFilter: listArg(args.runtime),
  signalLimit: args["signal-limit"] ? Number(args["signal-limit"]) : undefined
});

console.log(JSON.stringify(report, null, 2));
