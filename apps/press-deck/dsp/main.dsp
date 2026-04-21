import("stdfaust.lib");

declare name "Press Deck";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Character compressor with richer detector options, audition paths, stereo linking, and shared-suite metadata.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;
clamp01(x) = min(1.0, max(0.0, x));
sq(x) = x * x;

mode = hslider("Mode", 1.0, 0.0, 3.0, 1.0);
character = hslider("Character", 0.0, 0.0, 2.0, 1.0);
detectorMode = hslider("Detector Mode", 1.0, 0.0, 2.0, 1.0);
inputGainDb = hslider("Input Gain [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
thresholdDb = hslider("Threshold [unit:dB]", -24.0, -54.0, 0.0, 0.1) : si.smoo;
ratio = hslider("Ratio", 4.5, 1.0, 20.0, 0.1) : si.smoo;
kneeDb = hslider("Knee [unit:dB]", 8.0, 0.0, 24.0, 0.1) : si.smoo;
attackMs = hslider("Attack [unit:ms][scale:log]", 18.0, 0.1, 250.0, 0.1) : si.smoo;
releaseMs = hslider("Release [unit:ms][scale:log]", 160.0, 10.0, 1500.0, 0.1) : si.smoo;
rangeDb = hslider("Range [unit:dB]", 18.0, 0.0, 30.0, 0.1) : si.smoo;
stereoLinkPct = hslider("Stereo Link [unit:%]", 72.0, 0.0, 100.0, 1.0) : si.smoo;
detectorHpHz = hslider("Detector HP [unit:Hz][scale:log]", 90.0, 20.0, 2000.0, 1.0) : si.smoo;
detectorTiltPct = hslider("Detector Tilt [unit:%]", 0.0, -100.0, 100.0, 1.0) : si.smoo;
detectorFocus = hslider("Detector Focus", 0.0, 0.0, 2.0, 1.0);
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
autoTrim = checkbox("Auto Trim");
audition = hslider("Audition", 0.0, 0.0, 2.0, 1.0);
bypass = checkbox("Bypass");

modePunch = mode == 0.0;
modeGlue = mode == 1.0;
modeLift = mode == 2.0;
modeCrush = mode == 3.0;

characterClean = character == 0.0;
characterWarm = character == 1.0;
characterBold = character == 2.0;

detectorPeak = detectorMode == 0.0;
detectorBlend = detectorMode == 1.0;
detectorAverage = detectorMode == 2.0;

focusFull = detectorFocus == 0.0;
focusBody = detectorFocus == 1.0;
focusAir = detectorFocus == 2.0;

auditionProgram = audition == 0.0;
auditionDelta = audition == 1.0;
auditionDetector = audition == 2.0;

inputGain = db2lin(inputGainDb);
mixAmount = mixPct / 100.0;
tiltNorm = detectorTiltPct / 100.0;
tiltLow = max(0.0, -tiltNorm);
tiltHigh = max(0.0, tiltNorm);

modeAttackScale = modePunch * 1.25 + modeGlue * 1.85 + modeLift * 0.82 + modeCrush * 0.36;
modeReleaseScale = modePunch * 0.85 + modeGlue * 1.28 + modeLift * 0.70 + modeCrush * 1.62;
modeRatioScale = modePunch * 0.95 + modeGlue * 0.84 + modeLift * 0.72 + modeCrush * 1.42;
modeThresholdBias = modeGlue * 1.2 + modeLift * 2.4 - modeCrush * 2.8;
modeKneeScale = modePunch * 0.82 + modeGlue * 1.25 + modeLift * 1.32 + modeCrush * 0.55;
modeRangeBias = modeLift * 2.0 + modeCrush * 6.0;

effectiveAttack = max(0.00005, toSeconds(attackMs) * modeAttackScale);
effectiveRelease = max(0.005, toSeconds(releaseMs) * modeReleaseScale);
effectiveRatio = max(1.0, ratio * modeRatioScale);
effectiveThreshold = thresholdDb + modeThresholdBias;
effectiveKnee = max(0.0, kneeDb * modeKneeScale);
effectiveRange = min(36.0, rangeDb + modeRangeBias);
stereoLinkAmount = clamp01((stereoLinkPct / 100.0) + modeGlue * 0.12 + modeCrush * 0.08);

peakAttack = max(0.00003, effectiveAttack * (detectorPeak * 0.35 + detectorBlend * 0.65 + detectorAverage * 1.10));
peakRelease = max(0.005, effectiveRelease * (detectorPeak * 0.82 + detectorBlend * 1.0 + detectorAverage * 1.2));

autoTrimDb = autoTrim * (
    (-effectiveThreshold) * (1.0 - (1.0 / max(effectiveRatio, 1.0))) * 0.18
    + modeGlue * 0.25
    + modeLift * 0.15
    + modeCrush * 0.55
);
outputGain = db2lin(outputDb + autoTrimDb);

warmTone(x) = mix(x, ma.tanh(x * 1.35) / max(ma.tanh(1.35), ma.EPSILON), 0.28);
boldTone(x) = mix(x, x * 0.72 + ma.tanh(x * 2.4) * 0.28, 0.44);
characterTone(x) =
    x * characterClean +
    warmTone(x) * characterWarm +
    boldTone(x) * characterBold;

modeTone(x) =
    x * modePunch +
    (x : fi.lowpass(1, 17500.0)) * modeGlue +
    (x + (x : fi.highpass(1, 2600.0)) * 0.12) * modeLift +
    ma.tanh(x * 1.18) * modeCrush;

frontEnd(x) = x * inputGain : characterTone : modeTone;

focusTone(x) =
    x * focusFull +
    (x : fi.lowpass(2, 1600.0)) * focusBody +
    (x : fi.highpass(2, 2200.0)) * focusAir;

tiltTone(x) =
    x * (1.0 - max(tiltLow, tiltHigh)) +
    (x + (x : fi.lowpass(1, 320.0)) * 0.75) * tiltLow +
    (x + (x : fi.highpass(1, 3000.0)) * 0.75) * tiltHigh;

detectorTap(x) = x : fi.highpass(1, detectorHpHz) : focusTone : tiltTone;

peakSense(x) = x : abs : an.amp_follower_ar(peakAttack, peakRelease);
averageSense(x) = x : abs : an.rms_envelope_rect(0.025);
detectorEnvelope(x) =
    peakSense(x) * detectorPeak +
    mix(peakSense(x), averageSense(x), 0.5) * detectorBlend +
    averageSense(x) * detectorAverage;

linkedEnvelope(leftEnv, rightEnv) = mix((leftEnv + rightEnv) * 0.5, max(leftEnv, rightEnv), 0.65);
blendLinked(freeEnv, linkedEnv) = mix(freeEnv, linkedEnv, stereoLinkAmount);

compressionSlope(ratioValue) = 1.0 - (1.0 / max(ratioValue, 1.0));
compressionDb(levelDb, thresholdValue, ratioValue, kneeValue) =
    ba.if(
        kneeValue > 0.0,
        ba.if(
            levelDb - thresholdValue <= (-0.5 * kneeValue),
            0.0,
            ba.if(
                levelDb - thresholdValue >= (0.5 * kneeValue),
                max(levelDb - thresholdValue, 0.0) * compressionSlope(ratioValue),
                compressionSlope(ratioValue) * sq(levelDb - thresholdValue + 0.5 * kneeValue) / max(kneeValue * 2.0, ma.EPSILON)
            )
        ),
        max(levelDb - thresholdValue, 0.0) * compressionSlope(ratioValue)
    );

gainReductionTarget(detectorEnv) =
    min(effectiveRange, compressionDb(safeLin2db(detectorEnv), effectiveThreshold, effectiveRatio, effectiveKnee));
smoothedGainReduction(x) = x : si.onePoleSwitching(effectiveAttack, effectiveRelease);
gainFromReduction(grDb) = db2lin(0.0 - grDb);

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
detectorDriveView(x) = x : safeLin2db : hbargraph("Detector Drive", -72.0, 6.0);
gainReductionView(x) = x : hbargraph("Gain Reduction", 0.0, 30.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) =
    outLeft, outRight
with {
    frontLeft = frontEnd(leftIn);
    frontRight = frontEnd(rightIn);
    inputMono = (frontLeft + frontRight) * 0.5;

    detectorLeftTap = detectorTap(frontLeft);
    detectorRightTap = detectorTap(frontRight);
    freeLeftEnv = detectorEnvelope(detectorLeftTap) * (1.0 + modeCrush * 0.08);
    freeRightEnv = detectorEnvelope(detectorRightTap) * (1.0 + modeCrush * 0.08);
    linkEnv = linkedEnvelope(freeLeftEnv, freeRightEnv);
    detectorLeft = blendLinked(freeLeftEnv, linkEnv);
    detectorRight = blendLinked(freeRightEnv, linkEnv);

    gainReductionLeft = smoothedGainReduction(gainReductionTarget(detectorLeft));
    gainReductionRight = smoothedGainReduction(gainReductionTarget(detectorRight));
    wetLeftCore = frontLeft * gainFromReduction(gainReductionLeft);
    wetRightCore = frontRight * gainFromReduction(gainReductionRight);

    programLeft = mix(frontLeft, wetLeftCore, mixAmount) * outputGain;
    programRight = mix(frontRight, wetRightCore, mixAmount) * outputGain;
    deltaLeft = (frontLeft - wetLeftCore) * outputGain;
    deltaRight = (frontRight - wetRightCore) * outputGain;
    detectorMonitorLeft = detectorLeftTap * (0.80 + modeLift * 0.16 + focusAir * 0.08);
    detectorMonitorRight = detectorRightTap * (0.80 + modeLift * 0.16 + focusAir * 0.08);

    auditionLeftSig =
        programLeft * auditionProgram +
        deltaLeft * auditionDelta +
        detectorMonitorLeft * auditionDetector;
    auditionRightSig =
        programRight * auditionProgram +
        deltaRight * auditionDelta +
        detectorMonitorRight * auditionDetector;

    detectorMono = (detectorLeft + detectorRight) * 0.5;
    gainReductionMono = (gainReductionLeft + gainReductionRight) * 0.5;
    outputMono = (auditionLeftSig + auditionRightSig) * 0.5;

    outLeft = attach(attach(auditionLeftSig, inputPeakView(inputMono)), gainReductionView(gainReductionMono));
    outRight = attach(attach(auditionRightSig, detectorDriveView(detectorMono)), outputPeakView(outputMono));
};

process = _,_ : ba.bypass2(bypass, effect);
