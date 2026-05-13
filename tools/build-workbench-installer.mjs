// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readJsonFileSync,
  removePathSync,
  writeFileAtomically
} from "./lib/fs-tools.mjs";
import { parseCliArgs, slugify } from "./lib/project-tools.mjs";
import { runCommand } from "./lib/export-process-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceProjectPath = path.join(root, "apps", "omniplugin", "project.json");
const sourceDspPath = path.join(root, "apps", "omniplugin", "dsp", "main.dsp");

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
  return /** @type {T} */ (JSON.parse(JSON.stringify(value)));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function requiredString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * @param {unknown[]} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  return [...new Set(values.map((value) => requiredString(value)).filter(Boolean))];
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatFaustNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0.0";
  }
  return Number.isInteger(numeric) ? `${numeric}.0` : String(Number(numeric.toFixed(4)));
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeFaustString(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

/**
 * @param {string} value
 * @returns {string}
 */
function className(value) {
  const cleaned = String(value ?? "")
    .replace(/[^a-zA-Z0-9]+/gu, " ")
    .trim()
    .replace(/(?:^|\s+)([a-zA-Z0-9])/gu, (_match, char) => String(char).toUpperCase());
  return `${cleaned || "Workbench"}DSP`;
}

/**
 * @param {string} source
 * @param {string} label
 * @param {unknown} value
 * @returns {string}
 */
function replaceHsliderInit(source, label, value) {
  const pattern = new RegExp(`(hslider\\("${escapeRegExp(label)}(?: \\[[^"]+\\])?",\\s*)[-+]?\\d+(?:\\.\\d+)?`, "u");
  if (!pattern.test(source)) {
    throw new Error(`Could not find Faust hslider "${label}" while materializing workbench recipe.`);
  }
  return source.replace(pattern, (_match, prefix) => `${prefix}${formatFaustNumber(value)}`);
}

/**
 * @param {Record<string, unknown>} project
 * @returns {Record<string, unknown>}
 */
function resolveSectionGrid(project) {
  const surfaces = asObject(asObject(asObject(project.ui).preview).surfaces);
  const sectionGrid = asObject(surfaces["section-grid"]);
  if (!Object.keys(sectionGrid).length) {
    throw new Error("Primitive Workbench project is missing ui.preview.surfaces.section-grid.");
  }
  return sectionGrid;
}

/**
 * @param {Record<string, unknown>} sourceProject
 * @param {string} recipeId
 * @returns {Record<string, unknown>}
 */
function findRecipe(sourceProject, recipeId) {
  const sectionGrid = resolveSectionGrid(sourceProject);
  const recipes = Array.isArray(sectionGrid.recipes) ? sectionGrid.recipes.map(asObject) : [];
  const recipe = recipes.find((entry) => entry.id === recipeId);
  if (!recipe) {
    const available = recipes.map((entry) => entry.id).filter(Boolean).join(", ");
    throw new Error(`Unknown workbench recipe "${recipeId}". Available recipes: ${available || "none"}.`);
  }
  return recipe;
}

/**
 * @param {unknown} value
 * @param {unknown} fallback
 * @returns {number}
 */
function numericOr(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const fallbackNumeric = Number(fallback);
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
}

/**
 * @param {Record<string, unknown>} sourceProject
 * @returns {Map<string, Record<string, unknown>>}
 */
function primitivePaletteById(sourceProject) {
  const sectionGrid = resolveSectionGrid(sourceProject);
  const primitives = Array.isArray(sectionGrid.primitivePalette) ? sectionGrid.primitivePalette.map(asObject) : [];
  /** @type {Array<[string, Record<string, unknown>]>} */
  const entries = [];
  for (const primitive of primitives) {
    const id = requiredString(primitive.id);
    if (id) {
      entries.push([id, primitive]);
    }
  }
  return new Map(entries);
}

/**
 * @param {Record<string, unknown>} sourceProject
 * @param {string} assemblyFile
 * @returns {Record<string, unknown>}
 */
function normalizeScratchAssembly(sourceProject, assemblyFile) {
  const assemblyPath = path.resolve(root, assemblyFile);
  const assembly = asObject(readJsonFileSync(assemblyPath));
  const targetRecipeId = requiredString(assembly.targetRecipeId) || requiredString(assembly.recipe) || "fet-76-rebuild";
  const targetRecipe = findRecipe(sourceProject, targetRecipeId);
  const primitivesById = primitivePaletteById(sourceProject);
  const targetSlots = Array.isArray(targetRecipe.slots) ? targetRecipe.slots.map(asObject) : [];
  const targetSlotByNumber = new Map(targetSlots.map((slot) => [Number(slot.slot), slot]));
  const rawSlots = Array.isArray(assembly.slots) ? assembly.slots.map(asObject) : [];
  if (!rawSlots.length) {
    throw new Error(`Scratch assembly "${assemblyFile}" does not contain any primitive slots.`);
  }

  const slots = rawSlots.map((rawSlot) => {
    const slotNumber = Number(rawSlot.slot);
    const primitiveId = requiredString(rawSlot.primitiveId);
    const primitive = primitivesById.get(primitiveId);
    const targetSlot = targetSlotByNumber.get(slotNumber) || {};
    const targetPrimitiveId = requiredString(targetSlot.primitiveId);

    if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 4) {
      throw new Error(`Scratch assembly declares invalid slot "${rawSlot.slot}".`);
    }
    if (!primitive) {
      throw new Error(`Scratch assembly slot ${slotNumber} references unknown primitive "${primitiveId}".`);
    }
    if (targetPrimitiveId && targetPrimitiveId !== primitiveId) {
      throw new Error(`Scratch assembly slot ${slotNumber} uses "${primitiveId}" but target "${targetRecipeId}" expects "${targetPrimitiveId}".`);
    }

    return {
      slot: slotNumber,
      primitiveId,
      label: requiredString(rawSlot.label) || primitive.label,
      role: requiredString(rawSlot.role) || primitive.role,
      slotType: numericOr(rawSlot.slotType, targetSlot.slotType ?? primitive.slotType),
      amount: numericOr(rawSlot.amount, targetSlot.amount ?? primitive.amount),
      tone: numericOr(rawSlot.tone, targetSlot.tone ?? primitive.tone),
      mix: numericOr(rawSlot.mix, targetSlot.mix ?? primitive.mix)
    };
  }).sort((left, right) => Number(left.slot) - Number(right.slot));

  for (const targetSlot of targetSlots) {
    const slotNumber = Number(targetSlot.slot);
    if (!slots.some((slot) => Number(slot.slot) === slotNumber)) {
      throw new Error(`Scratch assembly is missing required target slot ${slotNumber} for "${targetRecipeId}".`);
    }
  }

  const rawMacros = asObject(assembly.macros);
  const targetMacros = asObject(targetRecipe.macros);
  const macros = Object.fromEntries(Object.entries(targetMacros).map(([label, value]) => [
    label,
    numericOr(rawMacros[label], value)
  ]));
  for (const [label, value] of Object.entries(rawMacros)) {
    if (!(label in macros) && Number.isFinite(Number(value))) {
      macros[label] = Number(value);
    }
  }

  return {
    ...targetRecipe,
    id: targetRecipeId,
    label: requiredString(assembly.targetLabel) || requiredString(targetRecipe.label) || targetRecipeId,
    targetAppKey: requiredString(assembly.targetAppKey) || targetRecipe.targetAppKey,
    productName: requiredString(assembly.productName) || targetRecipe.productName,
    artifactStem: requiredString(assembly.artifactStem) || targetRecipe.artifactStem,
    bundleId: requiredString(assembly.bundleId) || targetRecipe.bundleId,
    auSubtype: requiredString(assembly.auSubtype) || targetRecipe.auSubtype,
    description: requiredString(assembly.description) || targetRecipe.description,
    slots,
    macros,
    provenance: {
      ...asObject(assembly.provenance),
      mode: requiredString(assembly.mode) || "scratch-assembly",
      source: requiredString(assembly.source) || "primitive-workbench",
      targetRecipeId,
      validation: asObject(assembly.validation)
    }
  };
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {Map<string, Record<string, unknown>>} primitivesById
 * @returns {{ slotControls: Array<{ label: string, value: unknown }>, primitiveIds: string[], slotSummaries: Array<Record<string, unknown>> }}
 */
function resolveRecipeControls(recipe, primitivesById) {
  const slots = Array.isArray(recipe.slots) ? recipe.slots.map(asObject) : [];
  /** @type {Array<{ label: string, value: unknown }>} */
  const slotControls = [];
  /** @type {string[]} */
  const primitiveIds = [];
  /** @type {Array<Record<string, unknown>>} */
  const slotSummaries = [];

  for (const slot of slots) {
    const slotNumber = Number(slot.slot);
    const primitiveId = requiredString(slot.primitiveId);
    const primitive = primitivesById.get(primitiveId);
    if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 4) {
      throw new Error(`Recipe "${recipe.id}" declares invalid slot "${slot.slot}".`);
    }
    if (!primitive) {
      throw new Error(`Recipe "${recipe.id}" references unknown primitive "${primitiveId}".`);
    }

    primitiveIds.push(primitiveId);
    const slotType = slot.slotType ?? primitive.slotType;
    const amount = slot.amount ?? primitive.amount;
    const tone = slot.tone ?? primitive.tone;
    const mix = slot.mix ?? primitive.mix;
    slotControls.push(
      { label: `Slot ${slotNumber} Type`, value: slotType },
      { label: `Slot ${slotNumber} Amount`, value: amount },
      { label: `Slot ${slotNumber} Tone`, value: tone },
      { label: `Slot ${slotNumber} Mix`, value: mix }
    );
    slotSummaries.push({
      slot: slotNumber,
      primitiveId,
      label: primitive.label,
      role: primitive.role,
      slotType,
      amount,
      tone,
      mix
    });
  }

  const macros = asObject(recipe.macros);
  const macroControls = Object.entries(macros).map(([label, value]) => ({ label, value }));
  return {
    slotControls: [...slotControls, ...macroControls],
    primitiveIds: uniqueStrings(primitiveIds),
    slotSummaries
  };
}

/**
 * @param {string} source
 * @param {Record<string, unknown>} recipe
 * @param {Array<{ label: string, value: unknown }>} controls
 * @returns {string}
 */
function materializeDsp(source, recipe, controls) {
  let nextSource = source
    .replace(/declare name "[^"]*";/u, `declare name "${escapeFaustString(requiredString(recipe.productName) || requiredString(recipe.label) || "Workbench Plugin")}";`)
    .replace(/declare description "[^"]*";/u, `declare description "${escapeFaustString(requiredString(recipe.description) || "Workbench-generated primitive assemblage.")}";`);

  for (const control of controls) {
    nextSource = replaceHsliderInit(nextSource, control.label, control.value);
  }
  return nextSource;
}

/**
 * @param {Record<string, unknown>} sourceProject
 * @param {Record<string, unknown>} recipe
 * @param {string[]} primitiveIds
 * @param {Array<Record<string, unknown>>} slotSummaries
 * @returns {Record<string, unknown>}
 */
function materializeProject(sourceProject, recipe, primitiveIds, slotSummaries) {
  const project = cloneJson(sourceProject);
  const recipeId = requiredString(recipe.id);
  const provenance = asObject(recipe.provenance);
  const sourceMode = requiredString(provenance.mode) || "recipe";
  const appKey = requiredString(recipe.targetAppKey) || slugify(recipeId);
  const productName = requiredString(recipe.productName) || requiredString(recipe.label) || appKey;
  const artifactStem = requiredString(recipe.artifactStem) || productName.replace(/[^a-zA-Z0-9]+/gu, "");
  const bundleId = requiredString(recipe.bundleId) || `io.github.mlangens.faust-web-au-kit.workbench.${appKey}`;
  const auSubtype = (requiredString(recipe.auSubtype) || "WkFx").slice(0, 4).padEnd(4, "X");

  project.name = appKey;
  project.productName = productName;
  project.artifactStem = artifactStem;
  project.bundleId = bundleId;
  project.description = requiredString(recipe.description) || project.description;
  project.faust = {
    ...asObject(project.faust),
    source: "./dsp/main.dsp",
    className: className(artifactStem)
  };

  const ui = asObject(project.ui);
  project.ui = ui;
  ui.primitiveIds = primitiveIds;
  ui.catalog = {
    ...asObject(ui.catalog),
    productId: appKey,
    prototypeRole: "workbench-generated-primitive-assembly",
    referenceProduct: requiredString(recipe.label) || recipeId,
    category: "meta-workbench",
    sourceMode,
    primitiveIds,
    featureAnchors: [
      "drag-and-drop primitive assembly",
      "fixed automation contract",
      "generated scratch plugin installer",
      "agent-ready recipe provenance"
    ]
  };
  const shell = asObject(ui.shell);
  ui.shell = shell;
  shell.hero = {
    ...asObject(shell.hero),
    title: productName,
    description: requiredString(recipe.description) || "A scratch plugin generated from a primitive workbench recipe.",
    status: `Generated from ${sourceMode}; ${slotSummaries.length} primitive slots are baked into the initial control state.`
  };

  const sectionGrid = resolveSectionGrid(project);
  sectionGrid.defaultRecipe = recipeId;
  sectionGrid.title = `${productName} recipe`;
  sectionGrid.description = "This scratch plugin keeps the same stable slot contract while baking in a workbench-authored primitive recipe.";
  sectionGrid.sections = Array.isArray(sectionGrid.sections) ? sectionGrid.sections.map((section, index) => {
    const nextSection = asObject(section);
    const summary = slotSummaries.find((entry) => Number(entry.slot) === index + 1);
    if (summary) {
      nextSection.label = requiredString(summary.label) || `Slot ${index + 1}`;
      nextSection.description = `${requiredString(summary.role) || "Primitive"} block from ${requiredString(summary.primitiveId)}.`;
    }
    return nextSection;
  }) : sectionGrid.sections;
  sectionGrid.recipes = [recipe];

  project.benchmark = {
    ...asObject(project.benchmark),
    initialControls: slotSummaries.flatMap((slot) => [
      { label: `Slot ${slot.slot} Type`, value: slot.slotType },
      { label: `Slot ${slot.slot} Amount`, value: slot.amount },
      { label: `Slot ${slot.slot} Tone`, value: slot.tone },
      { label: `Slot ${slot.slot} Mix`, value: slot.mix }
    ]).concat(Object.entries(asObject(recipe.macros)).map(([label, value]) => ({ label, value })))
  };

  project.au = {
    ...asObject(project.au),
    subtype: auSubtype,
    tags: ["Effects", "Dynamics", "Compressor"]
  };
  project.clap = {
    ...asObject(project.clap),
    id: bundleId,
    description: project.description,
    features: ["audio-effect", "stereo", "compressor", "mixing"]
  };
  project.vst3 = {
    ...asObject(project.vst3),
    categories: ["Fx", "Dynamics", "Stereo"],
    componentTuid: ["Mlng", "Comp", auSubtype, 0],
    controllerTuid: ["Mlng", "Edit", auSubtype, 0]
  };
  project.standalone = {
    ...asObject(project.standalone),
    bundleId: `${bundleId}.app`
  };
  ui.statusText = `Generated workbench assembly: ${recipeId}.`;

  return project;
}

/**
 * @param {Record<string, unknown>} sourceProject
 * @param {Record<string, unknown>} recipe
 * @returns {{ appKey: string, workspacePath: string, projectPath: string, dspPath: string, planPath: string, expectedInstallerPath: string }}
 */
function buildAssemblyFiles(sourceProject, recipe) {
  const recipeId = requiredString(recipe.id);
  if (!recipeId) {
    throw new Error("Workbench recipe is missing an id.");
  }
  const provenance = asObject(recipe.provenance);
  const sourceMode = requiredString(provenance.mode) || "recipe";

  const primitivesById = primitivePaletteById(sourceProject);
  const { slotControls, primitiveIds, slotSummaries } = resolveRecipeControls(recipe, primitivesById);
  const appKey = requiredString(recipe.targetAppKey) || slugify(recipeId);
  const artifactStem = requiredString(recipe.artifactStem) || appKey;
  const version = requiredString(sourceProject.version) || "0.1.0";
  const assemblyRootRelative = path.join("generated", "workbench-assemblies", recipeId);
  const assemblyRoot = path.join(root, assemblyRootRelative);
  const appRoot = path.join(assemblyRoot, "app");
  const workspacePath = path.join(assemblyRoot, "workspace.json");
  const projectPath = path.join(appRoot, "project.json");
  const dspPath = path.join(appRoot, "dsp", "main.dsp");
  const planPath = path.join(assemblyRoot, "assembly-plan.json");
  const expectedInstallerPath = path.join(root, "dist", "workbench-assemblies", recipeId, appKey, `${artifactStem}-${version}.pkg`);

  removePathSync(assemblyRoot);
  const dsp = materializeDsp(fs.readFileSync(sourceDspPath, "utf8"), recipe, slotControls);
  const project = materializeProject(sourceProject, recipe, primitiveIds, slotSummaries);
  const workspace = {
    schemaVersion: 1,
    name: `fwak-workbench-${recipeId}`,
    version,
    defaultApp: appKey,
    paths: {
      generatedRoot: path.join("generated", "workbench-assemblies", recipeId, "generated"),
      generatedApps: path.join("generated", "workbench-assemblies", recipeId, "generated", "apps"),
      buildApps: path.join("build", "workbench-assemblies", recipeId),
      distApps: path.join("dist", "workbench-assemblies", recipeId)
    },
    apps: [
      {
        key: appKey,
        name: project.productName,
        manifest: path.join(assemblyRootRelative, "app", "project.json")
      }
    ]
  };
  const plan = {
    schemaVersion: 1,
    recipeId,
    sourceMode,
    generatedAt: new Date().toISOString(),
    appKey,
    productName: project.productName,
    artifactStem,
    bundleId: project.bundleId,
    primitiveIds,
    slots: slotSummaries,
    controls: slotControls,
    provenance,
    workspace: path.relative(root, workspacePath),
    project: path.relative(root, projectPath),
    expectedInstaller: path.relative(root, expectedInstallerPath)
  };

  writeFileAtomically(dspPath, dsp);
  writeFileAtomically(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  writeFileAtomically(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`);
  writeFileAtomically(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  return { appKey, workspacePath, projectPath, dspPath, planPath, expectedInstallerPath };
}

/**
 * @returns {void}
 */
function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const assemblyFile = requiredString(args["assembly-file"]);
  const requestedRecipeId = requiredString(args.recipe) || "fet-76-rebuild";
  const dryRun = args["dry-run"] === true;
  const skipBuild = args["skip-build"] === true;
  const sourceProject = /** @type {Record<string, unknown>} */ (readJsonFileSync(sourceProjectPath));
  const recipe = assemblyFile
    ? normalizeScratchAssembly(sourceProject, assemblyFile)
    : findRecipe(sourceProject, requestedRecipeId);
  const recipeId = requiredString(recipe.id);
  const assembly = buildAssemblyFiles(sourceProject, recipe);

  const summary = {
    recipe: recipeId,
    sourceMode: requiredString(asObject(recipe.provenance).mode) || "recipe",
    appKey: assembly.appKey,
    workspace: path.relative(root, assembly.workspacePath),
    project: path.relative(root, assembly.projectPath),
    dsp: path.relative(root, assembly.dspPath),
    plan: path.relative(root, assembly.planPath),
    expectedInstaller: path.relative(root, assembly.expectedInstallerPath)
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const packageArgs = [
    "--workspace",
    path.relative(root, assembly.workspacePath),
    "--app",
    assembly.appKey
  ];
  if (skipBuild) {
    packageArgs.unshift("--skip-build");
  }
  runCommand(path.join(root, "scripts", "package-installer.sh"), packageArgs, {
    cwd: root,
    description: "Build workbench installer",
    stdio: "inherit",
    timeoutEnvVar: "FWAK_NATIVE_BUILD_TIMEOUT_MS",
    timeoutMs: 30 * 60 * 1000
  });
  process.stdout.write(`Built workbench installer at ${assembly.expectedInstallerPath}\n`);
}

main();
