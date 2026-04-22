// @ts-check

/**
 * @typedef {import("../../types/framework").GeneratedControl} GeneratedControl
 * @typedef {import("../../types/framework").GeneratedMeter} GeneratedMeter
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").PreviewState} PreviewState
 */

import { normalizeRangeValue } from "./value-scale.js";

/**
 * @param {GeneratedControl | null | undefined} control
 * @returns {string[]}
 */
function resolveControlKeys(control) {
  return [...new Set(
    [control?.id, control?.label, control?.shortname].filter(
      /**
       * @param {string | undefined} key
       * @returns {key is string}
       */
      (key) => typeof key === "string" && key.trim().length > 0
    )
  )];
}

/**
 * @param {PreviewState} state
 * @param {GeneratedControl} control
 * @param {unknown} value
 * @returns {void}
 */
function rememberControlValue(state, control, value) {
  resolveControlKeys(control).forEach((key) => {
    state.controls.set(key, value);
  });
}

/**
 * @param {PreviewState} state
 * @param {string} key
 * @param {number} [fallback=0]
 * @returns {unknown}
 */
function readStoredControlValue(state, key, fallback = 0) {
  return state.controls.get(key) ?? fallback;
}

/**
 * @param {PreviewState} state
 * @param {string[]} keys
 * @param {number} [fallback=0]
 * @returns {unknown}
 */
function pickStoredControlValue(state, keys, fallback = 0) {
  for (const key of keys) {
    if (state.controls.has(key)) {
      return state.controls.get(key);
    }
  }
  return fallback;
}

/**
 * @param {GeneratedUiSchema} schema
 * @param {string} key
 * @returns {GeneratedControl | null}
 */
function resolveControl(schema, key) {
  return (Array.isArray(schema.controls) ? schema.controls : []).find((entry) => resolveControlKeys(entry).includes(key)) ?? null;
}

/**
 * @param {GeneratedUiSchema} schema
 * @param {string} key
 * @returns {GeneratedMeter | null}
 */
function resolveMeter(schema, key) {
  return (Array.isArray(schema.meters) ? schema.meters : []).find((entry) => [entry.id, entry.label].includes(key)) ?? null;
}

/**
 * @param {GeneratedUiSchema} schema
 * @param {PreviewState} state
 * @param {string} key
 * @param {number} [fallback=0]
 * @returns {unknown}
 */
function readSchemaControlValue(schema, state, key, fallback = 0) {
  const control = resolveControl(schema, key);
  if (!control) {
    return fallback;
  }

  for (const candidate of resolveControlKeys(control)) {
    if (state.controls.has(candidate)) {
      return state.controls.get(candidate);
    }
  }

  return control.init ?? fallback;
}

/**
 * @param {PreviewState} state
 * @param {GeneratedUiSchema} schema
 * @returns {number}
 */
function averageNormalizedControlValue(state, schema) {
  const controls = Array.isArray(schema.controls) ? schema.controls : [];
  if (!controls.length) {
    return 0.4;
  }

  const total = controls.reduce((sum, control) => {
    const keys = resolveControlKeys(control);
    const currentValue = pickStoredControlValue(state, keys, control.init ?? 0);
    const min = Number(control.min);
    const max = Number(control.max);
    const range = max - min;
    if (!Number.isFinite(range) || range === 0) {
      return sum;
    }
    return sum + normalizeRangeValue(currentValue, min, max, 0);
  }, 0);

  return total / controls.length;
}

export {
  averageNormalizedControlValue,
  pickStoredControlValue,
  readSchemaControlValue,
  readStoredControlValue,
  rememberControlValue,
  resolveControl,
  resolveControlKeys,
  resolveMeter
};
