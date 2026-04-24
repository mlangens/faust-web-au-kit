// @ts-check

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { gatherControls } from "./project-tools.mjs";
import { writeFileAtomically } from "./fs-tools.mjs";

/**
 * @typedef {import("../../types/framework").FaustControlItem} FaustControlItem
 * @typedef {import("../../types/framework").FaustUiExport} FaustUiExport
 * @typedef {import("../../types/framework").ProjectRuntime} ProjectRuntime
 * @typedef {import("../../types/framework").SonicAssertionManifest} SonicAssertionManifest
 * @typedef {import("../../types/framework").SonicFixtureManifest} SonicFixtureManifest
 * @typedef {import("../../types/framework").SonicNativeHostRequest} SonicNativeHostRequest
 * @typedef {import("../../types/framework").SonicRenderManifest} SonicRenderManifest
 * @typedef {import("../../types/framework").SonicRenderReport} SonicRenderReport
 * @typedef {import("../../types/framework").SonicStageManifest} SonicStageManifest
 * @typedef {import("../../types/framework").SonicStageReport} SonicStageReport
 * @typedef {import("../../types/framework").SonicSuiteReport} SonicSuiteReport
 */

/**
 * @typedef {{ sampleRate: number, channels: Float32Array[] }} AudioBuffer
 * @typedef {{ passed: boolean, message: string, assertion: SonicAssertionManifest, actual: number | null, reference: number | null }} AssertionResult
 * @typedef {{ controls: FaustControlItem[], uiJson: FaustUiExport }} SonicUi
 */

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_BLOCK_SIZE = 128;
const DEFAULT_FIXTURE_SECONDS = 1.5;
const DEFAULT_CHANNELS = 2;
const EPSILON = 1e-12;

/** @type {Record<string, [number, number]>} */
const BAND_RANGES = {
  sub: [20, 80],
  low: [80, 250],
  lowMid: [250, 700],
  mid: [700, 2000],
  presence: [2000, 6000],
  air: [6000, 18000],
  sibilance: [4500, 10000],
  full: [20, 20000]
};

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * @param {number} value
 * @returns {number}
 */
function linearToDb(value) {
  return 20 * Math.log10(Math.max(Math.abs(value), EPSILON));
}

/**
 * @param {number} value
 * @returns {number}
 */
function powerToDb(value) {
  return 10 * Math.log10(Math.max(value, EPSILON));
}

/**
 * @param {number} sampleRate
 * @param {number} frequency
 * @returns {{ z1: number, z2: number, coefficient: number }}
 */
function createGoertzel(sampleRate, frequency) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  return {
    z1: 0,
    z2: 0,
    coefficient: 2 * Math.cos(omega)
  };
}

/**
 * @param {{ z1: number, z2: number, coefficient: number }} state
 * @param {number} sample
 */
function processGoertzel(state, sample) {
  const next = sample + state.coefficient * state.z1 - state.z2;
  state.z2 = state.z1;
  state.z1 = next;
}

/**
 * @param {{ z1: number, z2: number, coefficient: number }} state
 * @param {number} length
 * @returns {number}
 */
function finishGoertzel(state, length) {
  const power = state.z2 * state.z2 + state.z1 * state.z1 - state.coefficient * state.z1 * state.z2;
  return power / Math.max(1, length * length);
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function createNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/**
 * @param {SonicFixtureManifest | string | undefined} fixture
 * @returns {SonicFixtureManifest}
 */
function normalizeFixture(fixture) {
  if (typeof fixture === "string") {
    return { kind: fixture };
  }
  if (fixture && typeof fixture === "object") {
    return fixture;
  }
  return { kind: "multitone" };
}

/**
 * @param {SonicFixtureManifest | string | undefined} fixture
 * @param {{ sampleRate?: number, channels?: number }} [options]
 * @returns {AudioBuffer}
 */
function createSonicFixture(fixture, options = {}) {
  const normalized = normalizeFixture(fixture);
  const sampleRate = Math.max(8000, Math.round(finiteNumber(options.sampleRate ?? normalized.sampleRate, DEFAULT_SAMPLE_RATE)));
  const seconds = Math.max(0.05, finiteNumber(normalized.seconds, DEFAULT_FIXTURE_SECONDS));
  const channelCount = Math.max(1, Math.round(finiteNumber(options.channels ?? normalized.channels, DEFAULT_CHANNELS)));
  const frameCount = Math.max(1, Math.round(sampleRate * seconds));
  const amplitude = finiteNumber(normalized.amplitude, 0.5);
  const kind = String(normalized.kind ?? "multitone");
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  const noise = createNoise(Math.round(finiteNumber(normalized.seed, 271828)));
  let pinkState = 0;
  let brownState = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const phase = frame / Math.max(1, frameCount - 1);
    let mono = 0;
    let side = 0;

    if (kind === "silence") {
      mono = 0;
    } else if (kind === "impulse") {
      mono = frame === 0 ? amplitude : 0;
    } else if (kind === "step") {
      mono = frame >= Math.floor(frameCount * 0.08) ? amplitude : 0;
    } else if (kind === "sine") {
      mono = Math.sin(2 * Math.PI * finiteNumber(normalized.frequency, 997) * time) * amplitude;
    } else if (kind === "two-tone") {
      const firstFrequency = finiteNumber(normalized.frequency, 700);
      const secondFrequency = finiteNumber(normalized.endFrequency, 1900);
      mono =
        (Math.sin(2 * Math.PI * firstFrequency * time) * 0.5 +
          Math.sin(2 * Math.PI * secondFrequency * time) * 0.5) *
        amplitude;
    } else if (kind === "imd-two-tone") {
      const bassFrequency = finiteNumber(normalized.frequency, 60);
      const voiceFrequency = finiteNumber(normalized.endFrequency, 7000);
      mono =
        (Math.sin(2 * Math.PI * bassFrequency * time) * 0.58 +
          Math.sin(2 * Math.PI * voiceFrequency * time) * 0.42) *
        amplitude;
    } else if (kind === "tone-burst") {
      const burstRate = finiteNumber(normalized.bpm, 120) / 60;
      const burstPhase = (time * burstRate) % 1;
      const gate = burstPhase < 0.18 ? Math.sin(Math.PI * burstPhase / 0.18) ** 0.5 : 0;
      mono = Math.sin(2 * Math.PI * finiteNumber(normalized.frequency, 997) * time) * gate * amplitude;
    } else if (kind === "pulse-train") {
      const pulseRate = finiteNumber(normalized.bpm, 120) / 60;
      const pulsePhase = (time * pulseRate) % 1;
      mono = (pulsePhase < 0.018 ? 1 : 0) * amplitude;
    } else if (kind === "stepped-sine") {
      const start = finiteNumber(normalized.startFrequency, 40);
      const end = finiteNumber(normalized.endFrequency, 16000);
      const steps = Math.max(2, Math.round(finiteNumber(normalized.steps, 10)));
      const stepIndex = Math.min(steps - 1, Math.floor(phase * steps));
      const stepPosition = steps <= 1 ? 0 : stepIndex / (steps - 1);
      const frequency = start * Math.pow(end / start, stepPosition);
      mono = Math.sin(2 * Math.PI * frequency * time) * amplitude;
    } else if (kind === "sweep") {
      const start = finiteNumber(normalized.startFrequency, 40);
      const end = finiteNumber(normalized.endFrequency, 16000);
      const frequency = start * Math.pow(end / start, phase);
      mono = Math.sin(2 * Math.PI * frequency * time) * amplitude;
    } else if (kind === "white-noise") {
      mono = noise() * amplitude;
    } else if (kind === "pink-noise") {
      pinkState = pinkState * 0.985 + noise() * 0.15;
      mono = pinkState * amplitude;
    } else if (kind === "brown-noise") {
      brownState = Math.max(-1, Math.min(1, brownState + noise() * 0.035));
      mono = brownState * amplitude;
    } else if (kind === "drum-loop") {
      const beat = (time * finiteNumber(normalized.bpm, 112)) / 60;
      const beatPhase = beat % 1;
      const kick = Math.sin(2 * Math.PI * (48 + 42 * Math.exp(-beatPhase * 18)) * time) * Math.exp(-beatPhase * 18);
      const snarePhase = (beat + 0.5) % 1;
      const snare = noise() * Math.exp(-snarePhase * 28) * 0.45;
      const hatPhase = (beat * 4) % 1;
      const hat = noise() * Math.exp(-hatPhase * 90) * 0.12;
      mono = (kick * 0.82 + snare + hat) * amplitude;
    } else if (kind === "vocal-sibilance") {
      const syllable = Math.sin(2 * Math.PI * 4.2 * time) > 0.35 ? 1 : 0;
      const vowel = Math.sin(2 * Math.PI * 185 * time) * 0.36 + Math.sin(2 * Math.PI * 370 * time) * 0.18;
      const sibilance = noise() * syllable * (0.22 + 0.18 * Math.sin(2 * Math.PI * 7600 * time));
      mono = (vowel + sibilance) * amplitude;
    } else if (kind === "bass-loop") {
      const notes = [55, 73.416, 82.407, 65.406];
      const noteIndex = Math.floor((time * 2) % notes.length);
      const notePhase = (time * 2) % 1;
      const envelope = Math.min(1, notePhase * 12) * Math.exp(-notePhase * 1.2);
      mono = Math.sin(2 * Math.PI * (notes[noteIndex] ?? 55) * time) * envelope * amplitude;
    } else if (kind === "stereo-ambience") {
      mono =
        (Math.sin(2 * Math.PI * 233 * time) * 0.34 +
          Math.sin(2 * Math.PI * 377 * time + 0.4) * 0.24 +
          noise() * 0.10) *
        amplitude;
      side = Math.sin(2 * Math.PI * 0.19 * time) * amplitude * 0.18;
    } else {
      mono =
        (Math.sin(2 * Math.PI * 110 * time) * 0.34 +
          Math.sin(2 * Math.PI * 997 * time) * 0.24 +
          Math.sin(2 * Math.PI * 3300 * time) * 0.18 +
          Math.sin(2 * Math.PI * 7200 * time) * 0.12) *
        amplitude;
    }

    for (let channel = 0; channel < channelCount; channel += 1) {
      const polarity = channel % 2 === 0 ? 1 : -1;
      const channelBuffer = channels[channel];
      if (channelBuffer) {
        channelBuffer[frame] = mono + side * polarity;
      }
    }
  }

  return { sampleRate, channels };
}

/**
 * @param {AudioBuffer} audio
 * @returns {Record<string, number>}
 */
function analyzeAudio(audio) {
  const frameCount = audio.channels[0]?.length ?? 0;
  const channelCount = Math.max(1, audio.channels.length);
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let nanSamples = 0;
  let infSamples = 0;
  let zeroCrossings = 0;
  let previous = 0;
  let earlySquares = 0;
  let lateSquares = 0;
  let sideSquares = 0;
  let midSquares = 0;
  let leftRightProduct = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  let firstImpulseFrame = -1;

  const bandStates = Object.fromEntries(
    Object.entries(BAND_RANGES).map(([band, [low, high]]) => [
      band,
      [low, (low + high) * 0.5, high]
        .filter((frequency) => frequency > 0 && frequency < audio.sampleRate * 0.49)
        .map((frequency) => createGoertzel(audio.sampleRate, frequency))
    ])
  );

  for (let frame = 0; frame < frameCount; frame += 1) {
    let mono = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = audio.channels[channel]?.[frame] ?? 0;
      if (Number.isNaN(value)) {
        nanSamples += 1;
        continue;
      }
      if (!Number.isFinite(value)) {
        infSamples += 1;
        continue;
      }
      peak = Math.max(peak, Math.abs(value));
      sumSquares += value * value;
      sum += value;
      mono += value / channelCount;
    }

    if (frame > 0 && Math.sign(mono) !== Math.sign(previous) && Math.abs(mono) > 1e-5 && Math.abs(previous) > 1e-5) {
      zeroCrossings += 1;
    }
    previous = mono;
    if (firstImpulseFrame < 0 && Math.abs(mono) > Math.max(0.01, peak * 0.25)) {
      firstImpulseFrame = frame;
    }

    if (frame < Math.floor(frameCount * 0.2)) {
      earlySquares += mono * mono;
    } else if (frame > Math.floor(frameCount * 0.55)) {
      lateSquares += mono * mono;
    }

    const left = audio.channels[0]?.[frame] ?? mono;
    const right = audio.channels[1]?.[frame] ?? left;
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    midSquares += mid * mid;
    sideSquares += side * side;
    leftRightProduct += left * right;
    leftSquares += left * left;
    rightSquares += right * right;

    for (const states of Object.values(bandStates)) {
      states.forEach((state) => processGoertzel(state, mono));
    }
  }

  const sampleCount = Math.max(1, frameCount * channelCount);
  /** @type {Record<string, number>} */
  const metrics = {
    frames: frameCount,
    sampleRate: audio.sampleRate,
    peak,
    peakDb: linearToDb(peak),
    rms: Math.sqrt(sumSquares / sampleCount),
    rmsDb: powerToDb(sumSquares / sampleCount),
    dcOffset: sum / sampleCount,
    nanSamples,
    infSamples,
    zeroCrossingRate: zeroCrossings / Math.max(1, frameCount),
    earlyRmsDb: powerToDb(earlySquares / Math.max(1, Math.floor(frameCount * 0.2))),
    lateRmsDb: powerToDb(lateSquares / Math.max(1, frameCount - Math.floor(frameCount * 0.55))),
    tailToEarlyDb: powerToDb((lateSquares + EPSILON) / Math.max(EPSILON, earlySquares)),
    stereoSideToMidDb: powerToDb((sideSquares + EPSILON) / Math.max(EPSILON, midSquares)),
    stereoCorrelation: leftRightProduct / Math.sqrt(Math.max(EPSILON, leftSquares * rightSquares)),
    latencySamples: firstImpulseFrame < 0 ? 0 : firstImpulseFrame
  };

  for (const [band, states] of Object.entries(bandStates)) {
    const power = states.reduce((total, state) => total + finishGoertzel(state, frameCount), 0) / Math.max(1, states.length);
    metrics[`bandEnergyDb.${band}`] = powerToDb(power);
  }

  metrics.harmonicRatioDb = (metrics["bandEnergyDb.presence"] ?? -120) - (metrics["bandEnergyDb.mid"] ?? -120);
  metrics.airToMidDb = (metrics["bandEnergyDb.air"] ?? -120) - (metrics["bandEnergyDb.mid"] ?? -120);
  metrics.sibilanceToBodyDb = (metrics["bandEnergyDb.sibilance"] ?? -120) - (metrics["bandEnergyDb.lowMid"] ?? -120);
  return metrics;
}

/**
 * @param {SonicRenderReport} render
 * @param {string} metric
 * @returns {number | null}
 */
function metricValue(render, metric) {
  const value = render.metrics?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param {SonicAssertionManifest} assertion
 * @param {ReadonlyMap<string, SonicRenderReport>} renders
 * @returns {AssertionResult}
 */
function evaluateAssertion(assertion, renders) {
  const renderId = String(assertion.render ?? "baseline");
  const render = renders.get(renderId);
  const metric = String(assertion.metric ?? "");
  const actual = render ? metricValue(render, metric) : null;
  const referenceRender = typeof assertion.reference === "string" ? renders.get(assertion.reference) : null;
  const reference = referenceRender ? metricValue(referenceRender, metric) : null;
  const label = `${renderId}.${metric}`;

  if (!render) {
    return { passed: false, message: `Missing render "${renderId}"`, assertion, actual, reference };
  }
  if (actual == null) {
    return { passed: false, message: `Missing metric "${label}"`, assertion, actual, reference };
  }
  if (typeof assertion.eq === "number" && actual !== assertion.eq) {
    return { passed: false, message: `${label} expected ${assertion.eq}, got ${actual}`, assertion, actual, reference };
  }
  if (typeof assertion.lte === "number" && actual > assertion.lte) {
    return { passed: false, message: `${label} expected <= ${assertion.lte}, got ${actual}`, assertion, actual, reference };
  }
  if (typeof assertion.gte === "number" && actual < assertion.gte) {
    return { passed: false, message: `${label} expected >= ${assertion.gte}, got ${actual}`, assertion, actual, reference };
  }
  if (Array.isArray(assertion.between) && assertion.between.length === 2) {
    const min = Number(assertion.between[0]);
    const max = Number(assertion.between[1]);
    if (actual < min || actual > max) {
      return { passed: false, message: `${label} expected between ${min} and ${max}, got ${actual}`, assertion, actual, reference };
    }
  }
  if (typeof assertion.minDelta === "number" || typeof assertion.maxDelta === "number") {
    if (reference == null) {
      return { passed: false, message: `${label} needs reference render "${assertion.reference}"`, assertion, actual, reference };
    }
    const delta = actual - reference;
    if (typeof assertion.minDelta === "number" && delta < assertion.minDelta) {
      return {
        passed: false,
        message: `${label} expected delta >= ${assertion.minDelta} vs ${assertion.reference}, got ${delta}`,
        assertion,
        actual,
        reference
      };
    }
    if (typeof assertion.maxDelta === "number" && delta > assertion.maxDelta) {
      return {
        passed: false,
        message: `${label} expected delta <= ${assertion.maxDelta} vs ${assertion.reference}, got ${delta}`,
        assertion,
        actual,
        reference
      };
    }
  }

  return { passed: true, message: `${label} passed`, assertion, actual, reference };
}

/**
 * @param {ProjectRuntime} runtime
 * @returns {SonicStageManifest}
 */
function defaultSmokeStage(runtime) {
  return {
    id: "framework-smoke",
    title: "Framework sonic smoke",
    description: "Renders a deterministic multitone scene and checks for invalid samples, runaway gain, and accidental silence.",
    fixture: {
      kind: runtime.project.plugin.kind === "instrument" ? "stereo-ambience" : "multitone",
      seconds: 0.75,
      amplitude: 0.34
    },
    renders: [
      {
        id: "baseline",
        parameters: {}
      }
    ],
    assertions: [
      { render: "baseline", metric: "nanSamples", eq: 0 },
      { render: "baseline", metric: "infSamples", eq: 0 },
      { render: "baseline", metric: "peakDb", between: [-90, 18] },
      { render: "baseline", metric: "rmsDb", between: [-100, 12] }
    ],
    tags: ["smoke", "framework"]
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @param {{ profile?: string }} [options]
 * @returns {SonicStageManifest[]}
 */
function resolveSonicStages(runtime, options = {}) {
  const declared = Array.isArray(runtime.project.sonicStages) ? runtime.project.sonicStages : [];
  const stages = [defaultSmokeStage(runtime), ...declared];
  if (options.profile === "smoke") {
    return stages.filter((stage) => (stage.tags ?? []).includes("smoke") || stage.id === "framework-smoke");
  }
  return stages;
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest} stage
 * @param {FaustControlItem[]} controls
 * @returns {string[]}
 */
function validateSonicStage(runtime, stage, controls) {
  const errors = [];
  const controlLabels = new Set(controls.map((control) => control.label));
  if (!stage.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(stage.id)) {
    errors.push(`${runtime.appKey} sonic stage id "${stage.id ?? ""}" must be kebab-case.`);
  }
  if (!Array.isArray(stage.renders) || stage.renders.length === 0) {
    errors.push(`${runtime.appKey}/${stage.id ?? "unknown"} must declare at least one render.`);
  }
  for (const render of stage.renders ?? []) {
    for (const label of Object.keys(render.parameters ?? {})) {
      if (!controlLabels.has(label)) {
        errors.push(`${runtime.appKey}/${stage.id ?? "unknown"} references unknown control "${label}".`);
      }
    }
  }
  if (!Array.isArray(stage.assertions) || stage.assertions.length === 0) {
    errors.push(`${runtime.appKey}/${stage.id ?? "unknown"} must declare at least one sonic assertion.`);
  }
  return errors;
}

/**
 * @param {string} targetsDir
 * @param {string} sourceBase
 * @returns {SonicUi}
 */
function loadSonicUi(targetsDir, sourceBase) {
  const uiJson = JSON.parse(fs.readFileSync(path.join(targetsDir, `${sourceBase}.ui.json`), "utf8"));
  return {
    controls: gatherControls(uiJson.ui),
    uiJson
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageManifest[]} stages
 * @param {string} mode
 * @returns {SonicNativeHostRequest}
 */
function createNativeHostRequest(runtime, stages, mode) {
  const artifactStem = runtime.project.artifactStem ?? runtime.project.productName.replaceAll(" ", "");
  return {
    version: 1,
    mode,
    appKey: runtime.appKey,
    productName: runtime.project.productName,
    pluginKind: runtime.project.plugin.kind,
    generatedDir: runtime.outputDir,
    artifacts: {
      standalone: path.join(runtime.buildDir, `${artifactStem}.app`),
      vst3: path.join(runtime.buildDir, `${artifactStem}.vst3`),
      clap: path.join(runtime.buildDir, `${artifactStem}.clap`)
    },
    stages
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicStageReport[]} stages
 * @param {{ mode: string, profile: string }} options
 * @returns {SonicSuiteReport}
 */
function createSonicReport(runtime, stages, options) {
  const failures = stages.flatMap((stage) => stage.assertions.filter((assertion) => !assertion.passed));
  return {
    version: 1,
    mode: options.mode,
    profile: options.profile,
    appKey: runtime.appKey,
    productName: runtime.project.productName,
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch()
    },
    passed: failures.length === 0,
    stages
  };
}

/**
 * @param {ProjectRuntime} runtime
 * @param {SonicSuiteReport} report
 * @returns {string}
 */
function writeSonicReport(runtime, report) {
  const reportPath = path.join(runtime.outputDir, "sonic-report.json");
  writeFileAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

export {
  DEFAULT_BLOCK_SIZE,
  DEFAULT_SAMPLE_RATE,
  analyzeAudio,
  createNativeHostRequest,
  createSonicFixture,
  createSonicReport,
  evaluateAssertion,
  loadSonicUi,
  resolveSonicStages,
  validateSonicStage,
  writeSonicReport
};
