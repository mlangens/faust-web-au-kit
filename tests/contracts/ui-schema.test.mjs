import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { summarizeControlLayout } from "../../preview/lib/control-panels.js";
import { loadSuiteRuntime } from "../../tools/lib/project-tools.mjs";
import { expectedOrderedLabels, loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";
import { appSchemaCases } from "./app-schema-cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const archivedCloneKeys = [
  "atlas-curve",
  "press-deck",
  "headroom",
  "room-bloom",
  "split-stack",
  "silk-guard",
  "latch-line",
  "ember-drive",
  "relay-tape",
  "contour-forge",
  "mirror-field",
  "seed-tone",
  "span-pair",
  "pocket-cut"
];

const SURFACE_CONTROL_KEYS = new Set([
  "control",
  "xControl",
  "yControl",
  "qControl",
  "startControl",
  "endControl",
  "timeControl",
  "amountControl",
  "sourceControl",
  "voiceControl",
  "summaryControl"
]);
const SURFACE_CONTROL_LIST_KEYS = new Set(["readouts", "items", "globalItems", "timingItems", "detailItems"]);

function collectSurfaceControlBindings(value, parentKey = "", bindings = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSurfaceControlBindings(entry, parentKey, bindings));
    return bindings;
  }

  if (typeof value === "string") {
    if (SURFACE_CONTROL_LIST_KEYS.has(parentKey)) {
      bindings.add(value);
    }
    return bindings;
  }

  if (!value || typeof value !== "object") {
    return bindings;
  }

  Object.entries(value).forEach(([key, entry]) => {
    if (SURFACE_CONTROL_KEYS.has(key) && typeof entry === "string") {
      bindings.add(entry);
    }
    collectSurfaceControlBindings(entry, key, bindings);
  });
  return bindings;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("default app schema now targets the primitive workbench", () => {
  const { runtime, schema, faustControls } = loadGeneratedProject();
  const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);

  assert.equal(runtime.appKey, "omniplugin");
  assert.equal(schema.project.key, "omniplugin");
  assert.equal(schema.project.name, "Primitive Workbench");
  assert.equal(schema.project.kind, "effect");
  assert.deepEqual(schema.controls.map((control) => control.label), expectedLabels);
  assert.equal(schema.ui.catalog?.category, "meta-workbench");
  assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.workflow, "primitive-assembler");
  assert.equal(schema.ui.preview?.surfaces?.["section-grid"]?.recipes?.[0]?.installerCommand, "npm run workbench:build-installer -- --recipe fet-76-rebuild");
  assert.equal(schema.benchmarkPath, "/generated/apps/omniplugin/benchmark-results.json");
});

test("active workspace manifest only exposes framework studio apps", () => {
  const workspace = loadGeneratedWorkspace();

  assert.deepEqual(
    workspace.apps.map((app) => app.key),
    ["omniplugin", "fet-76", "pulse-pad", "limiter-lab"]
  );
  assert.deepEqual(
    workspace.apps.map((app) => app.name),
    ["Primitive Workbench", "FET-76", "Pulse Pad", "Limiter Lab"]
  );
  assert.equal(workspace.defaultApp, "omniplugin");
});

test("active app schemas keep generated UI contracts aligned with Faust exports", () => {
  for (const appCase of appSchemaCases) {
    const { runtime, schema, faustControls } = loadGeneratedProject(appCase.appKey);
    const expectedLabels = expectedOrderedLabels(runtime.project, faustControls);
    const controlLabels = new Set(schema.controls.map((control) => control.label));

    assert.equal(schema.project.key, appCase.appKey);
    assert.equal(schema.project.name, appCase.name);
    assert.equal(schema.project.kind, appCase.kind);
    assert.deepEqual(schema.controls.map((control) => control.label), expectedLabels);
    assert.deepEqual(schema.ui.surfacePresetIds, appCase.surfacePresetIds);
    appCase.controlLabelsAny.forEach((label) => assert.ok(controlLabels.has(label), `${appCase.appKey} should expose ${label}`));
    appCase.assertions(schema);
  }
});

test("active apps keep sectioned layouts and surface-owned controls coherent", () => {
  for (const appCase of appSchemaCases) {
    const { schema } = loadGeneratedProject(appCase.appKey);
    const summary = summarizeControlLayout(schema);
    const surfaceBindings = collectSurfaceControlBindings(schema.ui.preview?.surfaces ?? {});

    assert.equal(summary.layout.layout, "sectioned", `${appCase.appKey} should use sectioned controls`);
    assert.ok(summary.sections.length > 0, `${appCase.appKey} should declare at least one section`);
    assert.deepEqual(
      new Set(summary.configuredControls.map((control) => control.label)),
      new Set(schema.controls.map((control) => control.label)),
      `${appCase.appKey} should map every exported control into the preview layout`
    );
    assert.equal(
      summary.configuredItems.length,
      schema.controls.length,
      `${appCase.appKey} should not duplicate controls across grouped layout sections`
    );
    if (summary.surfaceOnlyControls.length > 0) {
      summary.surfaceOnlyControls.forEach((control) => {
        assert.ok(surfaceBindings.has(control.label), `${appCase.appKey} surface-owned control "${control.label}" should be bound to a surface`);
      });
    } else {
      assert.equal(
        summary.visibleControls.length,
        schema.controls.length,
        `${appCase.appKey} without surface-owned controls should keep all controls visible`
      );
    }
  }
});

test("framework studio is the operational suite and Northline is reference-only", () => {
  const defaultSuite = loadSuiteRuntime();
  const frameworkStudio = loadSuiteRuntime(["--suite", "framework-studio"]);

  assert.equal(defaultSuite.suiteId, "framework-studio");
  assert.equal(frameworkStudio.suiteName, "FWAK Studio Lab");
  assert.deepEqual(
    frameworkStudio.apps.map((runtime) => runtime.appKey),
    ["omniplugin", "fet-76", "pulse-pad", "limiter-lab"]
  );
  assert.throws(
    () => loadSuiteRuntime(["--suite", "northline-suite"]),
    /reference-only/,
    "archived Northline should not be loadable as an operational suite"
  );
});

test("Northline clone knowledge is preserved as reference assemblages, not app routes", () => {
  const workspace = loadGeneratedWorkspace();
  const archive = readJson("framework/reference-corpus/reference-assemblages.json");
  const activeKeys = new Set(workspace.apps.map((app) => app.key));

  assert.equal(archive.id, "fwak-reference-assemblages");
  assert.equal(archive.assemblages.length, archivedCloneKeys.length);
  assert.deepEqual(archive.assemblages.map((entry) => entry.productKey), archivedCloneKeys);

  for (const entry of archive.assemblages) {
    assert.equal(entry.cloneDerivedSample, true);
    assert.equal(activeKeys.has(entry.productKey), false, `${entry.productKey} should not be an active workspace app`);
    assert.ok(entry.primitiveIds.length > 0, `${entry.productKey} should preserve primitive IDs`);
    assert.ok(entry.surfaceIds.length > 0, `${entry.productKey} should preserve surface IDs`);
    assert.ok(entry.controlSections.length > 0, `${entry.productKey} should preserve control sections`);
    assert.ok(entry.meterLabels.length > 0, `${entry.productKey} should preserve meter labels`);
  }
});
