// @ts-check

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveProjectPrimitiveSet } from "./primitive-library-tools.mjs";
import { gatherControls, loadProjectRuntime } from "./project-tools.mjs";
import { createProbeSignalSet, readWavAsFloat32, writeFloat32Wav, probeSignalDefinition, loadProbeSignalCorpus } from "./probe-signal-tools.mjs";
import { analyzeWavFile, writeAnalysisReport } from "./sonic-analysis-tools.mjs";
import { readJsonFileSync, writeFileAtomically } from "./fs-tools.mjs";

/**
 * @typedef {import("../../types/framework").FaustAssemblageProfileReport} FaustAssemblageProfileReport
 * @typedef {import("../../types/framework").JsonValue} JsonValue
 * @typedef {{ sampleRate: number, channels: number, frames: number, channelData: Float32Array[] }} FloatWav
 */

/**
 * @param {number} value
 * @param {number} alignment
 * @returns {number}
 */
function alignTo(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * @param {WebAssembly.ModuleImportDescriptor[]} requiredImports
 * @returns {{ env: Record<string, WebAssembly.Global | Function> }}
 */
function createWasmEnv(requiredImports) {
  /** @type {Record<string, (...args: number[]) => number>} */
  const mathFunctions = {
    _acosf: Math.acos,
    _asinf: Math.asin,
    _atan2f: Math.atan2,
    _atanf: Math.atan,
    _ceilf: Math.ceil,
    _cosf: Math.cos,
    _coshf: Math.cosh,
    _expf: Math.exp,
    _fabsf: Math.abs,
    _floorf: Math.floor,
    _fmodf: (a, b) => a % b,
    _log10f: Math.log10,
    _logf: Math.log,
    _powf: Math.pow,
    _roundf: Math.round,
    _sinf: Math.sin,
    _sinhf: Math.sinh,
    _sqrtf: Math.sqrt,
    _tanf: Math.tan,
    _tanhf: Math.tanh
  };

  /** @type {Record<string, WebAssembly.Global | Function>} */
  const env = {
    memoryBase: new WebAssembly.Global({ value: "i32", mutable: false }, 0),
    tableBase: new WebAssembly.Global({ value: "i32", mutable: false }, 0)
  };

  for (const item of requiredImports) {
    if (item.module !== "env" || item.kind !== "function") {
      continue;
    }
    const implementation = mathFunctions[item.name];
    if (!implementation) {
      throw new Error(`Missing wasm import implementation for ${item.module}.${item.name}`);
    }
    env[item.name] = implementation;
  }

  return { env };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeControlKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * @param {import("../../types/framework").FaustControlItem} control
 * @param {number} index
 * @returns {string[]}
 */
function controlMatchKeys(control, index) {
  return [
    control.label,
    control.address,
    control.shortname,
    control.address?.split("/").filter(Boolean).at(-1),
    String(index)
  ].map(normalizeControlKey).filter(Boolean);
}

/**
 * @param {JsonValue} value
 * @returns {JsonValue}
 */
function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry === undefined ? null : cloneJsonValue(entry)]));
  }
  return value;
}

/**
 * @param {import("../../types/framework").FaustUiItem[] | undefined} items
 * @param {Map<string, number>} indexByKey
 */
function collectControlIndexes(items, indexByKey) {
  for (const item of items ?? []) {
    if (item.items) {
      collectControlIndexes(item.items, indexByKey);
      continue;
    }
    const index = Number(item.index);
    if (!Number.isFinite(index)) {
      continue;
    }
    for (const key of controlMatchKeys(/** @type {import("../../types/framework").FaustControlItem} */ (item), index)) {
      if (!indexByKey.has(key)) {
        indexByKey.set(key, index);
      }
    }
  }
}

/**
 * @param {string} wastPath
 * @returns {JsonValue | null}
 */
function readEmbeddedWastJson(wastPath) {
  if (!fs.existsSync(wastPath)) {
    return null;
  }
  const wast = fs.readFileSync(wastPath, "utf8");
  const match = /\(data\s+\(i32\.const\s+0\)\s+"((?:\\.|[^"\\])*)"/su.exec(wast);
  if (!match?.[1]) {
    return null;
  }
  const decoded = JSON.parse(`"${match[1]}"`);
  return JSON.parse(decoded);
}

/**
 * @param {string} uiJsonPath
 * @returns {string}
 */
function siblingWastPath(uiJsonPath) {
  return uiJsonPath.replace(/\.ui\.json$/u, ".wast");
}

/**
 * Faust JSON emitted via `faust -json` can omit the WASM zone indexes that
 * `setParamValue` expects. The WAST target embeds the same UI JSON with those
 * indexes, so merge them back before rendering profiled candidates.
 *
 * @param {JsonValue} uiJson
 * @param {string} uiJsonPath
 * @returns {JsonValue}
 */
function applyFaustWasmControlIndexes(uiJson, uiJsonPath) {
  const embedded = readEmbeddedWastJson(siblingWastPath(uiJsonPath));
  if (!embedded || typeof embedded !== "object" || Array.isArray(embedded)) {
    return uiJson;
  }

  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  collectControlIndexes(/** @type {{ ui?: import("../../types/framework").FaustUiItem[] }} */ (embedded).ui, indexByKey);
  if (!indexByKey.size) {
    return uiJson;
  }

  const nextUiJson = cloneJsonValue(uiJson);
  /**
   * @param {import("../../types/framework").FaustUiItem[] | undefined} items
   */
  const applyIndexes = (items) => {
    for (const item of items ?? []) {
      if (item.items) {
        applyIndexes(item.items);
        continue;
      }
      if (Number.isFinite(Number(item.index))) {
        continue;
      }
      const keys = controlMatchKeys(/** @type {import("../../types/framework").FaustControlItem} */ (item), -1);
      const index = keys.map((key) => indexByKey.get(key)).find((value) => Number.isFinite(Number(value)));
      if (Number.isFinite(Number(index))) {
        item.index = Number(index);
      }
    }
  };
  applyIndexes(/** @type {{ ui?: import("../../types/framework").FaustUiItem[] }} */ (nextUiJson).ui);
  return nextUiJson;
}

/**
 * @param {{
 *   setParamValue?: Function,
 *   dspOffset: number,
 *   uiJson: JsonValue,
 *   controlOverrides?: Record<string, number>
 * }} options
 * @returns {{ applied: Record<string, number>, missing: string[] }}
 */
function applyFaustControlOverrides(options) {
  const overrides = options.controlOverrides ?? {};
  const overrideEntries = Object.entries(overrides).filter(([, value]) => Number.isFinite(Number(value)));
  if (!overrideEntries.length) {
    return { applied: {}, missing: [] };
  }
  if (typeof options.setParamValue !== "function") {
    throw new Error("Generated Faust WASM does not export setParamValue, so control overrides cannot be applied.");
  }

  const uiJson = /** @type {{ ui?: import("../../types/framework").FaustUiItem[] }} */ (options.uiJson ?? {});
  const controls = gatherControls(uiJson.ui);
  /** @type {Map<string, { index: number, label: string }>} */
  const controlsByKey = new Map();
  controls.forEach((control, index) => {
    for (const key of controlMatchKeys(control, index)) {
      if (!controlsByKey.has(key)) {
        controlsByKey.set(key, { index: Number(control.index ?? index), label: control.label });
      }
    }
  });

  /** @type {Record<string, number>} */
  const applied = {};
  /** @type {string[]} */
  const missing = [];
  for (const [name, rawValue] of overrideEntries) {
    const match = controlsByKey.get(normalizeControlKey(name));
    if (!match) {
      missing.push(name);
      continue;
    }
    const value = Number(rawValue);
    options.setParamValue(options.dspOffset, match.index, value);
    applied[match.label] = value;
  }

  return { applied, missing };
}

/**
 * @param {{
 *   wasmPath: string,
 *   uiJsonPath: string,
 *   input: FloatWav,
 *   blockSize: number,
 *   oversamplingFactor?: number,
 *   tailSeconds?: number,
 *   controlOverrides?: Record<string, number>
 * }} options
 * @returns {Promise<FloatWav>}
 */
async function renderFaustWasm(options) {
  const wasmBytes = fs.readFileSync(options.wasmPath);
  const module = new WebAssembly.Module(wasmBytes);
  const imports = createWasmEnv(WebAssembly.Module.imports(module));
  const instance = await WebAssembly.instantiate(module, imports);
  const exports = /** @type {{ memory: WebAssembly.Memory, init: Function, compute: Function, setParamValue?: Function }} */ (instance.exports);
  const uiJson = /** @type {import("../../types/framework").FaustUiExport} */ (
    applyFaustWasmControlIndexes(readJsonFileSync(options.uiJsonPath), options.uiJsonPath)
  );
  const sampleRate = options.input.sampleRate;
  const channels = Math.max(1, options.input.channels);
  const blockSize = Math.max(1, options.blockSize);
  const tailFrames = Math.max(0, Math.round((options.tailSeconds ?? 2) * sampleRate));
  const outputFrames = options.input.frames + tailFrames;
  const frameStrideBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const memF32 = new Float32Array(exports.memory.buffer);
  const memI32 = new Int32Array(exports.memory.buffer);
  const dspOffset = 0;
  const audioHeapBase = alignTo((Number(uiJson.size ?? 16384)) + 4096, 16);
  const inputBase = audioHeapBase;
  const outputBase = inputBase + frameStrideBytes * channels;
  const inputPtrsBase = outputBase + frameStrideBytes * channels;
  const outputPtrsBase = inputPtrsBase + Int32Array.BYTES_PER_ELEMENT * channels;

  exports.init(dspOffset, sampleRate * Math.max(1, options.oversamplingFactor ?? 1));
  const appliedControls = applyFaustControlOverrides({
    controlOverrides: options.controlOverrides,
    dspOffset,
    setParamValue: exports.setParamValue,
    uiJson
  });
  if (appliedControls.missing.length) {
    throw new Error(`Unknown Faust control override(s): ${appliedControls.missing.join(", ")}`);
  }

  for (let channel = 0; channel < channels; channel += 1) {
    memI32[(inputPtrsBase >> 2) + channel] = inputBase + frameStrideBytes * channel;
    memI32[(outputPtrsBase >> 2) + channel] = outputBase + frameStrideBytes * channel;
  }

  const output = {
    sampleRate,
    channels,
    frames: outputFrames,
    channelData: Array.from({ length: channels }, () => new Float32Array(outputFrames))
  };

  for (let frame = 0; frame < outputFrames; frame += blockSize) {
    const framesThisBlock = Math.min(blockSize, outputFrames - frame);
    for (let channel = 0; channel < channels; channel += 1) {
      const base = (inputBase >> 2) + channel * blockSize;
      const outBase = (outputBase >> 2) + channel * blockSize;
      for (let index = 0; index < blockSize; index += 1) {
        const sourceFrame = frame + index;
        memF32[base + index] = index < framesThisBlock && sourceFrame < options.input.frames
          ? options.input.channelData[channel]?.[sourceFrame] ?? 0
          : 0;
        memF32[outBase + index] = 0;
      }
    }
    exports.compute(dspOffset, framesThisBlock, inputPtrsBase, outputPtrsBase);
    for (let channel = 0; channel < channels; channel += 1) {
      const outBase = (outputBase >> 2) + channel * blockSize;
      const outputChannel = output.channelData[channel];
      if (!outputChannel) {
        continue;
      }
      for (let index = 0; index < framesThisBlock; index += 1) {
        outputChannel[frame + index] = memF32[outBase + index] ?? 0;
      }
    }
  }

  return output;
}

/**
 * @param {{
 *   appKey: string,
 *   root: string,
 *   outputDir: string,
 *   signalLimit?: number,
 *   signalIds?: string[],
 *   tailSeconds?: number,
 *   controlOverrides?: Record<string, number>,
 *   skipExport?: boolean
 * }} options
 * @returns {Promise<FaustAssemblageProfileReport>}
 */
async function profileFaustAssemblage(options) {
  if (!options.skipExport) {
    execFileSync(process.execPath, ["tools/export-targets.mjs", "--app", options.appKey], {
      cwd: options.root,
      stdio: "inherit"
    });
  }

  const runtime = loadProjectRuntime(["--app", options.appKey]);
  const primitiveSet = resolveProjectPrimitiveSet(runtime);
  const outputDir = path.resolve(options.outputDir);
  const probeDir = path.join(outputDir, "probes");
  const renderDir = path.join(outputDir, "renders");
  fs.mkdirSync(renderDir, { recursive: true });
  const probeManifest = createProbeSignalSet({
    outputDir: probeDir,
    primitiveIds: primitiveSet.primitiveIds,
    root: options.root,
    signalIds: options.signalIds,
    limit: options.signalLimit
  });
  const corpus = loadProbeSignalCorpus({ root: options.root });
  const wasmPath = path.join(runtime.targetDir, `${runtime.sourceBase}.wasm`);
  const uiJsonPath = path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
  /** @type {Record<string, JsonValue>} */
  const analyses = {};

  for (const signal of probeManifest.signals ?? []) {
    const inputPath = path.join(probeDir, signal.path);
    const outputPath = path.join(renderDir, `${signal.id}.wav`);
    const input = readWavAsFloat32(inputPath);
    const rendered = await renderFaustWasm({
      blockSize: runtime.project.benchmark.blockSize,
      input,
      oversamplingFactor: runtime.project.oversampling.factor,
      tailSeconds: options.tailSeconds,
      controlOverrides: options.controlOverrides,
      uiJsonPath,
      wasmPath
    });
    writeFloat32Wav(outputPath, rendered);
    const definition = probeSignalDefinition(corpus, signal.id);
    const analysis = analyzeWavFile(outputPath, { signalId: signal.id, signalDefinition: definition });
    analyses[signal.id] = analysis;
    writeAnalysisReport(path.join(renderDir, `${signal.id}.analysis.json`), analysis);
  }

  /** @type {FaustAssemblageProfileReport} */
  const report = {
    id: "fwak-faust-assemblage-profile",
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname()
    },
    appKey: options.appKey,
    primitiveIds: primitiveSet.primitiveIds,
    controlOverrides: options.controlOverrides ?? {},
    probeManifestPath: path.relative(outputDir, path.join(probeDir, "probe-manifest.json")),
    renderDir: path.relative(outputDir, renderDir),
    analyses
  };

  writeFileAtomically(path.join(outputDir, "faust-profile-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export {
  applyFaustWasmControlIndexes,
  applyFaustControlOverrides,
  profileFaustAssemblage,
  renderFaustWasm
};
