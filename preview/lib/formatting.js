// @ts-check

import { resolveControlDisplay } from "./schema-ui.js";

/**
 * @typedef {import("../../types/framework").GeneratedControl} GeneratedControl
 * @typedef {import("../../types/framework").ProjectUiManifest} ProjectUiManifest
 */

/**
 * @param {unknown} step
 * @returns {number}
 */
function decimalPlaces(step) {
  if (!Number.isFinite(Number(step))) {
    return 2;
  }

  const normalized = String(step);
  if (normalized.includes("e-")) {
    return Number(normalized.split("e-")[1]);
  }

  if (!normalized.includes(".")) {
    return 0;
  }
  const fraction = normalized.split(".")[1];
  return fraction ? fraction.length : 0;
}

/**
 * @param {string[]} labels
 * @param {unknown} value
 * @returns {string}
 */
function formatEnumValue(labels = [], value) {
  const index = Math.round(Number(value));
  return labels[index] ?? labels[0] ?? String(value);
}

/**
 * @param {unknown} value
 * @param {number} digits
 * @returns {string}
 */
function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

/**
 * @param {GeneratedControl} control
 * @param {unknown} value
 * @param {ProjectUiManifest} ui
 * @returns {string}
 */
function formatValue(control, value, ui) {
  const display = resolveControlDisplay(ui, control);

  if (display.enumLabels?.length) {
    return formatEnumValue(display.enumLabels, value);
  }

  if (control.isToggle) {
    return Number(value) >= 0.5 ? (display.onLabel ?? "On") : (display.offLabel ?? "Off");
  }

  if (display.precision != null) {
    const suffix = display.suffix || control.unit || "";
    return suffix ? `${formatNumber(value, Number(display.precision))} ${suffix}` : formatNumber(value, Number(display.precision));
  }

  if (control.unit === "Hz") {
    return `${Math.round(Number(value))} Hz`;
  }
  if (control.unit === "%") {
    return `${Math.round(Number(value))} %`;
  }
  if (control.unit === "ct") {
    return `${formatNumber(value, 1)} ct`;
  }
  if (control.unit === "dB") {
    return `${formatNumber(value, 1)} dB`;
  }
  if (control.unit === "ms") {
    return `${formatNumber(value, 2)} ms`;
  }

  return formatNumber(value, Math.max(decimalPlaces(control.step), 2));
}

export { formatValue };
