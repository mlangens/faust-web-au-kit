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

function cachedJsonMetadataPath(runtime) {
  return path.join(runtime.targetDir, `${runtime.sourceBase}.ui.json`);
}

function cachedFaustTargetPath(runtime, target) {
  const extension = TARGET_EXTENSION_BY_KIND[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }
  return path.join(runtime.targetDir, `${runtime.sourceBase}.${extension}`);
}

function defaultWorkspaceJsonMetadataPath(runtime) {
  return path.join(runtime.root, "generated", "apps", runtime.appKey, "targets", `${runtime.sourceBase}.ui.json`);
}

function defaultWorkspaceFaustTargetPath(runtime, target) {
  const extension = TARGET_EXTENSION_BY_KIND[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }
  return path.join(runtime.root, "generated", "apps", runtime.appKey, "targets", `${runtime.sourceBase}.${extension}`);
}

function cachedJsonMetadataPaths(runtime) {
  return [...new Set([
    cachedJsonMetadataPath(runtime),
    defaultWorkspaceJsonMetadataPath(runtime)
  ])];
}

function cachedFaustTargetPaths(runtime, target) {
  return [...new Set([
    cachedFaustTargetPath(runtime, target),
    defaultWorkspaceFaustTargetPath(runtime, target)
  ])];
}

function isUsableFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function isFreshCachedFile(runtime, filePath) {
  if (!isUsableFile(filePath)) {
    return false;
  }

  const sourceMtimeMs = fs.statSync(runtime.sourceFile).mtimeMs;
  const cachedMtimeMs = fs.statSync(filePath).mtimeMs;
  return cachedMtimeMs >= sourceMtimeMs;
}

function isUsableJsonMetadata(filePath) {
  if (!isUsableFile(filePath)) {
    return false;
  }

  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

function isFreshCachedJsonMetadata(runtime, filePath) {
  if (!isUsableJsonMetadata(filePath) || !isFreshCachedFile(runtime, filePath)) {
    return false;
  }
  return true;
}

function findCachedJsonMetadata(runtime, predicate) {
  return cachedJsonMetadataPaths(runtime).find((cachedPath) => predicate(runtime, cachedPath)) ?? null;
}

function findCachedFaustTarget(runtime, target, predicate) {
  return cachedFaustTargetPaths(runtime, target).find((cachedPath) => predicate(runtime, cachedPath)) ?? null;
}

function stageCachedJsonMetadata(runtime, stager, cachedPath) {
  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const finalJson = path.join(stager.stageTargetDir, `${runtime.sourceBase}.ui.json`);
  fs.copyFileSync(cachedPath, finalJson);
  stager.markArtifact(path.join("targets", `${runtime.sourceBase}.ui.json`));
  return finalJson;
}

function stageCachedFaustTarget(runtime, stager, target, cachedPath) {
  const extension = TARGET_EXTENSION_BY_KIND[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }

  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const outputFile = `${runtime.sourceBase}.${extension}`;
  const outputPath = stager.stagedTargetPath(outputFile);
  fs.copyFileSync(cachedPath, outputPath);
  stager.markArtifact(path.join("targets", outputFile));
  return outputPath;
}

function exportFaustTarget(runtime, stager, target, options = {}) {
  const extension = TARGET_EXTENSION_BY_KIND[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }

  const freshCachedPath = findCachedFaustTarget(runtime, target, isFreshCachedFile);
  if (options.preferCached && freshCachedPath) {
    return stageCachedFaustTarget(runtime, stager, target, freshCachedPath);
  }

  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const outputFile = `${runtime.sourceBase}.${extension}`;
  const outputPath = stager.stagedTargetPath(outputFile);
  try {
    runFaust(
      runtime,
      ["-lang", target, "-cn", runtime.project.faust.className, "-o", outputPath, runtime.sourceFile],
      { description: `Faust ${target} export for ${runtime.appKey}` }
    );
  } catch (error) {
    if (options.allowCachedFallback && freshCachedPath) {
      console.warn(`Reusing cached Faust ${target} target for ${runtime.appKey} after export failed: ${error.message}`);
      return stageCachedFaustTarget(runtime, stager, target, freshCachedPath);
    }
    throw error;
  }
  stager.markArtifact(path.join("targets", outputFile));
  return outputPath;
}

function exportJsonMetadata(runtime, stager, options = {}) {
  const cachedPath = cachedJsonMetadataPath(runtime);
  const preferredCachedPath = findCachedJsonMetadata(runtime, isFreshCachedJsonMetadata);
  if (options.preferCached && isFreshCachedJsonMetadata(runtime, cachedPath)) {
    return stageCachedJsonMetadata(runtime, stager, cachedPath);
  }
  if (options.preferCached && preferredCachedPath) {
    return stageCachedJsonMetadata(runtime, stager, preferredCachedPath);
  }

  fs.mkdirSync(stager.stageTargetDir, { recursive: true });
  const existingJsonFiles = new Set(
    fs.readdirSync(stager.stageTargetDir, { withFileTypes: false }).filter((entry) => entry.endsWith(".json"))
  );
  const jsonScaffoldName = `${runtime.sourceBase}.jsonmeta.cpp`;

  try {
    runFaust(
      runtime,
      ["-json", "-o", jsonScaffoldName, "-O", ".", "-cn", runtime.project.faust.className, runtime.sourceFile],
      {
        cwd: stager.stageTargetDir,
        description: `Faust JSON metadata export for ${runtime.appKey}`,
        stdio: ["ignore", "ignore", "inherit"]
      }
    );
  } catch (error) {
    const fallbackCachedPath = findCachedJsonMetadata(runtime, (_runtime, candidate) => isUsableJsonMetadata(candidate));
    if (options.allowCachedFallback && fallbackCachedPath) {
      console.warn(`Reusing cached Faust UI metadata for ${runtime.appKey} after JSON export failed: ${error.message}`);
      removePathSync(path.join(stager.stageTargetDir, jsonScaffoldName));
      return stageCachedJsonMetadata(runtime, stager, fallbackCachedPath);
    }
    throw error;
  }

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

export {
  cachedFaustTargetPath,
  cachedFaustTargetPaths,
  cachedJsonMetadataPath,
  cachedJsonMetadataPaths,
  exportFaustTarget,
  exportJsonMetadata,
  exportTargetsForProfile,
  resolveExportProfile
};
