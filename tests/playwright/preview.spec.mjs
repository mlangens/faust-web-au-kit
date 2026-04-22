import { expect, test } from "@playwright/test";

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

async function expectPreviewRouteLoaded(page, fixture, controlPattern) {
  await expect(page.locator("body")).toHaveAttribute("data-project-key", fixture.schema.project.key);
  await expect(page.getByRole("heading", { name: fixture.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(fixture.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(fixture.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(fixture.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(controlPattern);
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
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const outputTrimRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Output Trim" });
  const vintageRow = outputSurface.locator(".surface-value-row").filter({ hasText: "Vintage Response" });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(page.locator("#surfaces .surface-card--summary")).toHaveCount(0);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);
  await expect(outputSurface.locator(".surface-value-row")).toHaveCount(5);

  await setRangeValue(page, "Drive Target", 2);
  await setRangeValue(page, "Drive Focus", 3);
  await expect(historySurface.locator(".surface-metric-row")).toContainText("Target: Side");
  await expect(historySurface.locator(".surface-metric-row")).toContainText("Focus: High");

  await setRangeValue(page, "Tube Drive", 48);
  await setRangeValue(page, "Attack", 4.2);
  await expect(transferSurface).toContainText("48 %");
  await expect(transferSurface).toContainText("4.20 ms");

  await setRangeValue(page, "Output Trim", 1.5);
  await setToggleValue(page, "Vintage Response", true);
  await expect(outputTrimRow.locator("strong")).toHaveText("1.5 dB");
  await expect(vintageRow.locator("strong")).toHaveText("Vintage");
});

test("pulse pad preview loads the alternate generated project and its meter layout", async ({ page }) => {
  await page.goto("/?app=pulse-pad");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", pulsePad.schema.project.key);
  await expect(page.getByRole("heading", { name: pulsePad.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(pulsePad.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(pulsePad.schema.controls.length);
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

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(5);
  await expect(stackSurface.locator(".module-card")).toHaveCount(3);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(rackSurface.locator(".module-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(keyboardSurface.locator(".keyboard-key")).toHaveCount(8);

  await setRangeValue(page, "Motion", 0.9);
  await setRangeValue(page, "Contour", 0.72);
  await setToggleValue(page, "gate", true);

  await expect(graphSurface.locator(".surface-metric-row")).toContainText("Motion: 0.90");
  await expect(dockSurface).toContainText("Held");
  await expect(keyboardSurface).toContainText("0.72");
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
  const bellChip = eqSurface.locator(".surface-band-chip").filter({ hasText: /^Bell/ });
  const popover = eqSurface.locator(".graph-popover");

  await expect(surfacePanel).toBeVisible();
  await expect(surfacePanel).toContainText("Adaptive Curve Editor");
  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(page.locator('.surface-card[data-surface-id="eq-canvas"]')).toContainText("Adaptive curve editor");
  await expect(page.locator('.surface-card[data-surface-id="instance-strip"]')).toContainText("Scene cues");
  await expect(page.locator('.surface-card[data-surface-id="output-popover"]')).toContainText("Output tools");
  await expect(eqSurface.locator(".graph-band-handle")).toHaveCount(5);
  await expect(popover.locator("h4")).toHaveText("Bell");

  await setRangeValue(page, "Bell Freq", 2100);
  await setRangeValue(page, "Bell Gain", 3.4);

  await expect(bellChip).toContainText("2100 Hz");
  await expect(popover).toContainText("Bell Gain");
  await expect(popover).toContainText("3.4 dB");

  await eqSurface.locator('.graph-band-handle[data-band-id="presence-band"]').click();
  await expect(popover.locator("h4")).toHaveText("Presence");
});

test("room bloom preview renders the shared macro field surface", async ({ page }) => {
  await page.goto("/?app=room-bloom");

  const fieldSurface = page.locator('.surface-card[data-surface-id="reverb-space"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(2);
  await expect(fieldSurface.locator(".field-node")).toHaveCount(5);
  await expect(fieldSurface.locator(".field-link")).toHaveCount(4);

  await fieldSurface.locator('.field-node[data-node-id="spread-node"]').click();
  await setRangeValue(page, "Width", 84);

  await expect(fieldSurface.locator(".field-popover")).toContainText("84 %");
});

test("ember drive preview renders the shared multiband creative surfaces", async ({ page }) => {
  await page.goto("/?app=ember-drive");

  const editorSurface = page.locator('.surface-card[data-surface-id="multiband-editor"]');
  const inspectorSurface = page.locator('.surface-card[data-surface-id="band-inspector"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(editorSurface.locator(".region-block")).toHaveCount(3);
  await expect(inspectorSurface.locator(".linked-band-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(dockSurface.locator(".mod-source-chip")).toHaveCount(4);
});

test("relay tape preview renders the shared timeline, graph, and motion dock", async ({ page }) => {
  await page.goto("/?app=relay-tape");

  const timelineSurface = page.locator('.surface-card[data-surface-id="delay-timeline"]');
  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(timelineSurface.locator(".timeline-tap")).toHaveCount(5);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);

  await setRangeValue(page, "Time", 520);

  await expect(timelineSurface).toContainText("520.00 ms");
});

test("contour forge preview renders the shared filter, routing, and modulation surfaces", async ({ page }) => {
  await page.goto("/?app=contour-forge");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const routingSurface = page.locator('.surface-card[data-surface-id="routing-matrix"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(4);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(4);
  await expect(routingSurface.locator(".routing-matrix__cell")).toHaveCount(9);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(3);

  await setRangeValue(page, "Routing", 1);

  await expect(routingSurface.locator(".routing-matrix__cell.is-active")).toHaveCount(3);
});

test("mirror field preview renders the shared synth stack, rack, dock, and keyboard surfaces", async ({ page }) => {
  await page.goto("/?app=mirror-field");

  const stackSurface = page.locator('.surface-card[data-surface-id="oscillator-stack"]');
  const rackSurface = page.locator('.surface-card[data-surface-id="module-rack"]');
  const dockSurface = page.locator('.surface-card[data-surface-id="modulation-dock"]');
  const keyboardSurface = page.locator('.surface-card[data-surface-id="keyboard-strip"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(5);
  await expect(stackSurface.locator(".module-card")).toHaveCount(3);
  await expect(rackSurface.locator(".module-card")).toHaveCount(3);
  await expect(dockSurface.locator(".mod-slot-card")).toHaveCount(4);
  await expect(keyboardSurface.locator(".keyboard-key")).toHaveCount(8);

  await setRangeValue(page, "Voice Mode", 1);

  await expect(keyboardSurface.locator(".keyboard-key.is-active")).toHaveCount(2);
});

test("seed tone preview renders the shared section grid surface", async ({ page }) => {
  await page.goto("/?app=seed-tone");

  const gridSurface = page.locator('.surface-card[data-surface-id="section-grid"]');
  const toneSection = gridSurface.locator(".section-grid-card").filter({ hasText: /^Tone/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(1);
  await expect(gridSurface.locator(".section-grid-card")).toHaveCount(4);

  await setRangeValue(page, "Cutoff", 4200);
  await setRangeValue(page, "Drive", 9);

  await expect(toneSection).toContainText("4200 Hz");
  await expect(toneSection).toContainText("9.0 dB");
});

test("span pair preview renders the shared dual-filter and routing surfaces", async ({ page }) => {
  await page.goto("/?app=span-pair");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const routingSurface = page.locator('.surface-card[data-surface-id="routing-matrix"]');
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const filterBChip = graphSurface.locator(".surface-band-chip").filter({ hasText: /^Filter B/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(2);
  await expect(routingSurface.locator(".routing-matrix__cell")).toHaveCount(9);
  await expect(outputSurface).toContainText("Span Gap");

  await setRangeValue(page, "Filter B Cutoff", 4200);
  await setRangeValue(page, "Routing", 1);

  await expect(filterBChip).toContainText("4200 Hz");
  await expect(routingSurface.locator(".routing-matrix__cell.is-active")).toHaveCount(3);
});

test("pocket cut preview renders the shared compact filter surfaces", async ({ page }) => {
  await page.goto("/?app=pocket-cut");

  const graphSurface = page.locator('.surface-card[data-surface-id="filter-canvas"]');
  const outputSurface = page.locator('.surface-card[data-surface-id="output-popover"]');
  const cutoffChip = graphSurface.locator(".surface-band-chip").filter({ hasText: /^Cutoff/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(2);
  await expect(graphSurface.locator(".graph-band-handle")).toHaveCount(3);
  await expect(outputSurface).toContainText("Envelope");

  await setRangeValue(page, "Cutoff", 2400);
  await setRangeValue(page, "Mix", 64);

  await expect(cutoffChip).toContainText("2400 Hz");
  await expect(outputSurface).toContainText("64 %");
});

test("press deck preview renders the shared history and detector surfaces", async ({ page }) => {
  await page.goto("/?app=press-deck");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const detectorSurface = page.locator('.surface-card[data-surface-id="sidechain-editor"]');
  const hpChip = detectorSurface.locator(".surface-band-chip").filter({ hasText: /^HP/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(4);
  await expect(detectorSurface.locator(".graph-band-handle")).toHaveCount(3);

  await setRangeValue(page, "Detector HP", 420);

  await expect(hpChip).toContainText("420 Hz");
});

test("headroom preview renders the shared limiter transfer curve", async ({ page }) => {
  await page.goto("/?app=headroom");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);

  await setRangeValue(page, "Drive", 8);

  await expect(transferSurface).toContainText("8.0 dB");
});

test("latch line preview renders the shared gate curve and detector editor", async ({ page }) => {
  await page.goto("/?app=latch-line");

  const transferSurface = page.locator('.surface-card[data-surface-id="transfer-curve"]');
  const detectorSurface = page.locator('.surface-card[data-surface-id="sidechain-editor"]');
  const hpChip = detectorSurface.locator(".surface-band-chip").filter({ hasText: /^HP/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(transferSurface.locator(".transfer-handle")).toHaveCount(3);
  await expect(detectorSurface.locator(".graph-band-handle")).toHaveCount(3);

  await setRangeValue(page, "Detector HP", 320);

  await expect(hpChip).toContainText("320 Hz");
});

test("silk guard preview renders the shared de-ess history and focus filter", async ({ page }) => {
  await page.goto("/?app=silk-guard");

  const historySurface = page.locator('.surface-card[data-surface-id="history-trace"]');
  const filterSurface = page.locator('.surface-card[data-surface-id="detector-filter"]');
  const focusChip = filterSurface.locator(".surface-band-chip").filter({ hasText: /^Focus/ });

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(historySurface.locator(".trace-path")).toHaveCount(5);
  await expect(filterSurface.locator(".graph-band-handle")).toHaveCount(2);

  await setRangeValue(page, "Center Frequency", 7200);

  await expect(focusChip).toContainText("7200 Hz");
});

test("split stack preview renders the shared multiband editor and linked inspector", async ({ page }) => {
  await page.goto("/?app=split-stack");

  const editorSurface = page.locator('.surface-card[data-surface-id="multiband-editor"]');
  const inspectorSurface = page.locator('.surface-card[data-surface-id="band-inspector"]');

  await expect(page.locator("#surfaces .surface-card")).toHaveCount(3);
  await expect(editorSurface.locator(".region-block")).toHaveCount(3);
  await expect(inspectorSurface.locator(".linked-band-card")).toHaveCount(3);
  await expect(inspectorSurface).toContainText(/Attack|Release|Timing Spread|Band Link/);
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
