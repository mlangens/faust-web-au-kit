import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const project = JSON.parse(fs.readFileSync(path.join(root, "project.json"), "utf8"));
const generatedDir = path.join(root, "generated");
const targetDir = path.join(generatedDir, "targets");

fs.mkdirSync(targetDir, { recursive: true });

const dspSource = path.join(root, project.faust.source);
const className = project.faust.className;

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

  const header = `#ifndef FWAK_PROJECT_CONFIG_H
#define FWAK_PROJECT_CONFIG_H

#define FWAK_PROJECT_NAME "${project.name}"
#define FWAK_PROJECT_VERSION "${project.version}"
#define FWAK_PRODUCT_NAME "${project.productName}"
#define FWAK_COMPANY_NAME "${project.companyName}"
#define FWAK_BUNDLE_ID "${project.bundleId}"
#define FWAK_AU_TYPE "${project.au.type}"
#define FWAK_AU_SUBTYPE "${project.au.subtype}"
#define FWAK_AU_MANUFACTURER "${project.au.manufacturer}"
#define FWAK_PLUGIN_KIND "${project.plugin.kind}"
#define FWAK_PLUGIN_IS_INSTRUMENT ${isInstrument}
#define FWAK_PLUGIN_NUM_INPUTS ${project.plugin.inputs}
#define FWAK_PLUGIN_NUM_OUTPUTS ${project.plugin.outputs}
#define FWAK_PLUGIN_WANTS_MIDI_INPUT ${wantsMidiInput}
#define FWAK_PLUGIN_LATENCY_SECONDS ${project.plugin.latencySeconds}f
#define FWAK_GUI_NATIVE ${wantsNativeGui}
#define FWAK_GUI_WEB_PREVIEW ${wantsWebPreview}
#define FWAK_GUI_RESIZABLE ${guiResizable}
#define FWAK_OVERSAMPLING_FACTOR ${project.oversampling.factor}
#define FWAK_FAUST_CLASS "${project.faust.className}"
#define FWAK_ACTIVE_NATIVE_TARGETS "${activeTargets}"
#define FWAK_DECLARED_NATIVE_TARGETS "${declaredTargets}"

#endif
`;

  const cmake = `set(FWAK_PROJECT_NAME "${project.name}")
set(FWAK_PROJECT_VERSION "${project.version}")
set(FWAK_PRODUCT_NAME "${project.productName}")
set(FWAK_PROJECT_DESCRIPTION "${project.description}")
set(FWAK_COMPANY_NAME "${project.companyName}")
set(FWAK_BUNDLE_ID "${project.bundleId}")
set(FWAK_AU_TYPE "${project.au.type}")
set(FWAK_AU_SUBTYPE "${project.au.subtype}")
set(FWAK_AU_MANUFACTURER "${project.au.manufacturer}")
set(FWAK_AU_TAGS "${cmakeTags}")
set(FWAK_PLUGIN_KIND "${project.plugin.kind}")
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
set(FWAK_ACTIVE_NATIVE_TARGETS "${activeTargets}")
set(FWAK_DECLARED_NATIVE_TARGETS "${declaredTargets}")
`;

  fs.writeFileSync(path.join(generatedDir, "project_config.h"), header);
  fs.writeFileSync(path.join(generatedDir, "project_config.cmake"), cmake);
}

function exportTarget(target, extraArgs = []) {
  const outputByTarget = {
    c: path.join(targetDir, "limiter_lab.c"),
    cpp: path.join(targetDir, "limiter_lab.hpp"),
    wast: path.join(targetDir, "limiter_lab.wast"),
    wasm: path.join(targetDir, "limiter_lab.wasm"),
    cmajor: path.join(targetDir, "limiter_lab.cmajor"),
    rust: path.join(targetDir, "limiter_lab.rs")
  };

  const output = outputByTarget[target];
  if (!output) {
    throw new Error(`Unsupported target: ${target}`);
  }

  runFaust(["-lang", target, "-cn", className, "-o", output, ...extraArgs, dspSource], { stdio: "inherit" });
}

function exportJsonMetadata() {
  const cwd = targetDir;
  execFileSync("faust", ["-json", "-cn", className, dspSource], {
    cwd,
    stdio: ["ignore", "ignore", "inherit"]
  });

  const sourceBase = path.parse(dspSource).name;
  const emittedJson = path.join(cwd, `${sourceBase}.json`);
  const finalJson = path.join(targetDir, "limiter_lab.ui.json");
  if (fs.existsSync(finalJson)) {
    fs.unlinkSync(finalJson);
  }
  fs.renameSync(emittedJson, finalJson);
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

function writeUiManifest() {
  const uiJson = JSON.parse(fs.readFileSync(path.join(targetDir, "limiter_lab.ui.json"), "utf8"));
  const controls = gatherControls(uiJson.ui);
  const manifestLines = controls.map((control) => {
    const initValue = formatFloatLiteral(control.init ?? 0);
    const minValue = formatFloatLiteral(control.min ?? 0);
    const maxValue = formatFloatLiteral(control.max ?? 1);
    const stepValue = formatFloatLiteral(control.step ?? 0);
    const isToggle = control.type === "checkbox" || control.type === "button" ? 1 : 0;
    return `    { ${Number(control.index ?? 0)}, "${escapeCString(control.label)}", "${escapeCString(control.shortname)}", "${escapeCString(control.address)}", ${initValue}, ${minValue}, ${maxValue}, ${stepValue}, ${isToggle} }`;
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

#define FWAK_CONTROL_COUNT ${controls.length}

static const FwakControlManifestItem FWAK_CONTROL_MANIFEST[FWAK_CONTROL_COUNT] = {
${manifestLines.join(",\n")}
};

#endif
`;

  fs.writeFileSync(path.join(generatedDir, "ui_manifest.h"), header);
}

writeProjectConfig();
exportTarget("c");
exportTarget("cpp");
exportTarget("wast");
exportTarget("wasm");
exportTarget("cmajor");
exportTarget("rust");
exportJsonMetadata();
writeUiManifest();

console.log(`Exported Faust targets into ${path.relative(root, targetDir)}`);
