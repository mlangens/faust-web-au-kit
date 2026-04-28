// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFileSync, writeFileAtomically } from "./fs-tools.mjs";

/**
 * @typedef {import("../../types/framework").JsonObject} JsonObject
 * @typedef {import("../../types/framework").ProbeSignalCorpus} ProbeSignalCorpus
 * @typedef {import("../../types/framework").ProbeSignalDefinition} ProbeSignalDefinition
 * @typedef {import("../../types/framework").ProbeSignalManifest} ProbeSignalManifest
 * @typedef {import("../../types/framework").ProbeSignalManifestEntry} ProbeSignalManifestEntry
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultProbeCorpusRelativePath = "framework/profiling/probe-signals.json";
const wavFloatFormat = 3;
const twoPi = Math.PI * 2;

/**
 * @param {string} [resolverRoot]
 * @returns {string}
 */
function probeSignalCorpusPath(resolverRoot = root) {
  return path.resolve(resolverRoot, defaultProbeCorpusRelativePath);
}

/**
 * @param {unknown} value
 * @returns {value is JsonObject}
 */
function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => optionalString(entry)).filter(Boolean);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} db
 * @returns {number}
 */
function dbToGain(db) {
  return 10 ** (db / 20);
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {Float32Array[]} channels
 * @returns {number}
 */
function rms(channels) {
  let sum = 0;
  let count = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      sum += sample * sample;
      count += 1;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

/**
 * @param {Float32Array[]} channels
 * @param {number} levelDb
 */
function normalizeRms(channels, levelDb) {
  const current = rms(channels);
  if (!current) {
    return;
  }
  const gain = dbToGain(levelDb) / current;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = clamp((channel[index] ?? 0) * gain, -0.98, 0.98);
    }
  }
}

/**
 * @param {ProbeSignalCorpus} corpus
 */
function validateProbeSignalCorpus(corpus) {
  if (!isPlainObject(corpus)) {
    throw new Error(`Probe signal corpus must contain a JSON object.`);
  }
  if (!optionalString(corpus.id)) {
    throw new Error(`Probe signal corpus must declare an id.`);
  }
  const signals = isPlainObject(corpus.signals) ? corpus.signals : {};
  const profiles = isPlainObject(corpus.profiles) ? corpus.profiles : {};
  if (!Object.keys(signals).length) {
    throw new Error(`Probe signal corpus "${corpus.id}" must declare signals.`);
  }
  for (const [signalId, signal] of Object.entries(signals)) {
    if (!isPlainObject(signal) || !optionalString(signal.generator)) {
      throw new Error(`Probe signal "${signalId}" must declare a generator.`);
    }
  }
  for (const [profileId, profile] of Object.entries(profiles)) {
    const ids = stringList(isPlainObject(profile) ? profile.signalIds : []);
    if (!ids.length) {
      throw new Error(`Probe profile "${profileId}" must reference at least one signal.`);
    }
    for (const signalId of ids) {
      if (!signals[signalId]) {
        throw new Error(`Probe profile "${profileId}" references unknown signal "${signalId}".`);
      }
    }
  }
  const primitiveProbeMap = isPlainObject(corpus.primitiveProbeMap) ? corpus.primitiveProbeMap : {};
  for (const [primitiveId, profileIds] of Object.entries(primitiveProbeMap)) {
    for (const profileId of stringList(profileIds)) {
      if (!profiles[profileId]) {
        throw new Error(`Primitive probe map "${primitiveId}" references unknown profile "${profileId}".`);
      }
    }
  }
}

/**
 * @param {{ root?: string }} [options]
 * @returns {ProbeSignalCorpus}
 */
function loadProbeSignalCorpus(options = {}) {
  const corpusPath = probeSignalCorpusPath(options.root ?? root);
  /** @type {ProbeSignalCorpus} */
  const corpus = readJsonFileSync(corpusPath);
  validateProbeSignalCorpus(corpus);
  return corpus;
}

/**
 * @param {ProbeSignalCorpus} corpus
 * @param {string[]} primitiveIds
 * @returns {string[]}
 */
function resolveProbeSignalIdsForPrimitives(corpus, primitiveIds) {
  const profiles = isPlainObject(corpus.profiles) ? corpus.profiles : {};
  const primitiveProbeMap = isPlainObject(corpus.primitiveProbeMap) ? corpus.primitiveProbeMap : {};
  const signalIds = new Set();

  for (const signalId of stringList(isPlainObject(profiles["universal.baseline"]) ? profiles["universal.baseline"].signalIds : [])) {
    signalIds.add(signalId);
  }

  for (const primitiveId of primitiveIds) {
    for (const profileId of stringList(primitiveProbeMap[primitiveId])) {
      const profile = profiles[profileId];
      if (!isPlainObject(profile)) {
        continue;
      }
      for (const signalId of stringList(profile.signalIds)) {
        signalIds.add(signalId);
      }
    }
  }

  return [...signalIds];
}

/**
 * @param {ProbeSignalCorpus} corpus
 * @param {string[]} profileIds
 * @returns {string[]}
 */
function resolveProbeSignalIdsForProfiles(corpus, profileIds) {
  const profiles = isPlainObject(corpus.profiles) ? corpus.profiles : {};
  const signalIds = new Set();
  for (const profileId of profileIds) {
    const profile = profiles[profileId];
    if (!isPlainObject(profile)) {
      throw new Error(`Unknown probe profile "${profileId}".`);
    }
    for (const signalId of stringList(profile.signalIds)) {
      signalIds.add(signalId);
    }
  }
  return [...signalIds];
}

/**
 * @param {number} frames
 * @param {number} channels
 * @returns {Float32Array[]}
 */
function createChannels(frames, channels) {
  return Array.from({ length: channels }, () => new Float32Array(frames));
}

/**
 * @param {Float32Array[]} channels
 * @param {number} frame
 * @param {number} sample
 */
function setStereo(channels, frame, sample) {
  for (const channel of channels) {
    channel[frame] = sample;
  }
}

/**
 * @param {number} frame
 * @param {number} sampleRate
 * @param {number} startHz
 * @param {number} endHz
 * @param {number} durationSeconds
 * @returns {number}
 */
function logSweepPhase(frame, sampleRate, startHz, endHz, durationSeconds) {
  const t = frame / sampleRate;
  const ratio = endHz / startHz;
  const k = durationSeconds / Math.log(ratio);
  return twoPi * startHz * k * (Math.exp(t / k) - 1);
}

/**
 * @param {ProbeSignalDefinition} definition
 * @param {{ sampleRate?: number, channels?: number, seed?: number }} [options]
 * @returns {{ id?: string, sampleRate: number, channels: number, frames: number, channelData: Float32Array[] }}
 */
function generateProbeSignal(definition, options = {}) {
  const sampleRate = Math.max(8000, Number(options.sampleRate ?? 48000));
  const channels = Math.max(1, Math.floor(Number(options.channels ?? 2)));
  const seed = Number(options.seed ?? 732451);
  const durationSeconds = Math.max(0.05, Number(definition.durationSeconds ?? 1));
  const frames = Math.max(1, Math.round(durationSeconds * sampleRate));
  const channelData = createChannels(frames, channels);
  const generator = optionalString(definition.generator);
  const levelDb = Number(definition.levelDb ?? -18);
  const gain = dbToGain(levelDb);
  const noise = createPrng(seed + generator.length + frames);

  if (generator === "silence") {
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "impulse") {
    const amplitude = Number(definition.amplitude ?? 0.8);
    setStereo(channelData, Math.min(Math.round(0.1 * sampleRate), frames - 1), amplitude);
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "log-sweep" || generator === "phase-sweep") {
    const startHz = Math.max(1, Number(definition.startFrequencyHz ?? 20));
    const endHz = Math.min(sampleRate / 2 - 100, Number(definition.endFrequencyHz ?? 20000));
    for (let frame = 0; frame < frames; frame += 1) {
      const fadeIn = Math.min(1, frame / Math.max(1, Math.round(sampleRate * 0.025)));
      const fadeOut = Math.min(1, (frames - frame - 1) / Math.max(1, Math.round(sampleRate * 0.025)));
      const sample = Math.sin(logSweepPhase(frame, sampleRate, startHz, endHz, durationSeconds)) * gain * Math.min(fadeIn, fadeOut);
      const left = channelData[0];
      if (left) {
        left[frame] = sample;
      }
      for (let channel = 1; channel < channels; channel += 1) {
        const channelBuffer = channelData[channel];
        if (channelBuffer) {
          channelBuffer[frame] = generator === "phase-sweep" ? -sample : sample;
        }
      }
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "sine") {
    const frequency = Number(definition.frequencyHz ?? 1000);
    for (let frame = 0; frame < frames; frame += 1) {
      setStereo(channelData, frame, Math.sin(twoPi * frequency * frame / sampleRate) * gain);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "stepped-sine") {
    const frequency = Number(definition.frequencyHz ?? 1000);
    const levels = Array.isArray(definition.levelsDb) ? definition.levelsDb.map(Number).filter(Number.isFinite) : [-36, -24, -12, 0];
    const framesPerStep = Math.max(1, Math.floor(frames / levels.length));
    for (let frame = 0; frame < frames; frame += 1) {
      const level = levels[Math.min(levels.length - 1, Math.floor(frame / framesPerStep))] ?? -18;
      const sample = Math.sin(twoPi * frequency * frame / sampleRate) * dbToGain(level);
      setStereo(channelData, frame, sample);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "two-tone") {
    const frequencies = Array.isArray(definition.frequenciesHz) ? definition.frequenciesHz.map(Number).filter(Number.isFinite) : [60, 7000];
    for (let frame = 0; frame < frames; frame += 1) {
      let sample = 0;
      for (const frequency of frequencies) {
        sample += Math.sin(twoPi * frequency * frame / sampleRate);
      }
      setStereo(channelData, frame, sample * gain / Math.max(1, frequencies.length));
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "white-noise" || generator === "pink-noise") {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      const white = noise() * 2 - 1;
      let sample = white;
      if (generator === "pink-noise") {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        sample = (b0 + b1 + b2 + white * 0.1848) * 0.13;
      }
      setStereo(channelData, frame, sample);
    }
    normalizeRms(channelData, levelDb);
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "tone-burst") {
    const frequency = Number(definition.frequencyHz ?? 1000);
    const burstFrames = Math.max(1, Math.round(Number(definition.burstMilliseconds ?? 100) * sampleRate / 1000));
    const gapFrames = Math.max(1, Math.round(Number(definition.gapMilliseconds ?? 400) * sampleRate / 1000));
    const cycleFrames = burstFrames + gapFrames;
    for (let frame = 0; frame < frames; frame += 1) {
      const cycleFrame = frame % cycleFrames;
      if (cycleFrame >= burstFrames) {
        continue;
      }
      const edge = Math.min(cycleFrame, burstFrames - cycleFrame - 1);
      const envelope = Math.min(1, edge / Math.max(1, Math.round(sampleRate * 0.005)));
      setStereo(channelData, frame, Math.sin(twoPi * frequency * frame / sampleRate) * gain * envelope);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "transient-train") {
    const spacing = Math.max(1, Math.round(Number(definition.spacingMilliseconds ?? 250) * sampleRate / 1000));
    const amplitude = Number(definition.amplitude ?? 0.9);
    for (let frame = Math.round(0.15 * sampleRate); frame < frames; frame += spacing) {
      for (let offset = 0; offset < Math.min(32, frames - frame); offset += 1) {
        const value = amplitude * Math.exp(-offset / 6) * (offset % 2 ? -0.45 : 1);
        setStereo(channelData, frame + offset, value);
      }
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "gated-noise") {
    const burstFrames = Math.max(1, Math.round(Number(definition.burstMilliseconds ?? 300) * sampleRate / 1000));
    const gapFrames = Math.max(1, Math.round(Number(definition.gapMilliseconds ?? 900) * sampleRate / 1000));
    const cycleFrames = burstFrames + gapFrames;
    for (let frame = 0; frame < frames; frame += 1) {
      const cycleFrame = frame % cycleFrames;
      if (cycleFrame >= burstFrames) {
        continue;
      }
      const sample = (noise() * 2 - 1) * gain;
      setStereo(channelData, frame, sample);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "channel-isolation") {
    const frequency = Number(definition.frequencyHz ?? 997);
    const activeChannel = optionalString(definition.activeChannel) === "right" ? 1 : 0;
    const channelBuffer = channelData[Math.min(activeChannel, channels - 1)];
    for (let frame = 0; frame < frames; frame += 1) {
      if (channelBuffer) {
        channelBuffer[frame] = Math.sin(twoPi * frequency * frame / sampleRate) * gain;
      }
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "program-bed") {
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / sampleRate;
      const density = 0.5 + 0.5 * Math.sin(twoPi * 0.17 * t);
      const bass = Math.sin(twoPi * (70 + 16 * Math.sin(twoPi * 0.11 * t)) * t) * (0.65 + density * 0.2);
      const upper = Math.sin(twoPi * 1800 * t) * Math.sin(twoPi * 2.7 * t) * density;
      const transient = Math.exp(-((t * 2) % 1) * 20) * (noise() * 2 - 1) * 0.35;
      setStereo(channelData, frame, (bass * 0.55 + upper * 0.25 + transient) * gain);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "drum-bass-loop") {
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / sampleRate;
      const beat = (t * 2) % 1;
      const hatBeat = (t * 8) % 1;
      const kick = Math.sin(twoPi * (48 + 42 * Math.exp(-beat * 18)) * t) * Math.exp(-beat * 12);
      const snarePhase = ((t * 2 + 0.5) % 1);
      const snare = (noise() * 2 - 1) * Math.exp(-snarePhase * 20) * 0.45;
      const hat = (noise() * 2 - 1) * Math.exp(-hatBeat * 60) * 0.1;
      const note = [55, 65.41, 73.42, 49][Math.floor(t * 2) % 4] ?? 55;
      const bass = Math.sin(twoPi * note * t) * (0.35 + 0.2 * Math.sin(twoPi * 0.5 * t));
      setStereo(channelData, frame, (kick * 0.75 + snare + hat + bass) * gain);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "formant-phrase") {
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / sampleRate;
      const f0 = 125 + 18 * Math.sin(twoPi * 0.45 * t);
      const vowel = 0.5 + 0.5 * Math.sin(twoPi * 0.23 * t);
      const carrier = Math.sin(twoPi * f0 * t) + 0.45 * Math.sin(twoPi * f0 * 2 * t) + 0.25 * Math.sin(twoPi * f0 * 3 * t);
      const formant1 = Math.sin(twoPi * (650 + vowel * 250) * t) * 0.12;
      const formant2 = Math.sin(twoPi * (1200 + (1 - vowel) * 900) * t) * 0.08;
      const syllable = 0.35 + 0.65 * Math.max(0, Math.sin(twoPi * 1.6 * t));
      const sibilant = ((t * 3.2) % 1 > 0.78 ? noise() * 2 - 1 : 0) * 0.12;
      setStereo(channelData, frame, (carrier * 0.45 + formant1 + formant2 + sibilant) * syllable * gain);
    }
    return { sampleRate, channels, frames, channelData };
  }

  if (generator === "guitar-di") {
    const chordNotes = [
      [82.41, 123.47, 164.81, 246.94],
      [98, 146.83, 196, 293.66],
      [110, 164.81, 220, 329.63],
      [73.42, 110, 146.83, 220]
    ];
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / sampleRate;
      const chord = chordNotes[Math.floor(t * 1.5) % chordNotes.length] ?? chordNotes[0] ?? [];
      const local = (t * 1.5) % 1;
      let sample = 0;
      for (let index = 0; index < chord.length; index += 1) {
        const pluckDelay = index * 0.035;
        const age = Math.max(0, local - pluckDelay);
        const envelope = age > 0 ? Math.exp(-age * (2.5 + index * 0.25)) : 0;
        const note = chord[index] ?? 0;
        sample += Math.sin(twoPi * note * t) * envelope * (0.6 / (index + 1));
        sample += Math.sin(twoPi * note * 2.01 * t) * envelope * 0.11;
      }
      setStereo(channelData, frame, sample * gain);
    }
    return { sampleRate, channels, frames, channelData };
  }

  throw new Error(`Unsupported probe generator "${generator}".`);
}

/**
 * @param {string} wavPath
 * @param {{ sampleRate: number, channels: number, frames: number, channelData: Float32Array[] }} audio
 */
function writeFloat32Wav(wavPath, audio) {
  const { sampleRate, channels, frames, channelData } = audio;
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(wavFloatFormat, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(32, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      buffer.writeFloatLE(channelData[channel]?.[frame] ?? 0, offset);
      offset += bytesPerSample;
    }
  }

  fs.mkdirSync(path.dirname(wavPath), { recursive: true });
  fs.writeFileSync(wavPath, buffer);
}

/**
 * @param {string} wavPath
 * @returns {{ sampleRate: number, channels: number, frames: number, channelData: Float32Array[] }}
 */
function readWavAsFloat32(wavPath) {
  const buffer = fs.readFileSync(wavPath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`"${wavPath}" is not a RIFF/WAVE file.`);
  }

  let offset = 12;
  /** @type {{ audioFormat?: number, channels?: number, sampleRate?: number, bitsPerSample?: number, dataOffset?: number, dataBytes?: number }} */
  const metadata = {};

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkData = offset + 8;
    if (chunkId === "fmt ") {
      metadata.audioFormat = buffer.readUInt16LE(chunkData);
      metadata.channels = buffer.readUInt16LE(chunkData + 2);
      metadata.sampleRate = buffer.readUInt32LE(chunkData + 4);
      metadata.bitsPerSample = buffer.readUInt16LE(chunkData + 14);
    } else if (chunkId === "data") {
      metadata.dataOffset = chunkData;
      metadata.dataBytes = chunkSize;
    }
    offset = chunkData + chunkSize + (chunkSize % 2);
  }

  if (!metadata.channels || !metadata.sampleRate || metadata.dataOffset == null || !metadata.dataBytes) {
    throw new Error(`"${wavPath}" is missing required WAV metadata.`);
  }
  const channels = metadata.channels;
  const bytesPerSample = Math.max(1, Math.floor((metadata.bitsPerSample ?? 16) / 8));
  const frames = Math.floor(metadata.dataBytes / (channels * bytesPerSample));
  const channelData = createChannels(frames, channels);

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = metadata.dataOffset + (frame * channels + channel) * bytesPerSample;
      let sample = 0;
      if (metadata.audioFormat === wavFloatFormat && bytesPerSample === 4) {
        sample = buffer.readFloatLE(sampleOffset);
      } else if (metadata.audioFormat === 1 && bytesPerSample === 2) {
        sample = buffer.readInt16LE(sampleOffset) / 32768;
      } else if (metadata.audioFormat === 1 && bytesPerSample === 3) {
        const value = buffer.readIntLE(sampleOffset, 3);
        sample = value / 8388608;
      } else if (metadata.audioFormat === 1 && bytesPerSample === 4) {
        sample = buffer.readInt32LE(sampleOffset) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV format ${metadata.audioFormat}/${metadata.bitsPerSample} in "${wavPath}".`);
      }
      const channelBuffer = channelData[channel];
      if (channelBuffer) {
        channelBuffer[frame] = sample;
      }
    }
  }

  return {
    sampleRate: metadata.sampleRate,
    channels,
    frames,
    channelData
  };
}

/**
 * @param {ProbeSignalCorpus} corpus
 * @param {string} signalId
 * @returns {ProbeSignalDefinition}
 */
function probeSignalDefinition(corpus, signalId) {
  const signals = isPlainObject(corpus.signals) ? corpus.signals : {};
  const signal = signals[signalId];
  if (!isPlainObject(signal)) {
    throw new Error(`Unknown probe signal "${signalId}".`);
  }
  return /** @type {ProbeSignalDefinition} */ (signal);
}

/**
 * @param {{
 *   outputDir: string,
 *   corpus?: ProbeSignalCorpus,
 *   root?: string,
 *   primitiveIds?: string[],
 *   profileIds?: string[],
 *   signalIds?: string[],
 *   sampleRate?: number,
 *   channels?: number,
 *   seed?: number,
 *   limit?: number
 * }} options
 * @returns {ProbeSignalManifest}
 */
function createProbeSignalSet(options) {
  const corpus = options.corpus ?? loadProbeSignalCorpus({ root: options.root ?? root });
  const defaults = isPlainObject(corpus.defaults) ? corpus.defaults : {};
  const sampleRate = Math.max(8000, Number(options.sampleRate ?? defaults.sampleRate ?? 48000));
  const channels = Math.max(1, Math.floor(Number(options.channels ?? defaults.channels ?? 2)));
  const seed = Number(options.seed ?? defaults.seed ?? 732451);
  const outputDir = path.resolve(options.outputDir);
  const selectedIds = options.signalIds?.length
    ? options.signalIds
    : options.profileIds?.length
      ? resolveProbeSignalIdsForProfiles(corpus, options.profileIds)
      : resolveProbeSignalIdsForPrimitives(corpus, options.primitiveIds ?? []);
  const uniqueSignalIds = [...new Set(selectedIds)].slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
  /** @type {ProbeSignalManifestEntry[]} */
  const entries = [];

  fs.mkdirSync(outputDir, { recursive: true });

  for (const signalId of uniqueSignalIds) {
    const definition = probeSignalDefinition(corpus, signalId);
    const audio = generateProbeSignal(definition, { channels, sampleRate, seed: seed + entries.length * 17 });
    const relativePath = `${signalId}.wav`;
    const absolutePath = path.join(outputDir, relativePath);
    writeFloat32Wav(absolutePath, audio);
    entries.push({
      id: signalId,
      generator: optionalString(definition.generator),
      path: relativePath,
      sampleRate,
      channels,
      frames: audio.frames,
      durationSeconds: audio.frames / sampleRate,
      tags: stringList(definition.tags),
      analysisTargets: stringList(definition.analysisTargets),
      description: optionalString(definition.description)
    });
  }

  /** @type {ProbeSignalManifest} */
  const manifest = {
    id: "fwak-generated-probe-signal-set",
    corpusId: optionalString(corpus.id),
    corpusPath: defaultProbeCorpusRelativePath,
    generatedAt: new Date().toISOString(),
    outputDir,
    defaults: {
      sampleRate,
      channels,
      seed
    },
    primitiveIds: options.primitiveIds ?? [],
    profileIds: options.profileIds ?? [],
    signals: entries
  };

  writeFileAtomically(path.join(outputDir, "probe-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export {
  createProbeSignalSet,
  generateProbeSignal,
  loadProbeSignalCorpus,
  probeSignalCorpusPath,
  probeSignalDefinition,
  readWavAsFloat32,
  resolveProbeSignalIdsForPrimitives,
  resolveProbeSignalIdsForProfiles,
  writeFloat32Wav
};
