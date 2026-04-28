// @ts-check

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveProjectPrimitiveSet } from "./primitive-library-tools.mjs";
import { loadProjectRuntime } from "./project-tools.mjs";
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
 * @param {{
 *   wasmPath: string,
 *   uiJsonPath: string,
 *   input: FloatWav,
 *   blockSize: number,
 *   oversamplingFactor?: number,
 *   tailSeconds?: number
 * }} options
 * @returns {Promise<FloatWav>}
 */
async function renderFaustWasm(options) {
  const wasmBytes = fs.readFileSync(options.wasmPath);
  const module = new WebAssembly.Module(wasmBytes);
  const imports = createWasmEnv(WebAssembly.Module.imports(module));
  const instance = await WebAssembly.instantiate(module, imports);
  const exports = /** @type {{ memory: WebAssembly.Memory, init: Function, compute: Function }} */ (instance.exports);
  const uiJson = readJsonFileSync(options.uiJsonPath);
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
 *   tailSeconds?: number
 * }} options
 * @returns {Promise<FaustAssemblageProfileReport>}
 */
async function profileFaustAssemblage(options) {
  execFileSync(process.execPath, ["tools/export-targets.mjs", "--app", options.appKey], {
    cwd: options.root,
    stdio: "inherit"
  });

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
    probeManifestPath: path.relative(outputDir, path.join(probeDir, "probe-manifest.json")),
    renderDir: path.relative(outputDir, renderDir),
    analyses
  };

  writeFileAtomically(path.join(outputDir, "faust-profile-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export {
  profileFaustAssemblage,
  renderFaustWasm
};
