// @ts-check

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderFaustWasm } from "./faust-profiling-tools.mjs";
import { readJsonFileSync, writeFileAtomically } from "./fs-tools.mjs";
import { loadProjectRuntime } from "./project-tools.mjs";
import { createProbeSignalSet, loadProbeSignalCorpus, probeSignalDefinition, readWavAsFloat32, writeFloat32Wav } from "./probe-signal-tools.mjs";
import { analyzeWavFile, compareWavFiles, writeAnalysisReport } from "./sonic-analysis-tools.mjs";
import {
  compareUadProfilingPreference,
  compileAuProfileHost,
  discoverInstalledUadPlugins,
  inferPrimitiveIdsForPluginName,
  queryAuHostParameters,
  uadProductKey
} from "./uad-plugin-profiler-tools.mjs";

/**
 * @typedef {import("../../types/framework").EmulationAssemblySpec} EmulationAssemblySpec
 * @typedef {import("../../types/framework").EmulationCandidateState} EmulationCandidateState
 * @typedef {import("../../types/framework").EmulationPilotReport} EmulationPilotReport
 * @typedef {import("../../types/framework").EmulationPilotTarget} EmulationPilotTarget
 * @typedef {import("../../types/framework").EmulationUadState} EmulationUadState
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").UadPluginInventoryEntry} UadPluginInventoryEntry
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {EmulationPilotTarget[]} */
const defaultEmulationPilotTargets = [
  {
    id: "uad-1176-rev-a",
    displayName: "UAD 1176 Rev A vintage compressor pilot",
    pluginFilters: ["UAD UA 1176 Rev A", "1176 Rev A"],
    candidateApp: "press-deck",
    primitiveIds: [
      "compression.vintage-compressor-model",
      "analog.preamp-console-stage",
      "saturation.virtual-analog-stage"
    ],
    signalIds: [
      "stepped-sine-level-sweep",
      "tone-burst-train",
      "program-dependent-bed",
      "transient-click-train",
      "two-tone-imd",
      "musical-drum-bass-loop"
    ],
    uadStates: [
      {
        id: "default",
        label: "Default instantiated state",
        parameterOverrides: {}
      },
      {
        id: "driven-fast",
        label: "Driven fast 4:1 compression",
        parameterOverrides: {
          Input: 0.45,
          Output: 0.55,
          Attack: 0.8,
          Release: 0.8,
          Ratio: 4,
          Mix: 1,
          Power: 1
        }
      },
      {
        id: "parallel-gentle",
        label: "Parallel gentle leveling",
        parameterOverrides: {
          Input: 0.25,
          Output: 0.65,
          Attack: 0.35,
          Release: 0.55,
          Ratio: 1,
          Mix: 0.75,
          Power: 1
        }
      }
    ],
    candidateStates: [
      {
        id: "default",
        label: "Press Deck default",
        controlOverrides: {}
      },
      {
        id: "vintage-fast",
        label: "Fast vintage compression",
        controlOverrides: {
          Mode: 1,
          Character: 1,
          Ratio: 4,
          Attack: 12,
          Release: 90,
          Threshold: -30,
          "Input Gain": 6,
          Mix: 100
        }
      },
      {
        id: "parallel",
        label: "Parallel vintage compression",
        controlOverrides: {
          Mode: 1,
          Character: 2,
          Ratio: 4,
          Attack: 35,
          Release: 180,
          Threshold: -24,
          "Input Gain": 3,
          Mix: 75
        }
      }
    ]
  },
  {
    id: "uad-pultec-eqp-1a",
    displayName: "UAD Pultec EQP-1A passive EQ pilot",
    pluginFilters: ["UAD Pultec EQP-1A", "Pultec EQP-1A", "EQP-1A"],
    candidateApp: "atlas-curve",
    primitiveIds: [
      "eq.passive-vintage-program-eq",
      "eq.circuit-model-topology",
      "analog.preamp-console-stage"
    ],
    signalIds: [
      "log-sweep-fullband",
      "pink-noise-calibrated",
      "stepped-sine-level-sweep",
      "phase-null-sweep",
      "two-tone-imd",
      "musical-drum-bass-loop"
    ],
    uadStates: [
      {
        id: "default",
        label: "Default instantiated state",
        parameterOverrides: {}
      },
      {
        id: "low-bloom",
        label: "Low boost plus attenuation",
        parameterOverrides: {
          "LF Boost": 0.35,
          "LF Atten": 0.2,
          "Low Freq": 1,
          Power: 1
        }
      },
      {
        id: "presence-air",
        label: "Presence lift and high shelf color",
        parameterOverrides: {
          "HF Boost": 0.32,
          "HF Atten": 0.12,
          "HF Q": 0.55,
          "High Freq": 4,
          "HF Atten Freq": 1,
          Power: 1
        }
      }
    ],
    candidateStates: [
      {
        id: "default",
        label: "Atlas Curve default",
        controlOverrides: {}
      },
      {
        id: "low-shape",
        label: "Passive low contour",
        controlOverrides: {
          "Low Shelf": 3,
          "High Shelf": 1.5,
          Style: 1,
          Mode: 1
        }
      },
      {
        id: "presence",
        label: "Presence and air contour",
        controlOverrides: {
          "Presence Gain": 2.5,
          "Presence Freq": 3600,
          "Bell Gain": -1,
          "High Shelf": 2,
          Style: 2
        }
      }
    ]
  }
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function slugify(value) {
  return normalizeKey(value).replace(/\s+/gu, "-") || "item";
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {Record<string, number> | undefined} overrides
 * @returns {string}
 */
function stableOverridesKey(overrides) {
  return JSON.stringify(Object.entries(overrides ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * @param {JsonObject | null | undefined} parameterMap
 * @returns {JsonObject[]}
 */
function parameterList(parameterMap) {
  return Array.isArray(parameterMap?.parameters) ? /** @type {JsonObject[]} */ (parameterMap.parameters) : [];
}

/**
 * @param {JsonObject[]} parameters
 * @param {string} key
 * @returns {JsonObject | null}
 */
function findParameter(parameters, key) {
  const normalized = normalizeKey(key);
  if (!normalized) {
    return null;
  }
  const numeric = /^\d+$/u.test(normalized);
  if (numeric) {
    const id = Number(normalized);
    const match = parameters.find((parameter) => Number(parameter.id) === id);
    if (match) {
      return match;
    }
  }
  return (
    parameters.find((parameter) => normalizeKey(parameter.name) === normalized)
    ?? parameters.find((parameter) => normalizeKey(parameter.name).includes(normalized))
    ?? null
  );
}

/**
 * @param {Record<string, number> | undefined} requested
 * @param {JsonObject | null | undefined} parameterMap
 * @returns {{ args: string[], applied: Record<string, number>, skipped: string[] }}
 */
function materializeParameterOverrides(requested, parameterMap) {
  const parameters = parameterList(parameterMap);
  /** @type {string[]} */
  const args = [];
  /** @type {Record<string, number>} */
  const applied = {};
  /** @type {string[]} */
  const skipped = [];

  for (const [requestedName, rawValue] of Object.entries(requested ?? {})) {
    const parameter = findParameter(parameters, requestedName);
    if (!parameter) {
      skipped.push(requestedName);
      continue;
    }
    const min = Number.isFinite(Number(parameter.min)) ? Number(parameter.min) : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(Number(parameter.max)) ? Number(parameter.max) : Number.POSITIVE_INFINITY;
    const value = clamp(Number(rawValue), min, max);
    const name = String(parameter.name ?? requestedName);
    args.push(`${name}=${value}`);
    applied[name] = value;
  }

  return { args, applied, skipped };
}

/**
 * @param {JsonObject | undefined} analysis
 * @param {JsonObject | undefined} candidate
 * @param {string} key
 * @returns {number}
 */
function fingerprintDistanceDb(analysis, candidate, key) {
  const left = /** @type {Record<string, number> | undefined} */ (analysis?.[key]);
  const right = /** @type {Record<string, number> | undefined} */ (candidate?.[key]);
  if (!left || !right) {
    return 0;
  }
  let sum = 0;
  let count = 0;
  for (const [frequency, leftValue] of Object.entries(left)) {
    const rightValue = right[frequency];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      continue;
    }
    sum += Math.abs(Math.max(-180, leftValue) - Math.max(-180, Number(rightValue)));
    count += 1;
  }
  return count ? sum / count : 0;
}

/**
 * @param {JsonObject} comparisonReport
 * @returns {{ score: number, normalizedError: number, correlation: number, spectralDistanceDb: number, harmonicDistanceDb: number, rmsDeltaDb: number }}
 */
function scoreSonicComparison(comparisonReport) {
  const comparison = /** @type {JsonObject} */ (comparisonReport.comparison ?? {});
  const reference = /** @type {JsonObject} */ (comparisonReport.reference ?? {});
  const candidate = /** @type {JsonObject} */ (comparisonReport.candidate ?? {});
  const normalizedError = Number(comparison.normalizedError ?? 1);
  const correlation = Number(comparison.correlation ?? 0);
  const spectralDistanceDb = fingerprintDistanceDb(reference, candidate, "spectralFingerprint");
  const harmonicDistanceDb = fingerprintDistanceDb(reference, candidate, "harmonicFingerprint");
  const referenceRmsDb = Number(/** @type {JsonObject} */ (reference.mono ?? {}).rmsDb ?? -240);
  const candidateRmsDb = Number(/** @type {JsonObject} */ (candidate.mono ?? {}).rmsDb ?? -240);
  const rmsDeltaDb = Math.abs(referenceRmsDb - candidateRmsDb);
  const correlationPenalty = Math.max(0, 1 - correlation) * 0.35;
  const score = normalizedError
    + spectralDistanceDb / 90
    + harmonicDistanceDb / 120
    + rmsDeltaDb / 45
    + correlationPenalty;

  return {
    score: Number(score.toFixed(6)),
    normalizedError: Number(normalizedError.toFixed(6)),
    correlation: Number(correlation.toFixed(6)),
    spectralDistanceDb: Number(spectralDistanceDb.toFixed(3)),
    harmonicDistanceDb: Number(harmonicDistanceDb.toFixed(3)),
    rmsDeltaDb: Number(rmsDeltaDb.toFixed(3))
  };
}

/**
 * @param {{ referenceEngaged?: boolean, metrics?: { score?: number } }} comparison
 * @returns {boolean}
 */
function isValidScoredComparison(comparison) {
  return comparison.referenceEngaged !== false && Number.isFinite(Number(comparison.metrics?.score));
}

/**
 * @param {Array<{ candidateStateId: string, signalId: string, referenceEngaged?: boolean, metrics: { score: number } }>} comparisons
 * @returns {Array<{ candidateStateId: string, averageScore: number, signalCount: number }>}
 */
function summarizeCandidateScores(comparisons) {
  /** @type {Map<string, { sum: number, count: number }>} */
  const scores = new Map();
  for (const comparison of comparisons) {
    if (!isValidScoredComparison(comparison)) {
      continue;
    }
    const score = Number(comparison.metrics.score);
    const existing = scores.get(comparison.candidateStateId) ?? { sum: 0, count: 0 };
    existing.sum += score;
    existing.count += 1;
    scores.set(comparison.candidateStateId, existing);
  }
  return [...scores.entries()]
    .map(([candidateStateId, aggregate]) => ({
      candidateStateId,
      averageScore: Number((aggregate.sum / Math.max(1, aggregate.count)).toFixed(6)),
      signalCount: aggregate.count
    }))
    .sort((left, right) => left.averageScore - right.averageScore || left.candidateStateId.localeCompare(right.candidateStateId));
}

/**
 * @param {Array<{ candidateStateId: string, averageScore: number, signalCount: number }>} scores
 * @returns {{ candidateStateId: string, averageScore: number, signalCount: number } | null}
 */
function selectBestCandidateState(scores) {
  return scores[0] ?? null;
}

/**
 * @param {UadPluginInventoryEntry[]} inventory
 * @param {EmulationPilotTarget} target
 * @returns {UadPluginInventoryEntry | null}
 */
function selectInstalledAuPlugin(inventory, target) {
  const auEntries = inventory.filter((entry) => entry.format === "au").sort(compareUadProfilingPreference);
  for (const filter of target.pluginFilters ?? []) {
    const normalizedFilter = normalizeKey(filter);
    const filterProductKey = uadProductKey(filter);
    const productMatch = auEntries.find((entry) => uadProductKey(entry.displayName) === filterProductKey);
    if (productMatch) {
      return productMatch;
    }
    const exact = auEntries.find((entry) => normalizeKey(entry.displayName) === normalizedFilter);
    if (exact) {
      return exact;
    }
    const contains = auEntries.find((entry) => normalizeKey(entry.displayName).includes(normalizedFilter));
    if (contains) {
      return contains;
    }
  }
  return null;
}

/**
 * @param {string} auHostPath
 * @param {UadPluginInventoryEntry} plugin
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ exact?: boolean, tailSeconds?: number, parameterArgs?: string[], renderMethod?: string }} [options]
 * @returns {{ ok: boolean, status: number | null, stdout: string, stderr: string }}
 */
function renderAuPluginProbe(auHostPath, plugin, inputPath, outputPath, options = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = spawnSync(
    auHostPath,
    [
      "--render",
      "--name",
      plugin.displayName,
      ...(options.exact ? ["--exact"] : []),
      "--render-method",
      options.renderMethod ?? "callback",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--tail",
      String(options.tailSeconds ?? 2),
      ...(options.parameterArgs ?? []).flatMap((override) => ["--set", override])
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
 * @param {string} sourceRoot
 * @param {string} appKey
 * @returns {import("../../types/framework").ProjectRuntime}
 */
function exportAndLoadAppRuntime(sourceRoot, appKey) {
  execFileSync(process.execPath, ["tools/export-targets.mjs", "--app", appKey], {
    cwd: sourceRoot,
    stdio: "inherit"
  });
  return loadProjectRuntime(["--app", appKey]);
}

/**
 * @param {{
 *   runtime: import("../../types/framework").ProjectRuntime,
 *   probeManifest: import("../../types/framework").ProbeSignalManifest,
 *   probeDir: string,
 *   outputDir: string,
 *   candidateState: EmulationCandidateState,
 *   signalIds: string[],
 *   tailSeconds?: number
 * }} options
 * @returns {Promise<Record<string, JsonObject>>}
 */
async function renderFaustCandidateState(options) {
  const wasmPath = path.join(options.runtime.targetDir, `${options.runtime.sourceBase}.wasm`);
  const uiJsonPath = path.join(options.runtime.targetDir, `${options.runtime.sourceBase}.ui.json`);
  /** @type {Record<string, JsonObject>} */
  const renders = {};
  for (const signalId of options.signalIds) {
    const manifestEntry = options.probeManifest.signals?.find((entry) => entry.id === signalId);
    if (!manifestEntry) {
      continue;
    }
    const inputPath = path.join(options.probeDir, manifestEntry.path);
    const outputPath = path.join(options.outputDir, `${signalId}.wav`);
    const input = readWavAsFloat32(inputPath);
    const rendered = await renderFaustWasm({
      blockSize: options.runtime.project.benchmark.blockSize,
      controlOverrides: options.candidateState.controlOverrides ?? {},
      input,
      oversamplingFactor: options.runtime.project.oversampling.factor,
      tailSeconds: options.tailSeconds,
      uiJsonPath,
      wasmPath
    });
    writeFloat32Wav(outputPath, rendered);
    renders[signalId] = {
      ok: true,
      outputPath
    };
  }
  return renders;
}

/**
 * @param {EmulationPilotTarget} target
 * @param {{
 *   selectedPlugin: UadPluginInventoryEntry,
 *   bestCandidate: { candidateStateId: string, averageScore: number, signalCount: number } | null,
 *   candidateScores: Array<{ candidateStateId: string, averageScore: number, signalCount: number }>,
 *   comparisons: JsonObject[],
 *   parameterMap: JsonObject,
 *   outputDir: string
 * }} context
 * @returns {EmulationAssemblySpec}
 */
function buildPilotAssemblySpec(target, context) {
  const bestState = (target.candidateStates ?? []).find((state) => state.id === context.bestCandidate?.candidateStateId) ?? null;
  /**
   * @param {JsonObject} comparison
   * @param {string} key
   * @returns {number}
   */
  const metric = (comparison, key) => {
    const metrics = /** @type {JsonObject} */ (comparison.metrics ?? {});
    return Number(metrics[key] ?? 0);
  };
  const notes = [
    "Scores are behavioral fit signals, not a claim of binary identity.",
    "Lower scores indicate closer time-domain, spectral, harmonic, loudness, and correlation behavior.",
    "Use the residual list to decide which primitive or control should be refined next."
  ];
  if (!context.bestCandidate) {
    notes.push("No candidate was selected because no reference render passed the dry-input engagement check.");
  }
  return {
    id: `${target.id}-assembly-spec`,
    generatedAt: new Date().toISOString(),
    reference: {
      pluginId: context.selectedPlugin.id,
      pluginName: context.selectedPlugin.displayName,
      pluginPath: context.selectedPlugin.path,
      parameterCount: parameterList(context.parameterMap).length
    },
    candidate: {
      appKey: target.candidateApp,
      selectedStateId: context.bestCandidate?.candidateStateId ?? null,
      selectedControls: bestState?.controlOverrides ?? {},
      averageScore: context.bestCandidate?.averageScore ?? null,
      signalCount: context.bestCandidate?.signalCount ?? 0
    },
    primitiveIds: target.primitiveIds ?? [],
    candidateScores: context.candidateScores,
    residuals: context.comparisons
      .filter((comparison) => comparison.candidateStateId === context.bestCandidate?.candidateStateId)
      .filter(isValidScoredComparison)
      .sort((left, right) => metric(right, "score") - metric(left, "score"))
      .slice(0, 8)
      .map((comparison) => ({
        signalId: comparison.signalId,
        uadStateId: comparison.uadStateId,
        score: metric(comparison, "score"),
        spectralDistanceDb: metric(comparison, "spectralDistanceDb"),
        harmonicDistanceDb: metric(comparison, "harmonicDistanceDb"),
        rmsDeltaDb: metric(comparison, "rmsDeltaDb")
      })),
    notes
  };
}

/**
 * @param {{
 *   root?: string,
 *   outputDir: string,
 *   targetIds?: string[],
 *   signalLimit?: number,
 *   stateLimit?: number,
 *   candidateLimit?: number,
 *   tailSeconds?: number,
 *   renderMethod?: string
 * }} options
 * @returns {Promise<EmulationPilotReport>}
 */
async function runEmulationPilots(options) {
  const sourceRoot = options.root ?? root;
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const selectedTargetIds = new Set(options.targetIds ?? []);
  const targets = defaultEmulationPilotTargets.filter((target) => !selectedTargetIds.size || selectedTargetIds.has(target.id));
  const inventory = discoverInstalledUadPlugins();
  const auHostPath = compileAuProfileHost(sourceRoot, outputDir);
  /** @type {JsonObject[]} */
  const targetReports = [];
  /** @type {Map<string, import("../../types/framework").ProjectRuntime>} */
  const runtimeByApp = new Map();
  const corpus = loadProbeSignalCorpus({ root: sourceRoot });

  for (const target of targets) {
    const targetDir = path.join(outputDir, target.id);
    const probeDir = path.join(targetDir, "probes");
    const selectedPlugin = selectInstalledAuPlugin(inventory, target);
    if (!selectedPlugin) {
      targetReports.push({
        id: target.id,
        skipped: true,
        reason: "No installed Audio Unit matched the target filters.",
        pluginFilters: target.pluginFilters ?? []
      });
      continue;
    }

    const primitiveIds = target.primitiveIds?.length
      ? target.primitiveIds
      : inferPrimitiveIdsForPluginName(selectedPlugin.displayName).primitiveIds;
    const signalIds = [...new Set(target.signalIds ?? [])].slice(0, options.signalLimit && options.signalLimit > 0 ? options.signalLimit : undefined);
    const probeManifest = createProbeSignalSet({
      outputDir: probeDir,
      primitiveIds,
      root: sourceRoot,
      signalIds
    });
    const resolvedSignalIds = probeManifest.signals?.map((entry) => entry.id) ?? [];
    const parameterMap = queryAuHostParameters(auHostPath, selectedPlugin, []);
    writeAnalysisReport(path.join(targetDir, "uad-parameters.json"), parameterMap);
    const renderPlugin = {
      ...selectedPlugin,
      displayName: typeof parameterMap.component === "string" && parameterMap.component
        ? parameterMap.component
        : selectedPlugin.displayName
    };

    const uadStates = (target.uadStates ?? []).slice(0, options.stateLimit && options.stateLimit > 0 ? options.stateLimit : undefined);
    const candidateStates = (target.candidateStates ?? []).slice(0, options.candidateLimit && options.candidateLimit > 0 ? options.candidateLimit : undefined);
    /** @type {JsonObject[]} */
    const uadRenderResults = [];
    /** @type {Map<string, Record<string, string>>} */
    const uadOutputsByState = new Map();
    /** @type {Map<string, boolean>} */
    const referenceEngagementByStateSignal = new Map();

    for (const state of uadStates) {
      const stateDir = path.join(targetDir, "uad", state.id);
      const materialized = materializeParameterOverrides(state.parameterOverrides ?? {}, parameterMap);
      writeAnalysisReport(path.join(stateDir, "parameters.json"), queryAuHostParameters(auHostPath, renderPlugin, materialized.args, { exact: true }));
      /** @type {Record<string, string>} */
      const outputs = {};
      for (const signalId of resolvedSignalIds) {
        const manifestEntry = probeManifest.signals?.find((entry) => entry.id === signalId);
        if (!manifestEntry) {
          continue;
        }
        const inputPath = path.join(probeDir, manifestEntry.path);
        const outputPath = path.join(stateDir, `${signalId}.wav`);
        const renderResult = renderAuPluginProbe(auHostPath, renderPlugin, inputPath, outputPath, {
          exact: true,
          parameterArgs: materialized.args,
          renderMethod: options.renderMethod ?? "callback",
          tailSeconds: options.tailSeconds
        });
        /** @type {JsonObject} */
        const resultEntry = {
          ok: renderResult.ok,
          signalId,
          stateId: state.id,
          stateLabel: state.label,
          appliedParameters: materialized.applied,
          skippedParameters: materialized.skipped,
          outputPath,
          mode: "headless-audio-unit-cli",
          uiStaging: false,
          status: renderResult.status,
          stderr: renderResult.stderr.trim()
        };
        if (renderResult.ok && fs.existsSync(outputPath)) {
          outputs[signalId] = outputPath;
          const definition = probeSignalDefinition(corpus, signalId);
          const analysis = analyzeWavFile(outputPath, { signalId, signalDefinition: definition });
          writeAnalysisReport(path.join(stateDir, `${signalId}.analysis.json`), analysis);
          const inputComparison = compareWavFiles(inputPath, outputPath);
          const inputComparisonMetrics = scoreSonicComparison(inputComparison);
          const inputComparisonPath = path.join(stateDir, `${signalId}.input-comparison.json`);
          const inputTimeComparison = /** @type {JsonObject} */ (inputComparison.comparison ?? {});
          const referenceEngaged = Number(inputTimeComparison.normalizedError ?? 0) > 0.000001;
          referenceEngagementByStateSignal.set(`${state.id}:${signalId}`, referenceEngaged);
          writeAnalysisReport(inputComparisonPath, {
            signalId,
            stateId: state.id,
            referenceEngaged,
            metrics: inputComparisonMetrics,
            report: inputComparison
          });
          resultEntry.analysis = analysis;
          resultEntry.referenceEngagement = {
            engaged: referenceEngaged,
            comparisonPath: inputComparisonPath,
            normalizedError: inputComparisonMetrics.normalizedError,
            correlation: inputComparisonMetrics.correlation
          };
        }
        uadRenderResults.push(resultEntry);
      }
      uadOutputsByState.set(state.id, outputs);
    }

    let runtime = runtimeByApp.get(target.candidateApp);
    if (!runtime) {
      runtime = exportAndLoadAppRuntime(sourceRoot, target.candidateApp);
      runtimeByApp.set(target.candidateApp, runtime);
    }

    /** @type {JsonObject[]} */
    const faustRenderResults = [];
    /** @type {Map<string, Record<string, string>>} */
    const faustOutputsByCandidate = new Map();
    const renderedCandidateKeys = new Set();
    for (const candidateState of candidateStates) {
      const renderKey = stableOverridesKey(candidateState.controlOverrides);
      if (renderedCandidateKeys.has(renderKey)) {
        continue;
      }
      renderedCandidateKeys.add(renderKey);
      const stateDir = path.join(targetDir, "faust", candidateState.id);
      fs.mkdirSync(stateDir, { recursive: true });
      writeAnalysisReport(path.join(stateDir, "controls.json"), candidateState.controlOverrides ?? {});
      const renders = await renderFaustCandidateState({
        candidateState,
        outputDir: stateDir,
        probeDir,
        probeManifest,
        runtime,
        signalIds: resolvedSignalIds,
        tailSeconds: options.tailSeconds
      });
      /** @type {Record<string, string>} */
      const outputs = {};
      for (const [signalId, renderResult] of Object.entries(renders)) {
        const outputPath = String(renderResult.outputPath ?? "");
        outputs[signalId] = outputPath;
        const definition = probeSignalDefinition(corpus, signalId);
        const analysis = analyzeWavFile(outputPath, { signalId, signalDefinition: definition });
        writeAnalysisReport(path.join(stateDir, `${signalId}.analysis.json`), analysis);
        faustRenderResults.push({
          ok: true,
          candidateStateId: candidateState.id,
          signalId,
          outputPath,
          analysis
        });
      }
      faustOutputsByCandidate.set(candidateState.id, outputs);
    }

    /** @type {JsonObject[]} */
    const comparisons = [];
    for (const uadState of uadStates) {
      const uadOutputs = uadOutputsByState.get(uadState.id) ?? {};
      for (const candidateState of candidateStates) {
        const candidateOutputs = faustOutputsByCandidate.get(candidateState.id) ?? {};
        for (const signalId of resolvedSignalIds) {
          const referencePath = uadOutputs[signalId];
          const candidatePath = candidateOutputs[signalId];
          if (!referencePath || !candidatePath) {
            continue;
          }
          const comparisonReport = compareWavFiles(referencePath, candidatePath);
          const metrics = scoreSonicComparison(comparisonReport);
          const referenceEngaged = referenceEngagementByStateSignal.get(`${uadState.id}:${signalId}`) ?? true;
          const comparisonDir = path.join(targetDir, "comparisons", uadState.id, candidateState.id);
          const comparisonPath = path.join(comparisonDir, `${signalId}.json`);
          const summary = {
            signalId,
            uadStateId: uadState.id,
            candidateStateId: candidateState.id,
            referencePath,
            candidatePath,
            comparisonPath,
            referenceEngaged,
            metrics
          };
          writeAnalysisReport(comparisonPath, { ...summary, report: comparisonReport });
          comparisons.push(summary);
        }
      }
    }

    const candidateScores = summarizeCandidateScores(/** @type {Array<{ candidateStateId: string, signalId: string, referenceEngaged?: boolean, metrics: { score: number } }>} */ (comparisons));
    const bestCandidate = selectBestCandidateState(candidateScores);
    const assemblySpec = buildPilotAssemblySpec(target, {
      bestCandidate,
      candidateScores,
      comparisons,
      outputDir: targetDir,
      parameterMap,
      selectedPlugin
    });
    const assemblySpecPath = path.join(targetDir, "assembly-spec.json");
    writeFileAtomically(assemblySpecPath, `${JSON.stringify(assemblySpec, null, 2)}\n`);

    targetReports.push({
      id: target.id,
      displayName: target.displayName,
      selectedPlugin,
      primitiveIds,
      signalIds: resolvedSignalIds,
      candidateApp: target.candidateApp,
      uadStateCount: uadStates.length,
      candidateStateCount: candidateStates.length,
      comparisonCount: comparisons.length,
      renderMethod: options.renderMethod ?? "callback",
      validComparisonCount: comparisons.filter(isValidScoredComparison).length,
      invalidComparisonCount: comparisons.filter((comparison) => !isValidScoredComparison(comparison)).length,
      referenceEngagedCount: [...referenceEngagementByStateSignal.values()].filter(Boolean).length,
      referencePassThroughCount: [...referenceEngagementByStateSignal.values()].filter((value) => !value).length,
      bestCandidate,
      candidateScores,
      assemblySpecPath,
      uadRenderResults,
      faustRenderResults
    });
  }

  /** @type {EmulationPilotReport} */
  const report = {
    id: "fwak-emulation-pilot-report",
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname()
    },
    auHostPath,
    outputDir,
    mode: "headless-audio-unit-cli",
    uiStaging: false,
    renderMethod: options.renderMethod ?? "callback",
    targets: targetReports
  };

  writeFileAtomically(path.join(outputDir, "emulation-pilot-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export {
  buildPilotAssemblySpec,
  defaultEmulationPilotTargets,
  materializeParameterOverrides,
  runEmulationPilots,
  scoreSonicComparison,
  selectBestCandidateState,
  selectInstalledAuPlugin,
  summarizeCandidateScores
};
