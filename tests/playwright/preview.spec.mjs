import { expect, test } from "@playwright/test";

import { summarizeControlLayout } from "../../preview/lib/control-panels.js";
import { normalizeSchema } from "../../preview/lib/schema-ui.js";
import { createSimulator } from "../../preview/lib/simulators.js";
import { loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";

const atlasCurve = loadGeneratedProject("atlas-curve");
const contourForge = loadGeneratedProject("contour-forge");
const emberDrive = loadGeneratedProject("ember-drive");
const limiter = loadGeneratedProject();
const headroom = loadGeneratedProject("headroom");
const latchLine = loadGeneratedProject("latch-line");
const mirrorField = loadGeneratedProject("mirror-field");
const pocketCut = loadGeneratedProject("pocket-cut");
const pressDeck = loadGeneratedProject("press-deck");
const pulsePad = loadGeneratedProject("pulse-pad");
const relayTape = loadGeneratedProject("relay-tape");
const roomBloom = loadGeneratedProject("room-bloom");
const seedTone = loadGeneratedProject("seed-tone");
const silkGuard = loadGeneratedProject("silk-guard");
const spanPair = loadGeneratedProject("span-pair");
const splitStack = loadGeneratedProject("split-stack");
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
  if (fixture.schema.ui?.catalog?.referenceProduct) {
    await expect(page.locator("body")).toHaveAttribute("data-reference-product", fixture.schema.ui.catalog.referenceProduct);
  }
  await expect(page.getByRole("heading", { name: fixture.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(fixture.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(controlSummary.visibleControls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(fixture.schema.meters.length);
  await expect(page.locator("#controls")).toHaveAttribute("data-control-layout", "sectioned");
  await expect(page.locator("#controls")).toHaveAttribute("data-control-count", String(fixture.schema.controls.length));
  await expect(page.locator("#controls")).toHaveAttribute("data-visible-control-count", String(controlSummary.visibleControls.length));
  expect(await page.locator("#controls .control-section").count()).toBeGreaterThan(0);
  await expect(page.locator("body")).toContainText(controlPattern);
  await expect(page.locator("#surfaces .surface-card")).toHaveCount(expectedSurfaceIds.length);

  const renderedSurfaceIds = await page.locator("#surfaces .surface-card").evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-surface-id"))
  );
  expect(renderedSurfaceIds).toEqual(expectedSurfaceIds);
}

const routeSmokeCases = [
  {
    title: "atlas curve preview loads the flagship-eq scaffold route",
    route: "/?app=atlas-curve",
    fixture: atlasCurve,
    controlPattern: /Low Cut|Low Shelf|Bell Freq|Bell Gain|Bell Q|High Shelf|Analyzer/
  },
  {
    title: "room bloom preview loads the reverb scaffold route",
    route: "/?app=room-bloom",
    fixture: roomBloom,
    controlPattern: /Space|Size|Pre-Delay|Decay|Diffusion|Mix/
  },
  {
    title: "ember drive preview loads the multiband-saturation scaffold route",
    route: "/?app=ember-drive",
    fixture: emberDrive,
    controlPattern: /Low Drive|Mid Drive|High Drive|Glue|Output Trim/
  },
  {
    title: "relay tape preview loads the modulation-delay scaffold route",
    route: "/?app=relay-tape",
    fixture: relayTape,
    controlPattern: /Time|Feedback|Smear|Mod Depth|Mod Rate|Freeze/
  },
  {
    title: "contour forge preview loads the routable-filter scaffold route",
    route: "/?app=contour-forge",
    fixture: contourForge,
    controlPattern: /Mode|Cutoff|Resonance|Drive|Env Amount|LFO Depth|Routing/
  },
  {
    title: "mirror field preview loads the modular-synth scaffold route",
    route: "/?app=mirror-field",
    fixture: mirrorField,
    controlPattern: /Blend|Shape|Tone|Contour|Motion|Mod Amount|Detune/
  },
  {
    title: "seed tone preview loads the simple-synth scaffold route",
    route: "/?app=seed-tone",
    fixture: seedTone,
    controlPattern: /Wave|Cutoff|Resonance|Color|Sub|Noise|Motion/
  },
  {
    title: "span pair preview loads the dual-filter scaffold route",
    route: "/?app=span-pair",
    fixture: spanPair,
    controlPattern: /Mode|Routing|Filter A Cutoff|Filter B Cutoff|Spacing|Link|Drive/
  },
  {
    title: "pocket cut preview loads the mini-filter scaffold route",
    route: "/?app=pocket-cut",
    fixture: pocketCut,
    controlPattern: /Mode|Cutoff|Resonance|Envelope Follow|Drive|Mix/
  },
  {
    title: "press deck preview loads the new compressor-oriented scaffold route",
    route: "/?app=press-deck",
    fixture: pressDeck,
    controlPattern: /Threshold|Ratio|Attack|Release|Knee|Mix/
  },
  {
    title: "headroom preview loads the mastering-limiter scaffold route",
    route: "/?app=headroom",
    fixture: headroom,
    controlPattern: /Ceiling|Lookahead|Release|Audition/
  },
  {
    title: "latch line preview loads the gate-expander scaffold route",
    route: "/?app=latch-line",
    fixture: latchLine,
    controlPattern: /Threshold|Range|Hold|Hysteresis|Detector HP|Detector LP/
  },
  {
    title: "silk guard preview loads the de-esser scaffold route",
    route: "/?app=silk-guard",
    fixture: silkGuard,
    controlPattern: /Threshold|Range|Band Frequency|Lookahead|Split\/Wide/
  },
  {
    title: "split stack preview loads the multiband-dynamics scaffold route",
    route: "/?app=split-stack",
    fixture: splitStack,
    controlPattern: /Low Crossover|High Crossover|Low Threshold|Mid Threshold|High Threshold/
  }
];

test("default preview renders the current limiter schema surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", limiter.schema.project.key);
  await expect(page.getByRole("heading", { name: limiter.schema.project.name })).toBeVisible();
  await expect(page.locator("#previewNav a")).toHaveCount(workspace.apps.length);
  await expect(page.locator("#previewNav a")).toHaveText(workspace.apps.map((app) => app.name));
  await expect(page.locator('#previewNav a.is-active')).toHaveText(limiter.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(limiter.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(limiter.schema.meters.length);

  for (const control of limiter.schema.controls) {
    await expect(page.locator(`.control-card[data-control-id="${control.id}"]`)).toBeVisible();
  }

  for (const meter of limiter.schema.meters) {
    await expect(page.locator(`.meter-card[data-meter-id="${meter.id}"]`)).toBeVisible();
  }
});

test("default preview renders grouped non-slider control widgets", async ({ page }) => {
  await page.goto("/");

  const driveTargetCard = page.locator('.control-card[data-control-id="Drive Target"]');
  const tubeDriveCard = page.locator('.control-card[data-control-id="Tube Drive"]');
  const attackCard = page.locator('.control-card[data-control-id="Attack"]');
  const vintageCard = page.locator('.control-card[data-control-id="Vintage Response"]');
  const attackValue = attackCard.locator(".value");
  const initialAttack = await attackValue.textContent();

  await expect(page.locator("#controls")).toHaveAttribute("data-control-layout", "sectioned");
  await expect(driveTargetCard).toHaveAttribute("data-control-widget", "segment");
  await expect(tubeDriveCard).toHaveAttribute("data-control-widget", "fader");
  await expect(attackCard).toHaveAttribute("data-control-widget", "dial");
  await expect(vintageCard).toHaveAttribute("data-control-widget", "toggle");

  await driveTargetCard.locator(".control-segment-chip").filter({ hasText: "Side" }).click();
  await expect(driveTargetCard.locator(".value")).toHaveText("Side");

  await vintageCard.locator(".control-segment-chip").filter({ hasText: "Vintage" }).click();
  await expect(vintageCard.locator(".value")).toHaveText("Vintage");

  await dragLocatorBy(page, attackCard.locator(".control-dial__knob"), 0, -42);
  await expect(attackValue).not.toHaveText(initialAttack ?? "");
});

test("default preview interactions expose the new drive routing controls and toggle state", async ({ page }) => {
  await page.goto("/");

  await setRangeValue(page, "Drive Target", 2);
  await expect(page.locator('.control-card[data-control-id="Drive Target"] .value')).toHaveText("Side");

  await setRangeValue(page, "Drive Focus", 3);
  await expect(page.locator('.control-card[data-control-id="Drive Focus"] .value')).toHaveText("High");

  await setRangeValue(page, "Drive Low Split", 440);
  await expect(page.locator('.control-card[data-control-id="Drive Low Split"] .value')).toHaveText("440 Hz");

  await setToggleValue(page, "Bypass", true);
  await expect(page.locator('.control-card[data-control-id="Bypass"] .value')).toHaveText("On");
});

test("default preview renders the shared limiter surfaces", async ({ page }) => {
  await page.goto("/");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');
  const transferCanvas = transferSurface.locator(".transfer-canvas");
  const driveHandle = transferSurface.locator('.transfer-handle[data-role="drive"]');
  const attackRow = transferSurface.locator(".surface-value-row").filter({ hasText: "Attack" });
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const outputTrimRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Output Trim" });
  const vintageRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Vintage Response" });
  const tubeDriveValue = page.locator('.control-card[data-control-id="Tube Drive"] .value');
  const attackValue = page.locator('.control-card[data-control-id="Attack"] .value');
  const outputTrimValue = page.locator('.control-card[data-control-id="Output Trim"] .value');
  const initialTubeDrive = await tubeDriveValue.textContent();
  const initialAttack = await attackValue.textContent();
  const initialOutputTrim = await outputTrimValue.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(page.locator("#surfaces .surface-card--summary")).toHaveCount(0);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);
  await expect(outputSurface.locator(".surface-value-row")).toHaveCount(5);

  await setRangeValue(page, "Drive Target", 2);
  await setRangeValue(page, "Drive Focus", 3);
  await expect(historySurface.locator(".surface-metric-row")).toContainText("Target: Side");
  await expect(historySurface.locator(".surface-metric-row")).toContainText("Focus: High");

  await dragLocatorToCanvasRatio(page, driveHandle, transferCanvas, 0.68, 0.2);
  await dragLocatorBy(page, attackRow, 84, 0);
  await expect(tubeDriveValue).not.toHaveText(initialTubeDrive ?? "");
  await expect(attackValue).not.toHaveText(initialAttack ?? "");

  await dragLocatorBy(page, outputTrimRow, 92, 0);
  await vintageRow.click();
  await expect(outputTrimValue).not.toHaveText(initialOutputTrim ?? "");
  await expect(outputTrimRow.locator("strong")).toContainText("dB");
  await expect(vintageRow.locator("strong")).toHaveText("Vintage");
});

test("pulse pad preview loads the alternate generated project and its meter layout", async ({ page }) => {
  await page.goto("/?app=pulse-pad");
  const controlSummary = summarizeControlLayout(pulsePad.schema);

  await expect(page.locator("body")).toHaveAttribute("data-project-key", pulsePad.schema.project.key);
  await expect(page.getByRole("heading", { name: pulsePad.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(pulsePad.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(controlSummary.visibleControls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(pulsePad.schema.meters.length);

  for (const meter of pulsePad.schema.meters) {
    await expect(page.locator(`.meter-card[data-meter-id="${meter.id}"]`)).toBeVisible();
  }

  await setRangeValue(page, "Texture", 0.8);
  await expect(page.locator('.control-card[data-control-id="Texture"] .value')).toHaveText("0.80");

  await setRangeValue(page, "Detune", 12.5);
  await expect(page.locator('.control-card[data-control-id="Detune"] .value')).toHaveText("12.5 ct");

  await setRangeValue(page, "Sub", 48);
  await expect(page.locator('.control-card[data-control-id="Sub"] .value')).toHaveText("48 %");
});

test("pulse pad preview renders the shared synth parity surfaces", async ({ page }) => {
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

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(5);
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
  await expect(keyboardSurface.locator(".surface-value-row").filter({ hasText: "Attack" }).locator("strong")).not.toHaveText(initialAttack ?? "");
});

test("suite previews reserve surface-owned controls instead of duplicating them as shell cards", async ({ page }) => {
  await page.goto("/?app=atlas-curve");
  await expect(page.locator(".control-surface-summary")).toContainText("Surface-owned");
  await expect(page.locator('.control-card[data-control-id="Bell Freq"]')).toHaveCount(0);
  await expect(page.locator('.control-card[data-control-id="Bell Gain"]')).toHaveCount(0);
  await expect(page.locator('.control-card[data-control-id="Bell Q"]')).toHaveCount(0);

  await page.goto("/?app=relay-tape");
  await expect(page.locator('.control-card[data-control-id="Time"]')).toHaveCount(0);
  await expect(page.locator('.control-card[data-control-id="Feedback"]')).toHaveCount(0);

  await page.goto("/?app=seed-tone");
  await expect(page.locator('.control-card[data-control-id="Cutoff"]')).toHaveCount(0);
  await expect(page.locator('.control-card[data-control-id="Drive"]')).toHaveCount(0);
});

for (const routeCase of routeSmokeCases) {
  test(routeCase.title, async ({ page }) => {
    await page.goto(routeCase.route);
    await expectPreviewRouteLoaded(page, routeCase.fixture, routeCase.controlPattern);
  });
}

test("atlas curve preview renders the shared graph editor surface", async ({ page }) => {
  await page.goto("/?app=atlas-curve");

  const surfacePanel = page.locator("#surfacePanel");
  const eqSurface = page.locator('.surface-card[data-surface-id="eq-canvas"]');
  const graphCanvas = eqSurface.locator(".graph-canvas");
  const bellChip = eqSurface.locator(".surface-band-chip").filter({ hasText: /^Bell/ });
  const popover = eqSurface.locator(".graph-popover");
  const bellHandle = eqSurface.locator('.graph-band-handle[data-band-id="bell-band"]');
  const initialBellChip = await bellChip.textContent();

  await expect(surfacePanel).toBeVisible();
  await expect(surfacePanel).toContainText("Adaptive Curve Editor");
  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(eqSurface).toHaveAttribute("data-surface-workflow", "curve-editor");
  await expect(page.locator('.surface-card[data-surface-id="eq-canvas"]')).toContainText("Adaptive curve editor");
  await expect(eqSurface.locator(".surface-affordance-bar")).toContainText("drag bands");
  await expect(eqSurface.locator(".surface-affordance-bar")).toContainText("shape Q");
  await expect(page.locator('.surface-card[data-surface-id="instance-strip"]')).toContainText("Scene cues");
  await expect(page.locator('.surface-card[data-surface-id="output-popover"]')).toContainText("Output tools");
  await expect(eqSurface.locator(".graph-band-handle")).toHaveCount(5);
  await expect(graphCanvas).toHaveAttribute("data-canvas-hint", /Drag handles/);
  await expect(popover.locator("h4")).toHaveText("Bell");

  await dragLocatorToCanvasRatio(page, bellHandle, graphCanvas, 0.68, 0.28);

  await expect(bellChip).not.toHaveText(initialBellChip ?? "");
  await expect(popover).toContainText("Bell Gain");
  await expect(popover.locator("h4")).toHaveText("Bell");

  await eqSurface.locator('.graph-band-handle[data-band-id="presence-band"]').click();
  await expect(popover.locator("h4")).toHaveText("Presence");
});

test("room bloom preview renders the shared macro field surface", async ({ page }) => {
  await page.goto("/?app=room-bloom");

  const fieldSurface = page.locator('.surface-card[data-surface-id="reverb-space"]');
  const fieldCanvas = fieldSurface.locator(".field-canvas");
  const spreadNode = fieldSurface.locator('.field-node[data-node-id="spread-node"]');
  const fieldPopover = fieldSurface.locator(".field-popover");
  const initialFieldPopover = await fieldPopover.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(2);
  await expect(fieldSurface.locator(".field-node")).toHaveCount(5);
  await expect(fieldSurface.locator(".field-link")).toHaveCount(4);

  await dragLocatorToCanvasRatio(page, spreadNode, fieldCanvas, 0.84, 0.3);

  await expect(fieldPopover).not.toHaveText(initialFieldPopover ?? "");
  await expect(fieldPopover).toContainText("Width");
});

test("ember drive preview renders the shared multiband creative surfaces", async ({ page }) => {
  await page.goto("/?app=ember-drive");

  const editorSurface = page.locator('.surface-card[data-surface-id="multiband-editor"]');
  const inspectorSurface = page.locator('.surface-card[data-surface-id="band-inspector"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const lowBand = editorSurface.locator('.region-block[data-region-id="low-band"]');
  const initialLowBox = await lowBand.boundingBox();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(editorSurface.locator(".region-block")).toHaveCount(3);
  await expect(inspectorSurface.locator(".linked-band-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(dockSurface.locator(".mod-source-chip")).toHaveCount(4);

  await dragLocatorBy(page, lowBand, 72, 0);

  const updatedLowBox = await lowBand.boundingBox();
  expect(Math.abs((updatedLowBox?.width ?? 0) - (initialLowBox?.width ?? 0))).toBeGreaterThan(1);
});

test("relay tape preview renders the shared timeline, graph, and motion dock", async ({ page }) => {
  await page.goto("/?app=relay-tape");

  const timelineSurface = page.locator('.surface-card[data-surface-id="delay-timeline"]');
  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const timelineCanvas = timelineSurface.locator(".timeline-canvas");
  const mainTap = timelineSurface.locator('.timeline-tap[data-tap-id="main-echo"]');
  const mainChip = timelineSurface.locator(".surface-band-chip").filter({ hasText: /^Main/ });
  const initialMainChip = await mainChip.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(timelineSurface.locator(".timeline-tap")).toHaveCount(5);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);

  await dragLocatorToCanvasRatio(page, mainTap, timelineCanvas, 0.74, 0.5);

  await expect(mainChip).not.toHaveText(initialMainChip ?? "");
  await expect(timelineSurface).toContainText(/ms/);
});

test("contour forge preview renders the shared filter, routing, and modulation surfaces", async ({ page }) => {
  await page.goto("/?app=contour-forge");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const routingSurface = page.locator('.surface-card[data-surface-id="routing-matrix"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const routingValue = page.locator('.control-card[data-control-id="Routing"] .value');
  const motionSourceValue = page.locator('.control-card[data-control-id="Motion Source"] .value');
  const initialMotionSource = await motionSourceValue.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(routingSurface.locator(".routing-matrix__cell")).toHaveCount(9);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(3);

  await routingSurface.locator('.routing-matrix__cell[data-row-id="mid-side"][data-column-id="motion"]').click();
  const motionSourceRow = dockSurface.locator(".surface-value-row").filter({ hasText: "Motion Source" });
  await motionSourceRow.focus();
  await motionSourceRow.press("ArrowLeft");

  await expect(routingValue).toHaveText("Mid/Side");
  await expect(motionSourceValue).not.toHaveText(initialMotionSource ?? "");
  await expect(routingSurface.locator(".routing-matrix__cell.is-active")).toHaveCount(3);
});

test("mirror field preview renders the shared synth stack, rack, dock, and keyboard surfaces", async ({ page }) => {
  await page.goto("/?app=mirror-field");

  const stackSurface = page.locator('.surface-card[data-surface-id="oscillator-stack"]');
  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const rackSurface = page.locator('.surface-card[data-surface-id="module-rack"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const keyboardSurface = page.locator('.surface-card[data-surface-id="keyboard-strip"]');
  const graphCanvas = graphSurface.locator(".graph-canvas");
  const motionHandle = graphSurface.locator('.graph-band-handle[data-band-id="motion-band"]');
  const motionChip = graphSurface.locator(".surface-band-chip").filter({ hasText: /^Motion/ });
  const initialMotionChip = await motionChip.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(5);
  await expect(stackSurface.locator(".module-card")).toHaveCount(3);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(rackSurface.locator(".module-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(keyboardSurface.locator(".keyboard-key")).toHaveCount(8);

  await dragLocatorToCanvasRatio(page, motionHandle, graphCanvas, 0.72, 0.22);
  await setRangeValue(page, "Voice Mode", 1);

  await expect(motionChip).not.toHaveText(initialMotionChip ?? "");
  await expect(keyboardSurface.locator(".keyboard-key.is-active")).toHaveCount(2);
});

test("seed tone preview renders the shared section grid surface", async ({ page }) => {
  await page.goto("/?app=seed-tone");

  const gridSurface = page.locator('.surface-card[data-surface-id="section-grid"]');
  const toneSection = gridSurface.locator(".section-grid-card").filter({ hasText: /^Tone/ });
  const cutoffRow = toneSection.locator(".surface-value-row").filter({ hasText: "Cutoff" });
  const driveRow = toneSection.locator(".surface-value-row").filter({ hasText: "Drive" });
  const initialCutoff = await cutoffRow.locator("strong").textContent();
  const initialDrive = await driveRow.locator("strong").textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(1);
  await expect(gridSurface.locator(".section-grid-card")).toHaveCount(4);

  await dragLocatorBy(page, cutoffRow, 92, 0);
  await dragLocatorBy(page, driveRow, 72, 0);

  await expect(cutoffRow.locator("strong")).not.toHaveText(initialCutoff ?? "");
  await expect(driveRow.locator("strong")).not.toHaveText(initialDrive ?? "");
  await expect(toneSection).toContainText("Hz");
  await expect(toneSection).toContainText("dB");
});

test("span pair preview renders the shared dual-filter and routing surfaces", async ({ page }) => {
  await page.goto("/?app=span-pair");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const routingSurface = page.locator('.surface-card[data-surface-id="routing-matrix"]');
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const filterBChip = graphSurface.locator(".surface-band-chip").filter({ hasText: /^Filter B/ });
  const graphCanvas = graphSurface.locator(".graph-canvas");
  const filterBHandle = graphSurface.locator('.graph-band-handle[data-band-id="filter-b"]');
  const routingValue = page.locator('.control-card[data-control-id="Routing"] .value');
  const initialFilterBChip = await filterBChip.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(2);
  await expect(routingSurface.locator(".routing-matrix__cell")).toHaveCount(9);
  await expect(outputSurface).toContainText("Span Gap");

  await dragLocatorToCanvasRatio(page, filterBHandle, graphCanvas, 0.74, 0.3);
  await routingSurface.locator('.routing-matrix__cell[data-row-id="cross"][data-column-id="filters"]').click();

  await expect(filterBChip).not.toHaveText(initialFilterBChip ?? "");
  await expect(routingValue).toHaveText("Cross");
  await expect(routingSurface.locator(".routing-matrix__cell.is-active")).toHaveCount(3);
});

test("pocket cut preview renders the shared compact filter surfaces", async ({ page }) => {
  await page.goto("/?app=pocket-cut");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const cutoffChip = graphSurface.locator(".surface-band-chip").filter({ hasText: /^Cutoff/ });
  const graphCanvas = graphSurface.locator(".graph-canvas");
  const cutoffHandle = graphSurface.locator('.graph-band-handle[data-band-id="cutoff-core"]');
  const mixHandle = graphSurface.locator('.graph-band-handle[data-band-id="mix-band"]');
  const mixRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Mix" });
  const initialCutoffChip = await cutoffChip.textContent();
  const initialMix = await mixRow.locator("strong").textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(2);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(3);
  await expect(outputSurface).toContainText("Envelope");

  await dragLocatorToCanvasRatio(page, cutoffHandle, graphCanvas, 0.68, 0.26);
  await dragLocatorToCanvasRatio(page, mixHandle, graphCanvas, 0.9, 0.18);

  await expect(cutoffChip).not.toHaveText(initialCutoffChip ?? "");
  await expect(mixRow.locator("strong")).not.toHaveText(initialMix ?? "");
  await expect(outputSurface).toContainText("%");
});

test("press deck preview renders the shared history and detector surfaces", async ({ page }) => {
  await page.goto("/?app=press-deck");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const detectorSurface = page.locator('.surface-card[data-surface-id="sidechain-editor"]');
  const hpChip = detectorSurface.locator(".surface-band-chip").filter({ hasText: /^HP/ });
  const graphCanvas = detectorSurface.locator(".graph-canvas");
  const hpHandle = detectorSurface.locator('.graph-band-handle[data-band-id="detector-hp-band"]');
  const initialHpChip = await hpChip.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(4);
  await expect(detectorSurface.locator(".graph-band-handle")).toHaveCount(3);

  await dragLocatorToCanvasRatio(page, hpHandle, graphCanvas, 0.44, 0.18);

  await expect(hpChip).not.toHaveText(initialHpChip ?? "");
});

test("headroom preview renders the shared limiter transfer curve", async ({ page }) => {
  await page.goto("/?app=headroom");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');
  const transferCanvas = transferSurface.locator(".transfer-canvas");
  const driveHandle = transferSurface.locator('.transfer-handle[data-role="drive"]');
  const driveRow = transferSurface.locator(".surface-value-row").filter({ hasText: "Drive" });
  const initialDrive = await driveRow.locator("strong").textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);

  await dragLocatorToCanvasRatio(page, driveHandle, transferCanvas, 0.68, 0.2);

  await expect(driveRow.locator("strong")).not.toHaveText(initialDrive ?? "");
  await expect(transferSurface).toContainText("dB");
});

test("latch line preview renders the shared gate curve and detector editor", async ({ page }) => {
  await page.goto("/?app=latch-line");

  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');
  const detectorSurface = page.locator('.surface-card[data-surface-id="sidechain-editor"]');
  const hpChip = detectorSurface.locator(".surface-band-chip").filter({ hasText: /^HP/ });
  const transferCanvas = transferSurface.locator(".transfer-canvas");
  const thresholdHandle = transferSurface.locator('.transfer-handle[data-role="input"]');
  const thresholdRow = transferSurface.locator(".surface-value-row").filter({ hasText: "Threshold" });
  const initialThreshold = await thresholdRow.locator("strong").textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);
  await expect(detectorSurface.locator(".graph-band-handle")).toHaveCount(3);

  await dragLocatorToCanvasRatio(page, thresholdHandle, transferCanvas, 0.24, 0.72);

  await expect(thresholdRow.locator("strong")).not.toHaveText(initialThreshold ?? "");
  await expect(hpChip).toContainText("HP");
});

test("silk guard preview renders the shared de-ess history and focus filter", async ({ page }) => {
  await page.goto("/?app=silk-guard");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const filterSurface = page.locator('.surface-card[data-surface-id="detector-filter"]');
  const focusChip = filterSurface.locator(".surface-band-chip").filter({ hasText: /^Focus/ });
  const graphCanvas = filterSurface.locator(".graph-canvas");
  const focusHandle = filterSurface.locator('.graph-band-handle[data-band-id="focus-band"]');
  const initialFocusChip = await focusChip.textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(filterSurface.locator(".graph-band-handle")).toHaveCount(2);

  await dragLocatorToCanvasRatio(page, focusHandle, graphCanvas, 0.66, 0.32);

  await expect(focusChip).not.toHaveText(initialFocusChip ?? "");
});

test("split stack preview renders the shared multiband editor and linked inspector", async ({ page }) => {
  await page.goto("/?app=split-stack");

  const editorSurface = page.locator('.surface-card[data-surface-id="multiband-editor"]');
  const inspectorSurface = page.locator('.surface-card[data-surface-id="band-inspector"]');
  const lowBand = editorSurface.locator('.region-block[data-region-id="low-band"]');
  const attackRow = inspectorSurface.locator(".surface-value-row").filter({ hasText: "Attack" });
  const initialLowBox = await lowBand.boundingBox();
  const initialAttack = await attackRow.locator("strong").textContent();

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(editorSurface.locator(".region-block")).toHaveCount(3);
  await expect(inspectorSurface.locator(".linked-band-card")).toHaveCount(3);
  await expect(inspectorSurface).toContainText(/Attack|Release|Timing Spread|Band Link/);

  await dragLocatorBy(page, lowBand, 72, 0);
  await dragLocatorBy(page, attackRow, 84, 0);

  const updatedLowBox = await lowBand.boundingBox();
  expect(Math.abs((updatedLowBox?.width ?? 0) - (initialLowBox?.width ?? 0))).toBeGreaterThan(1);
  await expect(attackRow.locator("strong")).not.toHaveText(initialAttack ?? "");
});

test("preview falls back cleanly when benchmark data is unavailable", async ({ page }) => {
  await page.route("**/generated/apps/limiter-lab/benchmark-results.json", async (route) => {
    await route.fulfill({
      status: 503,
      body: "temporarily unavailable"
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: limiter.schema.project.name })).toBeVisible();
  await expect(page.locator("#controls .control-card")).toHaveCount(limiter.schema.controls.length);
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
