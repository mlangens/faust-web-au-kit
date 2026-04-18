import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  clapFeatureMacro,
  encodeVst3Tuid,
  escapeCString,
  findMetaValue,
  formatFloatLiteral,
  gatherControls,
  loadProjectRuntime,
  normalizeRelativePath
} from "./lib/project-tools.mjs";

const runtime = loadProjectRuntime();
const { root, project, sourceFile, sourceBase, outputDir, targetDir, isDefaultProject } = runtime;

fs.mkdirSync(targetDir, { recursive: true });

const className = project.faust.className;
const controlOrder = project.ui?.controlOrder ?? [];
const meters = project.ui?.meters ?? [];
const statusText = project.ui?.statusText ?? "";
const outputBaseName = sourceBase;

function generatedTargetPath(extension) {
  return path.join(targetDir, `${outputBaseName}.${extension}`);
}

function runFaust(args, options = {}) {
  execFileSync("faust", args, {
    cwd: root,
    stdio: options.stdio ?? "inherit"
  });
}

function writeProjectConfig() {
  const cmakeTags = project.au.tags.map((tag) => `<string>${tag}</string>`).join("\n");
  const versionParts = project.version.split(".").map((item) => Number(item) || 0);
  const versionInt = ((versionParts[0] ?? 0) << 16) | ((versionParts[1] ?? 0) << 8) | (versionParts[2] ?? 0);
  const isInstrument = project.plugin.kind === "instrument" ? 1 : 0;
  const wantsMidiInput = project.plugin.midiInput ? 1 : 0;
  const wantsNativeGui = project.plugin.gui.native ? 1 : 0;
  const wantsWebPreview = project.plugin.gui.webPreview ? 1 : 0;
  const guiResizable = project.plugin.gui.resizable ? 1 : 0;
  const activeTargets = (project.targets?.active ?? []).join(";");
  const declaredTargets = (project.targets?.native ?? []).join(";");
  const clapFeatures = (project.clap?.features ?? []).map(clapFeatureMacro).join(", ");
  const vst3Categories = (project.vst3?.categories ?? []).join("|");
  const projectDescription = project.description ?? "";
  const standaloneBundleId = project.standalone?.bundleId ?? `${project.bundleId}.app`;
  const generatedTargetRelPath = normalizeRelativePath(path.relative(outputDir, generatedTargetPath("c")));

  const header = `#ifndef FWAK_PROJECT_CONFIG_H
#define FWAK_PROJECT_CONFIG_H

#define FWAK_PROJECT_NAME "${escapeCString(project.name)}"
#define FWAK_PROJECT_VERSION "${escapeCString(project.version)}"
#define FWAK_PROJECT_DESCRIPTION "${escapeCString(projectDescription)}"
#define FWAK_PRODUCT_NAME "${escapeCString(project.productName)}"
#define FWAK_ARTIFACT_STEM "${escapeCString(project.artifactStem ?? project.productName.replaceAll(" ", ""))}"
#define FWAK_COMPANY_NAME "${escapeCString(project.companyName)}"
#define FWAK_BUNDLE_ID "${escapeCString(project.bundleId)}"
#define FWAK_STANDALONE_BUNDLE_ID "${escapeCString(standaloneBundleId)}"
#define FWAK_AU_TYPE "${escapeCString(project.au.type)}"
#define FWAK_AU_SUBTYPE "${escapeCString(project.au.subtype)}"
#define FWAK_AU_MANUFACTURER "${escapeCString(project.au.manufacturer)}"
#define FWAK_PLUGIN_KIND "${escapeCString(project.plugin.kind)}"
#define FWAK_PLUGIN_IS_INSTRUMENT ${isInstrument}
#define FWAK_PLUGIN_NUM_INPUTS ${project.plugin.inputs}
#define FWAK_PLUGIN_NUM_OUTPUTS ${project.plugin.outputs}
#define FWAK_PLUGIN_WANTS_MIDI_INPUT ${wantsMidiInput}
#define FWAK_PLUGIN_LATENCY_SECONDS ${project.plugin.latencySeconds}f
#define FWAK_GUI_NATIVE ${wantsNativeGui}
#define FWAK_GUI_WEB_PREVIEW ${wantsWebPreview}
#define FWAK_GUI_RESIZABLE ${guiResizable}
#define FWAK_OVERSAMPLING_FACTOR ${project.oversampling.factor}
#define FWAK_FAUST_CLASS "${escapeCString(project.faust.className)}"
#define FWAK_GENERATED_C_TARGET_PATH "${generatedTargetRelPath}"
#define FWAK_ACTIVE_NATIVE_TARGETS "${escapeCString(activeTargets)}"
#define FWAK_DECLARED_NATIVE_TARGETS "${escapeCString(declaredTargets)}"
#define FWAK_CLAP_ID "${escapeCString(project.clap?.id ?? project.bundleId)}"
#define FWAK_CLAP_DESCRIPTION "${escapeCString(project.clap?.description ?? projectDescription)}"
#define FWAK_CLAP_FEATURES ${clapFeatures || "CLAP_PLUGIN_FEATURE_STEREO"}
#define FWAK_VST3_CATEGORIES "${escapeCString(vst3Categories || "Fx|Stereo")}"
#define FWAK_VST3_TUID_COMPONENT ${encodeVst3Tuid(project.vst3?.componentTuid ?? ["Mlng", "Comp", "Demo", 0])}
#define FWAK_VST3_TUID_CONTROLLER ${encodeVst3Tuid(project.vst3?.controllerTuid ?? ["Mlng", "Edit", "Demo", 0])}

#endif
`;

  const cmake = `set(FWAK_PROJECT_NAME "${escapeCString(project.name)}")
set(FWAK_PROJECT_VERSION "${escapeCString(project.version)}")
set(FWAK_PRODUCT_NAME "${escapeCString(project.productName)}")
set(FWAK_ARTIFACT_STEM "${escapeCString(project.artifactStem ?? project.productName.replaceAll(" ", ""))}")
set(FWAK_PROJECT_DESCRIPTION "${escapeCString(project.description)}")
set(FWAK_COMPANY_NAME "${escapeCString(project.companyName)}")
set(FWAK_BUNDLE_ID "${escapeCString(project.bundleId)}")
set(FWAK_STANDALONE_BUNDLE_ID "${escapeCString(standaloneBundleId)}")
set(FWAK_AU_TYPE "${escapeCString(project.au.type)}")
set(FWAK_AU_SUBTYPE "${escapeCString(project.au.subtype)}")
set(FWAK_AU_MANUFACTURER "${escapeCString(project.au.manufacturer)}")
set(FWAK_AU_TAGS "${cmakeTags}")
set(FWAK_PLUGIN_KIND "${escapeCString(project.plugin.kind)}")
set(FWAK_PLUGIN_IS_INSTRUMENT ${isInstrument})
set(FWAK_PLUGIN_NUM_INPUTS ${project.plugin.inputs})
set(FWAK_PLUGIN_NUM_OUTPUTS ${project.plugin.outputs})
set(FWAK_PLUGIN_WANTS_MIDI_INPUT ${wantsMidiInput})
set(FWAK_PLUGIN_LATENCY_SECONDS ${project.plugin.latencySeconds})
set(FWAK_GUI_NATIVE ${wantsNativeGui})
set(FWAK_GUI_WEB_PREVIEW ${wantsWebPreview})
set(FWAK_GUI_RESIZABLE ${guiResizable})
set(FWAK_VERSION_INT ${versionInt})
set(FWAK_OVERSAMPLING_FACTOR ${project.oversampling.factor})
set(FWAK_ACTIVE_NATIVE_TARGETS "${escapeCString(activeTargets)}")
set(FWAK_DECLARED_NATIVE_TARGETS "${escapeCString(declaredTargets)}")
`;

  fs.writeFileSync(path.join(outputDir, "project_config.h"), header);
  fs.writeFileSync(path.join(outputDir, "project_config.cmake"), cmake);

  if (isDefaultProject) {
    fs.writeFileSync(path.join(root, "generated", "project_config.h"), header);
    fs.writeFileSync(path.join(root, "generated", "project_config.cmake"), cmake);
  }
}

function exportTarget(target, extraArgs = []) {
  const extensionByTarget = {
    c: "c",
    cpp: "hpp",
    wast: "wast",
    wasm: "wasm",
    cmajor: "cmajor",
    rust: "rs"
  };

  const extension = extensionByTarget[target];
  if (!extension) {
    throw new Error(`Unsupported target: ${target}`);
  }

  const output = generatedTargetPath(extension);
  runFaust(["-lang", target, "-cn", className, "-o", output, ...extraArgs, sourceFile], { stdio: "inherit" });
}

function exportJsonMetadata() {
  execFileSync("faust", ["-json", "-cn", className, sourceFile], {
    cwd: targetDir,
    stdio: ["ignore", "ignore", "inherit"]
  });

  const emittedJson = path.join(targetDir, `${sourceBase}.json`);
  const finalJson = path.join(targetDir, `${outputBaseName}.ui.json`);
  if (fs.existsSync(finalJson)) {
    fs.unlinkSync(finalJson);
  }
  fs.renameSync(emittedJson, finalJson);
  return finalJson;
}

function writeUiManifest(uiJsonPath) {
  const uiJson = JSON.parse(fs.readFileSync(uiJsonPath, "utf8"));
  const controls = gatherControls(uiJson.ui);
  const controlByLabel = new Map(controls.map((control) => [control.label, control]));
  const orderedControls = [
    ...controlOrder
      .map((label) => controlByLabel.get(label))
      .filter(Boolean),
    ...controls.filter((control) => !controlOrder.includes(control.label))
  ];

  const manifestLines = controls.map((control) => {
    const initValue = formatFloatLiteral(control.init ?? 0);
    const minValue = formatFloatLiteral(control.min ?? 0);
    const maxValue = formatFloatLiteral(control.max ?? 1);
    const stepValue = formatFloatLiteral(control.step ?? 0);
    const isToggle = control.type === "checkbox" || control.type === "button" ? 1 : 0;
    return `    { ${Number(control.index ?? 0)}, "${escapeCString(control.label)}", "${escapeCString(control.shortname)}", "${escapeCString(control.address)}", ${initValue}, ${minValue}, ${maxValue}, ${stepValue}, ${isToggle} }`;
  });

  const orderedIndices = orderedControls.map((control) => controls.findIndex((candidate) => candidate.label === control.label));
  const orderedIndexLines = orderedIndices.map((index) => `    ${index}`).join(",\n");

  const meterLines = meters.map((meter) => {
    const mode = meter.mode === "gr" ? 1 : 0;
    return `    { "${escapeCString(meter.id)}", "${escapeCString(meter.label)}", ${formatFloatLiteral(meter.max ?? 24)}, ${mode} }`;
  });

  const header = `#ifndef FWAK_UI_MANIFEST_H
#define FWAK_UI_MANIFEST_H

typedef struct {
    int faustIndex;
    const char* label;
    const char* shortname;
    const char* address;
    float initValue;
    float minValue;
    float maxValue;
    float stepValue;
    int isToggle;
} FwakControlManifestItem;

typedef struct {
    const char* id;
    const char* label;
    float maxValue;
    int isGainReduction;
} FwakMeterManifestItem;

#define FWAK_CONTROL_COUNT ${controls.length}
#define FWAK_CONTROL_ORDER_COUNT ${orderedIndices.length}
#define FWAK_METER_COUNT ${meters.length}
#define FWAK_STATUS_TEXT "${escapeCString(statusText)}"

static const FwakControlManifestItem FWAK_CONTROL_MANIFEST[FWAK_CONTROL_COUNT] = {
${manifestLines.join(",\n")}
};

static const int FWAK_CONTROL_ORDER[FWAK_CONTROL_ORDER_COUNT] = {
${orderedIndexLines}
};

static const FwakMeterManifestItem FWAK_METER_MANIFEST[FWAK_METER_COUNT] = {
${meterLines.join(",\n")}
};

#endif
`;

  const schema = {
    project: {
      key: runtime.projectKey,
      name: project.productName,
      description: project.description,
      statusText,
      kind: project.plugin.kind,
      inputs: project.plugin.inputs,
      outputs: project.plugin.outputs,
      previewOnly: true
    },
    controls: orderedControls.map((control) => ({
      id: control.label,
      label: control.label,
      shortname: control.shortname,
      address: control.address,
      type: control.type,
      init: control.init ?? 0,
      min: control.min ?? 0,
      max: control.max ?? 1,
      step: control.step ?? 0,
      unit: findMetaValue(control, "unit"),
      scale: findMetaValue(control, "scale"),
      isToggle: control.type === "checkbox" || control.type === "button"
    })),
    meters,
    benchmarkPath: "/generated/benchmark-results.json"
  };

  fs.writeFileSync(path.join(outputDir, "ui_manifest.h"), header);
  fs.writeFileSync(path.join(outputDir, "ui_schema.json"), `${JSON.stringify(schema, null, 2)}\n`);

  if (isDefaultProject) {
    fs.writeFileSync(path.join(root, "generated", "ui_manifest.h"), header);
    fs.writeFileSync(path.join(root, "generated", "ui_schema.json"), `${JSON.stringify(schema, null, 2)}\n`);
  }
}

writeProjectConfig();
exportTarget("c");
exportTarget("cpp");
exportTarget("wast");
exportTarget("wasm");
exportTarget("cmajor");
exportTarget("rust");
writeUiManifest(exportJsonMetadata());

console.log(`Exported Faust targets into ${path.relative(root, targetDir)}`);
