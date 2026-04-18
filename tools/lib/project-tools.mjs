import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeCString(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function formatFloatLiteral(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return "0.0f";
  }
  if (Number.isInteger(numeric)) {
    return `${numeric}.0f`;
  }
  return `${numeric}f`;
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "project";
}

function parseCliArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = nextValue;
    index += 1;
  }
  return parsed;
}

function loadProjectRuntime(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const projectFile = path.resolve(root, args.project || "project.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  const projectKey = slugify(path.parse(projectFile).name.replace(/\.project$/i, ""));
  const sourceFile = path.resolve(root, project.faust.source);
  const sourceBase = path.parse(sourceFile).name;
  const outputDir =
    args.out != null
      ? path.resolve(root, args.out)
      : projectFile === path.resolve(root, "project.json")
        ? path.join(root, "generated")
        : path.join(root, "generated", projectKey);

  return {
    args,
    root,
    projectFile,
    project,
    projectKey,
    sourceFile,
    sourceBase,
    outputDir,
    targetDir: path.join(outputDir, "targets"),
    isDefaultProject: projectFile === path.resolve(root, "project.json")
  };
}

function gatherControls(items, acc = []) {
  for (const item of items ?? []) {
    if (item.items) {
      gatherControls(item.items, acc);
      continue;
    }
    if (item.type === "hslider" || item.type === "vslider" || item.type === "nentry" || item.type === "checkbox" || item.type === "button") {
      acc.push(item);
    }
  }
  return acc;
}

function findMetaValue(control, key) {
  const match = (control.meta || []).find((entry) => Object.prototype.hasOwnProperty.call(entry, key));
  return match ? match[key] : null;
}

function clapFeatureMacro(name) {
  const featureMap = new Map([
    ["analyzer", "CLAP_PLUGIN_FEATURE_ANALYZER"],
    ["audio-effect", "CLAP_PLUGIN_FEATURE_AUDIO_EFFECT"],
    ["compressor", "CLAP_PLUGIN_FEATURE_COMPRESSOR"],
    ["drum-machine", "CLAP_PLUGIN_FEATURE_DRUM_MACHINE"],
    ["instrument", "CLAP_PLUGIN_FEATURE_INSTRUMENT"],
    ["limiter", "CLAP_PLUGIN_FEATURE_LIMITER"],
    ["mastering", "CLAP_PLUGIN_FEATURE_MASTERING"],
    ["mixing", "CLAP_PLUGIN_FEATURE_MIXING"],
    ["stereo", "CLAP_PLUGIN_FEATURE_STEREO"],
    ["synthesizer", "CLAP_PLUGIN_FEATURE_SYNTHESIZER"],
    ["utility", "CLAP_PLUGIN_FEATURE_UTILITY"]
  ]);
  const normalized = String(name ?? "").trim().toLowerCase();
  const macro = featureMap.get(normalized);
  if (!macro) {
    throw new Error(`Unsupported CLAP feature "${name}"`);
  }
  return macro;
}

function encodeVst3Tuid(parts) {
  if (!Array.isArray(parts) || parts.length !== 4) {
    throw new Error("VST3 TUID must contain exactly 4 items.");
  }
  return parts
    .map((part, index) => {
      if (typeof part === "number") {
        return String(part);
      }
      const text = String(part ?? "");
      if (text.length !== 4) {
        throw new Error(`VST3 TUID segment ${index + 1} must be 4 characters long.`);
      }
      return `'${text}'`;
    })
    .join(", ");
}

export {
  encodeVst3Tuid,
  escapeCString,
  findMetaValue,
  formatFloatLiteral,
  gatherControls,
  loadProjectRuntime,
  normalizeRelativePath,
  parseCliArgs,
  slugify,
  clapFeatureMacro
};
