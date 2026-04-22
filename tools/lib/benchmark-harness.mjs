import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeFileAtomically } from "./fs-tools.mjs";
import {
  DEFAULT_BENCHMARK_COMPILE_TIMEOUT_MS,
  DEFAULT_BENCHMARK_RUN_TIMEOUT_MS,
  resolveTimeoutMs,
  runCommand
} from "./export-process-tools.mjs";
import { gatherControls } from "./project-tools.mjs";

function resolveFaustIncludeRoot() {
  const prefix = runCommand("brew", ["--prefix", "faust"], {
    description: "Resolve Homebrew Faust prefix",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  }).trim();
  return path.join(prefix, "include");
}

function loadBenchmarkUi(targetsDir, sourceBase) {
  const uiJson = JSON.parse(fs.readFileSync(path.join(targetsDir, `${sourceBase}.ui.json`), "utf8"));
  return {
    controls: gatherControls(uiJson.ui),
    uiJson
  };
}

function compileNativeBenchmark({
  runtime,
  benchDir,
  generatedSource,
  generatedHeaderLang,
  includeRoot,
  initialControl,
  nativeRunner,
  targetName
}) {
  const out = path.join(benchDir, `bench-${targetName}`);
  const compileDefinitions = [
    `-DGENERATED_TARGET_KIND=${generatedHeaderLang}`,
    `-DGENERATED_SOURCE_PATH="${generatedSource}"`,
    `-DFAUST_INCLUDE_ROOT="${includeRoot}"`
  ];

  if (initialControl?.label) {
    compileDefinitions.push(`-DGENERATED_BENCH_CONTROL_LABEL="${initialControl.label}"`);
    compileDefinitions.push(`-DGENERATED_BENCH_CONTROL_VALUE=${Number(initialControl.value ?? 0)}`);
  }

  if (generatedHeaderLang === 1) {
    compileDefinitions.push(`-DGENERATED_C_DSP_TYPE=${runtime.project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_NEW_FN=new${runtime.project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_INIT_FN=init${runtime.project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_BUILD_UI_FN=buildUserInterface${runtime.project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_COMPUTE_FN=compute${runtime.project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_DELETE_FN=delete${runtime.project.faust.className}`);
  } else {
    compileDefinitions.push(`-DGENERATED_CPP_CLASS=${runtime.project.faust.className}`);
  }

  runCommand(
    "clang++",
    [
      "-std=c++20",
      "-O3",
      "-DNDEBUG",
      ...compileDefinitions,
      nativeRunner,
      "-I",
      includeRoot,
      "-I",
      runtime.outputDir,
      "-o",
      out
    ],
    {
      cwd: runtime.root,
      description: `Compile ${targetName} benchmark for ${runtime.appKey}`,
      stdio: "inherit",
      timeoutEnvVar: "FWAK_BENCHMARK_COMPILE_TIMEOUT_MS",
      timeoutMs: DEFAULT_BENCHMARK_COMPILE_TIMEOUT_MS
    }
  );

  const output = runCommand(
    out,
    [
      String(runtime.project.benchmark.sampleRate),
      String(runtime.project.benchmark.blockSize),
      String(runtime.project.benchmark.seconds)
    ],
    {
      description: `Run ${targetName} benchmark for ${runtime.appKey}`,
      encoding: "utf8",
      timeoutEnvVar: "FWAK_BENCHMARK_RUN_TIMEOUT_MS",
      timeoutMs: DEFAULT_BENCHMARK_RUN_TIMEOUT_MS
    }
  );

  return JSON.parse(output);
}

function alignTo(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function createWasmEnv(requiredImports) {
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

async function benchmarkWasmTarget({ runtime, uiJson, controls, initialControl }) {
  const wasmBytes = fs.readFileSync(path.join(runtime.targetDir, `${runtime.sourceBase}.wasm`));
  const module = new WebAssembly.Module(wasmBytes);
  const imports = createWasmEnv(WebAssembly.Module.imports(module));
  const sampleRate = runtime.project.benchmark.sampleRate;
  const blockSize = runtime.project.benchmark.blockSize;
  const totalFrames = sampleRate * runtime.project.benchmark.seconds * runtime.project.oversampling.factor;
  const blocks = Math.floor(totalFrames / blockSize);
  const processedFrames = blocks * blockSize;
  if (processedFrames <= 0) {
    throw new Error(`Benchmark configuration for ${runtime.appKey} must produce at least one audio block.`);
  }
  const frameStrideBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const timeoutMs = resolveTimeoutMs(DEFAULT_BENCHMARK_RUN_TIMEOUT_MS, "FWAK_BENCHMARK_WASM_TIMEOUT_MS");

  return WebAssembly.instantiate(module, imports).then((instance) => {
    const { memory, init, compute, setParamValue } = instance.exports;
    const memF32 = new Float32Array(memory.buffer);
    const memI32 = new Int32Array(memory.buffer);
    const dspOffset = 0;
    const audioHeapBase = alignTo((uiJson.size ?? 16384) + 4096, 16);
    const channels = 2;
    const factor = runtime.project.oversampling.factor;
    const inputBase = audioHeapBase;
    const outputBase = inputBase + frameStrideBytes * channels;
    const inputPtrsBase = outputBase + frameStrideBytes * channels;
    const outputPtrsBase = inputPtrsBase + Int32Array.BYTES_PER_ELEMENT * channels;

    init(dspOffset, sampleRate * factor);

    if (initialControl?.label) {
      const control = controls.find((item) => item.label === initialControl.label);
      if (control) {
        setParamValue(dspOffset, control.index, Number(initialControl.value ?? 0));
      }
    }

    for (let channel = 0; channel < channels; channel += 1) {
      memI32[(inputPtrsBase >> 2) + channel] = inputBase + frameStrideBytes * channel;
      memI32[(outputPtrsBase >> 2) + channel] = outputBase + frameStrideBytes * channel;
    }

    const baseFrequency = 997 / (sampleRate * factor);
    let phase = 0;
    const start = process.hrtime.bigint();
    const timeoutNs = timeoutMs > 0 ? BigInt(timeoutMs) * 1000000n : 0n;

    for (let block = 0; block < blocks; block += 1) {
      if (timeoutNs > 0 && block % 32 === 0 && process.hrtime.bigint() - start > timeoutNs) {
        throw new Error(`WASM benchmark timed out after ${timeoutMs}ms for ${runtime.appKey}.`);
      }

      for (let index = 0; index < blockSize; index += 1) {
        const sample = Math.sin(2 * Math.PI * phase) * (0.6 + 0.35 * Math.sin(2 * Math.PI * phase * 0.25));
        phase = (phase + baseFrequency) % 1;
        memF32[(inputBase >> 2) + index] = sample;
        memF32[(inputBase >> 2) + blockSize + index] = sample;
      }

      compute(dspOffset, blockSize, inputPtrsBase, outputPtrsBase);
    }

    const elapsedNs = Number(process.hrtime.bigint() - start);
    return {
      target: "wasm",
      processedFrames,
      elapsedSeconds: elapsedNs / 1e9,
      nsPerFrame: elapsedNs / processedFrames,
      realtimeFactor: processedFrames / (sampleRate * factor * (elapsedNs / 1e9))
    };
  });
}

function writeBenchmarkReport(outputDir, benchmark, results) {
  const report = {
    host: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus()[0]?.model ?? "unknown"
    },
    benchmark,
    results
  };

  writeFileAtomically(path.join(outputDir, "benchmark-results.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export {
  benchmarkWasmTarget,
  compileNativeBenchmark,
  loadBenchmarkUi,
  resolveFaustIncludeRoot,
  writeBenchmarkReport
};
