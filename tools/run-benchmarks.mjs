import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadProjectRuntime } from "./lib/project-tools.mjs";

const runtime = loadProjectRuntime();
const { root, project, outputDir: generatedDir, targetDir: targetsDir, sourceBase } = runtime;
const benchDir = path.join(generatedDir, "bench");
const includeDir = execFileSync("brew", ["--prefix", "faust"], { encoding: "utf8" }).trim();
const initialControl = project.benchmark?.initialControls?.[0] ?? null;

fs.mkdirSync(benchDir, { recursive: true });

execFileSync(process.execPath, [path.join(root, "tools", "export-targets.mjs"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit"
});

const nativeRunner = path.join(root, "src", "bench_native.cpp");
const cOutput = path.join(targetsDir, `${sourceBase}.c`);
const cppOutput = path.join(targetsDir, `${sourceBase}.hpp`);
const uiJson = JSON.parse(fs.readFileSync(path.join(targetsDir, `${sourceBase}.ui.json`), "utf8"));

function compileNative(targetName, generatedSource, generatedHeaderLang) {
  const out = path.join(benchDir, `bench-${targetName}`);
  const compileDefinitions = [
    `-DGENERATED_TARGET_KIND=${generatedHeaderLang}`,
    `-DGENERATED_SOURCE_PATH="${generatedSource}"`,
    `-DFAUST_INCLUDE_ROOT="${path.join(includeDir, "include")}"`
  ];

  if (initialControl?.label) {
    compileDefinitions.push(`-DGENERATED_BENCH_CONTROL_LABEL="${initialControl.label}"`);
    compileDefinitions.push(`-DGENERATED_BENCH_CONTROL_VALUE=${Number(initialControl.value ?? 0)}`);
  }

  if (generatedHeaderLang === 1) {
    compileDefinitions.push(`-DGENERATED_C_DSP_TYPE=${project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_NEW_FN=new${project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_INIT_FN=init${project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_BUILD_UI_FN=buildUserInterface${project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_COMPUTE_FN=compute${project.faust.className}`);
    compileDefinitions.push(`-DGENERATED_C_DELETE_FN=delete${project.faust.className}`);
  } else {
    compileDefinitions.push(`-DGENERATED_CPP_CLASS=${project.faust.className}`);
  }

  execFileSync(
    "clang++",
    [
      "-std=c++20",
      "-O3",
      "-DNDEBUG",
      ...compileDefinitions,
      nativeRunner,
      "-I",
      path.join(includeDir, "include"),
      "-I",
      generatedDir,
      "-o",
      out
    ],
    {
      cwd: root,
      stdio: "inherit"
    }
  );

  const output = execFileSync(
    out,
    [
      String(project.benchmark.sampleRate),
      String(project.benchmark.blockSize),
      String(project.benchmark.seconds)
    ],
    { encoding: "utf8" }
  );
  return JSON.parse(output);
}

function gatherControls(items, acc = []) {
  for (const item of items ?? []) {
    if (item.items) {
      gatherControls(item.items, acc);
      continue;
    }
    acc.push(item);
  }
  return acc;
}

const controls = gatherControls(uiJson.ui);

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

async function benchmarkWasm() {
  const wasmBytes = fs.readFileSync(path.join(targetsDir, `${sourceBase}.wasm`));
  const module = new WebAssembly.Module(wasmBytes);
  const imports = createWasmEnv(WebAssembly.Module.imports(module));
  const sampleRate = project.benchmark.sampleRate;
  const blockSize = project.benchmark.blockSize;
  const totalFrames = sampleRate * project.benchmark.seconds * project.oversampling.factor;
  const blocks = Math.floor(totalFrames / blockSize);
  const frameStrideBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;

  return WebAssembly.instantiate(module, imports).then((instance) => {
    const { memory, init, compute, setParamValue } = instance.exports;
    const memF32 = new Float32Array(memory.buffer);
    const memI32 = new Int32Array(memory.buffer);
    const dspOffset = 0;
    const audioHeapBase = alignTo((uiJson.size ?? 16384) + 4096, 16);
    const channels = 2;
    const factor = project.oversampling.factor;
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

    for (let ch = 0; ch < channels; ch += 1) {
      memI32[(inputPtrsBase >> 2) + ch] = inputBase + frameStrideBytes * ch;
      memI32[(outputPtrsBase >> 2) + ch] = outputBase + frameStrideBytes * ch;
    }

    const baseFrequency = 997 / (sampleRate * factor);
    let phase = 0;
    const start = process.hrtime.bigint();

    for (let block = 0; block < blocks; block += 1) {
      for (let i = 0; i < blockSize; i += 1) {
        const sample = Math.sin(2 * Math.PI * phase) * (0.6 + 0.35 * Math.sin(2 * Math.PI * phase * 0.25));
        phase = (phase + baseFrequency) % 1;
        memF32[(inputBase >> 2) + i] = sample;
        memF32[(inputBase >> 2) + blockSize + i] = sample;
      }
      compute(dspOffset, blockSize, inputPtrsBase, outputPtrsBase);
    }

    const elapsedNs = Number(process.hrtime.bigint() - start);
    const processedFrames = blocks * blockSize;
    return {
      target: "wasm",
      processedFrames,
      elapsedSeconds: elapsedNs / 1e9,
      nsPerFrame: elapsedNs / processedFrames,
      realtimeFactor: processedFrames / (sampleRate * factor * (elapsedNs / 1e9))
    };
  });
}

const results = [];
results.push(compileNative("c", cOutput, 1));
results.push(compileNative("cpp", cppOutput, 2));
results.push(await benchmarkWasm());

const report = {
  host: {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus()[0]?.model ?? "unknown"
  },
  benchmark: project.benchmark,
  results
};

fs.writeFileSync(path.join(generatedDir, "benchmark-results.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
