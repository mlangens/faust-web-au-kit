// @ts-check

import fs from "node:fs";
import path from "node:path";

import { writeFileAtomically } from "./fs-tools.mjs";
import { readWavAsFloat32 } from "./probe-signal-tools.mjs";

const analysisFrequencies = [
  20,
  31.5,
  50,
  80,
  125,
  250,
  500,
  1000,
  2000,
  4000,
  8000,
  12000,
  16000,
  20000
];

const defaultEngagementThresholds = {
  activeInputRmsDb: -90,
  activeOutputPeakDb: -100,
  transformedNormalizedError: 0.02,
  transformedRmsDeltaDb: 0.25,
  transformedCorrelationDrop: 0.002,
  noTransformNormalizedError: 0.002,
  noTransformRmsDeltaDb: 0.1,
  noTransformMinCorrelation: 0.9999
};

/**
 * @typedef {import("../../types/framework").AudioAnalysisReport} AudioAnalysisReport
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {{ sampleRate: number, channels: number, frames: number, channelData: Float32Array[] }} FloatWav
 */

/**
 * @param {number} value
 * @returns {number}
 */
function linearToDb(value) {
  return value > 0 ? 20 * Math.log10(value) : -240;
}

/**
 * @param {number} value
 * @param {number} digits
 * @returns {number}
 */
function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {Float32Array} samples
 * @returns {{ peak: number, peakDb: number, rms: number, rmsDb: number, dc: number, crestDb: number }}
 */
function analyzeChannel(samples) {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
    sum += sample;
  }
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
  return {
    peak: round(peak),
    peakDb: round(linearToDb(peak), 3),
    rms: round(rms),
    rmsDb: round(linearToDb(rms), 3),
    dc: round(samples.length ? sum / samples.length : 0),
    crestDb: round(linearToDb(peak / Math.max(rms, 1e-12)), 3)
  };
}

/**
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @returns {number}
 */
function stereoCorrelation(left, right) {
  const length = Math.min(left.length, right.length);
  if (!length) {
    return 0;
  }
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let index = 0; index < length; index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  const denominator = Math.sqrt(xx * yy);
  return denominator ? round(xy / denominator) : 0;
}

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {number} frequencyHz
 * @returns {number}
 */
function goertzelMagnitude(samples, sampleRate, frequencyHz) {
  if (!samples.length || frequencyHz <= 0 || frequencyHz >= sampleRate / 2) {
    return 0;
  }
  const omega = 2 * Math.PI * frequencyHz / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (const sample of samples) {
    q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }
  const power = q1 * q1 + q2 * q2 - coeff * q1 * q2;
  return Math.sqrt(Math.max(0, power)) * 2 / samples.length;
}

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {Record<string, number>}
 */
function spectralFingerprint(samples, sampleRate) {
  /** @type {Record<string, number>} */
  const fingerprint = {};
  for (const frequency of analysisFrequencies.filter((value) => value < sampleRate / 2)) {
    fingerprint[String(frequency)] = round(linearToDb(goertzelMagnitude(samples, sampleRate, frequency)), 3);
  }
  return fingerprint;
}

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {number} fundamentalHz
 * @param {number} harmonics
 * @returns {Record<string, number>}
 */
function harmonicFingerprint(samples, sampleRate, fundamentalHz = 1000, harmonics = 8) {
  /** @type {Record<string, number>} */
  const fingerprint = {};
  for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
    const frequency = fundamentalHz * harmonic;
    if (frequency >= sampleRate / 2) {
      break;
    }
    fingerprint[`h${harmonic}`] = round(linearToDb(goertzelMagnitude(samples, sampleRate, frequency)), 3);
  }
  return fingerprint;
}

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {{ firstPeakSample: number, firstPeakMs: number, peakSample: number, peakMs: number }}
 */
function impulseLandmarks(samples, sampleRate) {
  let peak = 0;
  let peakSample = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const absolute = Math.abs(samples[index] ?? 0);
    if (absolute > peak) {
      peak = absolute;
      peakSample = index;
    }
  }
  const threshold = peak * 0.1;
  let firstPeakSample = peakSample;
  for (let index = 0; index <= peakSample; index += 1) {
    if (Math.abs(samples[index] ?? 0) >= threshold) {
      firstPeakSample = index;
      break;
    }
  }
  return {
    firstPeakSample,
    firstPeakMs: round(firstPeakSample * 1000 / sampleRate, 3),
    peakSample,
    peakMs: round(peakSample * 1000 / sampleRate, 3)
  };
}

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {{ crossings: number, meanFrequencyHz: number, frequencyStdHz: number }}
 */
function zeroCrossingFrequency(samples, sampleRate) {
  /** @type {number[]} */
  const periods = [];
  let previous = samples[0] ?? 0;
  let previousCrossing = -1;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index] ?? 0;
    if (previous <= 0 && current > 0) {
      if (previousCrossing >= 0) {
        periods.push(index - previousCrossing);
      }
      previousCrossing = index;
    }
    previous = current;
  }
  const frequencies = periods.map((period) => sampleRate / period).filter(Number.isFinite);
  const mean = frequencies.length ? frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length : 0;
  const variance = frequencies.length
    ? frequencies.reduce((sum, value) => sum + (value - mean) ** 2, 0) / frequencies.length
    : 0;
  return {
    crossings: frequencies.length,
    meanFrequencyHz: round(mean, 3),
    frequencyStdHz: round(Math.sqrt(variance), 3)
  };
}

/**
 * @param {FloatWav} audio
 * @param {{ signalId?: string, signalDefinition?: JsonObject }} [options]
 * @returns {AudioAnalysisReport}
 */
function analyzeAudioBuffer(audio, options = {}) {
  const mono = new Float32Array(audio.frames);
  for (let frame = 0; frame < audio.frames; frame += 1) {
    let sample = 0;
    for (let channel = 0; channel < audio.channels; channel += 1) {
      sample += audio.channelData[channel]?.[frame] ?? 0;
    }
    mono[frame] = sample / Math.max(1, audio.channels);
  }

  const generator = typeof options.signalDefinition?.generator === "string" ? options.signalDefinition.generator : "";
  const frequencyHz = typeof options.signalDefinition?.frequencyHz === "number" ? options.signalDefinition.frequencyHz : 1000;
  const channelReports = audio.channelData.map((channel) => analyzeChannel(channel));
  const report = {
    signalId: options.signalId,
    generator,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    frames: audio.frames,
    durationSeconds: round(audio.frames / audio.sampleRate, 6),
    channelsAnalysis: channelReports,
    mono: analyzeChannel(mono),
    stereoCorrelation: audio.channels >= 2 && audio.channelData[0] && audio.channelData[1]
      ? stereoCorrelation(audio.channelData[0], audio.channelData[1])
      : null,
    spectralFingerprint: spectralFingerprint(mono, audio.sampleRate),
    harmonicFingerprint: harmonicFingerprint(mono, audio.sampleRate, frequencyHz, 10),
    impulseLandmarks: generator.includes("impulse") ? impulseLandmarks(mono, audio.sampleRate) : null,
    zeroCrossingFrequency: generator === "sine" ? zeroCrossingFrequency(mono, audio.sampleRate) : null
  };

  return /** @type {AudioAnalysisReport} */ (report);
}

/**
 * @param {string} wavPath
 * @param {{ signalId?: string, signalDefinition?: JsonObject }} [options]
 * @returns {AudioAnalysisReport}
 */
function analyzeWavFile(wavPath, options = {}) {
  return analyzeAudioBuffer(readWavAsFloat32(wavPath), options);
}

/**
 * @param {Float32Array[]} left
 * @param {Float32Array[]} right
 * @returns {{ rmsError: number, rmsErrorDb: number, normalizedError: number, correlation: number }}
 */
function compareChannelData(left, right) {
  const channels = Math.min(left.length, right.length);
  const frames = Math.min(left[0]?.length ?? 0, right[0]?.length ?? 0);
  let errorSum = 0;
  let signalSum = 0;
  let dot = 0;
  let leftSum = 0;
  let rightSum = 0;
  let count = 0;
  for (let channel = 0; channel < channels; channel += 1) {
    const leftChannel = left[channel];
    const rightChannel = right[channel];
    if (!leftChannel || !rightChannel) {
      continue;
    }
    for (let frame = 0; frame < frames; frame += 1) {
      const a = leftChannel[frame] ?? 0;
      const b = rightChannel[frame] ?? 0;
      const error = a - b;
      errorSum += error * error;
      signalSum += a * a;
      dot += a * b;
      leftSum += a * a;
      rightSum += b * b;
      count += 1;
    }
  }
  const rmsError = count ? Math.sqrt(errorSum / count) : 0;
  const denominator = Math.sqrt(leftSum * rightSum);
  return {
    rmsError: round(rmsError),
    rmsErrorDb: round(linearToDb(rmsError), 3),
    normalizedError: round(Math.sqrt(errorSum / Math.max(signalSum, 1e-12))),
    correlation: denominator ? round(dot / denominator) : 0
  };
}

/**
 * @param {string} referencePath
 * @param {string} candidatePath
 * @returns {JsonObject}
 */
function compareWavFiles(referencePath, candidatePath) {
  const reference = readWavAsFloat32(referencePath);
  const candidate = readWavAsFloat32(candidatePath);
  const comparison = compareChannelData(reference.channelData, candidate.channelData);
  const referenceAnalysis = analyzeAudioBuffer(reference);
  const candidateAnalysis = analyzeAudioBuffer(candidate);
  return {
    referencePath,
    candidatePath,
    sampleRateMatch: reference.sampleRate === candidate.sampleRate,
    channelMatch: reference.channels === candidate.channels,
    frameDelta: candidate.frames - reference.frames,
    comparison,
    reference: referenceAnalysis,
    candidate: candidateAnalysis
  };
}

/**
 * @param {JsonObject} comparisonReport
 * @param {{ signalId?: string, thresholds?: Partial<typeof defaultEngagementThresholds> }} [options]
 * @returns {JsonObject}
 */
function assessRenderEngagement(comparisonReport, options = {}) {
  const thresholds = {
    ...defaultEngagementThresholds,
    ...(options.thresholds ?? {})
  };
  const comparison = /** @type {JsonObject} */ (comparisonReport.comparison ?? {});
  const reference = /** @type {JsonObject} */ (comparisonReport.reference ?? {});
  const candidate = /** @type {JsonObject} */ (comparisonReport.candidate ?? {});
  const referenceMono = /** @type {JsonObject} */ (reference.mono ?? {});
  const candidateMono = /** @type {JsonObject} */ (candidate.mono ?? {});
  const referenceRmsDb = Number(referenceMono.rmsDb ?? -240);
  const candidateRmsDb = Number(candidateMono.rmsDb ?? -240);
  const candidatePeakDb = Number(candidateMono.peakDb ?? -240);
  const normalizedError = Number(comparison.normalizedError ?? 0);
  const correlation = Number(comparison.correlation ?? 0);
  const rmsDeltaDb = Math.abs(candidateRmsDb - referenceRmsDb);
  const frameDelta = Number(comparisonReport.frameDelta ?? 0);

  /** @type {string[]} */
  const flags = [];
  let status = "engaged";
  if (referenceRmsDb <= thresholds.activeInputRmsDb) {
    status = "input-silent";
    flags.push("input-silent");
  } else if (candidatePeakDb <= thresholds.activeOutputPeakDb) {
    status = "silent-output";
    flags.push("silent-output");
  } else {
    const transformed = normalizedError >= thresholds.transformedNormalizedError
      || rmsDeltaDb >= thresholds.transformedRmsDeltaDb
      || Math.abs(1 - correlation) >= thresholds.transformedCorrelationDrop;
    const unchanged = normalizedError <= thresholds.noTransformNormalizedError
      && rmsDeltaDb <= thresholds.noTransformRmsDeltaDb
      && correlation >= thresholds.noTransformMinCorrelation;
    if (unchanged || !transformed) {
      status = "no-transform";
      flags.push("likely-passthrough");
    }
  }

  if (frameDelta !== 0) {
    flags.push("frame-delta");
  }

  return {
    signalId: options.signalId,
    status,
    engaged: status === "engaged",
    needsLicensingCheck: status === "no-transform" || status === "silent-output",
    flags,
    metrics: {
      normalizedError: round(normalizedError),
      correlation: round(correlation),
      rmsErrorDb: round(Number(comparison.rmsErrorDb ?? -240), 3),
      rmsDeltaDb: round(rmsDeltaDb, 3),
      referenceRmsDb: round(referenceRmsDb, 3),
      candidateRmsDb: round(candidateRmsDb, 3),
      candidatePeakDb: round(candidatePeakDb, 3),
      frameDelta
    }
  };
}

/**
 * @param {JsonObject[]} renderResults
 * @returns {JsonObject[]}
 */
function summarizePluginEngagement(renderResults) {
  /** @type {Map<string, JsonObject[]>} */
  const byPlugin = new Map();
  for (const result of renderResults) {
    const engagement = /** @type {JsonObject | undefined} */ (result.engagement);
    if (!engagement || typeof result.pluginId !== "string") {
      continue;
    }
    const list = byPlugin.get(result.pluginId) ?? [];
    list.push(result);
    byPlugin.set(result.pluginId, list);
  }

  /** @type {JsonObject[]} */
  const summaries = [];
  for (const [pluginId, results] of byPlugin) {
    const statuses = results.map((result) => /** @type {JsonObject} */ (result.engagement ?? {}));
    const comparable = statuses.filter((entry) => entry.status !== "input-silent" && entry.status !== "not-compared");
    const engagedSignals = statuses.filter((entry) => entry.status === "engaged").length;
    const noTransformSignals = statuses.filter((entry) => entry.status === "no-transform").length;
    const silentOutputSignals = statuses.filter((entry) => entry.status === "silent-output").length;
    const inputSilentSignals = statuses.filter((entry) => entry.status === "input-silent").length;
    let status = "no-comparable-signals";
    if (engagedSignals > 0) {
      status = "engaged";
    } else if (comparable.length > 0 && silentOutputSignals === comparable.length) {
      status = "silent-output";
    } else if (comparable.length > 0 && noTransformSignals === comparable.length) {
      status = "likely-no-transform";
    } else if (comparable.length > 0) {
      status = "inconclusive";
    }
    const metrics = comparable
      .map((entry) => /** @type {JsonObject} */ (entry.metrics ?? {}))
      .filter((entry) => typeof entry.normalizedError === "number");
    summaries.push({
      pluginId,
      pluginName: String(results[0]?.pluginName ?? ""),
      status,
      engaged: status === "engaged",
      needsLicensingCheck: status === "likely-no-transform" || status === "silent-output",
      totalSignals: statuses.length,
      comparedSignals: comparable.length,
      engagedSignals,
      noTransformSignals,
      silentOutputSignals,
      inputSilentSignals,
      maxNormalizedError: round(Math.max(0, ...metrics.map((entry) => Number(entry.normalizedError ?? 0)))),
      minCorrelation: round(Math.min(1, ...metrics.map((entry) => Number(entry.correlation ?? 1)))),
      maxRmsDeltaDb: round(Math.max(0, ...metrics.map((entry) => Number(entry.rmsDeltaDb ?? 0))), 3),
      signalStatuses: statuses.map((entry) => ({
        signalId: entry.signalId,
        status: entry.status,
        flags: entry.flags,
        metrics: entry.metrics
      }))
    });
  }
  return summaries.sort((left, right) => String(left.pluginId ?? "").localeCompare(String(right.pluginId ?? "")));
}

/**
 * @param {string} outputPath
 * @param {unknown} report
 * @returns {unknown}
 */
function writeAnalysisReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileAtomically(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export {
  analyzeAudioBuffer,
  analyzeWavFile,
  assessRenderEngagement,
  compareWavFiles,
  goertzelMagnitude,
  linearToDb,
  spectralFingerprint,
  summarizePluginEngagement,
  writeAnalysisReport
};
