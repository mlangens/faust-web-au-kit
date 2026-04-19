import("stdfaust.lib");

declare name "Pulse Pad";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.3.1";
declare description "Polyphonic Faust synth with morphable oscillator color, contour sweep, and analyzer-linked drive telemetry.";
declare license "MIT";
declare options "[midi:on][nvoices:12]";

db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
mix(a, b, t) = a * (1.0 - t) + b * t;
clamp01(x) = min(1.0, max(0.0, x));
applyDrive(amount, x) = mix(x, ma.tanh(x * (1.0 + amount * 5.5)), amount);

attackMs = hslider("Attack [unit:ms][scale:log]", 12.0, 1.0, 900.0, 0.1);
releaseMs = hslider("Release [unit:ms][scale:log]", 480.0, 20.0, 6000.0, 1.0);
texture = hslider("Texture", 0.42, 0.0, 1.0, 0.01);
tone = hslider("Tone", 0.58, 0.0, 1.0, 0.01);
contour = hslider("Contour", 0.52, 0.0, 1.0, 0.01);
motion = hslider("Motion", 0.36, 0.0, 1.0, 0.01);
detuneCents = hslider("Detune [unit:ct]", 8.0, 0.0, 35.0, 0.1);
subPct = hslider("Sub [unit:%]", 24.0, 0.0, 100.0, 1.0);
driveDb = hslider("Drive [unit:dB]", 4.0, 0.0, 24.0, 0.1);
stereoWidth = hslider("Stereo Width", 0.78, 0.0, 1.0, 0.01);

gate = button("gate");
freq = hslider("freq", 220.0, 20.0, 2000.0, 1.0);
gain = hslider("gain", 0.3, 0.0, 1.0, 0.001);

attackSeconds = max(attackMs, 0.1) / 1000.0;
releaseSeconds = max(releaseMs, 1.0) / 1000.0;
driveAmount = clamp01(driveDb / 24.0);
subAmount = subPct / 100.0;
shapeCenter = clamp01(1.0 - abs(texture - 0.45) * 1.8);
toneSquared = tone * tone;
env = en.asr(attackSeconds, 1.0, releaseSeconds, gate);
contourEnv = env * (0.34 + contour * 0.86);
leftFreq = freq * (1.0 - detuneCents * stereoWidth * 0.0005776226504666211);
rightFreq = freq * (1.0 + detuneCents * stereoWidth * 0.0005776226504666211);

baseCutoff = 180.0 + toneSquared * 6800.0;
sweepCutoff = contourEnv * contour * 6200.0;
airCutoff = 900.0 + tone * 5200.0;
airGain = 0.03 + texture * 0.08 + motion * 0.05;
leftMotionSweep = (0.5 + 0.5 * os.osc(0.11 + motion * 0.52)) * motion * 1800.0;
rightMotionSweep = (0.5 + 0.5 * os.osc(0.18 + motion * 0.48)) * motion * 1800.0;
leftCutoff = min(16000.0, baseCutoff + sweepCutoff + leftMotionSweep + 140.0);
rightCutoff = min(16000.0, baseCutoff + sweepCutoff + rightMotionSweep + 320.0 * stereoWidth);

leftRaw =
    os.osc(leftFreq) * (0.14 + tone * 0.08) +
    os.triangle(leftFreq) * (0.34 + (1.0 - texture) * 0.16) +
    os.square(leftFreq) * (0.08 + shapeCenter * 0.18) +
    os.sawtooth(leftFreq) * (0.18 + texture * 0.24) +
    os.osc(leftFreq * (2.0 + texture * 1.4)) * (0.04 + motion * 0.08 + tone * 0.02) +
    os.sawtooth(leftFreq * 0.5) * subAmount * 0.24;
rightRaw =
    os.osc(rightFreq) * (0.14 + tone * 0.08) +
    os.triangle(rightFreq) * (0.34 + (1.0 - texture) * 0.16) +
    os.square(rightFreq) * (0.08 + shapeCenter * 0.18) +
    os.sawtooth(rightFreq) * (0.18 + texture * 0.24) +
    os.osc(rightFreq * (2.0 + texture * 1.4)) * (0.04 + motion * 0.08 + tone * 0.02) +
    os.sawtooth(rightFreq * 0.5) * subAmount * 0.24;
leftFiltered = leftRaw : fi.lowpass(3, leftCutoff);
rightFiltered = rightRaw : fi.lowpass(3, rightCutoff);
leftAir = leftRaw : fi.highpass(1, airCutoff) : *(airGain);
rightAir = rightRaw : fi.highpass(1, airCutoff) : *(airGain);
leftPre = (leftFiltered + leftAir) * env * gain * 0.62;
rightPre = (rightFiltered + rightAir) * env * gain * 0.62;
leftOut = leftPre : applyDrive(driveAmount);
rightOut = rightPre : applyDrive(driveAmount);

voiceBodyView = abs : an.rms_envelope_rect(0.08) : safeLin2db : hbargraph("Voice Body", -72.0, 6.0);
motionBloomView = abs : an.rms_envelope_rect(0.08) : safeLin2db : hbargraph("Motion Bloom", -72.0, 6.0);
outputPeakView = abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);
bandHeatView =
    fi.crossover3LR4(220.0, 2800.0)
    : bandHeatLow, bandHeatMid, bandHeatHigh
    :> _
with {
    bandHeatLow = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive Low Saturation", 0.0, 1.0);
    bandHeatMid = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive Mid Saturation", 0.0, 1.0);
    bandHeatHigh = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive High Saturation", 0.0, 1.0);
};

bodySense = (leftPre + rightPre) * 0.5;
motionSense = (leftOut - rightOut) * 0.5;
driveDeltaSense = abs(((leftOut + rightOut) - (leftPre + rightPre)) * 0.5);
outputSense = abs((leftOut + rightOut) * 0.5) + abs((leftOut - rightOut) * 0.5);
telemetryLeft =
    attach(
        attach(
            attach(leftOut, voiceBodyView(bodySense)),
            motionBloomView(motionSense)
        ),
        bandHeatView(driveDeltaSense)
    );

process = attach(telemetryLeft, outputPeakView(outputSense)), rightOut;
