import { expect, test } from "@playwright/test";

import { loadGeneratedProject, loadGeneratedWorkspace } from "../support/generated-projects.mjs";

const limiter = loadGeneratedProject();
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

test("default preview renders the current limiter schema surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("body")).toHaveAttribute("data-project-key", limiter.schema.project.key);
  await expect(page.getByRole("heading", { name: limiter.schema.project.name })).toBeVisible();
  await expect(page.locator("#previewNav a")).toHaveCount(workspace.apps.length);
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
