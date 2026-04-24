import fs from "node:fs";
import path from "node:path";

import {
  clapFeatureMacro,
  encodeVst3Tuid,
  escapeCString,
  findMetaValue,
  formatFloatLiteral,
  gatherControls,
  loadCatalogRuntime,
  normalizeRelativePath
} from "./project-tools.mjs";
import { writeFileAtomically } from "./fs-tools.mjs";

function generatedAppBenchmarkPath(appKey) {
  return `/generated/apps/${appKey}/benchmark-results.json`;
}

function generatedAppSchemaPath(appKey) {
  return `/generated/apps/${appKey}/ui_schema.json`;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveUiState(runtime) {
  const { project } = runtime;
  const resolvedUi = runtime.ui ?? project.ui ?? {};
  return {
    project,
    resolvedUi,
    controlOrder: resolvedUi?.controlOrder ?? [],
    meters: resolvedUi?.meters ?? [],
    statusText: resolvedUi?.shell?.hero?.status ?? resolvedUi?.statusText ?? resolvedUi?.shell?.statusText ?? ""
  };
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  const text = Buffer.from(String(value ?? ""), "utf8");
  for (const byte of text) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function controlParameterId(runtime, control, index) {
  const hash = fnv1a32(`${runtime.project.bundleId}:${control.address}`);
  return hash === 0 ? (0x10000000 + index) >>> 0 : hash;
}

function controlDisplayKind(control) {
  if (control.label === "Drive Target") {
    return "FWAK_PARAM_DISPLAY_DRIVE_TARGET";
  }
  if (control.label === "Drive Focus") {
    return "FWAK_PARAM_DISPLAY_DRIVE_FOCUS";
  }
  return "FWAK_PARAM_DISPLAY_DEFAULT";
}

function controlFlags(control) {
  const flags = ["CPLUG_FLAG_PARAMETER_IS_AUTOMATABLE"];
  if (control.type === "checkbox" || control.type === "button") {
    flags.unshift("CPLUG_FLAG_PARAMETER_IS_BOOL");
  }
  if (control.label === "Bypass") {
    flags.push("CPLUG_FLAG_PARAMETER_IS_BYPASS");
  }
  return flags.join(" | ");
}

function controlEnumLabels(resolvedUi, control) {
  const labels = resolvedUi?.display?.enumLabels?.[control.label];
  return Array.isArray(labels) && labels.length > 0 ? labels : null;
}

function controlDisplay(resolvedUi, control) {
  const display = resolvedUi?.display?.controls?.[control.label];
  return display != null && typeof display === "object" ? display : null;
}

function resolveCatalogManifest(resolvedUi) {
  const inlineCatalog = asObject(resolvedUi?.catalog);
  const productId = typeof inlineCatalog.productId === "string" ? inlineCatalog.productId.trim() : "";
  if (!productId) {
    return inlineCatalog;
  }

  const { catalog } = loadCatalogRuntime();
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const matchedProduct = products.find((product) => product?.id === productId);
  if (!matchedProduct) {
    return inlineCatalog;
  }

  return {
    ...inlineCatalog,
    referenceProduct:
      typeof inlineCatalog.referenceProduct === "string" && inlineCatalog.referenceProduct.trim().length
        ? inlineCatalog.referenceProduct
        : matchedProduct.referenceProduct,
    featureAnchors:
      Array.isArray(inlineCatalog.featureAnchors) && inlineCatalog.featureAnchors.length
        ? inlineCatalog.featureAnchors
        : matchedProduct.featureAnchors
  };
}

function buildProjectConfigArtifacts(runtime) {
  const { project } = runtime;
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
  const generatedTargetRelPath = normalizeRelativePath(
    path.relative(runtime.outputDir, path.join(runtime.targetDir, `${runtime.sourceBase}.c`))
  );
  const latencyLiteral = formatFloatLiteral(project.plugin.latencySeconds);
  const artifactStemToken = project.artifactStem ?? project.productName.replaceAll(" ", "");

  const header = `#ifndef FWAK_PROJECT_CONFIG_H
#define FWAK_PROJECT_CONFIG_H

#define FWAK_PROJECT_NAME "${escapeCString(project.name)}"
#define FWAK_PROJECT_VERSION "${escapeCString(project.version)}"
#define FWAK_PROJECT_DESCRIPTION "${escapeCString(projectDescription)}"
#define FWAK_PRODUCT_NAME "${escapeCString(project.productName)}"
#define FWAK_ARTIFACT_STEM "${escapeCString(artifactStemToken)}"
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
#define FWAK_PLUGIN_LATENCY_SECONDS ${latencyLiteral}
#define FWAK_GUI_NATIVE ${wantsNativeGui}
#define FWAK_GUI_WEB_PREVIEW ${wantsWebPreview}
#define FWAK_GUI_RESIZABLE ${guiResizable}
#define FWAK_PLUGIN_VIEW_CLASS FwakPluginView_${artifactStemToken}
#define FWAK_ANALYZER_VIEW_CLASS FwakAnalyzerView_${artifactStemToken}
#define FWAK_AUV2_FACTORY_CLASS FwakAuv2ViewFactory_${artifactStemToken}
#define FWAK_AUV2_FACTORY_CLASS_STR "FwakAuv2ViewFactory_${artifactStemToken}"
#define FWAK_OVERSAMPLING_FACTOR ${project.oversampling.factor}
#define FWAK_FAUST_CLASS "${escapeCString(project.faust.className)}"
#define FWAK_DSP_TYPE ${project.faust.className}
#define FWAK_DSP_CPP_CLASS ${project.faust.className}
#define FWAK_DSP_NEW_FN new${project.faust.className}
#define FWAK_DSP_DELETE_FN delete${project.faust.className}
#define FWAK_DSP_INIT_FN init${project.faust.className}
#define FWAK_DSP_INSTANCE_INIT_FN instanceInit${project.faust.className}
#define FWAK_DSP_BUILD_UI_FN buildUserInterface${project.faust.className}
#define FWAK_DSP_COMPUTE_FN compute${project.faust.className}
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
set(FWAK_ARTIFACT_STEM "${escapeCString(artifactStemToken)}")
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

  return { cmake, header };
}

function buildUiManifestArtifacts(runtime, uiJsonPath) {
  const { project, resolvedUi, controlOrder, meters, statusText } = resolveUiState(runtime);
  const uiJson = JSON.parse(fs.readFileSync(uiJsonPath, "utf8"));
  const controls = gatherControls(uiJson.ui);
  const controlByLabel = new Map(controls.map((control) => [control.label, control]));
  const controlIndexByLabel = new Map(controls.map((control, index) => [control.label, index]));
  const orderedControls = [
    ...controlOrder.map((label) => controlByLabel.get(label)).filter(Boolean),
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

  const orderedIndices = orderedControls.map((control) => controlIndexByLabel.get(control.label) ?? -1);
  const orderedIndexLines = orderedIndices.map((index) => `    ${index}`).join(",\n");
  const parameterEnumLabelLines = [];
  const parameterLines = controls.map((control, index) => {
    const initValue = formatFloatLiteral(control.init ?? 0);
    const minValue = formatFloatLiteral(control.min ?? 0);
    const maxValue = formatFloatLiteral(control.max ?? 1);
    const unit = findMetaValue(control, "unit") ?? "";
    const enumLabels = controlEnumLabels(resolvedUi, control);
    const display = controlDisplay(resolvedUi, control);
    let enumLabelSymbol = "0";
    let enumLabelCount = "0u";

    if (enumLabels) {
      enumLabelSymbol = `FWAK_PARAM_ENUM_LABELS_${index}`;
      enumLabelCount = `${enumLabels.length}u`;
      parameterEnumLabelLines.push(`static const char* const ${enumLabelSymbol}[${enumLabels.length}] = {
${enumLabels.map((label) => `    "${escapeCString(label)}"`).join(",\n")}
};`);
    }

    const offLabel = typeof display?.offLabel === "string" ? `"${escapeCString(display.offLabel)}"` : "0";
    const onLabel = typeof display?.onLabel === "string" ? `"${escapeCString(display.onLabel)}"` : "0";

    return `    { ${controlParameterId(runtime, control, index)}u, "${escapeCString(control.label)}", "${escapeCString(unit)}", ${minValue}, ${maxValue}, ${initValue}, ${controlFlags(control)}, ${controlDisplayKind(control)}, ${offLabel}, ${onLabel}, ${enumLabelSymbol}, ${enumLabelCount} }`;
  });

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

${parameterEnumLabelLines.length > 0 ? `${parameterEnumLabelLines.join("\n\n")}\n\n` : ""}static const FwakParameterInfo FWAK_PARAMETER_MANIFEST[FWAK_CONTROL_COUNT] = {
${parameterLines.join(",\n")}
};

static const FwakMeterManifestItem FWAK_METER_MANIFEST[FWAK_METER_COUNT] = {
${meterLines.join(",\n")}
};

#endif
`;

  const schema = {
    project: {
      key: runtime.appKey,
      name: project.productName,
      description: project.description,
      statusText,
      kind: project.plugin.kind,
      inputs: project.plugin.inputs,
      outputs: project.plugin.outputs,
      previewOnly: true,
      uiFamily: runtime.uiRuntime?.family ?? null,
      uiVariant: runtime.uiRuntime?.variant ?? null
    },
    ui: {
      family: runtime.uiRuntime?.family ?? null,
      variant: runtime.uiRuntime?.variant ?? null,
      group: resolvedUi?.group ?? null,
      accentPaletteId: resolvedUi?.accentPaletteId ?? resolvedUi?.presentation?.accentPaletteId ?? null,
      catalog: resolveCatalogManifest(resolvedUi),
      presentation: resolvedUi?.presentation ?? {},
      visualLanguage: resolvedUi?.visualLanguage ?? {},
      shell: resolvedUi?.shell ?? {},
      theme: resolvedUi?.theme ?? {},
      layout: resolvedUi?.layout ?? {},
      surfaces: resolvedUi?.surfaces ?? [],
      surfacePresets: resolvedUi?.surfacePresets ?? {},
      analyzerPresets: resolvedUi?.analyzerPresets ?? {},
      meterPresets: resolvedUi?.meterPresets ?? {},
      surfacePresetIds: resolvedUi?.surfacePresetIds ?? [],
      analyzerPresetIds: resolvedUi?.analyzerPresetIds ?? [],
      meterPresetIds: resolvedUi?.meterPresetIds ?? [],
      controlKindIds: resolvedUi?.controlKindIds ?? [],
      layoutProfile: resolvedUi?.layoutProfile ?? null,
      preview: resolvedUi?.preview ?? {},
      display: resolvedUi?.display ?? {}
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
      isToggle: control.type === "checkbox" || control.type === "button",
      enumLabels: controlEnumLabels(resolvedUi, control),
      display: controlDisplay(resolvedUi, control)
    })),
    meters,
    benchmarkPath: generatedAppBenchmarkPath(runtime.appKey)
  };

  return { header, schema };
}

function writeWorkspaceManifest(runtime) {
  const workspaceManifest = {
    name: runtime.workspace.name,
    version: runtime.workspace.version,
    defaultApp: runtime.workspaceRuntime.defaultAppKey,
    apps: runtime.workspaceRuntime.appEntries.map((entry) => {
      const appProject = JSON.parse(fs.readFileSync(entry.manifestPath, "utf8"));
      return {
        key: entry.key,
        name: appProject.productName,
        description: appProject.description,
        manifest: entry.manifest,
        schemaPath: generatedAppSchemaPath(entry.key),
        benchmarkPath: generatedAppBenchmarkPath(entry.key),
        previewPath: entry.previewPath
      };
    })
  };

  writeFileAtomically(
    path.join(runtime.generatedRootDir, "workspace_manifest.json"),
    `${JSON.stringify(workspaceManifest, null, 2)}\n`
  );
}

export {
  buildProjectConfigArtifacts,
  buildUiManifestArtifacts,
  generatedAppBenchmarkPath,
  generatedAppSchemaPath,
  writeWorkspaceManifest
};
