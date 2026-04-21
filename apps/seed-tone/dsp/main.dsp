import("stdfaust.lib");

declare name "Seed Tone";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "Simple synth scaffold with one primary oscillator, cutoff/resonance shaping, color/sub/noise layers, motion LFO, drive, and envelope control.";
declare license "MIT";
declare options "[midi:on][nvoices:8]";

mix(a, b, t) = a * (1.0 - t) + b * t;
clamp01(x) = min(1.0, max(0.0, x));
db2lin(x) = ba.db2linear(x);
softclip(amount, x) = mix(x, ma.tanh(x * (1.0 + amount * 4.5)), amount);

wave = hslider("Wave", 0.0, 0.0, 3.0, 1.0);
cutoffHz = hslider("Cutoff [unit:Hz][scale:log]", 1200.0, 60.0, 18000.0, 1.0);
resonancePct = hslider("Resonance [unit:%]", 30.0, 0.0, 100.0, 1.0);
color = hslider("Color", 0.53, 0.0, 1.0, 0.01);
subPct = hslider("Sub [unit:%]", 20.0, 0.0, 100.0, 1.0);
noisePct = hslider("Noise [unit:%]", 8.0, 0.0, 100.0, 1.0);
motion = hslider("Motion", 0.34, 0.0, 1.0, 0.01);
driveDb = hslider("Drive [unit:dB]", 2.0, 0.0, 18.0, 0.1);
stereoWidth = hslider("Stereo Width", 0.58, 0.0, 1.0, 0.01);
attackMs = hslider("Attack [unit:ms][scale:log]", 12.0, 0.5, 800.0, 0.1);
releaseMs = hslider("Release [unit:ms][scale:log]", 340.0, 10.0, 5000.0, 1.0);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);
gate = button("gate");
freq = hslider("freq", 220.0, 20.0, 5000.0, 1.0);
gain = hslider("gain", 0.28, 0.0, 1.0, 0.001);

attackSeconds = max(attackMs, 0.1) / 1000.0;
releaseSeconds = max(releaseMs, 1.0) / 1000.0;
env = en.asr(attackSeconds, 1.0, releaseSeconds, gate);
motionLfo = 0.5 + 0.5 * os.osc(0.06 + motion * 0.62);
motionAlt = 0.5 + 0.5 * os.osc(0.11 + motion * 0.29);
motionAmount = clamp01((motionLfo * 0.68 + motionAlt * 0.32) * motion);
driveAmount = clamp01(driveDb / 18.0);
subAmount = subPct / 100.0;
noiseAmount = noisePct / 100.0;
outputGain = db2lin(outputTrimDb);
detuneRatio = stereoWidth * (0.00035 + motionAmount * 0.00025);
leftFreq = freq * (1.0 - detuneRatio);
rightFreq = freq * (1.0 + detuneRatio);
dynamicCutoff = min(18000.0, max(60.0, cutoffHz * (0.76 + color * 0.78 + motionAmount * 0.42)));
dynamicRes = clamp01(resonancePct / 100.0) * (0.85 + motionAmount * 0.45);
driveGain = 1.0 + driveAmount * 6.0;
trimGain = outputGain * gain;

primaryOsc(f) = sine * waveSine + triangle * waveTriangle + saw * waveSaw + pulse * wavePulse
with {
    sine = os.osc(f);
    triangle = os.triangle(f);
    saw = os.sawtooth(f);
    pulse = os.square(f);
    waveSine = wave < 0.5;
    waveTriangle = (wave >= 0.5) * (wave < 1.5);
    waveSaw = (wave >= 1.5) * (wave < 2.5);
    wavePulse = wave >= 2.5;
};

toneLayer(f) = mix(primaryOsc(f), os.sawtooth(f), color * 0.72);
subLayer(f) = os.osc(f * 0.5) * subAmount * 0.28;
noiseLayer = no.noise * noiseAmount * (0.10 + color * 0.16);

resonantTone(x, cutoff, resonance) =
    ((x : fi.lowpass(2, cutoff)) * (1.0 + resonance * 0.04)) +
    (((x : fi.highpass(2, cutoff * 0.62)) : fi.lowpass(2, cutoff * 1.48)) * (resonance * 0.18));

voiceCore(f) = resonantTone(core, dynamicCutoff, dynamicRes)
with {
    core =
        toneLayer(f) * (0.70 + color * 0.18) +
        subLayer(f) +
        (noiseLayer : fi.highpass(1, 1600.0 + color * 2600.0));
};

shapeVoice(f) = softclip(driveAmount, voiceCore(f) * env * trimGain * driveGain);

leftRaw = shapeVoice(leftFreq);
rightRaw = shapeVoice(rightFreq);
leftMotion = leftRaw * (1.0 + motionAmount * 0.08);
rightMotion = rightRaw * (1.0 - motionAmount * 0.08);
mid = (leftMotion + rightMotion) * 0.5;
side = (leftMotion - rightMotion) * 0.5 * stereoWidth;
leftOut = (mid + side) : fi.highpass(1, 24.0);
rightOut = (mid - side) : fi.highpass(1, 24.0);

safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
voiceLevelView(x) = x : abs : an.rms_envelope_rect(0.05) : safeLin2db : hbargraph("Voice Level", -72.0, 6.0);
motionLevelView(x) = x : abs : an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Motion Level", 0.0, 1.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

voiceSense = (leftRaw + rightRaw) * 0.5;
outputSense = (leftOut + rightOut) * 0.5;
leftMonitored = attach(attach(leftOut, voiceLevelView(voiceSense)), motionLevelView(motionAmount));
rightMonitored = attach(rightOut, outputPeakView(outputSense));

process = leftMonitored, rightMonitored;
