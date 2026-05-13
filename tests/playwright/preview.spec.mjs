import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

import { summarizeControlLayout } from "../../preview/lib/control-panels.js";
import { normalizeSchema } from "../../preview/lib/schema-ui.js";
import { createSimulator } from "../../preview/lib/simulators.js";
import { loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";

const omniplugin = loadGeneratedProject("omniplugin");
const fet76 = loadGeneratedProject("fet-76");
const limiter = loadGeneratedProject("limiter-lab");
const pulsePad = loadGeneratedProject("pulse-pad");
const workspace = loadGeneratedWorkspace();

async function setRangeValue(page, controlId, value) {
  await page.locator(`input[data-control-id="${controlId}"]`).evaluate((node, nextValue) => {
    node.value = String(nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function setToggleValue(page, controlId, checked) {
  await page.locator(`input[data-control-id="${controlId}"]`).evaluate((node, nextChecked) => {
    node.checked = Boolean(nextChecked);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function dragLocatorTo(page, locator, targetX, targetY) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not resolve bounding box for drag source.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

async function dragLocatorBy(page, locator, deltaX, deltaY = 0) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not resolve bounding box for drag source.");
  }

  await dragLocatorTo(page, locator, box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY);
}

async function dragLocatorToCanvasRatio(page, locator, canvas, xRatio, yRatio) {
  await canvas.scrollIntoViewIfNeeded();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Could not resolve bounding box for drag canvas.");
  }

  await dragLocatorTo(
    page,
    locator,
    canvasBox.x + canvasBox.width * xRatio,
    canvasBox.y + canvasBox.height * yRatio
  );
}

function createSineWavBuffer({ seconds = 0.2, sampleRate = 8000, frequency = 220 } = {}) {
  const frames = Math.max(1, Math.floor(seconds * sampleRate));
  const bytesPerSample = 2;
  const channels = 1;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin((frame / sampleRate) * frequency * Math.PI * 2) * 0x3fff);
    buffer.writeInt16LE(sample, 44 + frame * bytesPerSample);
  }
  return buffer;
}

async function expectPreviewRouteLoaded(page, fixture, controlPattern) {
  const normalized = normalizeSchema(fixture.schema);
  const controlSummary = summarizeControlLayout(fixture.schema);
  const expectedSurfaceIds = (fixture.schema.ui?.surfacePresetIds ?? []).filter((surfaceId) => surfaceId !== "meter-stack");
  const simulator = createSimulator(normalized);

  await expect(page.locator("body")).toHaveAttribute("data-project-key", fixture.schema.project.key);
  await expect(page.locator("body")).toHaveAttribute("data-ui-family", normalized.ui.family);
  await expect(page.locator("body")).toHaveAttribute("data-ui-variant", normalized.ui.variant);
  await expect(page.locator("body")).toHaveAttribute("data-ui-theme-group", normalized.ui.themeGroup);
  await expect(page.locator("body")).toHaveAttribute("data-layout-profile", normalized.ui.layoutProfile);
  await expect(page.locator("body")).toHaveAttribute("data-simulator-id", simulator.id);
  await expect(page.getByRole("heading", { name: fixture.schema.project.name, exact: true })).toBeVisible();
  await expect(page.locator("#previewNav a.is-active")).toHaveText(fixture.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(controlSummary.visibleControls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(fixture.schema.meters.length);
  await expect(page.locator("#controls")).toHaveAttribute("data-control-layout", "sectioned");
  await expect(page.locator("#controls")).toHaveAttribute("data-control-count", String(fixture.schema.controls.length));
  await expect(page.locator("#controls")).toHaveAttribute("data-visible-control-count", String(controlSummary.visibleControls.length));
  await expect(page.locator("body")).toContainText(controlPattern);
  await expect(page.locator("#surfaces .surface-card")).toHaveCount(expectedSurfaceIds.length);

  const renderedSurfaceIds = await page.locator("#surfaces .surface-card").evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-surface-id"))
  );
  expect(renderedSurfaceIds).toEqual(expectedSurfaceIds);
}

async function expectPreviewViewportFits(page) {
  await expect(page.locator("#previewNav a.is-active")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#previewNav a.is-active")).toBeVisible();

  const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);

  const offscreenSurfaceIds = await page.locator("#surfaces .surface-card").evaluateAll((nodes) => nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > window.innerWidth + 1;
    })
    .map((node) => node.getAttribute("data-surface-id") ?? node.className));
  expect(offscreenSurfaceIds).toEqual([]);
}

const routeSmokeCases = [
  {
    title: "primitive workbench preview loads the default route",
    route: "/",
    fixture: omniplugin,
    controlPattern: /Slot 1 Type|Slot 2 Amount|Macro Intent|Macro Guard/
  },
  {
    title: "fet 76 preview loads the profiled FET compressor route",
    route: "/?app=fet-76",
    fixture: fet76,
    controlPattern: /Input|Output|Ratio|Attack|Release|Bias|Sidechain HP/
  },
  {
    title: "pulse pad preview loads the instrument route",
    route: "/?app=pulse-pad",
    fixture: pulsePad,
    controlPattern: /Texture|Detune|Sub|Motion/
  },
  {
    title: "limiter lab preview remains available as a legacy framework reference",
    route: "/?app=limiter-lab",
    fixture: limiter,
    controlPattern: /Input Gain|Ceiling|Drive Target|Output Trim/
  }
];

test("default preview renders the primitive workbench as the active workspace entry", async ({ page }) => {
  const controlSummary = summarizeControlLayout(omniplugin.schema);

  await page.goto("/");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", "omniplugin");
  await expect(page.getByRole("heading", { name: "Primitive Workbench" })).toBeVisible();
  await expect(page.locator("#previewNav a")).toHaveCount(workspace.apps.length);
  await expect(page.locator("#previewNav a")).toHaveText(workspace.apps.map((app) => app.name));
  await expect(page.locator("#previewNav a.is-active")).toHaveText("Primitive Workbench");
  await expect(page.locator("#controls .control-card")).toHaveCount(controlSummary.visibleControls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(omniplugin.schema.meters.length);
  await expect(page.locator("#controls")).toHaveAttribute("data-visible-control-count", "0");
  await expect(page.locator(".control-surface-summary")).toContainText("Surface-owned");
});

for (const routeCase of routeSmokeCases) {
  test(routeCase.title, async ({ page }) => {
    await page.goto(routeCase.route);
    await expectPreviewRouteLoaded(page, routeCase.fixture, routeCase.controlPattern);
  });
}

test("workspace preview routes fit shared shell bounds at desktop, tablet, and mobile widths", async ({ page }) => {
  const viewports = [
    { width: 1440, height: 1000 },
    { width: 860, height: 1000 },
    { width: 390, height: 1000 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const app of workspace.apps) {
      await page.goto(app.previewPath);
      await expect(page.locator("body")).toHaveAttribute("data-project-key", app.key);
      await expectPreviewViewportFits(page);
    }
  }
});

test("primitive workbench keeps every primitive slot surface-owned and directly editable", async ({ page }) => {
  await page.goto("/");

  const slotSurface = page.locator('.surface-card[data-surface-id="section-grid"]');
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const slotOneType = slotSurface.locator(".surface-value-row").filter({ hasText: "Type" }).first();
  const slotOneAmount = slotSurface.locator(".surface-value-row").filter({ hasText: "Amount" }).first();
  const intentRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Intent" });
  const initialType = await slotOneType.locator("strong").textContent();
  const initialAmount = await slotOneAmount.locator("strong").textContent();
  const initialIntent = await intentRow.locator("strong").textContent();

  await expect(page.locator("#controls")).toHaveAttribute("data-surface-only-control-count", String(omniplugin.schema.controls.length));
  await expect(page.locator('.control-card[data-control-id="Slot 1 Type"]')).toHaveCount(0);
  await expect(slotSurface.locator(".section-grid-card")).toHaveCount(4);
  await expect(slotSurface).toContainText("Primitive chain slots");
  await expect(outputSurface).toContainText("Output tools");

  await slotOneType.click();
  await dragLocatorBy(page, slotOneAmount, 92, 0);
  await dragLocatorBy(page, intentRow, 84, 0);

  await expect(slotOneType.locator("strong")).not.toHaveText(initialType ?? "");
  await expect(slotOneAmount.locator("strong")).not.toHaveText(initialAmount ?? "");
  await expect(intentRow.locator("strong")).not.toHaveText(initialIntent ?? "");
});

test("primitive workbench supports guided drag-drop scratch assembly and installer handoff", async ({ page }) => {
  await page.goto("/");

  const slotSurface = page.locator('.surface-card[data-surface-id="section-grid"]');
  const palette = slotSurface.locator(".primitive-palette");
  const recipePanel = slotSurface.locator(".primitive-recipe-panel");
  const inputPreampChip = palette.locator('.primitive-chip[data-primitive-id="analog.preamp-console-stage"]');
  const fetGainChip = palette.locator('.primitive-chip[data-primitive-id="compression.fet-76-gain-cell"]');
  const vintageTimingChip = palette.locator('.primitive-chip[data-primitive-id="compression.vintage-compressor-model"]');
  const outputColorChip = palette.locator('.primitive-chip[data-primitive-id="saturation.virtual-analog-stage"]');
  const slotOne = slotSurface.locator('.section-grid-card[data-section-id="slot-1"]');
  const slotTwo = slotSurface.locator('.section-grid-card[data-section-id="slot-2"]');
  const slotThree = slotSurface.locator('.section-grid-card[data-section-id="slot-3"]');
  const slotFour = slotSurface.locator('.section-grid-card[data-section-id="slot-4"]');
  const slotTwoAmount = slotTwo.locator(".surface-value-row").filter({ hasText: "Amount" }).locator("strong");
  let buildPayload;

  await expect(palette).toContainText("Primitive Palette");
  await expect(fetGainChip).toContainText("FET Gain Cell");
  await expect(recipePanel).toContainText("Recipe + Installer");
  await expect(recipePanel.locator(".target-guide")).toContainText("0/4 matched");
  await expect(recipePanel.getByRole("button", { name: "Build Installer" })).toBeDisabled();

  const recipeButton = recipePanel.locator('.recipe-button[data-recipe-id="fet-76-rebuild"]');
  await recipeButton.click();
  await expect(recipeButton).toHaveText(/Start guided FET-76 scratch build/);
  await expect(recipeButton).toHaveClass(/is-active/);
  await expect(slotOne.locator(".section-grid-card__assignment")).toContainText("Drop a primitive here");

  await inputPreampChip.dragTo(slotOne);
  await fetGainChip.dragTo(slotTwo);
  await vintageTimingChip.dragTo(slotThree);
  await outputColorChip.dragTo(slotFour);

  await expect(slotOne.locator(".section-grid-card__assignment")).toContainText("Input Preamp");
  await expect(slotTwo.locator(".section-grid-card__assignment")).toContainText("FET Gain Cell");
  await expect(slotThree.locator(".section-grid-card__assignment")).toContainText("Vintage Timing");
  await expect(slotFour.locator(".section-grid-card__assignment")).toContainText("Output Color");
  await expect(slotTwo.locator(".surface-value-row").filter({ hasText: "Type" }).locator("strong")).toContainText("Dynamics");
  await expect(slotTwoAmount).toContainText("86");
  await expect(recipePanel.locator(".target-guide")).toContainText("4/4 matched");
  await expect(recipePanel.locator(".target-guide")).toContainText("Build Installer is unlocked");
  await expect(recipePanel.locator(".recipe-installer-command")).toContainText("npm run workbench:build-installer -- --recipe fet-76-rebuild");
  await expect(recipePanel.locator(".recipe-installer-command")).toContainText("FET76Workbench-0.1.0.pkg");

  await page.route("**/api/workbench/build-installer", async (route) => {
    buildPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        recipe: buildPayload.recipe,
        sourceMode: "scratch-assembly",
        assemblyFile: "generated/workbench-requests/test/scratch-assembly.json",
        installerPath: "/tmp/FET76Workbench-0.1.0.pkg"
      })
    });
  });

  await recipePanel.getByRole("button", { name: "Build Installer" }).click();
  expect(buildPayload).toMatchObject({
    mode: "scratch-assembly",
    source: "primitive-workbench",
    recipe: "fet-76-rebuild",
    validation: {
      matchedSlots: 4,
      requiredSlots: 4,
      targetMatched: true
    }
  });
  expect(buildPayload.slots.map((slot) => slot.primitiveId)).toEqual([
    "analog.preamp-console-stage",
    "compression.fet-76-gain-cell",
    "compression.vintage-compressor-model",
    "saturation.virtual-analog-stage"
  ]);
  expect(buildPayload.slots[1]).toMatchObject({ slot: 2, amount: 86, tone: 66, mix: 100 });
  await expect(recipePanel.locator(".recipe-installer-command")).toContainText("Built installer: /tmp/FET76Workbench-0.1.0.pkg");
  await expect(slotTwo.locator(".surface-value-row").filter({ hasText: "Amount" })).toHaveAttribute("role", "slider");
  await expect(slotTwo.locator(".surface-value-row").filter({ hasText: "Amount" })).toHaveAttribute("aria-valuetext", /86/);
});

test("primitive workbench auditions a local source file through the current primitive chain", async ({ page }) => {
  await page.goto("/");

  const slotSurface = page.locator('.surface-card[data-surface-id="section-grid"]');
  const palette = slotSurface.locator(".primitive-palette");
  const recipePanel = slotSurface.locator(".primitive-recipe-panel");
  const auditionPanel = slotSurface.locator(".audio-source-panel");
  const fileInput = auditionPanel.locator("input[data-audio-source-input]");
  const startButton = auditionPanel.getByRole("button", { name: "Start Source" });
  const stopButton = auditionPanel.getByRole("button", { name: "Stop Source" });
  const status = auditionPanel.locator(".audio-source-status");
  const chain = auditionPanel.locator(".audio-source-chain");

  await expect(auditionPanel).toContainText("Source Audition");
  await expect(startButton).toBeDisabled();
  await expect(stopButton).toBeDisabled();

  await fileInput.setInputFiles({
    name: "primitive-test.wav",
    mimeType: "audio/wav",
    buffer: createSineWavBuffer()
  });

  await expect(status).toContainText("Loaded primitive-test.wav");
  await expect(startButton).toBeEnabled();

  await recipePanel.locator('.recipe-button[data-recipe-id="fet-76-rebuild"]').click();
  await palette.locator('.primitive-chip[data-primitive-id="analog.preamp-console-stage"]').dragTo(
    slotSurface.locator('.section-grid-card[data-section-id="slot-1"]')
  );
  await palette.locator('.primitive-chip[data-primitive-id="compression.fet-76-gain-cell"]').dragTo(
    slotSurface.locator('.section-grid-card[data-section-id="slot-2"]')
  );
  await palette.locator('.primitive-chip[data-primitive-id="compression.vintage-compressor-model"]').dragTo(
    slotSurface.locator('.section-grid-card[data-section-id="slot-3"]')
  );
  await palette.locator('.primitive-chip[data-primitive-id="saturation.virtual-analog-stage"]').dragTo(
    slotSurface.locator('.section-grid-card[data-section-id="slot-4"]')
  );

  await expect(chain).toContainText("Input Preamp -> FET Gain Cell -> Vintage Timing -> Output Color");

  await startButton.click();
  await expect(status).toContainText("Playing primitive-test.wav through 4 primitives");
  await expect(startButton).toBeDisabled();
  await expect(stopButton).toBeEnabled();

  await stopButton.click();
  await expect(status).toContainText("Stopped primitive-test.wav");
  await expect(startButton).toBeEnabled();
  await expect(stopButton).toBeDisabled();
});

test("fet 76 preview preserves the profiled faceplate interaction path", async ({ page }) => {
  await page.goto("/?app=fet-76");

  const faceplate = page.locator('.surface-card[data-surface-id="fet-76-faceplate"]');
  const ratioButton = faceplate.locator(".fet76-ratio-button").filter({ hasText: "All" });
  const inputKnob = faceplate.locator('.fet76-knob[data-role="drive"]');
  const inputValue = faceplate.locator(".fet76-knob-wrap").filter({ hasText: "Input" }).locator("span").last();
  const initialInput = await inputValue.textContent();

  await expect(faceplate).toBeVisible();
  await expect(faceplate.locator(".fet76-knob")).toHaveCount(4);
  await expect(faceplate.locator(".fet76-ratio-button")).toHaveCount(5);
  await expect(faceplate.locator(".fet76-vu__needle")).toBeVisible();
  await expect(page.locator('.control-card[data-control-id="Ratio"]')).toHaveCount(0);

  await ratioButton.click();
  await dragLocatorBy(page, inputKnob, 0, -62);

  await expect(ratioButton).toHaveClass(/is-active/);
  await expect(faceplate.locator(".surface-metric-row")).toContainText("Ratio: All");
  await expect(inputValue).not.toHaveText(initialInput ?? "");
});

test("pulse pad preview keeps synth shaping in visual surfaces", async ({ page }) => {
  await page.goto("/?app=pulse-pad");

  const stackSurface = page.locator('.surface-card[data-surface-id="oscillator-stack"]');
  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const rackSurface = page.locator('.surface-card[data-surface-id="module-rack"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const keyboardSurface = page.locator('.surface-card[data-surface-id="keyboard-strip"]');
  const graphCanvas = graphSurface.locator(".graph-canvas");
  const motionHandle = graphSurface.locator('.graph-band-handle[data-band-id="motion-band"]');
  const motionValue = page.locator('.control-card[data-control-id="Motion"] .value');
  const attackRow = keyboardSurface.locator(".surface-value-row").filter({ hasText: "Attack" });
  const attackValue = page.locator('.control-card[data-control-id="Attack"] .value');
  const initialMotion = await motionValue.textContent();
  const initialAttack = await attackValue.textContent();

  await expect(stackSurface.locator(".module-card")).toHaveCount(3);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(rackSurface.locator(".module-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(keyboardSurface.locator(".keyboard-key")).toHaveCount(8);

  await dragLocatorToCanvasRatio(page, motionHandle, graphCanvas, 0.72, 0.2);
  await dragLocatorBy(page, attackRow, 84, 0);
  await setToggleValue(page, "gate", true);

  await expect(motionValue).not.toHaveText(initialMotion ?? "");
  await expect(attackValue).not.toHaveText(initialAttack ?? "");
  await expect(dockSurface).toContainText("Held");
});

test("limiter lab stays available without reclaiming the default route", async ({ page }) => {
  await page.goto("/?app=limiter-lab");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');
  const transferCanvas = transferSurface.locator(".transfer-canvas");
  const driveHandle = transferSurface.locator('.transfer-handle[data-role="drive"]');
  const tubeDriveValue = page.locator('.control-card[data-control-id="Tube Drive"] .value');
  const initialTubeDrive = await tubeDriveValue.textContent();

  await expect(page.locator("body")).toHaveAttribute("data-project-key", "limiter-lab");
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);

  await setRangeValue(page, "Drive Target", 2);
  await expect(historySurface.locator(".surface-metric-row")).toContainText("Target: Side");

  await dragLocatorToCanvasRatio(page, driveHandle, transferCanvas, 0.68, 0.2);
  await expect(tubeDriveValue).not.toHaveText(initialTubeDrive ?? "");
});

test("preview falls back cleanly when benchmark data is unavailable", async ({ page }) => {
  await page.route("**/generated/apps/omniplugin/benchmark-results.json", async (route) => {
    await route.fulfill({
      status: 503,
      body: "temporarily unavailable"
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: omniplugin.schema.project.name })).toBeVisible();
  await expect(page.locator("#benchmarks .benchmark-card")).toContainText("No Benchmarks");
});

test("preview shows a friendly error when the requested project schema is missing", async ({ page }) => {
  await page.goto("/?app=missing-project");

  await expect(page.locator("body")).toHaveAttribute("data-preview-error", "true");
  await expect(page.locator("#productTitle")).toHaveText("Preview Error");
  await expect(page.locator("#projectDescription")).toContainText("missing-project");
  await expect(page.locator("#benchmarks .benchmark-card")).toContainText("Preview Error");
  await expect(page.locator("#controls .control-card")).toHaveCount(0);
  await expect(page.locator("#meters .meter-card")).toHaveCount(0);
});
