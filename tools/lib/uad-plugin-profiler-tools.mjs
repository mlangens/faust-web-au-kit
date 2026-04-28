// @ts-check

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPrimitiveLibrary } from "./primitive-library-tools.mjs";
import {
  createProbeSignalSet,
  loadProbeSignalCorpus,
  probeSignalDefinition,
  resolveProbeSignalIdsForPrimitives
} from "./probe-signal-tools.mjs";
import { analyzeWavFile, writeAnalysisReport } from "./sonic-analysis-tools.mjs";
import { writeFileAtomically } from "./fs-tools.mjs";

/**
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").UadPluginInventoryEntry} UadPluginInventoryEntry
 * @typedef {import("../../types/framework").UadPluginProfilePlanEntry} UadPluginProfilePlanEntry
 * @typedef {import("../../types/framework").UadPluginProfileReport} UadPluginProfileReport
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const auComponentDirs = [
  "/Library/Audio/Plug-Ins/Components",
  path.join(os.homedir(), "Library/Audio/Plug-Ins/Components")
];
const vst3Dirs = [
  "/Library/Audio/Plug-Ins/VST3",
  path.join(os.homedir(), "Library/Audio/Plug-Ins/VST3")
];

const primitiveRules = [
  {
    id: "phase.all-pass-alignment-network",
    pattern: /\b(ibp|little labs|phase|alignment)\b/u
  },
  {
    id: "tape.magnetic-recorder-stage",
    pattern: /\b(studer|ampex|atr|a800|oxide|tape|space echo|re-201|ep-34|fatso)\b/u
  },
  {
    id: "compression.vintage-compressor-model",
    pattern: /\b(1176(?:[a-z]+)?|la-2|la-2a|teletronix|fairchild|660|670|dbx|api 2500|ssl.*bus|g bus|distressor|variable mu|varimu|compressor|limiter|fatso|33609|cl 1b|tla-100|capitol compressor)\b/u
  },
  {
    id: "analog.preamp-console-stage",
    pattern: /\b(preamp|channel strip|console|610|6176|1073|1081|1084|88rs|api vision|api preamp|ssl e|century|voxbox|avalon|manley|helios|trident|harrison|ua 610)\b/u
  },
  {
    id: "eq.passive-vintage-program-eq",
    pattern: /\b(pultec|eqp|meq|hlf|massive passive|hitsville eq|bax|passive eq|program eq)\b/u
  },
  {
    id: "eq.circuit-model-topology",
    pattern: /\b(eq|equalizer|filter|harrison|trident|cambridge|tonelux|mdweq|oxford eq)\b/u
  },
  {
    id: "space.mechanical-room-reverb",
    pattern: /\b(reverb|plate|chamber|room|studio|ocean way|sound city|dreamverb|realverb|lexicon|emt|akg|bx20|reflection)\b/u
  },
  {
    id: "modulation.vintage-delay-modulation",
    pattern: /\b(chorus|flanger|doubler|dimension|delay|echo|brigade|ce-1|sdd|cooper|modulation|re-201|ep-34)\b/u
  },
  {
    id: "amp.cabinet-mic-chain",
    pattern: /\b(amp|cab|speaker|dream|ruby|woodrow|lion|fender|marshall|friedman|suhr|engl|ampeg|tweed|overdrive|tube screamer|ts808|raw distortion)\b/u
  },
  {
    id: "microphone.modeling-chain",
    pattern: /\b(mic|microphone|sphere|hemisphere|putnam|ocean way mic)\b/u
  },
  {
    id: "instrument.electromechanical-keyboard",
    pattern: /\b(ravel|electra|b-3|b3|waterfall|rotary|piano|organ|keys|wurlitzer|rhodes)\b/u
  },
  {
    id: "saturation.virtual-analog-stage",
    pattern: /\b(saturator|culture vulture|distortion|overdrive|tube|vsm|inflator|maximizer|enhancer)\b/u
  },
  {
    id: "compression.true-peak-limiter",
    pattern: /\b(precision limiter|maximizer|limiter)\b/u
  },
  {
    id: "metering.analysis-suite",
    pattern: /\b(meter|analyzer|topline key finder)\b/u
  }
];

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePluginName(value) {
  return value
    .replace(/\.(?:component|vst3)$/iu, "")
    .replace(/^uad\s+/iu, "")
    .replace(/^uaudio[_\s-]+/iu, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * Collapse bundle names, AU registry names, and marketing names into a product key.
 * This lets the profiler match `uaudio_ua_1176_rev_a.component` to the exact
 * `Universal Audio (UADx): UADx 1176 Rev A Compressor` Audio Unit.
 *
 * @param {string} value
 * @returns {string}
 */
function uadProductKey(value) {
  return String(value ?? "")
    .replace(/\.(?:component|vst3)$/iu, "")
    .replace(/^universal audio\s*(?:\(uadx\))?\s*:\s*/iu, "")
    .replace(/^uad\s+/iu, "")
    .replace(/^uadx\s+/iu, "")
    .replace(/^uaudio[_\s-]+/iu, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\b(?:compressor|limiter|equalizer|eq|synth|plugin|plug in)\b/giu, "")
    .replace(/^ua\s+(?=\d)/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} displayName
 * @param {string} pluginPath
 * @returns {"uadx-native" | "uad-dsp" | "unknown"}
 */
function classifyUadRuntime(displayName, pluginPath = "") {
  const value = `${displayName} ${pluginPath}`;
  if (/\bUADx\b/u.test(value) || /(?:^|[/\\])uaudio_/iu.test(pluginPath) || /^uaudio[_\s-]/iu.test(displayName)) {
    return "uadx-native";
  }
  if (/\bUAD\b/u.test(value) || /universal audio/iu.test(value)) {
    return "uad-dsp";
  }
  return "unknown";
}

/**
 * @param {UadPluginInventoryEntry | JsonObject} entry
 * @returns {number}
 */
function uadRuntimePriority(entry) {
  const runtimeKind = String(entry.runtimeKind ?? classifyUadRuntime(String(entry.displayName ?? entry.name ?? ""), String(entry.path ?? "")));
  if (runtimeKind === "uadx-native") {
    return 0;
  }
  if (runtimeKind === "uad-dsp") {
    return 2;
  }
  return 1;
}

/**
 * @param {UadPluginInventoryEntry | JsonObject} entry
 * @returns {number}
 */
function uadFormatPriority(entry) {
  return String(entry.format ?? "") === "au" ? 0 : 1;
}

/**
 * @param {UadPluginInventoryEntry} left
 * @param {UadPluginInventoryEntry} right
 * @returns {number}
 */
function compareUadProfilingPreference(left, right) {
  return String(left.productKey ?? "").localeCompare(String(right.productKey ?? ""))
    || uadRuntimePriority(left) - uadRuntimePriority(right)
    || uadFormatPriority(left) - uadFormatPriority(right)
    || left.displayName.localeCompare(right.displayName)
    || left.format.localeCompare(right.format);
}

/**
 * @param {string} value
 * @returns {string}
 */
function stableSlugHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

/**
 * @param {string} dir
 * @param {string} extension
 * @param {string[]} results
 */
function collectPluginBundles(dir, extension, results) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name.toLowerCase().endsWith(extension)) {
      results.push(absolute);
      continue;
    }
    if (entry.isDirectory() && !entry.name.toLowerCase().endsWith(".component") && !entry.name.toLowerCase().endsWith(".vst3")) {
      collectPluginBundles(absolute, extension, results);
    }
  }
}

/**
 * @param {string} basename
 * @returns {boolean}
 */
function isLikelyUadPlugin(basename) {
  return /(^uad\b|^uaudio|universal audio|\buad\b|1176|la-2a|teletronix|studer|ampex|pultec|fairchild|manley|neve|api|hitsville|capitol|galaxy|brigade|oxide|sphere|ocean way|sound city|dream|ruby|woodrow)/iu.test(basename);
}

/**
 * @param {{ auDirs?: string[], vst3Dirs?: string[] }} [options]
 * @returns {UadPluginInventoryEntry[]}
 */
function discoverInstalledUadPlugins(options = {}) {
  /** @type {string[]} */
  const auPaths = [];
  /** @type {string[]} */
  const vst3Paths = [];
  for (const dir of options.auDirs ?? auComponentDirs) {
    collectPluginBundles(dir, ".component", auPaths);
  }
  for (const dir of options.vst3Dirs ?? vst3Dirs) {
    collectPluginBundles(dir, ".vst3", vst3Paths);
  }

  /** @type {UadPluginInventoryEntry[]} */
  const entries = [];
  for (const [format, pluginPaths] of /** @type {const} */ ([[ "au", auPaths ], [ "vst3", vst3Paths ]])) {
    for (const pluginPath of pluginPaths) {
      const basename = path.basename(pluginPath);
      if (!isLikelyUadPlugin(basename)) {
        continue;
      }
      const displayName = basename.replace(/\.(?:component|vst3)$/iu, "");
      const normalizedName = normalizePluginName(displayName);
      const runtimeKind = classifyUadRuntime(displayName, pluginPath);
      entries.push({
        id: `${format}:${normalizedName.replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`,
        format,
        displayName,
        normalizedName,
        productKey: uadProductKey(displayName),
        runtimeKind,
        nativeRuntime: runtimeKind === "uadx-native",
        path: pluginPath,
        primitiveIds: inferPrimitiveIdsForPluginName(displayName).primitiveIds
      });
    }
  }

  const idCounts = entries.reduce((counts, entry) => {
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    return counts;
  }, /** @type {Map<string, number>} */ (new Map()));
  for (const entry of entries) {
    if ((idCounts.get(entry.id) ?? 0) > 1) {
      entry.id = `${entry.id}-${stableSlugHash(entry.path)}`;
    }
  }

  return entries.sort(compareUadProfilingPreference);
}

/**
 * @param {string} displayName
 * @returns {{ primitiveIds: string[], matchedRules: string[] }}
 */
function inferPrimitiveIdsForPluginName(displayName) {
  const normalized = normalizePluginName(displayName);
  /** @type {string[]} */
  const primitiveIds = [];
  /** @type {string[]} */
  const matchedRules = [];
  for (const rule of primitiveRules) {
    if (rule.pattern.test(normalized)) {
      primitiveIds.push(rule.id);
      matchedRules.push(rule.id);
    }
  }
  if (!primitiveIds.length) {
    primitiveIds.push("metering.analysis-suite");
    matchedRules.push("fallback:metering.analysis-suite");
  }
  return {
    primitiveIds: [...new Set(primitiveIds)],
    matchedRules
  };
}

/**
 * @param {{
 *   entries: UadPluginInventoryEntry[],
 *   root?: string,
 *   signalLimit?: number
 * }} options
 * @returns {UadPluginProfilePlanEntry[]}
 */
function buildUadProfilePlan(options) {
  const corpus = loadProbeSignalCorpus({ root: options.root ?? root });
  const library = loadPrimitiveLibrary({ root: options.root ?? root });
  const primitiveIds = new Set(Object.keys(library.primitives ?? {}));
  /** @type {UadPluginProfilePlanEntry[]} */
  const plan = [];

  for (const entry of options.entries) {
    const inferred = inferPrimitiveIdsForPluginName(entry.displayName);
    const resolvedPrimitiveIds = inferred.primitiveIds.filter((id) => primitiveIds.has(id));
    const signalIds = resolveProbeSignalIdsForPrimitives(corpus, resolvedPrimitiveIds)
      .slice(0, options.signalLimit && options.signalLimit > 0 ? options.signalLimit : undefined);
    plan.push({
      ...entry,
      primitiveIds: resolvedPrimitiveIds,
      matchedRules: inferred.matchedRules,
      signalIds,
      renderableByBuiltInAuHost: entry.format === "au"
    });
  }

  return plan;
}

/**
 * @param {string} sourceRoot
 * @param {string} outputDir
 * @returns {string}
 */
function compileAuProfileHost(sourceRoot, outputDir) {
  const binaryDir = path.join(outputDir, "bin");
  const binaryPath = path.join(binaryDir, "profile-au-host");
  const sourcePath = path.join(sourceRoot, "src", "profile_au_host.m");
  fs.mkdirSync(binaryDir, { recursive: true });
  execFileSync(
    "clang",
    [
      "-fobjc-arc",
      "-O2",
      sourcePath,
      "-framework",
      "AudioToolbox",
      "-framework",
      "AudioUnit",
      "-framework",
      "CoreFoundation",
      "-framework",
      "Foundation",
      "-o",
      binaryPath
    ],
    { cwd: sourceRoot, stdio: "inherit" }
  );
  return binaryPath;
}

/**
 * @param {string} command
 * @param {Record<string, string>} replacements
 * @returns {{ ok: boolean, stdout: string, stderr: string, status: number | null }}
 */
function runRenderCommand(command, replacements) {
  let rendered = command;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{${key}}`, value);
  }
  const result = spawnSync(rendered, {
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * @param {string[]} overrides
 * @returns {string[]}
 */
function auHostParameterArgs(overrides) {
  return overrides.flatMap((override) => ["--set", override]);
}

/**
 * @param {JsonObject} component
 * @returns {"uadx-native" | "uad-dsp" | "unknown"}
 */
function classifyAuHostComponentRuntime(component) {
  if (String(component.manufacturer ?? "") === "UADx") {
    return "uadx-native";
  }
  if (String(component.manufacturer ?? "") === "!UAD") {
    return "uad-dsp";
  }
  return classifyUadRuntime(String(component.name ?? ""), "");
}

/**
 * @param {JsonObject} component
 * @param {UadPluginProfilePlanEntry} plugin
 * @returns {number}
 */
function scoreAuHostComponent(component, plugin) {
  const componentKey = uadProductKey(String(component.name ?? ""));
  const pluginKey = uadProductKey(plugin.displayName);
  let score = 0;
  if (componentKey === pluginKey) {
    score += 100;
  } else if (componentKey.includes(pluginKey) || pluginKey.includes(componentKey)) {
    score += 40;
  }
  if (String(component.type ?? "") === "aufx") {
    score += 5;
  }
  score -= uadRuntimePriority({ ...component, runtimeKind: classifyAuHostComponentRuntime(component) }) * 20;
  return score;
}

/**
 * @param {string} auHostPath
 * @param {UadPluginProfilePlanEntry} plugin
 * @returns {JsonObject | null}
 */
function resolveAuHostComponent(auHostPath, plugin) {
  const inventory = listAuHostComponents(auHostPath);
  const components = Array.isArray(inventory.components) ? /** @type {JsonObject[]} */ (inventory.components) : [];
  const pluginKey = uadProductKey(plugin.displayName);
  const candidates = components
    .filter((component) => {
      const componentKey = uadProductKey(String(component.name ?? ""));
      return componentKey === pluginKey || componentKey.includes(pluginKey) || pluginKey.includes(componentKey);
    })
    .sort((left, right) => scoreAuHostComponent(right, plugin) - scoreAuHostComponent(left, plugin));
  return candidates[0] ?? null;
}

/**
 * UAD components can print logger banners to stdout before the host emits JSON.
 * Find the framework-owned payload without assuming stdout is JSON-only.
 *
 * @param {string} text
 * @returns {JsonObject}
 */
function parseAuHostJsonPayload(text) {
  const anchors = ['{"component"', '{"ok"'];
  for (const anchor of anchors) {
    const start = text.indexOf(anchor);
    if (start >= 0) {
      return /** @type {JsonObject} */ (JSON.parse(text.slice(start)));
    }
  }
  return /** @type {JsonObject} */ (JSON.parse(text));
}

/**
 * @param {string} auHostPath
 * @param {UadPluginProfilePlanEntry} plugin
 * @param {string[]} parameterOverrides
 * @param {{ exact?: boolean }} [options]
 * @returns {JsonObject}
 */
function queryAuHostParameters(auHostPath, plugin, parameterOverrides, options = {}) {
  const resolvedComponent = options.exact ? null : resolveAuHostComponent(auHostPath, plugin);
  const componentName = String(resolvedComponent?.name ?? plugin.displayName);
  const result = spawnSync(
    auHostPath,
    [
      "--parameters",
      "--name",
      componentName,
      ...(options.exact || resolvedComponent ? ["--exact"] : []),
      ...auHostParameterArgs(parameterOverrides)
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? ""
    };
  }
  try {
    return {
      ok: true,
      ...parseAuHostJsonPayload(result.stdout)
    };
  } catch (error) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * @param {string} auHostPath
 * @returns {JsonObject}
 */
function listAuHostComponents(auHostPath) {
  const result = spawnSync(auHostPath, ["--list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? ""
    };
  }
  try {
    return {
      ok: true,
      components: JSON.parse(result.stdout)
    };
  } catch (error) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * @param {{
 *   outputDir: string,
 *   root?: string,
 *   limit?: number,
 *   pluginFilter?: string[],
 *   signalLimit?: number,
 *   render?: boolean,
 *   renderLimit?: number,
 *   renderMethod?: string,
 *   renderCommand?: string,
 *   parameterOverrides?: string[],
 *   auHost?: boolean,
 *   auDirs?: string[],
 *   vst3Dirs?: string[]
 * }} options
 * @returns {UadPluginProfileReport}
 */
function createUadPluginProfile(options) {
  const sourceRoot = options.root ?? root;
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const filters = (options.pluginFilter ?? []).map((filter) => filter.toLowerCase());
  const discovered = discoverInstalledUadPlugins({ auDirs: options.auDirs, vst3Dirs: options.vst3Dirs });
  const filtered = discovered.filter((entry) => {
    if (!filters.length) {
      return true;
    }
    return filters.some((filter) => entry.displayName.toLowerCase().includes(filter) || entry.normalizedName.includes(filter));
  });
  const entries = filtered.slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
  const plan = buildUadProfilePlan({ entries, root: sourceRoot, signalLimit: options.signalLimit });
  const unionPrimitiveIds = [...new Set(plan.flatMap((entry) => entry.primitiveIds ?? []))];
  const unionSignalIds = [...new Set(plan.flatMap((entry) => entry.signalIds ?? []))];
  const probeDir = path.join(outputDir, "probes");
  const probeManifest = createProbeSignalSet({
    outputDir: probeDir,
    primitiveIds: unionPrimitiveIds,
    root: sourceRoot,
    signalIds: unionSignalIds
  });
  const corpus = loadProbeSignalCorpus({ root: sourceRoot });
  const parameterOverrides = options.parameterOverrides ?? [];

  /** @type {Record<string, JsonObject>} */
  const inputAnalyses = {};
  for (const entry of probeManifest.signals ?? []) {
    const definition = probeSignalDefinition(corpus, entry.id);
    inputAnalyses[entry.id] = analyzeWavFile(path.join(probeDir, entry.path), {
      signalId: entry.id,
      signalDefinition: definition
    });
  }
  writeAnalysisReport(path.join(outputDir, "input-analysis.json"), inputAnalyses);

  /** @type {JsonObject[]} */
  const renderResults = [];
  let auHostPath = "";
  if (options.render && options.auHost !== false && plan.some((entry) => entry.renderableByBuiltInAuHost)) {
    try {
      auHostPath = compileAuProfileHost(sourceRoot, outputDir);
    } catch (error) {
      renderResults.push({
        ok: false,
        stage: "compile-au-host",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (options.render) {
    const renderablePlan = plan
      .filter((entry) => options.renderCommand || (auHostPath && entry.renderableByBuiltInAuHost))
      .slice(0, options.renderLimit && options.renderLimit > 0 ? options.renderLimit : undefined);

    for (const plugin of renderablePlan) {
      const pluginDir = path.join(outputDir, "renders", plugin.id.replace(/[^a-z0-9-:]+/giu, "-").replace(/:/gu, "-"));
      fs.mkdirSync(pluginDir, { recursive: true });
      let renderPlugin = plugin;
      let exactRender = false;
      if (auHostPath && plugin.renderableByBuiltInAuHost) {
        const parameterMap = queryAuHostParameters(auHostPath, plugin, parameterOverrides);
        writeAnalysisReport(path.join(pluginDir, "parameters.json"), parameterMap);
        if (typeof parameterMap.component === "string" && parameterMap.component) {
          renderPlugin = { ...plugin, displayName: parameterMap.component };
          exactRender = true;
        }
        renderResults.push({
          pluginId: plugin.id,
          pluginName: plugin.displayName,
          stage: "parameter-map",
          ok: parameterMap.ok === true,
          parameterCount: Array.isArray(parameterMap.parameters) ? parameterMap.parameters.length : 0,
          path: path.join(pluginDir, "parameters.json")
        });
      }
      for (const signalId of plugin.signalIds ?? []) {
        const manifestEntry = probeManifest.signals?.find((entry) => entry.id === signalId);
        if (!manifestEntry) {
          continue;
        }
        const inputPath = path.join(probeDir, manifestEntry.path);
        const outputPath = path.join(pluginDir, `${signalId}.wav`);
        let renderResult;
        if (options.renderCommand) {
          renderResult = runRenderCommand(options.renderCommand, {
            pluginPath: plugin.path,
            pluginName: plugin.displayName,
            pluginId: plugin.id,
            input: inputPath,
            output: outputPath,
            format: plugin.format,
            parameterArgs: parameterOverrides.map((override) => `--set ${shellQuote(override)}`).join(" "),
            sampleRate: String(probeManifest.defaults?.sampleRate ?? 48000),
            channels: String(probeManifest.defaults?.channels ?? 2)
          });
        } else {
          const result = spawnSync(
            auHostPath,
            [
              "--render",
              "--name",
              renderPlugin.displayName,
              ...(exactRender ? ["--exact"] : []),
              "--input",
              inputPath,
              "--output",
              outputPath,
              "--render-method",
              options.renderMethod ?? "callback",
              ...auHostParameterArgs(parameterOverrides)
            ],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
          );
          renderResult = {
            ok: result.status === 0,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
            status: result.status
          };
        }
        /** @type {JsonObject} */
        const resultEntry = {
          pluginId: plugin.id,
          pluginName: plugin.displayName,
          signalId,
          inputPath,
          outputPath,
          mode: options.renderCommand ? "external-command" : "headless-audio-unit-cli",
          uiStaging: false,
          ok: renderResult.ok,
          status: renderResult.status,
          stderr: renderResult.stderr.trim(),
          stdout: renderResult.stdout.trim()
        };
        if (renderResult.ok && fs.existsSync(outputPath)) {
          const definition = probeSignalDefinition(corpus, signalId);
          resultEntry.analysis = analyzeWavFile(outputPath, { signalId, signalDefinition: definition });
          writeAnalysisReport(path.join(pluginDir, `${signalId}.analysis.json`), resultEntry.analysis);
        }
        renderResults.push(resultEntry);
      }
    }
  }

  /** @type {UadPluginProfileReport} */
  const report = {
    id: "fwak-uad-plugin-profile",
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname()
    },
    inventory: {
      discoveredCount: discovered.length,
      selectedCount: entries.length,
      plugins: entries
    },
    primitiveIds: unionPrimitiveIds,
    signalIds: unionSignalIds,
    probeManifestPath: path.relative(outputDir, path.join(probeDir, "probe-manifest.json")),
    plan,
    render: {
      requested: Boolean(options.render),
      auHostPath: auHostPath ? path.relative(outputDir, auHostPath) : null,
      externalCommand: options.renderCommand ? true : false,
      mode: options.renderCommand ? "external-command" : "headless-audio-unit-cli",
      uiStaging: false,
      renderMethod: options.renderMethod ?? "callback",
      parameterOverrides,
      results: renderResults
    }
  };

  writeFileAtomically(path.join(outputDir, "uad-profile-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "uad-plugin-inventory.json"), `${JSON.stringify(entries, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "uad-profile-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return report;
}

export {
  buildUadProfilePlan,
  classifyUadRuntime,
  compileAuProfileHost,
  compareUadProfilingPreference,
  createUadPluginProfile,
  discoverInstalledUadPlugins,
  inferPrimitiveIdsForPluginName,
  listAuHostComponents,
  normalizePluginName,
  parseAuHostJsonPayload,
  queryAuHostParameters,
  resolveAuHostComponent,
  uadProductKey,
  primitiveRules
};
