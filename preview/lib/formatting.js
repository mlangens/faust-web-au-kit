import { resolveControlDisplay } from "./schema-ui.js";

function decimalPlaces(step) {
  if (!Number.isFinite(Number(step))) {
    return 2;
  }

  const normalized = String(step);
  if (normalized.includes("e-")) {
    return Number(normalized.split("e-")[1]);
  }

  return normalized.includes(".") ? normalized.split(".")[1].length : 0;
}

function formatEnumValue(labels, value) {
  const index = Math.round(Number(value));
  return labels[index] ?? labels[0] ?? String(value);
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function formatValue(control, value, ui) {
  const display = resolveControlDisplay(ui, control);

  if (display.enumLabels?.length) {
    return formatEnumValue(display.enumLabels, value);
  }

  if (control.isToggle) {
    return value >= 0.5 ? (display.onLabel ?? "On") : (display.offLabel ?? "Off");
  }

  if (display.precision != null) {
    const suffix = display.suffix || control.unit || "";
    return suffix ? `${formatNumber(value, Number(display.precision))} ${suffix}` : formatNumber(value, Number(display.precision));
  }

  if (control.unit === "Hz") {
    return `${Math.round(value)} Hz`;
  }
  if (control.unit === "%") {
    return `${Math.round(value)} %`;
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
