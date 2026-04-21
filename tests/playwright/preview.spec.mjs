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

test("atlas curve preview loads the flagship-eq scaffold route", async ({ page }) => {
  await page.goto("/?app=atlas-curve");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", atlasCurve.schema.project.key);
  await expect(page.getByRole("heading", { name: atlasCurve.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(atlasCurve.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(atlasCurve.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(atlasCurve.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Low Cut|Low Shelf|Bell Freq|Bell Gain|Bell Q|High Shelf|Analyzer/);
});

test("room bloom preview loads the reverb scaffold route", async ({ page }) => {
  await page.goto("/?app=room-bloom");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", roomBloom.schema.project.key);
  await expect(page.getByRole("heading", { name: roomBloom.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(roomBloom.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(roomBloom.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(roomBloom.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Space|Size|Pre-Delay|Decay|Diffusion|Mix/);
});

test("ember drive preview loads the multiband-saturation scaffold route", async ({ page }) => {
  await page.goto("/?app=ember-drive");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", emberDrive.schema.project.key);
  await expect(page.getByRole("heading", { name: emberDrive.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(emberDrive.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(emberDrive.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(emberDrive.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Low Drive|Mid Drive|High Drive|Glue|Output Trim/);
});

test("relay tape preview loads the modulation-delay scaffold route", async ({ page }) => {
  await page.goto("/?app=relay-tape");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", relayTape.schema.project.key);
  await expect(page.getByRole("heading", { name: relayTape.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(relayTape.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(relayTape.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(relayTape.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Time|Feedback|Smear|Mod Depth|Mod Rate|Freeze/);
});

test("contour forge preview loads the routable-filter scaffold route", async ({ page }) => {
  await page.goto("/?app=contour-forge");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", contourForge.schema.project.key);
  await expect(page.getByRole("heading", { name: contourForge.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(contourForge.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(contourForge.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(contourForge.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Mode|Cutoff|Resonance|Drive|Env Amount|LFO Depth|Routing/);
});

test("mirror field preview loads the modular-synth scaffold route", async ({ page }) => {
  await page.goto("/?app=mirror-field");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", mirrorField.schema.project.key);
  await expect(page.getByRole("heading", { name: mirrorField.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(mirrorField.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(mirrorField.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(mirrorField.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Blend|Shape|Tone|Contour|Motion|Mod Amount|Detune/);
});

test("seed tone preview loads the simple-synth scaffold route", async ({ page }) => {
  await page.goto("/?app=seed-tone");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", seedTone.schema.project.key);
  await expect(page.getByRole("heading", { name: seedTone.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(seedTone.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(seedTone.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(seedTone.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Wave|Cutoff|Resonance|Color|Sub|Noise|Motion/);
});

test("span pair preview loads the dual-filter scaffold route", async ({ page }) => {
  await page.goto("/?app=span-pair");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", spanPair.schema.project.key);
  await expect(page.getByRole("heading", { name: spanPair.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(spanPair.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(spanPair.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(spanPair.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Mode|Routing|Filter A Cutoff|Filter B Cutoff|Spacing|Link|Drive/);
});

test("pocket cut preview loads the mini-filter scaffold route", async ({ page }) => {
  await page.goto("/?app=pocket-cut");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", pocketCut.schema.project.key);
  await expect(page.getByRole("heading", { name: pocketCut.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(pocketCut.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(pocketCut.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(pocketCut.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Mode|Cutoff|Resonance|Envelope Follow|Drive|Mix/);
});

test("press deck preview loads the new compressor-oriented scaffold route", async ({ page }) => {
  const pressDeck = loadGeneratedProject("press-deck");

  await page.goto("/?app=press-deck");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", pressDeck.schema.project.key);
  await expect(page.getByRole("heading", { name: pressDeck.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(pressDeck.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(pressDeck.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(pressDeck.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Threshold|Ratio|Attack|Release|Knee|Mix/);
});

test("headroom preview loads the mastering-limiter scaffold route", async ({ page }) => {
  await page.goto("/?app=headroom");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", headroom.schema.project.key);
  await expect(page.getByRole("heading", { name: headroom.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(headroom.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(headroom.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(headroom.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Ceiling|Lookahead|Release|Audition/);
});

test("latch line preview loads the gate-expander scaffold route", async ({ page }) => {
  await page.goto("/?app=latch-line");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", latchLine.schema.project.key);
  await expect(page.getByRole("heading", { name: latchLine.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(latchLine.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(latchLine.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(latchLine.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Threshold|Range|Hold|Hysteresis|Detector HP|Detector LP/);
});

test("silk guard preview loads the de-esser scaffold route", async ({ page }) => {
  await page.goto("/?app=silk-guard");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", silkGuard.schema.project.key);
  await expect(page.getByRole("heading", { name: silkGuard.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(silkGuard.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(silkGuard.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(silkGuard.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Threshold|Range|Band Frequency|Lookahead|Split\/Wide/);
});

test("split stack preview loads the multiband-dynamics scaffold route", async ({ page }) => {
  await page.goto("/?app=split-stack");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", splitStack.schema.project.key);
  await expect(page.getByRole("heading", { name: splitStack.schema.project.name })).toBeVisible();
  await expect(page.locator('#previewNav a.is-active')).toHaveText(splitStack.schema.project.name);
  await expect(page.locator("#controls .control-card")).toHaveCount(splitStack.schema.controls.length);
  await expect(page.locator("#meters .meter-card")).toHaveCount(splitStack.schema.meters.length);
  await expect(page.locator("#controls")).toContainText(/Low Crossover|High Crossover|Low Threshold|Mid Threshold|High Threshold/);
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
