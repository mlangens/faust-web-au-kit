import fs from "node:fs";
import path from "node:path";

import {
  benchmarkWasmTarget,
  compileNativeBenchmark,
  loadBenchmarkUi,
  resolveFaustIncludeRoot,
  writeBenchmarkReport
} from "./lib/benchmark-harness.mjs";
import { runNodeTool } from "./lib/export-process-tools.mjs";
import { loadProjectRuntime } from "./lib/project-tools.mjs";

const runtime = loadProjectRuntime();
const { root, project, outputDir: generatedDir, targetDir: targetsDir, sourceBase } = runtime;
const benchDir = path.join(generatedDir, "bench");
const initialControl = project.benchmark?.initialControls?.[0] ?? null;
const includeRoot = resolveFaustIncludeRoot();

fs.mkdirSync(benchDir, { recursive: true });

runNodeTool(root, "tools/export-targets.mjs", process.argv.slice(2), {
  cwd: root,
  description: `Export benchmark targets for ${runtime.appKey}`,
  stdio: "inherit"
});

const nativeRunner = path.join(root, "src", "bench_native.cpp");
const cOutput = path.join(targetsDir, `${sourceBase}.c`);
const cppOutput = path.join(targetsDir, `${sourceBase}.hpp`);
const { controls, uiJson } = loadBenchmarkUi(targetsDir, sourceBase);

const results = [];
results.push(
  compileNativeBenchmark({
    benchDir,
    generatedHeaderLang: 1,
    generatedSource: cOutput,
    includeRoot,
    initialControl,
    nativeRunner,
    runtime,
    targetName: "c"
  })
);
results.push(
  compileNativeBenchmark({
    benchDir,
    generatedHeaderLang: 2,
    generatedSource: cppOutput,
    includeRoot,
    initialControl,
    nativeRunner,
    runtime,
    targetName: "cpp"
  })
);
results.push(await benchmarkWasmTarget({ controls, initialControl, runtime, uiJson }));

const report = writeBenchmarkReport(generatedDir, project.benchmark, results);
console.log(JSON.stringify(report, null, 2));
