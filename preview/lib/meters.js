// @ts-check

/**
 * @typedef {import("../../types/framework").GeneratedMeter} GeneratedMeter
 */

import { clamp } from "./value-scale.js";

/**
 * @param {GeneratedMeter | null | undefined} meter
 * @returns {number}
 */
function meterMax(meter) {
  return Number(meter?.max) || 78;
}

/**
 * @param {unknown} value
 * @param {GeneratedMeter | null | undefined} meter
 * @returns {number}
 */
function meterPercent(value, meter) {
  if (!meter) {
    return clamp(Number(value) || 0, 0, 1);
  }

  const max = meterMax(meter);
  if (meter.mode === "gr" || meter.unit === "%" || meter.mode === "depth") {
    return clamp(Number(value) / max, 0, 1);
  }
  return clamp((Number(value) + 72) / max, 0, 1);
}

/**
 * @param {unknown} value
 * @param {GeneratedMeter | null | undefined} meter
 * @returns {string}
 */
function formatMeterValue(value, meter) {
  if (!meter) {
    return String(value ?? "");
  }
  return `${Number(value).toFixed(1)} ${meter.unit || "dB"}`;
}

/**
 * @param {HTMLElement} fill
 * @param {HTMLElement} label
 * @param {unknown} rawValue
 * @param {GeneratedMeter | null | undefined} meter
 * @returns {void}
 */
function setMeter(fill, label, rawValue, meter) {
  fill.style.width = `${meterPercent(rawValue, meter) * 100}%`;
  label.textContent = formatMeterValue(rawValue, meter);
}

export { formatMeterValue, meterPercent, setMeter };
