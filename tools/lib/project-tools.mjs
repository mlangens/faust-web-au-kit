// @ts-check

import fs from "node:fs";
import path from "node:path";

import { resolveProjectUi } from "./ui-family-tools.mjs";

/**
 * @typedef {import("../../types/framework").CatalogManifest} CatalogManifest
 * @typedef {import("../../types/framework").CliArgs} CliArgs
 * @typedef {import("../../types/framework").FaustControlItem} FaustControlItem
 * @typedef {import("../../types/framework").FaustUiItem} FaustUiItem
 * @typedef {import("../../types/framework").ProjectManifest} ProjectManifest
 * @typedef {import("../../types/framework").ProjectRuntime} ProjectRuntime
 * @typedef {import("../../types/framework").ResolvedAppEntry} ResolvedAppEntry
 * @typedef {import("../../types/framework").ResolvedSuite} ResolvedSuite
 * @typedef {import("../../types/framework").SuiteRuntime} SuiteRuntime
 * @typedef {import("../../types/framework").WorkspaceManifest} WorkspaceManifest
 * @typedef {import("../../types/framework").WorkspacePathConfig} WorkspacePathConfig
 * @typedef {import("../../types/framework").WorkspaceRuntime} WorkspaceRuntime
 */

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const defaultWorkspaceFile = path.resolve(root, "fwak.workspace.json");
const defaultCatalogsDir = path.resolve(root, "ui", "catalog");

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join("/");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeCString(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
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

/**
 * @param {unknown} value
 * @returns {string}
 */
function slugify(value) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

/**
 * @param {string[]} argv
 * @returns {CliArgs}
 */
function parseCliArgs(argv) {
  /** @type {CliArgs} */
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
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

/**
 * @param {WorkspaceManifest} workspace
 * @returns {WorkspacePathConfig}
 */
function workspacePathConfig(workspace) {
  return {
    appsDir: path.resolve(root, workspace.paths?.apps ?? "apps"),
    generatedRootDir: path.resolve(root, workspace.paths?.generatedRoot ?? "generated"),
    generatedAppsDir: path.resolve(root, workspace.paths?.generatedApps ?? path.join("generated", "apps")),
    buildAppsDir: path.resolve(root, workspace.paths?.buildApps ?? path.join("build", "apps")),
    distAppsDir: path.resolve(root, workspace.paths?.distApps ?? path.join("dist", "apps"))
  };
}

/**
 * @param {string} catalogIdOrPath
 * @param {string} [rootDir]
 * @returns {string}
 */
function resolveCatalogFile(catalogIdOrPath, rootDir = root) {
  const directPath = path.resolve(rootDir, String(catalogIdOrPath ?? ""));
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  return path.resolve(defaultCatalogsDir, `${String(catalogIdOrPath ?? "").replace(/\.json$/u, "")}.json`);
}

/**
 * @param {string} [catalogIdOrPath]
 * @param {string} [rootDir]
 * @returns {{ catalogFile: string, catalog: CatalogManifest }}
 */
function loadCatalogRuntime(catalogIdOrPath = "northline-suite", rootDir = root) {
  const catalogFile = resolveCatalogFile(catalogIdOrPath, rootDir);
  /** @type {CatalogManifest} */
  const catalog = /** @type {CatalogManifest} */ (JSON.parse(fs.readFileSync(catalogFile, "utf8")));
  return {
    catalogFile,
    catalog
  };
}

/**
 * @param {string[]} [argv]
 * @returns {WorkspaceRuntime}
 */
function loadWorkspaceRuntime(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const workspaceArg = typeof args.workspace === "string" ? args.workspace : defaultWorkspaceFile;
  const workspaceFile = path.resolve(root, workspaceArg);
  /** @type {WorkspaceManifest} */
  const workspace = /** @type {WorkspaceManifest} */ (JSON.parse(fs.readFileSync(workspaceFile, "utf8")));
  const paths = workspacePathConfig(workspace);
  const workspaceApps = workspace.apps ?? [];
  const appEntries = workspaceApps.map((entry) => {
    const key = String(entry.key ?? slugify(entry.name ?? path.basename(entry.manifest ?? "")));
    if (!entry.manifest) {
      throw new Error(`Workspace app "${key}" is missing a manifest path.`);
    }

    const manifestPath = path.resolve(root, entry.manifest);
    return {
      key,
      name: entry.name ?? key,
      manifest: normalizeRelativePath(entry.manifest),
      manifestPath,
      generatedDir: path.join(paths.generatedAppsDir, key),
      buildDir: path.join(paths.buildAppsDir, key),
      distDir: path.join(paths.distAppsDir, key)
    };
  });

  if (!appEntries.length) {
    throw new Error(`Workspace "${workspaceFile}" does not declare any apps.`);
  }

  const firstAppKey = appEntries[0]?.key;
  if (!firstAppKey) {
    throw new Error(`Workspace "${workspaceFile}" could not resolve the first app key.`);
  }
  const defaultAppKey = String(workspace.defaultApp ?? firstAppKey);
  return /** @type {WorkspaceRuntime} */ ({
    args,
    root,
    workspaceFile,
    workspace,
    defaultAppKey,
    ...paths,
    appEntries: appEntries.map((entry) => ({
      ...entry,
      previewPath: entry.key === defaultAppKey ? "/" : `/?app=${encodeURIComponent(entry.key)}`
    }))
  });
}

/**
 * @param {WorkspaceRuntime} workspaceRuntime
 * @param {CliArgs} [args]
 * @returns {ResolvedAppEntry}
 */
function resolveWorkspaceApp(workspaceRuntime, args = workspaceRuntime.args) {
  if (typeof args.project === "string") {
    const manifestPath = path.resolve(root, args.project);
    const byManifest = workspaceRuntime.appEntries.find((entry) => entry.manifestPath === manifestPath);
    if (!byManifest) {
      throw new Error(`No workspace app matches manifest path "${args.project}".`);
    }
    return byManifest;
  }

  const selectedAppKey = String(args.app ?? process.env.FWAK_APP ?? workspaceRuntime.defaultAppKey);
  const appEntry = workspaceRuntime.appEntries.find((entry) => entry.key === selectedAppKey);
  if (!appEntry) {
    const available = workspaceRuntime.appEntries.map((entry) => entry.key).join(", ");
    throw new Error(`Unknown app "${selectedAppKey}". Available apps: ${available}`);
  }
  return appEntry;
}

/**
 * @param {WorkspaceRuntime} workspaceRuntime
 * @param {ResolvedAppEntry} appEntry
 * @returns {ProjectRuntime}
 */
function createProjectRuntime(workspaceRuntime, appEntry) {
  const projectFile = appEntry.manifestPath;
  /** @type {ProjectManifest} */
  const rawProject = /** @type {ProjectManifest} */ (JSON.parse(fs.readFileSync(projectFile, "utf8")));
  const uiRuntime = resolveProjectUi(rawProject.ui, { root });
  const project = { ...rawProject };
  if (uiRuntime.hasProjectUi) {
    project.ui = /** @type {ProjectManifest["ui"]} */ (uiRuntime.resolved);
  }
  const appDir = path.dirname(projectFile);
  const sourceFile = path.resolve(appDir, project.faust.source);
  const sourceBase = path.parse(sourceFile).name;
  const outputDir =
    typeof workspaceRuntime.args.out === "string" ? path.resolve(root, workspaceRuntime.args.out) : appEntry.generatedDir;
  const buildDir =
    typeof workspaceRuntime.args["build-out"] === "string"
      ? path.resolve(root, workspaceRuntime.args["build-out"])
      : appEntry.buildDir;
  const distDir =
    typeof workspaceRuntime.args["dist-out"] === "string"
      ? path.resolve(root, workspaceRuntime.args["dist-out"])
      : appEntry.distDir;

  return /** @type {ProjectRuntime} */ ({
    args: workspaceRuntime.args,
    root,
    workspaceFile: workspaceRuntime.workspaceFile,
    workspace: workspaceRuntime.workspace,
    workspaceRuntime,
    appKey: appEntry.key,
    appEntry,
    appDir,
    projectFile,
    project,
    rawProject,
    projectManifest: rawProject,
    uiRuntime,
    ui: uiRuntime.resolved,
    sourceFile,
    sourceBase,
    outputDir,
    targetDir: path.join(outputDir, "targets"),
    buildDir,
    distDir,
    generatedRootDir: workspaceRuntime.generatedRootDir,
    generatedAppsDir: workspaceRuntime.generatedAppsDir,
    buildRootDir: workspaceRuntime.buildAppsDir,
    distRootDir: workspaceRuntime.distAppsDir,
    previewPath: appEntry.previewPath,
    isDefaultApp: appEntry.key === workspaceRuntime.defaultAppKey
  });
}

/**
 * @param {WorkspaceRuntime} workspaceRuntime
 * @param {string} [catalogIdOrPath]
 * @returns {ResolvedSuite}
 */
function resolveWorkspaceSuite(workspaceRuntime, catalogIdOrPath) {
  const suiteArg =
    typeof catalogIdOrPath === "string"
      ? catalogIdOrPath
      : typeof workspaceRuntime.args.suite === "string"
        ? workspaceRuntime.args.suite
        : "northline-suite";
  const { catalogFile, catalog } = loadCatalogRuntime(suiteArg);
  const appByKey = new Map(workspaceRuntime.appEntries.map((entry) => [entry.key, entry]));
  const suiteProducts = catalog.products ?? [];
  const suiteEntries = suiteProducts.map((product, index) => {
    const key = String(product.id ?? "");
    if (!key) {
      throw new Error(`Catalog "${catalog.id ?? suiteArg}" contains a product without an id.`);
    }

    const appEntry = appByKey.get(key);
    if (!appEntry) {
      throw new Error(`Catalog "${catalog.id ?? suiteArg}" references app "${key}" which is not registered in the workspace.`);
    }

    return {
      order: Number.isFinite(Number(product.implementationOrder)) ? Number(product.implementationOrder) : Number.MAX_SAFE_INTEGER,
      index,
      product,
      appEntry
    };
  });

  suiteEntries.sort((left, right) => left.order - right.order || left.index - right.index);

  return {
    id: String(catalog.id ?? suiteArg),
    catalogFile,
    catalog,
    entries: suiteEntries
  };
}

/**
 * @param {string[]} [argv]
 * @returns {ProjectRuntime}
 */
function loadProjectRuntime(argv = process.argv.slice(2)) {
  const workspaceRuntime = loadWorkspaceRuntime(argv);
  const appEntry = resolveWorkspaceApp(workspaceRuntime);
  return createProjectRuntime(workspaceRuntime, appEntry);
}

/**
 * @param {string[]} [argv]
 * @returns {SuiteRuntime}
 */
function loadSuiteRuntime(argv = process.argv.slice(2)) {
  const workspaceRuntime = loadWorkspaceRuntime(argv);
  const suite = resolveWorkspaceSuite(workspaceRuntime);
  const apps = suite.entries.map((entry) => ({
    ...createProjectRuntime(workspaceRuntime, entry.appEntry),
    suiteProduct: entry.product,
    implementationOrder: entry.order
  }));

  return /** @type {SuiteRuntime} */ ({
    args: workspaceRuntime.args,
    root,
    workspaceFile: workspaceRuntime.workspaceFile,
    workspace: workspaceRuntime.workspace,
    workspaceRuntime,
    suiteId: suite.id,
    suiteFile: suite.catalogFile,
    suiteCatalog: suite.catalog,
    suiteName: suite.catalog.displayName ?? suite.id,
    appEntries: suite.entries.map((entry) => entry.appEntry),
    apps
  });
}

/**
 * @param {FaustUiItem[] | undefined} items
 * @param {FaustControlItem[]} [acc]
 * @returns {FaustControlItem[]}
 */
function gatherControls(items, acc = []) {
  for (const item of items ?? []) {
    if (item.items) {
      gatherControls(item.items, acc);
      continue;
    }
    if (item.type === "hslider" || item.type === "vslider" || item.type === "nentry" || item.type === "checkbox" || item.type === "button") {
      acc.push(/** @type {FaustControlItem} */ (item));
    }
  }
  return acc;
}

/**
 * @param {FaustControlItem} control
 * @param {string} key
 * @returns {string | null}
 */
function findMetaValue(control, key) {
  const match = (control.meta || []).find((entry) => Object.prototype.hasOwnProperty.call(entry, key));
  return typeof match?.[key] === "string" ? match[key] : null;
}

/**
 * @param {string} name
 * @returns {string}
 */
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

/**
 * @param {unknown[]} parts
 * @returns {string}
 */
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
  clapFeatureMacro,
  encodeVst3Tuid,
  escapeCString,
  findMetaValue,
  formatFloatLiteral,
  gatherControls,
  loadCatalogRuntime,
  loadProjectRuntime,
  loadSuiteRuntime,
  loadWorkspaceRuntime,
  normalizeRelativePath,
  parseCliArgs,
  resolveWorkspaceSuite,
  resolveWorkspaceApp,
  slugify
};
