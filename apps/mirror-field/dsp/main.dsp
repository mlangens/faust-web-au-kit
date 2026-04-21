import("stdfaust.lib");

declare name "Mirror Field";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Modular synth with richer voice modes, filter voicing, motion states, drift, stereo spread, and reusable Northline instrument controls.";
declare license "MIT";
declare options "[midi:on][nvoices:8]";

clamp01(x) = min(1.0, max(0.0, x));
mix(a, b, t) = a * (1.0 - t) + b * t;
softdrive(amount, x) = mix(x, ma.tanh(x * (1.0 + amount * 5.4)), amount);
safeDb(x) = ba.linear2db(max(x, ma.EPSILON));

voiceMode = hslider("Voice Mode", 2.0, 0.0, 3.0, 1.0);
blend = hslider("Blend", 1.0, 0.0, 3.0, 1.0);
shape = hslider("Shape", 0.58, 0.0, 1.0, 0.01);
tone = hslider("Tone", 0.62, 0.0, 1.0, 0.01);
filterMode = hslider("Filter Mode", 1.0, 0.0, 2.0, 1.0);
contour = hslider("Contour", 0.54, 0.0, 1.0, 0.01);
motion = hslider("Motion", 2.0, 0.0, 3.0, 1.0);
modAmount = hslider("Mod Amount", 0.36, 0.0, 1.0, 0.01);
drift = hslider("Drift", 0.28, 0.0, 1.0, 0.01);
detune = hslider("Detune [unit:ct]", 9.0, 0.0, 36.0, 0.1);
sub = hslider("Sub [unit:%]", 22.0, 0.0, 100.0, 1.0);
drive = hslider("Drive [unit:dB]", 4.5, 0.0, 24.0, 0.1);
stereoWidth = hslider("Stereo Width [unit:%]", 72.0, 0.0, 100.0, 1.0);
attackMs = hslider("Attack [unit:ms][scale:log]", 8.0, 0.5, 800.0, 0.1);
releaseMs = hslider("Release [unit:ms][scale:log]", 420.0, 10.0, 5000.0, 1.0);
gate = button("gate");
freq = hslider("freq", 220.0, 20.0, 4000.0, 1.0);
gain = hslider("gain", 0.35, 0.0, 1.0, 0.001);

voiceMono = voiceMode == 0.0;
voiceDuo = voiceMode == 1.0;
voiceWide = voiceMode == 2.0;
voiceStack = voiceMode == 3.0;

blendSine = blend == 0.0;
blendTriangle = blend == 1.0;
blendSaw = blend == 2.0;
blendSquare = blend == 3.0;

filterSoft = filterMode == 0.0;
filterFocus = filterMode == 1.0;
filterGlass = filterMode == 2.0;

motionStill = motion == 0.0;
motionWander = motion == 1.0;
motionPulse = motion == 2.0;
motionOrbit = motion == 3.0;

attackSeconds = max(attackMs, 0.1) / 1000.0;
releaseSeconds = max(releaseMs, 1.0) / 1000.0;
subMix = sub / 100.0;
driveMix = clamp01(drive / 24.0);
width = stereoWidth / 100.0;
driftDepth = drift;
env = en.asr(attackSeconds, 1.0, releaseSeconds, gate);

motionRate =
  motionStill * 0.03 +
  motionWander * 0.17 +
  motionPulse * 0.48 +
  motionOrbit * 0.26;
motionLfoA = 0.5 + 0.5 * os.osc(motionRate + driftDepth * 0.04);
motionLfoB = 0.5 + 0.5 * os.osc(motionRate * 1.43 + 0.23 + driftDepth * 0.06);
motionPulseShape = clamp01((motionLfoA * 1.3 + motionLfoB * 0.2) - 0.25);
motionBlend =
  motionStill * 0.5 +
  motionWander * (motionLfoA * 0.72 + motionLfoB * 0.28) +
  motionPulse * motionPulseShape +
  motionOrbit * (motionLfoA * 0.45 + motionLfoB * 0.55);
motionDepth = 0.12 + modAmount * 0.88;
motionSignal = clamp01(motionBlend * motionDepth);

detuneRatio = detune * 0.0005776226504666211;
voiceSpread =
  voiceMono * 0.18 +
  voiceDuo * 0.42 +
  voiceWide * 0.82 +
  voiceStack * 1.18;
driftRatio = driftDepth * 0.0055;
leftFreq = freq * (1.0 - detuneRatio * width * voiceSpread - driftRatio * motionSignal);
rightFreq = freq * (1.0 + detuneRatio * width * voiceSpread + driftRatio * (1.0 - motionSignal));
subFreq = max(10.0, freq * 0.5);

filterBase =
  filterSoft * 0.82 +
  filterFocus * 1.0 +
  filterGlass * 1.18;
filterResBase =
  filterSoft * 0.72 +
  filterFocus * 1.0 +
  filterGlass * 1.12;
toneSweep = 220.0 + tone * 7600.0;
contourSweep = contour * 7600.0;
airLift =
  filterSoft * 0.035 +
  filterFocus * 0.060 +
  filterGlass * 0.105;

wavePick(freqIn) =
  os.osc(freqIn) * blendSine +
  os.triangle(freqIn) * blendTriangle +
  os.sawtooth(freqIn) * blendSaw +
  os.square(freqIn) * blendSquare;

oscStack(freqIn, altRatio) = primary + secondary + subLayer
with {
  primary = wavePick(freqIn) * (0.52 + shape * 0.24);
  secondary = wavePick(freqIn * altRatio) * (0.18 + shape * 0.16 + voiceStack * 0.14 + voiceDuo * 0.08);
  subLayer = os.sawtooth(subFreq * altRatio) * subMix * (0.20 + voiceMono * 0.06 + voiceWide * 0.04);
};

shapeTone(x) = mix(x, ma.tanh(x * (1.0 + shape * 3.2)), shape * 0.34);
voiceDrive(x) = softdrive(driveMix * (0.84 + voiceStack * 0.24), x);

filterVoice(x, cutoff, q) = filtered
with {
  lowTone = x : fi.lowpass(3, cutoff) : *(1.0 + q * 0.04);
  bandTone = x
    : fi.highpass(2, max(30.0, cutoff * 0.46))
    : fi.lowpass(2, min(18000.0, cutoff * (1.68 + q * 0.05)))
    : *(1.0 + q * 0.05);
  glassTone = (x : fi.lowpass(2, min(18000.0, cutoff * 1.12))) + (x : fi.highpass(1, cutoff * 1.1)) * airLift;
  filtered =
    lowTone * filterSoft +
    bandTone * filterFocus +
    glassTone * filterGlass;
};

voiceChannel(freqIn, altRatio, stereoBias) = out
with {
  raw = oscStack(freqIn, altRatio);
  shaped = raw : shapeTone : *(env * gain);
  contourMod = contourSweep * env * (0.42 + motionSignal * 0.66);
  motionCut = motionSignal * (2200.0 + driftDepth * 1200.0);
  cutoff = min(16000.0, max(120.0, toneSweep * filterBase + contourMod + motionCut + stereoBias * width * 420.0));
  q = max(0.5, 0.7 + shape * 1.2 + driveMix * 0.8 + motionSignal * 1.4) * filterResBase;
  filtered = filterVoice(shaped, cutoff, q);
  animated = filtered * (1.0 + (motionSignal - 0.5) * (0.12 + width * 0.08));
  out = animated : voiceDrive;
};

leftRaw = voiceChannel(leftFreq, 1.003 + voiceSpread * 0.002, -1.0);
rightRaw = voiceChannel(rightFreq, 0.997 - voiceSpread * 0.002, 1.0);
mid = (leftRaw + rightRaw) * 0.5;
side = (leftRaw - rightRaw) * 0.5 * (0.42 + width * (0.92 + voiceWide * 0.18 + voiceStack * 0.12));
leftOut = mid + side;
rightOut = mid - side;

voiceLevelView = abs : an.rms_envelope_rect(0.05) : safeDb : hbargraph("Voice Level", -72.0, 6.0);
filterBloomView = abs : an.rms_envelope_rect(0.06) : safeDb : hbargraph("Filter Bloom", -72.0, 6.0);
stereoSpreadView(sideIn, midIn) = spread : hbargraph("Stereo Spread", 0.0, 100.0)
with {
  sideEnv = sideIn : abs : an.rms_envelope_rect(0.08);
  midEnv = midIn : abs : an.rms_envelope_rect(0.08);
  spread = clamp01(sideEnv / max(ma.EPSILON, sideEnv + midEnv)) * 100.0;
};
outputPeakView = abs : an.rms_envelope_rect(0.03) : safeDb : hbargraph("Output Peak", -72.0, 6.0);

voiceSense = (leftRaw + rightRaw) * 0.5;
filterSense = ((leftRaw : fi.highpass(1, toneSweep)) + (rightRaw : fi.highpass(1, toneSweep))) * 0.5;
outputSense = (leftOut + rightOut) * 0.5;
telemetryLeft = attach(attach(leftOut, voiceLevelView(voiceSense)), filterBloomView(filterSense));
telemetryRight = attach(attach(rightOut, stereoSpreadView(side, mid)), outputPeakView(outputSense));
process = telemetryLeft, telemetryRight;
