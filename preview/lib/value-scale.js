// @ts-check

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {unknown} value
 * @param {number} [max=100]
 * @returns {number}
 */
function normalizeUnitValue(value, max = 100) {
  const numeric = Number(value);
  const safeMax = Number.isFinite(Number(max)) && Number(max) !== 0 ? Number(max) : 100;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (Math.abs(numeric) <= 1 && safeMax > 1) {
    return clamp(numeric, 0, 1);
  }
  return clamp(numeric / safeMax, 0, 1);
}

/**
 * @param {unknown} value
 * @param {number} [min=0]
 * @param {number} [max=1]
 * @param {number} [fallback=0.5]
 * @returns {number}
 */
function normalizeRangeValue(value, min = 0, max = 1, fallback = 0.5) {
  const numeric = Number(value);
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 0;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 1;
  if (!Number.isFinite(numeric) || safeMax === safeMin) {
    return clamp(fallback, 0, 1);
  }
  return clamp((numeric - safeMin) / (safeMax - safeMin), 0, 1);
}

/**
 * @param {unknown} value
 * @param {number} [max=100]
 * @returns {number}
 */
function normalizeBipolarUnitValue(value, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  if (Math.abs(numeric) <= 1) {
    return clamp((numeric + 1) / 2, 0, 1);
  }
  return normalizeRangeValue(numeric, -max, max, 0.5);
}

/**
 * @param {unknown} value
 * @param {number} [min=20]
 * @param {number} [max=20000]
 * @returns {number}
 */
function normalizeFrequencyValue(value, min = 20, max = 20000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0 && numeric <= 1) {
    return clamp(numeric, 0, 1);
  }

  const safeMin = Math.max(Number(min) || 20, 1);
  const safeMax = Math.max(Number(max) || 20000, safeMin + 1);
  return clamp(
    (Math.log10(Math.max(numeric, safeMin)) - Math.log10(safeMin)) / (Math.log10(safeMax) - Math.log10(safeMin)),
    0,
    1
  );
}

export { clamp, normalizeBipolarUnitValue, normalizeFrequencyValue, normalizeRangeValue, normalizeUnitValue };
