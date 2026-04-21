function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readControlValue(state, key, fallback = 0) {
  return state.controls.get(key) ?? fallback;
}

function pickControlValue(state, keys, fallback = 0) {
  for (const key of keys) {
    if (state.controls.has(key)) {
      return state.controls.get(key);
    }
  }
  return fallback;
}

function normalizeUnitValue(value, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (Math.abs(numeric) <= 1 && max > 1) {
    return clamp(numeric, 0, 1);
  }
  return clamp(numeric / max, 0, 1);
}

function normalizeBipolarUnitValue(value, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  if (Math.abs(numeric) <= 1) {
    return clamp((numeric + 1) / 2, 0, 1);
  }
  return clamp((numeric + max) / (max * 2), 0, 1);
}

function normalizeFrequencyValue(value, min = 20, max = 20000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0 && numeric <= 1) {
    return clamp(numeric, 0, 1);
  }
  const safeMin = Math.max(min, 1);
  const safeMax = Math.max(max, safeMin + 1);
  return clamp(
    (Math.log10(Math.max(numeric, safeMin)) - Math.log10(safeMin)) / (Math.log10(safeMax) - Math.log10(safeMin)),
    0,
    1
  );
}

function averageNormalizedControlValue(state, schema) {
  if (!schema.controls?.length) {
    return 0.4;
  }

  const total = schema.controls.reduce((sum, control) => {
    const currentValue = state.controls.get(control.id) ?? state.controls.get(control.label) ?? control.init ?? 0;
    const range = Number(control.max) - Number(control.min);
    if (!Number.isFinite(range) || range === 0) {
      return sum;
    }
    return sum + clamp((Number(currentValue) - Number(control.min)) / range, 0, 1);
  }, 0);

  return total / schema.controls.length;
}

function buildLimiterLabSimulator() {
  return (state, id) => {
    const inputGain = readControlValue(state, "Input Gain", 0);
    const ceiling = readControlValue(state, "Ceiling", -1);
    const outputTrim = readControlValue(state, "Output Trim", 0);
    const vintage = readControlValue(state, "Vintage Response", 0);
    const bypass = readControlValue(state, "Bypass", 0);
    const tubeDrive = readControlValue(state, "Tube Drive", 0);
    const transformerTone = readControlValue(state, "Transformer Tone", 0);
    const driveTarget = readControlValue(state, "Drive Target", 0);
    const driveFocus = readControlValue(state, "Drive Focus", 0);
    const driveLowSplit = readControlValue(state, "Drive Low Split", 220);
    const driveHighSplit = readControlValue(state, "Drive High Split", 3000);
    const driveAmount = (tubeDrive + transformerTone) / 200;
    const focusMultiplier = [0.9, 0.65, 0.82, 1.0][Math.round(driveFocus)] ?? 0.9;
    const targetMultiplier = [1.0, 0.72, 0.78][Math.round(driveTarget)] ?? 1.0;
    const splitSpread = clamp((driveHighSplit - driveLowSplit) / 6000, 0.15, 1.5);
    const saturationBias = driveAmount * focusMultiplier * targetMultiplier * splitSpread;

    const inputPeakDb = clamp(-14 + inputGain + Math.sin(state.motionPhase * 1.1) * 5.5, -72, 6);
    const gainReductionDb = clamp(
      (inputGain - ceiling) * 0.55 + vintage * 1.8 + saturationBias * 7.0 - bypass * 4.0 + Math.sin(state.motionPhase * 0.8 + 0.9) * 1.4,
      0,
      24
    );
    const outputPeakDb = clamp(inputPeakDb - gainReductionDb + outputTrim + 0.8, -72, 6);

    switch (id) {
      case "inputPeak":
        return inputPeakDb;
      case "outputPeak":
        return outputPeakDb;
      case "gainReduction":
        return gainReductionDb;
      default:
        return outputPeakDb;
    }
  };
}

function buildPulsePadSimulator() {
  return (state, id) => {
    const texture = readControlValue(state, "Texture", 0.42);
    const tone = readControlValue(state, "Tone", 0.58);
    const contour = readControlValue(state, "Contour", 0.52);
    const motion = readControlValue(state, "Motion", 0.36);
    const detune = readControlValue(state, "Detune", 8.0);
    const sub = readControlValue(state, "Sub", 24.0);
    const driveDb = readControlValue(state, "Drive", 4.0);
    const stereoWidth = readControlValue(state, "Stereo Width", 0.78);

    const voiceBodyDb = clamp(
      -35 + tone * 16 + contour * 10 + texture * 6 + sub * 0.08 + driveDb * 0.32 + Math.sin(state.motionPhase * 0.8) * 2.4,
      -72,
      6
    );
    const motionBloomDb = clamp(
      -44 + motion * 20 + detune * 0.45 + stereoWidth * 12 + texture * 4 + Math.sin(state.motionPhase * 1.2 + 0.7) * 3.6,
      -72,
      6
    );
    const outputPeakDb = clamp(
      Math.max(voiceBodyDb + 6.5, motionBloomDb + 4.0) + driveDb * 0.14 - (1 - tone) * 3.5,
      -72,
      6
    );

    switch (id) {
      case "voiceBody":
        return voiceBodyDb;
      case "motionBloom":
        return motionBloomDb;
      case "outputPeak":
        return outputPeakDb;
      default:
        return outputPeakDb;
    }
  };
}

function buildEqFamilySimulator(schema) {
  return (state, id, meter) => {
    const inputGain = readControlValue(state, "Input Gain", 0);
    const outputTrim = readControlValue(state, "Output Trim", 0);
    const lowCut = readControlValue(state, "Low Cut", 90);
    const lowShelf = readControlValue(state, "Low Shelf", 0);
    const bellGain = readControlValue(state, "Bell Gain", 0);
    const presenceGain = readControlValue(state, "Presence Gain", 0);
    const highShelf = readControlValue(state, "High Shelf", 0);
    const guide = readControlValue(state, "Guide", readControlValue(state, "Match", 0));
    const dynamic = readControlValue(state, "Dynamic", 0);
    const tilt = readControlValue(state, "Tilt", readControlValue(state, "Tone", 0));
    const air = readControlValue(state, "Air", 0);
    const analyzer = readControlValue(state, "Analyzer", 1);
    const motion = Math.sin(state.motionPhase * 0.9 + schema.meters.findIndex((entry) => entry.id === id) * 0.6);
    const spectralBias = clamp((lowShelf * 0.45 + bellGain + presenceGain * 0.9 + highShelf + tilt * 0.5 + air * 0.04) / 24, -1.25, 1.25);
    const lowCutBias = clamp((Math.log10(Math.max(lowCut, 20)) - 1.3) / 1.7, 0, 1);
    const guideBias = clamp((guide / 100 || guide / 48) * 0.9 + (dynamic / 100 || dynamic / 48) * 0.45, 0, 1.2);

    const inputPeakDb = clamp(-16 + inputGain + motion * 4.2, -72, 6);
    const outputPeakDb = clamp(inputPeakDb + spectralBias * 5.5 + outputTrim - guideBias * 1.8, -72, 6);
    const analyzerLevelDb = clamp(-28 + analyzer * 9 + spectralBias * 12 - lowCutBias * 7 + motion * 5 + guideBias * 3, -72, 6);
    const guideLevelDb = clamp(-42 + guideBias * 30 + Math.abs(spectralBias) * 6 + motion * 4, -72, 6);

    if (meter.mode === "gr") {
      return clamp(meter.max * (0.05 + Math.abs(spectralBias) * 0.18) + motion * meter.max * 0.03, 0, meter.max);
    }
    if (id === "inputPeak") {
      return inputPeakDb;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    if (id.toLowerCase().includes("guide")) {
      return guideLevelDb;
    }
    if (id.toLowerCase().includes("analyzer") || id.toLowerCase().includes("spectrum")) {
      return analyzerLevelDb;
    }

    return clamp(-34 + spectralBias * 10 + analyzer * 8 + guideBias * 4 + motion * 4.5, -72, 6);
  };
}

function buildSpaceFamilySimulator(schema) {
  return (state, id, meter) => {
    const size = readControlValue(state, "Size", readControlValue(state, "Space", 0.58));
    const character = readControlValue(state, "Character", 1);
    const decay = readControlValue(state, "Decay", 2.4);
    const preDelay = readControlValue(state, "Pre-Delay", readControlValue(state, "Predelay", 24));
    const diffusion = readControlValue(state, "Diffusion", 0.55);
    const brightness = readControlValue(state, "Brightness", readControlValue(state, "Tone", readControlValue(state, "High Cut", 0.5)));
    const width = readControlValue(state, "Width", 55);
    const bloom = readControlValue(state, "Bloom", 40);
    const mix = readControlValue(state, "Mix", 40);
    const ducking = readControlValue(state, "Ducking", 0);
    const motion = Math.sin(state.motionPhase * 0.78 + schema.meters.findIndex((entry) => entry.id === id) * 0.66);
    const sizeBias = size > 1 ? size / 100 : size;
    const brightnessBias = brightness > 1000
      ? clamp((Math.log10(Math.max(brightness, 1200)) - 3.0) / 1.2, 0, 1)
      : clamp(brightness / 100 || brightness, 0, 1);
    const wetBias = clamp((mix / 100) * 0.42 + sizeBias * 0.2 + (diffusion / 100 || diffusion) * 0.16 + (bloom / 100 || bloom) * 0.18 + Number(character) * 0.03, 0, 1.25);
    const spreadPct = clamp((width / 100 || width) * 70 + wetBias * 18 + motion * 6, 0, meter?.unit === "%" ? meter.max : 100);

    const inputPeakDb = clamp(-20 + motion * 4.5 + brightnessBias * 2.5, -72, 6);
    const earlyEnergyDb = clamp(-34 + wetBias * 18 + preDelay * 0.05 + motion * 4.2, -72, 6);
    const tailEnergyDb = clamp(-30 + wetBias * 25 + decay * 1.8 + preDelay * 0.03 - ducking * 0.06 + motion * 4.8, -72, 6);
    const duckReductionDb = clamp((ducking / 100 || ducking) * 18 + wetBias * 3 + Math.max(0, motion) * 2.5, 0, 24);
    const outputPeakDb = clamp(inputPeakDb + wetBias * 6 - duckReductionDb * 0.1 + motion * 2.5, -72, 6);

    if (id === "inputPeak") {
      return inputPeakDb;
    }
    if (meter?.mode === "gr" || id.toLowerCase().includes("duck")) {
      return duckReductionDb;
    }
    if (meter?.unit === "%" || id.toLowerCase().includes("spread") || id.toLowerCase().includes("width")) {
      return spreadPct;
    }
    if (id.toLowerCase().includes("early")) {
      return earlyEnergyDb;
    }
    if (id.toLowerCase().includes("tail") || id.toLowerCase().includes("decay") || id.toLowerCase().includes("space") || id.toLowerCase().includes("field")) {
      return tailEnergyDb;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    return outputPeakDb;
  };
}

function buildCreativeFamilySimulator(schema) {
  return (state, id, meter) => {
    const inputGain = pickControlValue(state, ["Input Gain"], 0);
    const lowDrive = pickControlValue(state, ["Low Drive", "Drive"], 18);
    const midDrive = pickControlValue(state, ["Mid Drive", "Drive"], lowDrive + 6);
    const highDrive = pickControlValue(state, ["High Drive", "Drive"], midDrive + 4);
    const feedback = pickControlValue(state, ["Feedback"], 35);
    const smear = pickControlValue(state, ["Smear"], 32);
    const age = pickControlValue(state, ["Age"], 26);
    const tone = pickControlValue(state, ["Tone", "Low Tone"], 0.5);
    const dynamics = pickControlValue(state, ["Dynamics"], 42);
    const glue = pickControlValue(state, ["Glue"], 24);
    const width = pickControlValue(state, ["Width", "Stereo Width"], 64);
    const mix = pickControlValue(state, ["Mix"], 45);
    const output = pickControlValue(state, ["Output", "Output Trim"], 0);
    const modDepth = pickControlValue(state, ["Mod Depth", "Mod Amount", "LFO Depth"], 0.35);
    const modRate = pickControlValue(state, ["Mod Rate", "LFO Rate"], 0.3);
    const flutter = pickControlValue(state, ["Flutter"], 18);
    const freeze = pickControlValue(state, ["Freeze"], 0);
    const lowTone = pickControlValue(state, ["Low Tone", "Tone"], tone);
    const midTone = pickControlValue(state, ["Mid Tone", "Tone"], tone);
    const highTone = pickControlValue(state, ["High Tone", "Tone"], tone);
    const lowBias = pickControlValue(state, ["Low Bias"], 0);
    const midBias = pickControlValue(state, ["Mid Bias"], 0);
    const highBias = pickControlValue(state, ["High Bias"], 0);

    const driveNorm = clamp((lowDrive + midDrive + highDrive) / (24 * 3), 0, 1.6);
    const feedbackNorm = normalizeUnitValue(feedback, 100);
    const smearNorm = normalizeUnitValue(smear, 100);
    const ageNorm = normalizeUnitValue(age, 100);
    const widthNorm = normalizeUnitValue(width, 100);
    const mixNorm = normalizeUnitValue(mix, 100);
    const toneNorm = clamp(
      normalizeUnitValue(lowTone, 100) * 0.3 + normalizeUnitValue(midTone, 100) * 0.35 + normalizeUnitValue(highTone, 100) * 0.35,
      0,
      1
    );
    const biasNorm = clamp(
      normalizeBipolarUnitValue(lowBias, 100) * 0.3 +
        normalizeBipolarUnitValue(midBias, 100) * 0.35 +
        normalizeBipolarUnitValue(highBias, 100) * 0.35,
      0,
      1
    );
    const motionAmount = clamp(
      normalizeUnitValue(modDepth, 100) * 0.55 +
        normalizeUnitValue(modRate, 2) * 0.15 +
        normalizeUnitValue(flutter, 100) * 0.2 +
        ageNorm * 0.1,
      0,
      1.25
    );
    const glueNorm = normalizeUnitValue(glue, 100);
    const dynamicsNorm = normalizeUnitValue(dynamics, 100);
    const freezeNorm = normalizeUnitValue(freeze, 100);
    const creativeEnergy = clamp(
      driveNorm * 0.34 +
        feedbackNorm * 0.16 +
        smearNorm * 0.1 +
        toneNorm * 0.08 +
        biasNorm * 0.08 +
        motionAmount * 0.12 +
        mixNorm * 0.12,
      0,
      1.5
    );
    const lane = schema.meters.findIndex((entry) => entry.id === id);
    const motion = Math.sin(state.motionPhase * (0.9 + lane * 0.18) + lane * 0.45 + motionAmount * 0.9);
    const inputPeakDb = clamp(-24 + inputGain + creativeEnergy * 13 + motion * 3.5, -72, 6);
    const echoDriveDb = clamp(inputPeakDb + feedbackNorm * 11 + toneNorm * 5 + ageNorm * 3.5 + motion * 2.5, -72, 6);
    const diffuseTailDb = clamp(-42 + creativeEnergy * 24 + smearNorm * 12 + feedbackNorm * 10 + freezeNorm * 14 + motion * 4.2, -72, 6);
    const glueReductionDb = clamp(glueNorm * 13 + dynamicsNorm * 6 + creativeEnergy * 4 + Math.max(0, motion) * 2.4, 0, meter?.max || 24);
    const stereoSpreadPct = clamp(widthNorm * 70 + motionAmount * 18 + feedbackNorm * 8 + motion * 5.5, 0, meter?.max || 100);
    const lowHeatPct = clamp(normalizeUnitValue(lowDrive, 100) * 88 + normalizeUnitValue(lowTone, 100) * 8 + motion * 4, 0, 100);
    const midHeatPct = clamp(normalizeUnitValue(midDrive, 100) * 90 + normalizeUnitValue(midTone, 100) * 8 + motion * 5, 0, 100);
    const highHeatPct = clamp(normalizeUnitValue(highDrive, 100) * 92 + normalizeUnitValue(highTone, 100) * 8 + motion * 6, 0, 100);
    const motionPct = clamp(motionAmount * 78 + flutter * 0.35 + Math.abs(motion) * 14, 0, meter?.max || 100);
    const freezeHoldPct = clamp(freezeNorm * 88 + feedbackNorm * 9 + Math.max(0, motion) * 6, 0, meter?.max || 100);
    const outputPeakDb = clamp(
      Math.max(inputPeakDb + creativeEnergy * 4.8, diffuseTailDb + mixNorm * 0.16) - glueReductionDb * 0.08 + output,
      -72,
      6
    );

    if (id === "inputPeak") {
      return inputPeakDb;
    }
    if (meter.mode === "gr" || id.toLowerCase().includes("reduction")) {
      return glueReductionDb;
    }
    if (id === "lowHeat") {
      return lowHeatPct;
    }
    if (id === "midHeat") {
      return midHeatPct;
    }
    if (id === "highHeat") {
      return highHeatPct;
    }
    if (id.toLowerCase().includes("motion")) {
      return motionPct;
    }
    if (id.toLowerCase().includes("spread") || id.toLowerCase().includes("width")) {
      return stereoSpreadPct;
    }
    if (id.toLowerCase().includes("hold")) {
      return freezeHoldPct;
    }
    if (id.toLowerCase().includes("tail")) {
      return diffuseTailDb;
    }
    if (id.toLowerCase().includes("echo")) {
      return echoDriveDb;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    return clamp(-42 + creativeEnergy * 34 + motion * 5.4, -72, 6);
  };
}

function buildFilterFamilySimulator(schema) {
  return (state, id, meter) => {
    const cutoff = pickControlValue(state, ["Cutoff", "Filter A Cutoff", "Frequency"], 800);
    const resonance = pickControlValue(state, ["Resonance", "Filter A Resonance"], 0.5);
    const drive = pickControlValue(state, ["Drive"], 0);
    const env = pickControlValue(state, ["Env Amount", "Envelope", "Follow"], 0.4);
    const envSpeed = pickControlValue(state, ["Env Speed"], 48);
    const lfoDepth = pickControlValue(state, ["LFO Depth"], 0.3);
    const lfoRate = pickControlValue(state, ["LFO Rate"], 0.25);
    const spread = pickControlValue(state, ["Filter Spread"], 0);
    const motionBias = pickControlValue(state, ["Motion Bias"], 0);
    const stereoLink = pickControlValue(state, ["Stereo Link"], 100);
    const mix = pickControlValue(state, ["Mix"], 100);
    const output = pickControlValue(state, ["Output", "Output Trim"], 0);
    const lane = schema.meters.findIndex((entry) => entry.id === id);
    const cutoffBias = normalizeFrequencyValue(cutoff, 20, 16000);
    const resonanceBias = resonance > 1 ? clamp(Number(resonance) / 100, 0, 1) : clamp(Number(resonance), 0, 1);
    const driveBias = normalizeUnitValue(drive, 24);
    const envBias = normalizeUnitValue(env, 100);
    const envSpeedBias = normalizeUnitValue(envSpeed, 100);
    const lfoDepthBias = normalizeUnitValue(lfoDepth, 100);
    const lfoRateBias = normalizeUnitValue(lfoRate, 2);
    const spreadBias = normalizeBipolarUnitValue(spread, 100);
    const motionBiasNorm = normalizeBipolarUnitValue(motionBias, 100);
    const stereoLinkBias = normalizeUnitValue(stereoLink, 100);
    const mixBias = normalizeUnitValue(mix, 100);
    const energy = clamp(
      cutoffBias * 0.2 +
        resonanceBias * 0.2 +
        driveBias * 0.18 +
        envBias * 0.12 +
        envSpeedBias * 0.05 +
        lfoDepthBias * 0.11 +
        lfoRateBias * 0.04 +
        mixBias * 0.1,
      0,
      1.35
    );
    const motion = Math.sin(state.motionPhase * (0.88 + lane * 0.15) + lane * 0.5);
    const inputPeakDb = clamp(-28 + energy * 12 + motion * 3.8, -72, 6);
    const motionDepthPct = clamp((envBias * 0.4 + lfoDepthBias * 0.45 + lfoRateBias * 0.05 + Math.abs(motionBiasNorm - 0.5) * 0.2) * 100 + motion * 6, 0, 100);
    const driveHeatDb = clamp(-38 + driveBias * 24 + resonanceBias * 10 + motion * 4.4, -72, 6);
    const stereoSpreadPct = clamp((1 - stereoLinkBias) * 34 + spreadBias * 48 + mixBias * 12 + Math.abs(motion) * 10, 0, meter?.max || 100);
    const outputPeakDb = clamp(inputPeakDb + driveBias * 6 + mixBias * 3 - resonanceBias * 2 + output + motion * 2.2, -72, 6);

    if (id === "inputPeak") {
      return inputPeakDb;
    }
    if (id.toLowerCase().includes("motion")) {
      return motionDepthPct;
    }
    if (id.toLowerCase().includes("spread") || id.toLowerCase().includes("width")) {
      return stereoSpreadPct;
    }
    if (id.toLowerCase().includes("heat") || id.toLowerCase().includes("drive")) {
      return driveHeatDb;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    return clamp(-45 + energy * 36 + motion * 5, -72, 6);
  };
}

function buildDynamicsFamilySimulator(schema) {
  return (state, id, meter) => {
    const motion = Math.sin(state.motionPhase * 0.95 + schema.meters.findIndex((entry) => entry.id === id) * 0.7);
    const energy = averageNormalizedControlValue(state, schema);
    const inputGain = pickControlValue(state, ["Input Gain"], 0);
    const drive = pickControlValue(state, ["Drive"], 0);
    const threshold = pickControlValue(state, ["Threshold", "Ceiling"], -18);
    const ratio = pickControlValue(state, ["Ratio"], 4);
    const range = pickControlValue(state, ["Range"], 18);
    const floor = pickControlValue(state, ["Floor"], -40);
    const detectorFocus = pickControlValue(state, ["Detector Focus", "Detection Focus"], 0);
    const detectorTilt = pickControlValue(state, ["Detector Tilt"], 0);
    const sensitivity = pickControlValue(state, ["Sensitivity"], 50);
    const centerFrequency = pickControlValue(state, ["Center Frequency"], 6400);
    const focusWidth = pickControlValue(state, ["Focus Width"], 50);
    const stereoLink = pickControlValue(state, ["Stereo Link"], 100);
    const bandLink = pickControlValue(state, ["Band Link"], 0);
    const lowGuard = pickControlValue(state, ["Low Guard"], 36);
    const ceilingShape = pickControlValue(state, ["Ceiling Shape"], 28);
    const splitDepth = pickControlValue(state, ["Split Depth"], 80);
    const hysteresis = pickControlValue(state, ["Hysteresis"], 0);
    const mix = pickControlValue(state, ["Mix"], 100);
    const output = pickControlValue(state, ["Output", "Output Trim"], 0);
    const transient = pickControlValue(state, ["Transient", "Transient Preserve"], 0);
    const lowCrossover = pickControlValue(state, ["Low Crossover"], 180);
    const highCrossover = pickControlValue(state, ["High Crossover"], 2800);
    const lowThreshold = pickControlValue(state, ["Low Threshold"], threshold);
    const midThreshold = pickControlValue(state, ["Mid Threshold"], threshold);
    const highThreshold = pickControlValue(state, ["High Threshold"], threshold);
    const lowAmount = pickControlValue(state, ["Low Amount"], 40);
    const midAmount = pickControlValue(state, ["Mid Amount"], 45);
    const highAmount = pickControlValue(state, ["High Amount"], 38);
    const lowLift = pickControlValue(state, ["Low Lift"], 0);
    const midLift = pickControlValue(state, ["Mid Lift"], 0);
    const highLift = pickControlValue(state, ["High Lift"], 0);

    const thresholdBias = clamp(Math.abs(Number(threshold)) / 60, 0, 1);
    const rangeBias = normalizeUnitValue(range, 60);
    const ratioBias = normalizeUnitValue(ratio, 20);
    const detectorBias = clamp(
      normalizeUnitValue(Math.abs(detectorTilt), 100) * 0.18 +
        Number(detectorFocus) * 0.08 +
        normalizeUnitValue(transient, 100) * 0.16 +
        normalizeUnitValue(sensitivity, 100) * 0.12,
      0,
      0.7
    );
    const gainReductionDb = clamp(
      (inputGain + drive * 0.5) * 0.35 +
        thresholdBias * 10 +
        (ratio - 1) * 0.9 +
        rangeBias * 14 +
        detectorBias * 11 +
        Math.max(0, motion) * 2.2,
      0,
      meter.mode === "gr" ? meter.max : 30
    );
    const inputPeakDb = clamp(-26 + inputGain + drive * 0.45 + energy * 20 + motion * 4.5, -72, 6);
    const detectorDriveDb = clamp(
      inputPeakDb + detectorBias * 12 + thresholdBias * 5 + normalizeUnitValue(centerFrequency, 12000) * 2,
      -72,
      6
    );
    const ceilingActivityDb = clamp(
      detectorDriveDb - gainReductionDb * 0.3 + normalizeUnitValue(ceilingShape, 100) * 8 - normalizeUnitValue(lowGuard, 100) * 4 + motion * 2,
      -72,
      6
    );
    const focusEnergyDb = clamp(
      -42 +
        normalizeFrequencyValue(centerFrequency, 1000, 16000) * 20 +
        normalizeUnitValue(focusWidth, 100) * 9 +
        normalizeUnitValue(splitDepth, 100) * 4 +
        motion * 4,
      -72,
      6
    );
    const closureDepthPct = clamp(
      rangeBias * 64 +
        clamp(Math.abs(Number(floor)) / 60, 0, 1) * 18 +
        normalizeUnitValue(hysteresis, 24) * 12 +
        Math.max(0, motion) * 8,
      0,
      100
    );
    const lowEnergyDb = clamp(
      -40 +
        normalizeFrequencyValue(lowCrossover, 40, 1000) * 15 +
        normalizeUnitValue(lowLift, 24) * 12 +
        normalizeUnitValue(lowAmount, 100) * 8 +
        motion * 3,
      -72,
      6
    );
    const midEnergyDb = clamp(
      -38 +
        normalizeFrequencyValue(highCrossover, 800, 12000) * 10 +
        normalizeUnitValue(midLift, 24) * 12 +
        normalizeUnitValue(midAmount, 100) * 8 +
        Math.sin(state.motionPhase * 1.2 + 0.45) * 3.5,
      -72,
      6
    );
    const highEnergyDb = clamp(
      -41 +
        normalizeFrequencyValue(highCrossover, 1200, 16000) * 18 +
        normalizeUnitValue(highLift, 24) * 12 +
        normalizeUnitValue(highAmount, 100) * 8 +
        Math.sin(state.motionPhase * 1.3 + 1.1) * 3,
      -72,
      6
    );
    const lowReductionDb = clamp(
      thresholdBias * 8 + normalizeUnitValue(lowAmount, 100) * 12 + normalizeUnitValue(Math.abs(lowThreshold), 60) * 6 + Math.max(0, motion) * 2,
      0,
      meter.mode === "gr" ? meter.max : 30
    );
    const midReductionDb = clamp(
      thresholdBias * 8 + normalizeUnitValue(midAmount, 100) * 12 + normalizeUnitValue(Math.abs(midThreshold), 60) * 6 + Math.max(0, Math.sin(state.motionPhase * 1.1)) * 2,
      0,
      meter.mode === "gr" ? meter.max : 30
    );
    const highReductionDb = clamp(
      thresholdBias * 8 + normalizeUnitValue(highAmount, 100) * 12 + normalizeUnitValue(Math.abs(highThreshold), 60) * 6 + Math.max(0, Math.sin(state.motionPhase * 1.2 + 0.9)) * 2,
      0,
      meter.mode === "gr" ? meter.max : 30
    );
    const outputPeakDb = clamp(inputPeakDb - gainReductionDb * (mix / 100) + output + motion * 2.8, -72, 6);

    if (meter.mode === "gr") {
      if (id.startsWith("low")) {
        return clamp(lowReductionDb, 0, meter.max);
      }
      if (id.startsWith("mid")) {
        return clamp(midReductionDb, 0, meter.max);
      }
      if (id.startsWith("high")) {
        return clamp(highReductionDb, 0, meter.max);
      }
      return clamp(gainReductionDb, 0, meter.max);
    }
    if (id === "inputPeak") {
      return inputPeakDb;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    if (id.toLowerCase().includes("detector")) {
      return detectorDriveDb;
    }
    if (id.toLowerCase().includes("ceiling")) {
      return ceilingActivityDb;
    }
    if (id.toLowerCase().includes("focus")) {
      return focusEnergyDb;
    }
    if (id.toLowerCase().includes("closure")) {
      return closureDepthPct;
    }
    if (id === "lowEnergy") {
      return lowEnergyDb;
    }
    if (id === "midEnergy") {
      return midEnergyDb;
    }
    if (id === "highEnergy") {
      return highEnergyDb;
    }

    return clamp(-50 + energy * 44 + motion * 4.5, -72, 6);
  };
}

function buildInstrumentFamilySimulator(schema) {
  return (state, id, meter) => {
    const voiceIndex = schema.meters.findIndex((entry) => entry.id === id);
    const voiceMode = pickControlValue(state, ["Voice Mode"], 1);
    const blend = pickControlValue(state, ["Blend"], 1);
    const shape = pickControlValue(state, ["Shape"], 0.5);
    const tone = pickControlValue(state, ["Tone"], 0.5);
    const filterMode = pickControlValue(state, ["Filter Mode"], 1);
    const contour = pickControlValue(state, ["Contour"], 0.5);
    const motionMode = pickControlValue(state, ["Motion"], 1);
    const modAmount = pickControlValue(state, ["Mod Amount"], 0.35);
    const drift = pickControlValue(state, ["Drift"], 0.2);
    const detune = pickControlValue(state, ["Detune"], 8);
    const sub = pickControlValue(state, ["Sub"], 24);
    const drive = pickControlValue(state, ["Drive"], 4);
    const stereoWidth = pickControlValue(state, ["Stereo Width", "Width"], 0.7);
    const release = pickControlValue(state, ["Release"], 180);
    const energy = clamp(
      normalizeUnitValue(Number(blend), 3) * 0.12 +
        normalizeUnitValue(shape, 1) * 0.1 +
        normalizeUnitValue(tone, 1) * 0.1 +
        normalizeUnitValue(Number(filterMode), 2) * 0.08 +
        normalizeUnitValue(contour, 1) * 0.08 +
        normalizeUnitValue(Number(motionMode), 3) * 0.08 +
        normalizeUnitValue(modAmount, 1) * 0.12 +
        normalizeUnitValue(drift, 1) * 0.08 +
        normalizeUnitValue(detune, 24) * 0.08 +
        normalizeUnitValue(sub, 100) * 0.08 +
        normalizeUnitValue(drive, 18) * 0.08,
      0,
      1.4
    );
    const motion = Math.sin(state.motionPhase * (0.85 + voiceIndex * 0.2) + voiceIndex * 0.45);
    const voiceLevelDb = clamp(
      -40 + energy * 24 + normalizeUnitValue(Number(voiceMode), 3) * 8 + normalizeUnitValue(sub, 100) * 7 + motion * 4.2,
      -72,
      6
    );
    const filterBloomDb = clamp(
      -44 + normalizeUnitValue(tone, 1) * 12 + normalizeUnitValue(contour, 1) * 10 + normalizeUnitValue(drive, 18) * 9 + motion * 4.5,
      -72,
      6
    );
    const stereoSpreadPct = clamp(
      normalizeUnitValue(stereoWidth, 1) * 76 +
        normalizeUnitValue(detune, 24) * 12 +
        normalizeUnitValue(drift, 1) * 8 +
        Math.abs(motion) * 10,
      0,
      meter?.max || 100
    );
    const outputPeakDb = clamp(
      Math.max(voiceLevelDb + normalizeUnitValue(release, 800) * 4, filterBloomDb + 2) - normalizeUnitValue(drive, 18) * 2,
      -72,
      6
    );

    if (id === "voiceLevel") {
      return voiceLevelDb;
    }
    if (id.toLowerCase().includes("filter") || id.toLowerCase().includes("bloom")) {
      return filterBloomDb;
    }
    if (id.toLowerCase().includes("spread") || id.toLowerCase().includes("width")) {
      return stereoSpreadPct;
    }
    if (id === "outputPeak") {
      return outputPeakDb;
    }
    return clamp(-46 + energy * 36 + motion * 5.5, -72, 6);
  };
}

function buildDefaultSimulator(schema) {
  return (state, id, meter) => {
    const lane = schema.meters.findIndex((entry) => entry.id === id);
    const energy = averageNormalizedControlValue(state, schema);
    const motion = Math.sin(state.motionPhase * 0.9 + lane * 0.55);

    if (meter.mode === "gr") {
      return clamp(meter.max * (0.18 + energy * 0.28) + motion * meter.max * 0.05, 0, meter.max);
    }
    if (meter.unit === "%") {
      return clamp(meter.max * (0.24 + energy * 0.36) + Math.abs(motion) * meter.max * 0.08, 0, meter.max);
    }

    return clamp(-54 + energy * 42 + motion * 4, -72, 6);
  };
}

function normalizeSimulatorId(schema) {
  const rawId = String(schema.ui?.simulator?.id || schema.project?.key || schema.ui?.family || "default").toLowerCase();

  if (rawId === "limiterlab" || rawId === "limiter-lab") {
    return "limiter-lab";
  }
  if (rawId === "pulsepad" || rawId === "pulse-pad") {
    return "pulse-pad";
  }
  if (rawId === "eq" || rawId === "equalizer" || rawId === "spectral-eq") {
    return "eq";
  }
  if (rawId === "space" || rawId === "reverb") {
    return "space";
  }
  if (rawId === "creative" || rawId === "creative-effect" || rawId === "delay") {
    return "creative";
  }
  if (rawId === "filter" || rawId === "utility-effect") {
    return "filter";
  }
  if (rawId === "dynamics") {
    return "dynamics";
  }
  if (rawId === "instrument" || rawId === "synth" || rawId === "synthesizer") {
    return "instrument";
  }
  if (rawId === "utility" || rawId === "default") {
    return "default";
  }

  if (schema.project?.key === "limiter-lab") {
    return "limiter-lab";
  }
  if (schema.project?.key === "pulse-pad") {
    return "pulse-pad";
  }
  if (schema.ui?.variant === "spectral-eq") {
    return "eq";
  }
  if (schema.ui?.group === "space") {
    return "space";
  }
  if (schema.ui?.group === "creative-effect") {
    return "creative";
  }
  if (schema.ui?.group === "utility-effect") {
    return "filter";
  }
  if (schema.ui?.group === "mix" || schema.ui?.group === "mastering" || schema.ui?.themeGroup === "dynamics") {
    return "dynamics";
  }
  if (schema.ui?.group === "instrument" || schema.ui?.themeGroup === "instrument") {
    return "instrument";
  }

  return "default";
}

function createSimulator(schema) {
  const simulatorId = normalizeSimulatorId(schema);
  const factories = {
    "limiter-lab": buildLimiterLabSimulator,
    "pulse-pad": buildPulsePadSimulator,
    eq: () => buildEqFamilySimulator(schema),
    space: () => buildSpaceFamilySimulator(schema),
    creative: () => buildCreativeFamilySimulator(schema),
    filter: () => buildFilterFamilySimulator(schema),
    dynamics: () => buildDynamicsFamilySimulator(schema),
    instrument: () => buildInstrumentFamilySimulator(schema),
    default: () => buildDefaultSimulator(schema)
  };

  return {
    id: simulatorId,
    measure: (factories[simulatorId] || factories.default)()
  };
}

function setMeter(fill, label, rawValue, meter) {
  const unit = meter.unit || "dB";
  const percent = meter.mode === "gr"
    ? clamp(rawValue / meter.max, 0, 1) * 100
    : unit === "%"
      ? clamp(rawValue / meter.max, 0, 1) * 100
      : clamp((rawValue + 72) / meter.max, 0, 1) * 100;
  fill.style.width = `${percent}%`;
  label.textContent = `${Number(rawValue).toFixed(1)} ${unit}`;
}

export { createSimulator, setMeter };
