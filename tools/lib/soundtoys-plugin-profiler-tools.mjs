// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileAuProfileHost,
  listAuHostComponents,
  queryAuHostParameters
} from "./uad-plugin-profiler-tools.mjs";
import { writeFileAtomically } from "./fs-tools.mjs";
import { loadPrimitiveLibrary } from "./primitive-library-tools.mjs";
import {
  createProbeSignalSet,
  loadProbeSignalCorpus,
  probeSignalDefinition,
  resolveProbeSignalIdsForPrimitives
} from "./probe-signal-tools.mjs";
import {
  analyzeWavFile,
  assessRenderEngagement,
  compareWavFiles,
  summarizePluginEngagement,
  writeAnalysisReport
} from "./sonic-analysis-tools.mjs";

/**
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").UadPluginInventoryEntry} PluginInventoryEntry
 * @typedef {import("../../types/framework").UadPluginProfilePlanEntry} PluginProfilePlanEntry
 * @typedef {import("../../types/framework").UadPluginProfileReport} PluginProfileReport
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const soundtoysManufacturerCode = "SToy";

const soundtoysPrimitiveRules = [
  {
    id: "delay.style-morphing-echo-engine",
    pattern: /\b(echo boy|echoboy|echo boy jr|echoboy jr)\b/u
  },
  {
    id: "delay.retro-digital-buffer",
    pattern: /\b(primal tap|primaltap|little primal tap|little primaltap)\b/u
  },
  {
    id: "pitch.granular-reverse-echo",
    pattern: /\bcrystallizer\b/u
  },
  {
    id: "pitch.formant-shift-voice-transform",
    pattern: /\b(little alter boy|alter boy|alterboy)\b/u
  },
  {
    id: "spatial.micro-pitch-widener",
    pattern: /\b(little micro shift|micro shift|microshift)\b/u
  },
  {
    id: "modulation.rhythmic-auto-pan",
    pattern: /\bpan man|panman\b/u
  },
  {
    id: "modulation.rhythmic-amplitude-gate",
    pattern: /\btremolator\b/u
  },
  {
    id: "modulation.resonant-filter-motion",
    pattern: /\bfilter freak\s*[12]?|filterfreak\s*[12]?\b/u
  },
  {
    id: "modulation.all-pass-phaser-network",
    pattern: /\bphase mistress|phasemistress\b/u
  },
  {
    id: "saturation.character-model-bank",
    pattern: /\b(decapitator|devil loc|devil-loc|radiator|little radiator)\b/u
  },
  {
    id: "compression.crush-pump-dynamics",
    pattern: /\b(devil loc|devil-loc|devil loc deluxe|devil-loc deluxe)\b/u
  },
  {
    id: "analog.tube-preamp-drive-stage",
    pattern: /\b(radiator|little radiator)\b/u
  },
  {
    id: "space.modulated-plate-reverb",
    pattern: /\blittle plate\b/u
  },
  {
    id: "routing.serial-effect-rack",
    pattern: /\beffect rack|effectrack\b/u
  },
  {
    id: "delay.tap-feedback-network",
    pattern: /\b(echo boy|echoboy|primal tap|primaltap)\b/u
  },
  {
    id: "eq.circuit-model-topology",
    pattern: /\b(filter freak|filterfreak|sie q|sie-q|sieq)\b/u
  },
  {
    id: "eq.passive-vintage-program-eq",
    pattern: /\b(sie q|sie-q|sieq)\b/u
  },
  {
    id: "pitch.modulated-feedback-shifter",
    pattern: /\b(crystallizer|alter boy|alterboy|micro shift|microshift)\b/u
  },
  {
    id: "saturation.virtual-analog-stage",
    pattern: /\b(decapitator|devil loc|devil-loc|radiator|little radiator)\b/u
  },
  {
    id: "space.plate-reverb",
    pattern: /\blittle plate\b/u
  },
  {
    id: "spatial.channel-toolkit",
    pattern: /\b(pan man|panman|micro shift|microshift)\b/u
  },
  {
    id: "modulation.vintage-delay-modulation",
    pattern: /\b(echo boy|echoboy|filter freak|filterfreak|phase mistress|phasemistress|tremolator)\b/u
  },
  {
    id: "metering.analysis-suite",
    pattern: /\beffect rack|effectrack\b/u
  }
];

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeSoundtoysName(value) {
  return String(value ?? "")
    .replace(/\.(?:component|vst3)$/iu, "")
    .replace(/^soundtoys\s*:\s*/iu, "")
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z])([A-Z0-9])/gu, "$1 $2")
    .replace(/([0-9])([A-Za-z])/gu, "$1 $2")
    .replace(/\bsie\s*q\b/giu, "sie q")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
function soundtoysProductKey(value) {
  return normalizeSoundtoysName(value)
    .replace(/\bplugin\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * @param {string} displayName
 * @returns {{ primitiveIds: string[], matchedRules: string[] }}
 */
function inferPrimitiveIdsForSoundtoysName(displayName) {
  const normalized = normalizeSoundtoysName(displayName);
  /** @type {string[]} */
  const primitiveIds = [];
  /** @type {string[]} */
  const matchedRules = [];
  for (const rule of soundtoysPrimitiveRules) {
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
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
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
 * @returns {PluginInventoryEntry}
 */
function componentToInventoryEntry(component) {
  const displayName = String(component.name ?? "");
  const normalizedName = normalizeSoundtoysName(displayName);
  const productKey = soundtoysProductKey(displayName);
  const inferred = inferPrimitiveIdsForSoundtoysName(displayName);
  return {
    id: `au:${slugify(normalizedName)}`,
    format: "au",
    displayName,
    normalizedName,
    productKey,
    runtimeKind: "native",
    nativeRuntime: true,
    path: displayName,
    primitiveIds: inferred.primitiveIds,
    componentType: String(component.type ?? ""),
    componentSubtype: String(component.subtype ?? ""),
    manufacturer: String(component.manufacturer ?? "")
  };
}

/**
 * @param {PluginInventoryEntry} left
 * @param {PluginInventoryEntry} right
 * @returns {number}
 */
function compareSoundtoysPluginInventory(left, right) {
  return String(left.productKey ?? "").localeCompare(String(right.productKey ?? ""))
    || String(left.format ?? "").localeCompare(String(right.format ?? ""))
    || left.displayName.localeCompare(right.displayName);
}

/**
 * @param {{ auHostPath?: string, components?: JsonObject[] }} [options]
 * @returns {PluginInventoryEntry[]}
 */
function discoverInstalledSoundtoysPlugins(options = {}) {
  const inventory = options.components
    ? { ok: true, components: options.components }
    : options.auHostPath
      ? listAuHostComponents(options.auHostPath)
      : { ok: true, components: [] };
  const components = Array.isArray(inventory.components) ? /** @type {JsonObject[]} */ (inventory.components) : [];
  return components
    .filter((component) => String(component.manufacturer ?? "") === soundtoysManufacturerCode)
    .filter((component) => /^soundtoys\s*:/iu.test(String(component.name ?? "")))
    .map(componentToInventoryEntry)
    .sort(compareSoundtoysPluginInventory);
}

/**
 * @param {{ entries: PluginInventoryEntry[], root?: string, signalLimit?: number }} options
 * @returns {PluginProfilePlanEntry[]}
 */
function buildSoundtoysProfilePlan(options) {
  const corpus = loadProbeSignalCorpus({ root: options.root ?? root });
  const library = loadPrimitiveLibrary({ root: options.root ?? root });
  const primitiveIds = new Set(Object.keys(library.primitives ?? {}));
  /** @type {PluginProfilePlanEntry[]} */
  const plan = [];

  for (const entry of options.entries) {
    const inferred = inferPrimitiveIdsForSoundtoysName(entry.displayName);
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
 * @param {{
 *   outputDir: string,
 *   root?: string,
 *   limit?: number,
 *   pluginFilter?: string[],
 *   signalLimit?: number,
 *   render?: boolean,
 *   renderLimit?: number,
 *   renderMethod?: string,
 *   parameterOverrides?: string[]
 * }} options
 * @returns {PluginProfileReport}
 */
function createSoundtoysPluginProfile(options) {
  const sourceRoot = options.root ?? root;
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const auHostPath = compileAuProfileHost(sourceRoot, outputDir);
  const discovered = discoverInstalledSoundtoysPlugins({ auHostPath });
  const filters = (options.pluginFilter ?? []).map((filter) => filter.toLowerCase());
  const filtered = filters.length
    ? discovered.filter((entry) => filters.some((filter) => entry.displayName.toLowerCase().includes(filter) || entry.normalizedName.includes(filter)))
    : discovered;
  const entries = filtered.slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
  const plan = buildSoundtoysProfilePlan({ entries, root: sourceRoot, signalLimit: options.signalLimit });
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
  if (options.render) {
    const renderablePlan = plan
      .filter((entry) => entry.renderableByBuiltInAuHost)
      .slice(0, options.renderLimit && options.renderLimit > 0 ? options.renderLimit : undefined);

    for (const plugin of renderablePlan) {
      const pluginDir = path.join(outputDir, "renders", plugin.id.replace(/[^a-z0-9-:]+/giu, "-").replace(/:/gu, "-"));
      fs.mkdirSync(pluginDir, { recursive: true });
      const parameterMap = queryAuHostParameters(auHostPath, plugin, parameterOverrides, { exact: true });
      writeAnalysisReport(path.join(pluginDir, "parameters.json"), parameterMap);
      renderResults.push({
        pluginId: plugin.id,
        pluginName: plugin.displayName,
        stage: "parameter-map",
        ok: parameterMap.ok === true,
        parameterCount: Array.isArray(parameterMap.parameters) ? parameterMap.parameters.length : 0,
        path: path.join(pluginDir, "parameters.json")
      });

      for (const signalId of plugin.signalIds ?? []) {
        const manifestEntry = probeManifest.signals?.find((entry) => entry.id === signalId);
        if (!manifestEntry) {
          continue;
        }
        const inputPath = path.join(probeDir, manifestEntry.path);
        const outputPath = path.join(pluginDir, `${signalId}.wav`);
        const result = spawnSync(
          auHostPath,
          [
            "--render",
            "--name",
            plugin.displayName,
            "--exact",
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
        /** @type {JsonObject} */
        const resultEntry = {
          pluginId: plugin.id,
          pluginName: plugin.displayName,
          signalId,
          inputPath,
          outputPath,
          mode: "headless-audio-unit-cli",
          uiStaging: false,
          ok: result.status === 0,
          status: result.status,
          stderr: result.stderr.trim(),
          stdout: result.stdout.trim()
        };
        if (result.status === 0 && fs.existsSync(outputPath)) {
          const definition = probeSignalDefinition(corpus, signalId);
          resultEntry.analysis = analyzeWavFile(outputPath, { signalId, signalDefinition: definition });
          writeAnalysisReport(path.join(pluginDir, `${signalId}.analysis.json`), resultEntry.analysis);
          const dryComparison = compareWavFiles(inputPath, outputPath);
          const dryComparisonPath = path.join(pluginDir, `${signalId}.dry-comparison.json`);
          writeAnalysisReport(dryComparisonPath, dryComparison);
          resultEntry.dryComparisonPath = dryComparisonPath;
          resultEntry.engagement = assessRenderEngagement(dryComparison, { signalId });
        }
        renderResults.push(resultEntry);
      }
    }
  }

  const engagementSummary = summarizePluginEngagement(renderResults);
  if (engagementSummary.length) {
    writeAnalysisReport(path.join(outputDir, "engagement-summary.json"), engagementSummary);
  }

  /** @type {PluginProfileReport} */
  const report = {
    id: "fwak-soundtoys-plugin-profile",
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
      auHostPath: path.relative(outputDir, auHostPath),
      externalCommand: false,
      mode: "headless-audio-unit-cli",
      uiStaging: false,
      renderMethod: options.renderMethod ?? "callback",
      parameterOverrides,
      engagementSummary,
      results: renderResults
    }
  };

  writeFileAtomically(path.join(outputDir, "soundtoys-profile-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "soundtoys-plugin-inventory.json"), `${JSON.stringify(entries, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "soundtoys-profile-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return report;
}

export {
  buildSoundtoysProfilePlan,
  compareSoundtoysPluginInventory,
  createSoundtoysPluginProfile,
  discoverInstalledSoundtoysPlugins,
  inferPrimitiveIdsForSoundtoysName,
  normalizeSoundtoysName,
  soundtoysPrimitiveRules,
  soundtoysProductKey
};
