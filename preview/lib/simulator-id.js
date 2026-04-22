/** @type {Record<string, string>} */
const SIMULATOR_ID_ALIASES = {
  limiterlab: "limiter-lab",
  "limiter-lab": "limiter-lab",
  pulsepad: "pulse-pad",
  "pulse-pad": "pulse-pad",
  eq: "eq",
  equalizer: "eq",
  "spectral-eq": "eq",
  space: "space",
  reverb: "space",
  creative: "creative",
  "creative-effect": "creative",
  delay: "creative",
  filter: "filter",
  "utility-effect": "filter",
  dynamics: "dynamics",
  instrument: "instrument",
  synth: "instrument",
  synthesizer: "instrument",
  utility: "default",
  default: "default"
};

/** @type {Record<string, string>} */
const PROJECT_SIMULATORS = {
  "limiter-lab": "limiter-lab",
  "pulse-pad": "pulse-pad"
};

/** @type {Record<string, string>} */
const VARIANT_SIMULATORS = {
  "spectral-eq": "eq"
};

/** @type {Record<string, string>} */
const GROUP_SIMULATORS = {
  space: "space",
  "creative-effect": "creative",
  "utility-effect": "filter",
  mix: "dynamics",
  mastering: "dynamics",
  instrument: "instrument"
};

/**
 * @param {GeneratedUiSchema} schema
 * @returns {string | null}
 */
function simulatorOverrideId(schema) {
  const simulator = schema.ui?.simulator;
  if (!simulator || typeof simulator !== "object" || Array.isArray(simulator)) {
    return null;
  }
  return typeof simulator.id === "string" && simulator.id.trim().length > 0 ? simulator.id : null;
}

/**
 * @param {GeneratedUiSchema} schema
 * @returns {string}
 */
function normalizeSimulatorId(schema) {
  const rawId = String(simulatorOverrideId(schema) || schema.project?.key || schema.ui?.family || "default").toLowerCase();
  const aliasMatch = SIMULATOR_ID_ALIASES[rawId];
  if (aliasMatch) {
    return aliasMatch;
  }

  const projectKey = schema.project?.key;
  const projectMatch = projectKey ? PROJECT_SIMULATORS[projectKey] : undefined;
  if (projectMatch) {
    return projectMatch;
  }

  const variant = schema.ui?.variant;
  const variantMatch = variant ? VARIANT_SIMULATORS[variant] : undefined;
  if (variantMatch) {
    return variantMatch;
  }

  const group = schema.ui?.group;
  const groupMatch = group ? GROUP_SIMULATORS[group] : undefined;
  if (groupMatch) {
    return groupMatch;
  }

  if (schema.ui?.themeGroup === "dynamics") {
    return "dynamics";
  }
  if (schema.ui?.themeGroup === "instrument") {
    return "instrument";
  }

  return "default";
}

export { normalizeSimulatorId };
// @ts-check

/**
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 */
