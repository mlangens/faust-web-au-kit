// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileAuProfileHost,
  listAuHostComponents,
  parseAuHostJsonPayload
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

const genericAuPrimitiveRules = [
  { id: "restoration.source-separation-focus", pattern: /\b(dialogue isolate|master rebalance|music rebalance|restem|re stem|source separation)\b/u },
  { id: "restoration.spectral-repair-module", pattern: /\b(rx|x[- ]?(?:click|crackle|noise)|de[- ]?click|de[- ]?clip|de[- ]?crackle|de[- ]?hum|de[- ]?noise|de[- ]?reverb|de[- ]?plosive|mouth de[- ]?click|breath control|guitar de[- ]?noise|spectral de[- ]?noise|voice de[- ]?noise|repair|sound isolation|ausound isolation)\b/u },
  { id: "mastering.integrated-mastering-chain", pattern: /\b(ozone|mastering|masterdesk|tg mastering|ar tg|l3|l2|l1|maximizer|mix centric|tone centric)\b/u },
  { id: "mastering.spectral-balance-shaper", pattern: /\b(clarity|stabilizer|spectral shaper|soothe|refinement|low end focus|match eq|soundid|arc 4|tonal balance)\b/u },
  { id: "spatial.stereo-image-matrix", pattern: /\b(imager|stereo|m\/s|msed|center|s1|doubler|micro pitch|width|drms|dr ms|double ms|brauer motion|panipulator|pan|matrix|ps22|reel adt|adt[0-9]*)\b/u },
  { id: "compression.transient-shaper", pattern: /\b(transient|impact|drum leveler|silencer|de[- ]?breath|vocal rider|bass rider|axx|renaissance axx)\b/u },
  { id: "compression.gate-expander", pattern: /\b(gate|expander|de[- ]?plosive|big beautiful door|pro g)\b/u },
  { id: "saturation.clip-limiter-stage", pattern: /\b(clip|clipper|kclip|standardclip|ultimate[- ]?d|peak limiter|limiter|maxlimit|maximizer|pro l|l1|l2|l3)\b/u },
  { id: "modulation.ensemble-chorus", pattern: /\b(choral|chorus|ensemble|flair|flanger|tremolo|trem|mondomod|mondo mod|metaflanger|tal[- ]?chorus|phaser|phasis|enigma)\b/u },
  { id: "space.algorithmic-reverb-suite", pattern: /\b(reverb|room|raum|supermassive|vintageverb|valhalla|ir[- ]?l|revolver|de[- ]?verb|aureverb|au reverb|rverb|true verb|one knob wetter)\b/u },
  { id: "utility.room-correction-reference", pattern: /\b(soundid|sonarworks|arc 4|room correction|reference)\b/u },
  { id: "utility.signal-source-codec-stage", pattern: /\b(roger beep|auroger beep|round trip aac|auround trip aac|generator|signal generator|tone generator)\b/u },
  { id: "routing.plugin-host-shell", pattern: /\b(metaplugin|plugin ?doctor|listento|receiver|relay|net send|aunet send|connect)\b/u },
  { id: "pitch.vocal-time-alignment", pattern: /\b(vocalign|voc align|vocal align|melodyne|new pitch|pitch|tune|h910|doppler)\b/u },
  { id: "analog.external-hardware-bridge", pattern: /\b(apb|hardware insert|bob|moo x mixer)\b/u },
  { id: "cabinet.speaker-mic-simulation", pattern: /\b(cab|cabinet|speaker|ampcraft|amp craft|rockrack|gtr amp|gtr tool rack|prs archon|prs dallas|prs v9|dream amp|ruby amp|woodrow amp|lion amp|showtime amp|waterfall rotary)\b/u },
  { id: "instrument.sample-playback-workstation", pattern: /\b(kontakt|sampler|superior drummer|trigger|aria player|smartmusic|sample|piano|organ|strings|voices|mellotron|emulator|synthmaster)\b/u },
  { id: "instrument.virtual-analog-workstation", pattern: /\b(analog lab|arp|buchla|cs[- ]?80|jup|jun|prophet|mini v|modular|sem|solina|sq80|dx7|cz|op[- ]?xa|matrix|moog|synth|reaktor)\b/u },
  { id: "analog.channel-strip-signal-path", pattern: /\b(channel|omni channel|audiotrack|audio track|ssl|api|scheps|vision|strip|console)\b/u },
  { id: "analog.preamp-console-stage", pattern: /\b(preamp|console|tg|abbey road|kramer|rs56|nls|j37|tape|aphex|vinyl|radiator)\b/u },
  { id: "amp.cabinet-mic-chain", pattern: /\b(amp|gtr|rockrack|cabinet|guitar|prs|archon|dallas)\b/u },
  { id: "compression.multiband-dynamics", pattern: /\b(multiband|pro mb|c4|c6|multiplicity|multi ?comp|multi ?limit|linear phase multiband)\b/u },
  { id: "compression.split-band-focus", pattern: /\b(de[- ]?ess|deesser|de esser|rde esser|pro ds|sibilance|spectral shaper|supr?esser)\b/u },
  { id: "compression.true-peak-limiter", pattern: /\b(limiter|maximizer|maxlimit|pro l|l1|l2|l3|kclip|standardclip|clipper)\b/u },
  { id: "compression.vca-bus-detector", pattern: /\b(bus comp|buss comp|solid bus|ssl comp|api 2500)\b/u },
  { id: "compression.vintage-compressor-model", pattern: /\b(compressor|rcompressor|r compressor|rcomp|r comp|vcomp|v comp|mv2|pro c|comp|cla[- ]?76|cla[- ]?2a|fairchild|puig child|dbx|level[- ]?loc|unison|unisum|royal mu|c673|moo|el juan|c1|solid dynamics|true dynamics|audynamics processor)\b/u },
  { id: "delay.style-morphing-echo-engine", pattern: /\b(delay|audelay|echo|replika|supertap|super tap|h[- ]?delay|doubler|tape echo|timeless|reel adt|adt[0-9]*)\b/u },
  { id: "eq.circuit-model-topology", pattern: /\b(eq|equalizer|filter|pro q|ff pro q|q ?[0-9]+\b|req [0-9]+\b|ssleq|veq ?[0-9]+\b|emo[- ]?(?:f2|q4)|bandpass|aubandpass|hipass|auhipass|lowpass|aulowpass|aufilter|n?band|graphic|free ranger|cleansweep|niveau|hoser|true 252|royal q|subfilter|track control|sa3 spectral|bark of dog)\b/u },
  { id: "eq.dynamic-band", pattern: /\b(dynamic eq|pro mb|f6|c6|spectral shaper|soothe|stabilizer)\b/u },
  { id: "eq.filterbank-crossover", pattern: /\b(crossover|multiband|pro mb|c4|c6|multiplicity)\b/u },
  { id: "eq.passive-vintage-program-eq", pattern: /\b(pultec|rs56|puigtec|helios|free ranger|vintage eq|tg mastering|veq[0-9]\b|ssleq)\b/u },
  { id: "metering.analysis-suite", pattern: /\b(meter|analyzer|paz|frequency|levels|position|plugin ?doctor|tonal balance|insight|listento|receiver)\b/u },
  { id: "modulation.all-pass-phaser-network", pattern: /\b(phaser|phasis)\b/u },
  { id: "modulation.resonant-filter-motion", pattern: /\b(filter|autofilter|creative filter|driver|subfilter)\b/u },
  { id: "modulation.vintage-delay-modulation", pattern: /\b(chorus|flanger|delay|doubler|replika|phaser|ensemble|doppler)\b/u },
  { id: "phase.all-pass-alignment-network", pattern: /\b(phase|sample delay|time alignment|align|vocalign)\b/u },
  { id: "pitch.modulated-feedback-shifter", pattern: /\b(pitch|aupitch|doppler|doubler|h910|melodyne)\b/u },
  { id: "saturation.character-model-bank", pattern: /\b(distortion|audistortion|driver|berzerk|grimebox|overdrive|crusher|trash|futz|tominator)\b/u },
  { id: "saturation.multiband-enhancer-exciter", pattern: /\b(exciter|enhancer|aphex|vitamin|vitalizer|maxx bass|rbass|subfilter|bark of dog|oneknob brighter|oneknob phatter)\b/u },
  { id: "saturation.virtual-analog-stage", pattern: /\b(saturation|saturator|saturn|drive|distortion|audistortion|tube|tubes|bb tubes|iron|kelvin|j37|tape|vinyl|kramer|ekramer|true iron|synth warmer|grimebox|w43|futz)\b/u },
  { id: "space.reverb-macro-field", pattern: /\b(reverb|room|raum|supermassive|vintageverb|ir[- ]?l|revolver|rverb|true verb|one knob wetter)\b/u },
  { id: "spatial.channel-toolkit", pattern: /\b(stereo|mono|width|msed|center|s1|panipulator|solo|m\/s|double ms|stereotools|ps22|drms|dr ms)\b/u },
  { id: "tape.magnetic-recorder-stage", pattern: /\b(tape|j37|kramer tape|vinyl|reel adt|adt[0-9]*)\b/u }
];

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeAuPluginName(value) {
  return String(value ?? "")
    .replace(/^.+?:\s*/u, "")
    .replace(/\((?:m|s|mono|stereo|m->s)\)$/iu, "")
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z])([A-Z0-9])/gu, "$1 $2")
    .replace(/([0-9])([A-Za-z])/gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
function auVendorName(value) {
  const match = String(value ?? "").match(/^(.+?):\s*/u);
  return match?.[1]?.trim() ?? "";
}

/**
 * @param {string} value
 * @returns {string}
 */
function auProductKey(value) {
  return normalizeAuPluginName(value)
    .replace(/\b(?:mono|stereo|plugin|au|live)\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * @param {PluginInventoryEntry} entry
 * @returns {number}
 */
function auComponentPreferenceScore(entry) {
  const normalized = String(entry.displayName ?? "").toLowerCase();
  if (/\((?:s|stereo)\)$/u.test(normalized) || /\bstereo\b/u.test(normalized)) {
    return 0;
  }
  if (/\(m->s\)$/u.test(normalized)) {
    return 1;
  }
  if (/\((?:m|mono)\)$/u.test(normalized) || /\bmono\b/u.test(normalized)) {
    return 3;
  }
  return 2;
}

/**
 * @param {string} displayName
 * @returns {{ primitiveIds: string[], matchedRules: string[] }}
 */
function inferPrimitiveIdsForAuName(displayName) {
  const normalized = normalizeAuPluginName(displayName);
  /** @type {string[]} */
  const primitiveIds = [];
  /** @type {string[]} */
  const matchedRules = [];
  for (const rule of genericAuPrimitiveRules) {
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
  const normalizedName = normalizeAuPluginName(displayName);
  const inferred = inferPrimitiveIdsForAuName(displayName);
  return {
    id: `au:${slugify(`${String(component.manufacturer ?? "unknown")} ${normalizedName}`)}`,
    format: "au",
    displayName,
    normalizedName,
    productKey: auProductKey(displayName),
    runtimeKind: "native",
    nativeRuntime: true,
    path: displayName,
    primitiveIds: inferred.primitiveIds,
    componentType: String(component.type ?? ""),
    componentSubtype: String(component.subtype ?? ""),
    manufacturer: String(component.manufacturer ?? ""),
    vendor: auVendorName(displayName)
  };
}

/**
 * @param {PluginInventoryEntry} left
 * @param {PluginInventoryEntry} right
 * @returns {number}
 */
function compareAuPluginInventory(left, right) {
  return String(left.vendor ?? "").localeCompare(String(right.vendor ?? ""))
    || String(left.productKey ?? "").localeCompare(String(right.productKey ?? ""))
    || String(left.componentType ?? "").localeCompare(String(right.componentType ?? ""))
    || left.displayName.localeCompare(right.displayName);
}

/**
 * @param {PluginInventoryEntry} left
 * @param {PluginInventoryEntry} right
 * @returns {number}
 */
function compareAuProductPreference(left, right) {
  return auComponentPreferenceScore(left) - auComponentPreferenceScore(right)
    || String(left.componentType ?? "").localeCompare(String(right.componentType ?? ""))
    || left.displayName.localeCompare(right.displayName);
}

/**
 * @param {PluginInventoryEntry[]} entries
 * @returns {PluginInventoryEntry[]}
 */
function preferDistinctAuProducts(entries) {
  /** @type {Map<string, PluginInventoryEntry>} */
  const byProduct = new Map();
  for (const entry of entries) {
    const key = [
      String(entry.manufacturer ?? "").toLowerCase(),
      String(entry.vendor ?? "").toLowerCase(),
      String(entry.productKey ?? entry.normalizedName ?? entry.displayName).toLowerCase()
    ].join(":");
    const current = byProduct.get(key);
    if (!current || compareAuProductPreference(entry, current) < 0) {
      byProduct.set(key, entry);
    }
  }
  return [...byProduct.values()].sort(compareAuPluginInventory);
}

/**
 * @param {{ auHostPath?: string, components?: JsonObject[], excludeManufacturers?: string[], includeManufacturers?: string[], typeFilter?: string[] }} [options]
 * @returns {PluginInventoryEntry[]}
 */
function discoverInstalledAuPlugins(options = {}) {
  const inventory = options.components
    ? { ok: true, components: options.components }
    : options.auHostPath
      ? listAuHostComponents(options.auHostPath)
      : { ok: true, components: [] };
  const components = Array.isArray(inventory.components) ? /** @type {JsonObject[]} */ (inventory.components) : [];
  const excludeManufacturers = new Set((options.excludeManufacturers ?? []).map((value) => value.toLowerCase()));
  const includeManufacturers = new Set((options.includeManufacturers ?? []).map((value) => value.toLowerCase()));
  const typeFilter = new Set((options.typeFilter ?? []).map((value) => value.toLowerCase()));
  return components
    .filter((component) => !excludeManufacturers.has(String(component.manufacturer ?? "").toLowerCase()))
    .filter((component) => !includeManufacturers.size || includeManufacturers.has(String(component.manufacturer ?? "").toLowerCase()))
    .filter((component) => !typeFilter.size || typeFilter.has(String(component.type ?? "").toLowerCase()))
    .map(componentToInventoryEntry)
    .sort(compareAuPluginInventory);
}

/**
 * @param {{ entries: PluginInventoryEntry[], root?: string, signalLimit?: number, signalIds?: string[] }} options
 * @returns {PluginProfilePlanEntry[]}
 */
function buildAuProfilePlan(options) {
  const corpus = loadProbeSignalCorpus({ root: options.root ?? root });
  const library = loadPrimitiveLibrary({ root: options.root ?? root });
  const primitiveIds = new Set(Object.keys(library.primitives ?? {}));
  /** @type {PluginProfilePlanEntry[]} */
  const plan = [];

  for (const entry of options.entries) {
    const inferred = inferPrimitiveIdsForAuName(entry.displayName);
    const resolvedPrimitiveIds = inferred.primitiveIds.filter((id) => primitiveIds.has(id));
    const resolvedSignalIds = options.signalIds?.length
      ? options.signalIds
      : resolveProbeSignalIdsForPrimitives(corpus, resolvedPrimitiveIds);
    const signalIds = resolvedSignalIds.slice(0, options.signalLimit && options.signalLimit > 0 ? options.signalLimit : undefined);
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
 * @param {string} auHostPath
 * @param {PluginProfilePlanEntry} plugin
 * @param {string[]} parameterOverrides
 * @param {number | undefined} timeoutMs
 * @returns {JsonObject}
 */
function queryAuParametersExact(auHostPath, plugin, parameterOverrides, timeoutMs) {
  const result = spawnSync(
    auHostPath,
    [
      "--parameters",
      "--name",
      plugin.displayName,
      "--exact",
      ...auHostParameterArgs(parameterOverrides)
    ],
    { encoding: "utf8", killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }
  );
  if (result.error) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.error.message
    };
  }
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
 * @param {PluginInventoryEntry[]} plugins
 * @param {JsonObject[]} engagementSummary
 * @returns {JsonObject}
 */
function summarizeFunctionalPrimitiveCoverage(plugins, engagementSummary) {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const functionalIds = new Set(engagementSummary.filter((entry) => entry.status === "engaged").map((entry) => String(entry.pluginId ?? "")));
  /** @type {Record<string, number>} */
  const primitiveCounts = {};
  /** @type {Record<string, number>} */
  const manufacturerCounts = {};
  for (const pluginId of functionalIds) {
    const plugin = byId.get(pluginId);
    if (!plugin) {
      continue;
    }
    manufacturerCounts[String(plugin.manufacturer ?? "unknown")] = (manufacturerCounts[String(plugin.manufacturer ?? "unknown")] ?? 0) + 1;
    for (const primitiveId of plugin.primitiveIds ?? []) {
      primitiveCounts[primitiveId] = (primitiveCounts[primitiveId] ?? 0) + 1;
    }
  }
  return {
    functionalPluginCount: functionalIds.size,
    functionalPluginIds: [...functionalIds].sort(),
    primitiveCounts: Object.fromEntries(Object.entries(primitiveCounts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))),
    manufacturerCounts: Object.fromEntries(Object.entries(manufacturerCounts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])))
  };
}

/**
 * @param {{
 *   outputDir: string,
 *   root?: string,
 *   limit?: number,
 *   pluginFilter?: string[],
 *   excludePluginFilter?: string[],
 *   preferProducts?: boolean,
 *   signalLimit?: number,
 *   signalIds?: string[],
 *   render?: boolean,
 *   renderLimit?: number,
 *   renderMethod?: string,
 *   progress?: boolean,
 *   parameterOverrides?: string[],
 *   excludeManufacturers?: string[],
 *   includeManufacturers?: string[],
 *   typeFilter?: string[],
 *   parameterTimeoutMs?: number,
 *   renderTimeoutMs?: number
 * }} options
 * @returns {PluginProfileReport}
 */
function createAuPluginProfile(options) {
  const sourceRoot = options.root ?? root;
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const auHostPath = compileAuProfileHost(sourceRoot, outputDir);
  const discovered = discoverInstalledAuPlugins({
    auHostPath,
    excludeManufacturers: options.excludeManufacturers,
    includeManufacturers: options.includeManufacturers,
    typeFilter: options.typeFilter
  });
  const filters = (options.pluginFilter ?? []).map((filter) => filter.toLowerCase());
  const excludeFilters = (options.excludePluginFilter ?? []).map((filter) => filter.toLowerCase());
  const included = filters.length
    ? discovered.filter((entry) => filters.some((filter) => entry.displayName.toLowerCase().includes(filter) || entry.normalizedName.includes(filter)))
    : discovered;
  const filtered = excludeFilters.length
    ? included.filter((entry) => !excludeFilters.some((filter) => entry.displayName.toLowerCase().includes(filter) || entry.normalizedName.includes(filter)))
    : included;
  const distinctEntries = options.preferProducts ? preferDistinctAuProducts(filtered) : filtered;
  const entries = distinctEntries.slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
  const plan = buildAuProfilePlan({
    entries,
    root: sourceRoot,
    signalIds: options.signalIds,
    signalLimit: options.signalLimit
  });
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

    for (const [index, plugin] of renderablePlan.entries()) {
      if (options.progress) {
        console.error(`[au-profile] ${index + 1}/${renderablePlan.length} ${plugin.displayName}`);
      }
      const pluginDir = path.join(outputDir, "renders", plugin.id.replace(/[^a-z0-9-:]+/giu, "-").replace(/:/gu, "-"));
      fs.mkdirSync(pluginDir, { recursive: true });
      const parameterMap = queryAuParametersExact(auHostPath, plugin, parameterOverrides, options.parameterTimeoutMs);
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
          { encoding: "utf8", killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"], timeout: options.renderTimeoutMs }
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
          ok: result.status === 0 && !result.error,
          status: result.status,
          stderr: (result.error?.message ?? result.stderr ?? "").trim(),
          stdout: result.stdout?.trim() ?? ""
        };
        if (resultEntry.ok && fs.existsSync(outputPath)) {
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
  const functionalCoverage = summarizeFunctionalPrimitiveCoverage(entries, engagementSummary);
  if (engagementSummary.length) {
    writeAnalysisReport(path.join(outputDir, "functional-primitive-summary.json"), functionalCoverage);
  }

  /** @type {PluginProfileReport} */
  const report = {
    id: "fwak-au-plugin-profile",
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
      functionalCoverage,
      results: renderResults
    }
  };

  writeFileAtomically(path.join(outputDir, "au-profile-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "au-plugin-inventory.json"), `${JSON.stringify(entries, null, 2)}\n`);
  writeFileAtomically(path.join(outputDir, "au-profile-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return report;
}

export {
  buildAuProfilePlan,
  compareAuPluginInventory,
  createAuPluginProfile,
  discoverInstalledAuPlugins,
  genericAuPrimitiveRules,
  inferPrimitiveIdsForAuName,
  normalizeAuPluginName,
  preferDistinctAuProducts,
  summarizeFunctionalPrimitiveCoverage
};
