import fs from "node:fs";
import path from "node:path";

import { removePathSync } from "./fs-tools.mjs";
import { runCommand } from "./export-process-tools.mjs";

const TARGET_EXTENSION_BY_KIND = {
  c: "c",
  cpp: "hpp",
  wast: "wast",
  wasm: "wasm",
  cmajor: "cmajor",
  rust: "rs"
};

function resolveExportProfile(args) {
  if (args["export-profile"] != null) {
    return String(args["export-profile"]).toLowerCase();
  }
  return args["native-only"] ? "native" : "full";
}

function exportTargetsForProfile(exportProfile) {
  if (exportProfile === "preview" || exportProfile === "schema") {
    return [];
  }
  if (exportProfile === "native") {
    return ["c", "cpp"];
  }
  return ["c", "cpp", "wast", "wasm", "cmajor", "rust"];
}

function runFaust(runtime, args, options = {}) {
  return runCommand("faust", args, {
    cwd: runtime.root,
    description: options.description ?? `Faust export for ${runtime.appKey}`,
    stdio: options.stdio ?? "inherit",
    timeoutEnvVar: "FWAK_EXPORT_TIMEOUT_MS",
    ...options
  });
}

function exportFaustTarget(runtime, stager, target) {
  const extension = TARGET_EXTENSION_BY_KIND[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }

  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const outputFile = `${runtime.sourceBase}.${extension}`;
  const outputPath = stager.stagedTargetPath(outputFile);
  runFaust(
    runtime,
    ["-lang", target, "-cn", runtime.project.faust.className, "-o", outputPath, runtime.sourceFile],
    { description: `Faust ${target} export for ${runtime.appKey}` }
  );
  stager.markArtifact(path.join("targets", outputFile));
  return outputPath;
}

function exportJsonMetadata(runtime, stager) {
  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const existingJsonFiles = new Set(
    fs.readdirSync(stager.stageTargetDir, { withFileTypes: false }).filter((entry) => entry.endsWith(".json"))
  );
  const jsonScaffoldName = `${runtime.sourceBase}.jsonmeta.cpp`;

  runFaust(
    runtime,
    ["-json", "-o", jsonScaffoldName, "-O", ".", "-cn", runtime.project.faust.className, runtime.sourceFile],
    {
      cwd: stager.stageTargetDir,
      description: `Faust JSON metadata export for ${runtime.appKey}`,
      stdio: ["ignore", "ignore", "inherit"]
    }
  );

  const emittedJsonNames = fs.readdirSync(stager.stageTargetDir)
    .filter((entry) => entry.endsWith(".json") && !existingJsonFiles.has(entry))
    .sort((left, right) => left.localeCompare(right));
  const emittedJsonName = emittedJsonNames.find((entry) => entry === `${runtime.sourceBase}.json`) ?? emittedJsonNames[0];
  if (!emittedJsonName) {
    throw new Error(`Faust did not emit JSON metadata for ${runtime.appKey}.`);
  }

  const emittedJson = path.join(stager.stageTargetDir, emittedJsonName);
  removePathSync(path.join(stager.stageTargetDir, jsonScaffoldName));
  const finalJson = path.join(stager.stageTargetDir, `${runtime.sourceBase}.ui.json`);
  if (emittedJson !== finalJson) {
    fs.renameSync(emittedJson, finalJson);
  }

  stager.markArtifact(path.join("targets", `${runtime.sourceBase}.ui.json`));
  return finalJson;
}

export { exportFaustTarget, exportJsonMetadata, exportTargetsForProfile, resolveExportProfile };
