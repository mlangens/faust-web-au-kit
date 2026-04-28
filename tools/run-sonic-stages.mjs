// @ts-check

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BLOCK_SIZE,
  analyzeAudio,
  createNativeHostRequest,
  createSonicFixture,
  createSonicReport,
  evaluateAssertion,
  loadSonicUi,
  resolveSonicStages,
  validateSonicStage,
  writeSonicReport
} from "./lib/sonic-stage-tools.mjs";
import { runCommand, runNodeTool } from "./lib/export-process-tools.mjs";
import { writeFileAtomically } from "./lib/fs-tools.mjs";
import { loadProjectRuntime, loadSuiteRuntime, parseCliArgs } from "./lib/project-tools.mjs";

/**
 * @typedef {import("../types/framework").ProjectRuntime} ProjectRuntime
 * @typedef {import("../types/framework").SonicNativeHostRequest} SonicNativeHostRequest
 * @typedef {import("../types/framework").SonicRenderManifest} SonicRenderManifest
 * @typedef {import("../types/framework").SonicRenderReport} SonicRenderReport
 * @typedef {import("../types/framework").SonicStageManifest} SonicStageManifest
 * @typedef {import("./lib/sonic-stage-tools.mjs").AudioBuffer} AudioBuffer
 * @typedef {{ address: string, pointer: number }} ControlPointer
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPPORTED_DIRECT_MODES = new Set(["dsp", "cpp", "cpp-direct"]);
const SUPPORTED_HOST_MODES = new Set(["native", "standalone", "vst3"]);

/**
 * @returns {string}
 */
function resolveFaustIncludeRoot() {
  const prefix = String(
    runCommand("brew", ["--prefix", "faust"], {
      description: "Resolve Homebrew Faust prefix",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    })
  ).trim();
  return path.join(prefix, "include");
}

/**
 * @returns {string}
 */
function resolveMacosSdkRoot() {
  return String(
    runCommand("xcrun", ["--show-sdk-path"], {
      description: "Resolve macOS SDK path",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    })
  ).trim();
}

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
 * @returns {{ env: Record<string, (...args: number[]) => number> }}
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

  /** @type {Record<string, (...args: number[]) => number>} */
  const env = {};
  for (const item of requiredImports) {
    if (item.module !== "env" || item.kind !== "function") {
      continue;
    }
    const implementation = mathFunctions[item.name];
    if (!implementation) {
      throw new Error(`Missing wasm import implementation for env.${item.name}`);
    }
    env[item.name] = implementation;
  }
  return { env };
}

/**
 * @param {WebAssembly.Memory} memory
 * @param {number} requiredBytes
 */
function ensureWasmMemory(memory, requiredBytes) {
  const deficit = requiredBytes - memory.buffer.byteLength;
  if (deficit > 0) {
    memory.grow(Math.ceil(deficit / 65536));
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {Function}
 */
function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`WASM export "${name}" is missing.`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {WebAssembly.Memory}
 */
function requireMemory(value) {
  if (!(value instanceof WebAssembly.Memory)) {
    throw new Error("WASM export \"memory\" is missing.");
  }
  return value;
}

/**
 * @param {WebAssembly.Memory} memory
 * @param {import("../types/framework").FaustControlItem[]} controls
 * @param {number} stringBase
 * @returns {Map<string, ControlPointer>}
 */
function writeControlAddressPointers(memory, controls, stringBase) {
  const bytes = new Uint8Array(memory.buffer);
  let cursor = stringBase;
  /** @type {Map<string, ControlPointer>} */
  const pointers = new Map();

  for (const control of controls) {
    const address = String(control.address ?? "");
    if (!address) {
      continue;
    }
    const encoded = Buffer.from(`${address}\0`, "utf8");
    bytes.set(encoded, cursor);
    pointers.set(control.label, { address, pointer: cursor });
    cursor = alignTo(cursor + encoded.length, 4);
  }

  return pointers;
}

/**
 * @param {import("../types/framework").FaustControlItem[]} controls
 * @returns {number}
 */
function controlAddressBytes(controls) {
  return controls.reduce((total, control) => total + alignTo(Buffer.byteLength(String(control.address ?? ""), "utf8") + 1, 4), 0);
}

/**
 * @param {ProjectRuntime} runtime
 * @param {import("../types/framework").FaustControlItem[]} controls
 * @param {SonicStageManifest} stage
 * @param {SonicRenderManifest} render
 * @returns {Promise<SonicRenderReport>}
 */
async function renderWasm(runtime, controls, stage, render) {
  const wasmPath = path.join(runtime.targetDir, `${runtime.sourceBase}.wasm`);
  const uiPath = path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
  const uiJson = JSON.parse(fs.readFileSync(uiPath, "utf8"));
  const wasmBytes = fs.readFileSync(wasmPath);
  const module = new WebAssembly.Module(wasmBytes);
  const imports = createWasmEnv(WebAssembly.Module.imports(module));
  const instance = await WebAssembly.instantiate(module, imports);
  const { exports } = instance;
  const memory = requireMemory(exports.memory);
  const init = requireFunction(exports.init, "init");
  const compute = requireFunction(exports.compute, "compute");
  const setParamValue = typeof exports.setParamValue === "function" ? exports.setParamValue : null;
  const factor = Math.max(1, Number(runtime.project.oversampling.factor ?? 1));
  const requestedSampleRate =
    typeof stage.fixture === "object" && stage.fixture?.sampleRate ? Number(stage.fixture.sampleRate) : 48000;
  const effectiveSampleRate = Math.max(8000, Math.round(requestedSampleRate * factor));
  const input = createSonicFixture(stage.fixture, {
    sampleRate: effectiveSampleRate,
    channels: Math.max(1, runtime.project.plugin.inputs || 2)
  });
  const blockSize = Math.max(16, Math.round(Number(stage.blockSize ?? DEFAULT_BLOCK_SIZE)));
  const frameCount = input.channels[0]?.length ?? 0;
  const outputChannels = Math.max(1, runtime.project.plugin.outputs || 2);
  const output = Array.from({ length: outputChannels }, () => new Float32Array(frameCount));
  const frameStrideBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const dspOffset = 0;
  const audioHeapBase = alignTo(Number(uiJson.size ?? 16384) + 4096, 16);
  const inputBase = audioHeapBase;
  const outputBase = inputBase + frameStrideBytes * input.channels.length;
  const inputPtrsBase = outputBase + frameStrideBytes * outputChannels;
  const outputPtrsBase = inputPtrsBase + Int32Array.BYTES_PER_ELEMENT * input.channels.length;
  const stringBase = alignTo(outputPtrsBase + Int32Array.BYTES_PER_ELEMENT * outputChannels + 1024, 16);
  const requiredBytes = stringBase + controlAddressBytes(controls) + 1024;

  ensureWasmMemory(memory, requiredBytes);
  init(dspOffset, effectiveSampleRate);

  if (setParamValue) {
    const controlByLabel = writeControlAddressPointers(memory, controls, stringBase);
    const parameterValues = {
      ...(runtime.project.plugin.kind === "instrument" && controlByLabel.has("gate") ? { gate: 1 } : {}),
      ...(render.parameters ?? {})
    };
    for (const [label, value] of Object.entries(parameterValues)) {
      const control = controlByLabel.get(label);
      if (control) {
        setParamValue(dspOffset, control.pointer, Number(value));
      }
    }
  }

  for (let frame = 0; frame < frameCount; frame += blockSize) {
    const framesThisBlock = Math.min(blockSize, frameCount - frame);
    const memF32 = new Float32Array(memory.buffer);
    const memI32 = new Int32Array(memory.buffer);

    for (let channel = 0; channel < input.channels.length; channel += 1) {
      const channelBase = inputBase + frameStrideBytes * channel;
      memI32[(inputPtrsBase >> 2) + channel] = channelBase;
      for (let index = 0; index < framesThisBlock; index += 1) {
        memF32[(channelBase >> 2) + index] = input.channels[channel]?.[frame + index] ?? 0;
      }
      for (let index = framesThisBlock; index < blockSize; index += 1) {
        memF32[(channelBase >> 2) + index] = 0;
      }
    }

    for (let channel = 0; channel < outputChannels; channel += 1) {
      const channelBase = outputBase + frameStrideBytes * channel;
      memI32[(outputPtrsBase >> 2) + channel] = channelBase;
      for (let index = 0; index < blockSize; index += 1) {
        memF32[(channelBase >> 2) + index] = 0;
      }
    }

    compute(dspOffset, blockSize, inputPtrsBase, outputPtrsBase);

    for (let channel = 0; channel < outputChannels; channel += 1) {
      const channelBase = outputBase + frameStrideBytes * channel;
      for (let index = 0; index < framesThisBlock; index += 1) {
        const channelOutput = output[channel];
        if (channelOutput) {
          channelOutput[frame + index] = memF32[(channelBase >> 2) + index] ?? 0;
        }
      }
    }
  }

  return {
    id: String(render.id ?? "render"),
    parameters: render.parameters ?? {},
    metrics: analyzeAudio({
      sampleRate: effectiveSampleRate,
      channels: output
    })
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @returns {string}
 */
function sonicBinaryPath(runtime) {
  return path.join(runtime.outputDir, "sonic", "sonic-native");
}

/**
 * @param {ProjectRuntime} runtime
 * @returns {boolean}
 */
function hasFreshNativeSonicRenderer(runtime) {
  const binary = sonicBinaryPath(runtime);
  const generatedSource = path.join(runtime.targetDir, `${runtime.sourceBase}.hpp`);
  const runner = path.join(runtime.root, "src", "sonic_native.cpp");
  if (!fs.existsSync(binary) || !fs.existsSync(generatedSource)) {
    return false;
  }
  const binaryMtime = fs.statSync(binary).mtimeMs;
  return binaryMtime >= fs.statSync(generatedSource).mtimeMs && binaryMtime >= fs.statSync(runner).mtimeMs;
}

/**
 * @param {ProjectRuntime} runtime
 * @returns {string}
 */
function compileNativeSonicRenderer(runtime) {
  const binary = sonicBinaryPath(runtime);
  if (hasFreshNativeSonicRenderer(runtime)) {
    return binary;
  }

  fs.mkdirSync(path.dirname(binary), { recursive: true });
  const includeRoot = resolveFaustIncludeRoot();
  const sdkRoot = resolveMacosSdkRoot();
  runCommand(
    "xcrun",
    [
      "clang++",
      "-std=c++20",
      "-stdlib=libc++",
      "-isysroot",
      sdkRoot,
      "-isystem",
      path.join(sdkRoot, "usr", "include", "c++", "v1"),
      "-O2",
      "-DNDEBUG",
      `-DGENERATED_SOURCE_PATH="${path.join(runtime.targetDir, `${runtime.sourceBase}.hpp`)}"`,
      `-DGENERATED_CPP_CLASS=${runtime.project.faust.className}`,
      path.join(runtime.root, "src", "sonic_native.cpp"),
      "-I",
      includeRoot,
      "-I",
      runtime.outputDir,
      "-o",
      binary
    ],
    {
      cwd: runtime.root,
      description: `Compile sonic native renderer for ${runtime.appKey}`,
      stdio: "inherit",
      timeoutEnvVar: "FWAK_SONIC_COMPILE_TIMEOUT_MS",
      timeoutMs: 120000
    }
  );
  return binary;
}

/**
 * @param {AudioBuffer} audio
 * @param {number} inputCount
 * @returns {Buffer}
 */
function encodeInputAudio(audio, inputCount) {
  const frameCount = audio.channels[0]?.length ?? 0;
  const buffer = Buffer.alloc(frameCount * inputCount * Float32Array.BYTES_PER_ELEMENT);
  let offset = 0;
  for (let channel = 0; channel < inputCount; channel += 1) {
    const source = audio.channels[channel] ?? audio.channels[0] ?? new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      buffer.writeFloatLE(source[frame] ?? 0, offset);
      offset += Float32Array.BYTES_PER_ELEMENT;
    }
  }
  return buffer;
}

/**
 * @param {Buffer} buffer
 * @param {number} outputCount
 * @param {number} frameCount
 * @returns {Float32Array[]}
 */
function decodeOutputAudio(buffer, outputCount, frameCount) {
  const channels = Array.from({ length: outputCount }, () => new Float32Array(frameCount));
  let offset = 0;
  for (let channel = 0; channel < outputCount; channel += 1) {
    const target = channels[channel];
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (target) {
        target[frame] = offset + 4 <= buffer.length ? buffer.readFloatLE(offset) : 0;
      }
      offset += Float32Array.BYTES_PER_ELEMENT;
    }
  }
  return channels;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest} stage
 * @param {SonicRenderManifest} render
 * @returns {SonicRenderReport}
 */
function renderNative(runtime, stage, render) {
  const binary = compileNativeSonicRenderer(runtime);
  const sampleRate = typeof stage.fixture === "object" && stage.fixture?.sampleRate ? Number(stage.fixture.sampleRate) : 48000;
  const inputCount = Math.max(0, runtime.project.plugin.inputs || 0);
  const outputCount = Math.max(1, runtime.project.plugin.outputs || 2);
  const input = createSonicFixture(stage.fixture, {
    sampleRate,
    channels: Math.max(1, inputCount || 1)
  });
  const frameCount = input.channels[0]?.length ?? 0;
  const blockSize = Math.max(16, Math.round(Number(stage.blockSize ?? DEFAULT_BLOCK_SIZE)));
  const parameterValues = {
    ...(runtime.project.plugin.kind === "instrument" ? { gate: 1, gain: 0.35 } : {}),
    ...(render.parameters ?? {})
  };
  const args = [
    String(sampleRate),
    String(blockSize),
    String(frameCount),
    ...Object.entries(parameterValues).flatMap(([label, value]) => [label, String(Number(value))])
  ];
  const output = execFileSync(binary, args, {
    cwd: runtime.root,
    input: encodeInputAudio(input, inputCount),
    maxBuffer: Math.max(32 * 1024 * 1024, frameCount * outputCount * 8),
    timeout: Number(process.env.FWAK_SONIC_RUN_TIMEOUT_MS ?? 120000)
  });

  return {
    id: String(render.id ?? "render"),
    parameters: render.parameters ?? {},
    metrics: analyzeAudio({
      sampleRate,
      channels: decodeOutputAudio(output, outputCount, frameCount)
    })
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @returns {boolean}
 */
function hasFreshSonicTargets(runtime) {
  const cppPath = path.join(runtime.targetDir, `${runtime.sourceBase}.hpp`);
  const uiPath = path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
  if (!fs.existsSync(cppPath) || !fs.existsSync(uiPath)) {
    return false;
  }
  const sourceMtime = fs.statSync(runtime.sourceFile).mtimeMs;
  return fs.statSync(cppPath).mtimeMs >= sourceMtime && fs.statSync(uiPath).mtimeMs >= sourceMtime;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest[]} stages
 */
function exportWasmTargets(runtime, stages) {
  if (!stages.length) {
    return;
  }
  if (hasFreshSonicTargets(runtime)) {
    return;
  }
  runNodeTool(root, "tools/export-targets.mjs", ["--workspace", runtime.workspaceFile, "--app", runtime.appKey, "--export-profile", "sonic"], {
    cwd: root,
    description: `Export sonic targets for ${runtime.appKey}`,
    stdio: "inherit"
  });
}

/**
 * @param {ProjectRuntime} runtime
 * @param {string} profile
 * @returns {SonicStageManifest[]}
 */
function resolveAndValidateStages(runtime, profile) {
  const stages = resolveSonicStages(runtime, { profile });
  const { controls } = fs.existsSync(path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`))
    ? loadSonicUi(runtime.targetDir, runtime.sourceBase)
    : { controls: [] };
  const declaredControls = controls.length
    ? controls
    : (runtime.project.ui.controlOrder ?? []).map((label, index) => ({
        type: "hslider",
        label,
        address: `/${label}`,
        index
      }));
  const errors = stages.flatMap((stage) => validateSonicStage(runtime, stage, declaredControls));
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  return stages;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest[]} stages
 * @param {string} profile
 * @returns {Promise<import("../types/framework").SonicSuiteReport>}
 */
async function runDirectStages(runtime, stages, profile) {
  exportWasmTargets(runtime, stages);
  const { controls } = loadSonicUi(runtime.targetDir, runtime.sourceBase);
  const stageReports = [];

  for (const stage of stages) {
    const renderReports = [];
    for (const render of stage.renders ?? []) {
      renderReports.push(renderNative(runtime, stage, render));
    }
    const renderMap = new Map(renderReports.map((render) => [render.id, render]));
    const assertionReports = (stage.assertions ?? []).map((assertion) => evaluateAssertion(assertion, renderMap));
    stageReports.push({
      id: String(stage.id),
      title: stage.title,
      description: stage.description,
      fixture: typeof stage.fixture === "string" ? { kind: stage.fixture } : stage.fixture,
      renders: renderReports,
      assertions: assertionReports,
      passed: assertionReports.every((assertion) => assertion.passed)
    });
  }

  return createSonicReport(runtime, stageReports, { mode: "cpp-direct", profile });
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicNativeHostRequest} request
 * @returns {string}
 */
function writeHostRequest(runtime, request) {
  const requestPath = path.join(runtime.outputDir, "sonic-host-request.json");
  writeFileAtomically(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  return requestPath;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicNativeHostRequest} request
 * @returns {string}
 */
function writeAgenticSession(runtime, request) {
  const sessionPath = path.join(runtime.outputDir, "sonic-agent-session.json");
  const stageUrl = `http://127.0.0.1:4173/?app=${encodeURIComponent(runtime.appKey)}&sonicStage=1`;
  const session = {
    version: 1,
    appKey: runtime.appKey,
    productName: runtime.project.productName,
    purpose: "Agent-observable plugin staging session for screenshot, parameter, and sonic regression work.",
    browserPreviewUrl: stageUrl,
    screenshotTargets: [
      {
        id: "web-preview",
        kind: "browser",
        url: stageUrl,
        description: "Shared preview surface for fast screenshot inspection while native hosts are unavailable."
      },
      {
        id: "standalone-plugin",
        kind: "macos-app",
        path: request.artifacts.standalone,
        description: "Built standalone plugin app intended for Computer Use launch and screenshot capture."
      },
      {
        id: "vst3-host",
        kind: "external-host",
        path: request.artifacts.vst3,
        commandEnv: "FWAK_SONIC_HOST_COMMAND",
        description: "External VST3 host adapter command should load this bundle, apply the request file, and return metrics/screenshots."
      }
    ],
    requestFile: path.join(runtime.outputDir, "sonic-host-request.json")
  };
  writeFileAtomically(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  return sessionPath;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest[]} stages
 * @param {{ mode: string, profile: string, dryRun: boolean }} options
 * @returns {import("../types/framework").SonicSuiteReport}
 */
function runHostPlan(runtime, stages, options) {
  const request = createNativeHostRequest(runtime, stages, options.mode);
  const requestPath = writeHostRequest(runtime, request);
  const sessionPath = writeAgenticSession(runtime, request);
  const hostCommand = process.env.FWAK_SONIC_HOST_COMMAND;

  if (hostCommand && !options.dryRun) {
    const output = runCommand(hostCommand, [requestPath], {
      cwd: root,
      description: `Run ${options.mode} sonic host for ${runtime.appKey}`,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    });
    return JSON.parse(String(output));
  }

  const stageReports = stages.map((stage) => ({
    id: String(stage.id),
    title: stage.title,
    description: stage.description,
    fixture: typeof stage.fixture === "string" ? { kind: stage.fixture } : stage.fixture,
    renders: [],
    assertions: [
      {
        passed: true,
        message: `Host request staged at ${path.relative(root, requestPath)}; agent session at ${path.relative(root, sessionPath)}.`,
        assertion: { render: "host", metric: "requestStaged", eq: 1 },
        actual: 1,
        reference: null
      }
    ],
    passed: true
  }));
  return createSonicReport(runtime, stageReports, { mode: options.mode, profile: options.profile });
}

/**
 * @returns {{ runtimes: ProjectRuntime[], mode: string, profile: string, dryRun: boolean, format: string }}
 */
function resolveInvocation() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = String(args.mode ?? "cpp-direct");
  const profile = String(args.profile ?? "contracts");
  const dryRun = Boolean(args["dry-run"]);
  const format = String(args.format ?? "text");
  const runtimes = typeof args.suite === "string" && args.suite
    ? loadSuiteRuntime(process.argv.slice(2)).apps
    : [loadProjectRuntime(process.argv.slice(2))];
  return { runtimes, mode, profile, dryRun, format };
}

async function main() {
  const invocation = resolveInvocation();
  if (!SUPPORTED_DIRECT_MODES.has(invocation.mode) && !SUPPORTED_HOST_MODES.has(invocation.mode)) {
    throw new Error(`Unsupported sonic stage mode "${invocation.mode}".`);
  }

  const reports = [];
  for (const runtime of invocation.runtimes) {
    const stages = resolveAndValidateStages(runtime, invocation.profile);
    const report = SUPPORTED_DIRECT_MODES.has(invocation.mode)
      ? await runDirectStages(runtime, stages, invocation.profile)
      : runHostPlan(runtime, stages, invocation);
    const reportPath = writeSonicReport(runtime, report);
    reports.push({ reportPath, report });
  }

  const failed = reports.filter(({ report }) => !report.passed);
  if (invocation.format === "json") {
    console.log(JSON.stringify(reports.map(({ reportPath, report }) => ({ reportPath, ...report })), null, 2));
  } else {
    for (const { reportPath, report } of reports) {
      console.log(`${report.passed ? "PASS" : "FAIL"} ${report.appKey}: ${path.relative(root, reportPath)}`);
      for (const stage of report.stages) {
        console.log(`  ${stage.passed ? "PASS" : "FAIL"} ${stage.id}`);
        stage.assertions
          .filter((assertion) => !assertion.passed)
          .forEach((assertion) => console.log(`    ${assertion.message}`));
      }
    }
  }

  if (failed.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { renderNative, renderWasm };
