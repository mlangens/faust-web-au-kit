import("stdfaust.lib");

declare name "Split Stack";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Character multiband dynamics tool with deeper crossover, linking, monitor routing, and richer band metering.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;
clamp01(x) = min(1.0, max(0.0, x));
sq(x) = x * x;

mode = hslider("Mode", 1.0, 0.0, 2.0, 1.0);
character = hslider("Character", 1.0, 0.0, 2.0, 1.0);
detectorMode = hslider("Detector Mode", 1.0, 0.0, 2.0, 1.0);
rawLowCrossoverHz = hslider("Low Crossover [unit:Hz][scale:log]", 180.0, 60.0, 1200.0, 1.0) : si.smoo;
rawHighCrossoverHz = hslider("High Crossover [unit:Hz][scale:log]", 2600.0, 700.0, 16000.0, 1.0) : si.smoo;
attackMs = hslider("Attack [unit:ms][scale:log]", 24.0, 0.1, 250.0, 0.1) : si.smoo;
releaseMs = hslider("Release [unit:ms][scale:log]", 180.0, 10.0, 1600.0, 0.1) : si.smoo;
timingSpreadPct = hslider("Timing Spread [unit:%]", 35.0, 0.0, 100.0, 1.0) : si.smoo;
stereoLinkPct = hslider("Stereo Link [unit:%]", 78.0, 0.0, 100.0, 1.0) : si.smoo;
bandLinkPct = hslider("Band Link [unit:%]", 24.0, 0.0, 100.0, 1.0) : si.smoo;
rangeDb = hslider("Range [unit:dB]", 18.0, 0.0, 30.0, 0.1) : si.smoo;
lowThresholdDb = hslider("Low Threshold [unit:dB]", -24.0, -54.0, 0.0, 0.1) : si.smoo;
lowAmountPct = hslider("Low Amount [unit:%]", 48.0, 0.0, 100.0, 1.0) : si.smoo;
lowLiftDb = hslider("Low Lift [unit:dB]", 0.0, -12.0, 12.0, 0.1) : si.smoo;
midThresholdDb = hslider("Mid Threshold [unit:dB]", -22.0, -54.0, 0.0, 0.1) : si.smoo;
midAmountPct = hslider("Mid Amount [unit:%]", 54.0, 0.0, 100.0, 1.0) : si.smoo;
midLiftDb = hslider("Mid Lift [unit:dB]", 0.0, -12.0, 12.0, 0.1) : si.smoo;
highThresholdDb = hslider("High Threshold [unit:dB]", -20.0, -54.0, 0.0, 0.1) : si.smoo;
highAmountPct = hslider("High Amount [unit:%]", 42.0, 0.0, 100.0, 1.0) : si.smoo;
highLiftDb = hslider("High Lift [unit:dB]", 0.0, -12.0, 12.0, 0.1) : si.smoo;
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
monitor = hslider("Monitor", 0.0, 0.0, 4.0, 1.0);
bypass = checkbox("Bypass");

modeTight = mode == 0.0;
modeBalance = mode == 1.0;
modeOpen = mode == 2.0;

characterClean = character == 0.0;
characterWarm = character == 1.0;
characterBold = character == 2.0;

detectorPeak = detectorMode == 0.0;
detectorBlend = detectorMode == 1.0;
detectorAverage = detectorMode == 2.0;

monitorProgram = monitor == 0.0;
monitorLow = monitor == 1.0;
monitorMid = monitor == 2.0;
monitorHigh = monitor == 3.0;
monitorDelta = monitor == 4.0;

mixAmount = mixPct / 100.0;
stereoLinkAmount = clamp01(stereoLinkPct / 100.0);
bandLinkAmount = clamp01(bandLinkPct / 100.0);
spreadAmount = timingSpreadPct / 100.0;

lowCrossoverHz = max(60.0, min(rawLowCrossoverHz, rawHighCrossoverHz - 120.0));
highCrossoverHz = min(18000.0, max(rawHighCrossoverHz, lowCrossoverHz + 120.0));

modeAttackScale = modeTight * 0.72 + modeBalance * 1.0 + modeOpen * 1.34;
modeReleaseScale = modeTight * 0.84 + modeBalance * 1.0 + modeOpen * 1.22;
modeRatioScale = modeTight * 1.18 + modeBalance * 1.0 + modeOpen * 0.82;
modeThresholdBias = modeTight * -2.4 + modeOpen * 1.4;
modeRangeBias = modeTight * 2.0 + modeOpen * -1.0;
modeLiftBias = modeOpen * 0.45;
kneeDb = modeTight * 4.0 + modeBalance * 7.0 + modeOpen * 10.0;

baseAttack = max(0.00005, toSeconds(attackMs) * modeAttackScale);
baseRelease = max(0.008, toSeconds(releaseMs) * modeReleaseScale);

lowAttack = max(0.00005, baseAttack * (1.0 + spreadAmount * 0.60));
midAttack = baseAttack;
highAttack = max(0.00003, baseAttack * (1.0 - spreadAmount * 0.34));

lowRelease = max(0.008, baseRelease * (1.0 + spreadAmount * 0.34));
midRelease = baseRelease;
highRelease = max(0.008, baseRelease * (1.0 - spreadAmount * 0.18));

effectiveRange = min(36.0, max(0.0, rangeDb + modeRangeBias));

lowAmount = lowAmountPct / 100.0;
midAmount = midAmountPct / 100.0;
highAmount = highAmountPct / 100.0;

lowRatio = max(1.0, 1.0 + lowAmount * 7.0 * modeRatioScale);
midRatio = max(1.0, 1.0 + midAmount * 8.5 * modeRatioScale);
highRatio = max(1.0, 1.0 + highAmount * 7.5 * modeRatioScale);

lowThreshold = lowThresholdDb + modeThresholdBias - characterWarm * 0.8;
midThreshold = midThresholdDb + modeThresholdBias;
highThreshold = highThresholdDb + modeThresholdBias + characterBold * 0.6;

lowLiftGain = db2lin(lowLiftDb + modeLiftBias);
midLiftGain = db2lin(midLiftDb + modeLiftBias * 0.5);
highLiftGain = db2lin(highLiftDb + modeOpen * 0.2);
outputGain = db2lin(outputDb);

warmTone(x) = mix(x, ma.tanh(x * 1.28), 0.24);
boldTone(x) = mix(x, x * 0.70 + ma.tanh(x * 2.2) * 0.30, 0.42);
characterTone(x) =
    x * characterClean +
    warmTone(x) * characterWarm +
    boldTone(x) * characterBold;

modeTone(x) =
    (x : fi.lowpass(1, 16500.0)) * modeTight +
    x * modeBalance +
    (x + (x : fi.highpass(1, 2400.0)) * 0.10) * modeOpen;

frontEnd(x) = x : characterTone : modeTone;

lowBandTap(x) = x : fi.lowpassLR4(lowCrossoverHz);
highBandTap(x) = x : fi.highpassLR4(highCrossoverHz);
midBandTap(x) = x - lowBandTap(x) - highBandTap(x);

peakSense(x, attackSeconds, releaseSeconds) =
    x : abs : an.amp_follower_ar(max(0.00003, attackSeconds * 0.55), max(0.005, releaseSeconds * 0.85));
averageSense(x) = x : abs : an.rms_envelope_rect(0.025);
detectorEnvelope(x, attackSeconds, releaseSeconds) =
    peakSense(x, attackSeconds, releaseSeconds) * detectorPeak +
    mix(peakSense(x, attackSeconds, releaseSeconds), averageSense(x), 0.5) * detectorBlend +
    averageSense(x) * detectorAverage;

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

gainReductionTarget(detectorEnv, thresholdValue, ratioValue, kneeValue, rangeValue) =
    min(rangeValue, compressionDb(safeLin2db(detectorEnv), thresholdValue, ratioValue, kneeValue));
smoothedGainReduction(x, attackSeconds, releaseSeconds) = x : si.onePoleSwitching(attackSeconds, releaseSeconds);
gainFromReduction(grDb) = db2lin(0.0 - grDb);

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.040) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
lowEnergyView(x) = x : abs : an.rms_envelope_rect(0.050) : safeLin2db : hbargraph("Low Energy", -72.0, 6.0);
midEnergyView(x) = x : abs : an.rms_envelope_rect(0.050) : safeLin2db : hbargraph("Mid Energy", -72.0, 6.0);
highEnergyView(x) = x : abs : an.rms_envelope_rect(0.050) : safeLin2db : hbargraph("High Energy", -72.0, 6.0);
lowReductionView(x) = x : hbargraph("Low Reduction", 0.0, 30.0);
midReductionView(x) = x : hbargraph("Mid Reduction", 0.0, 30.0);
highReductionView(x) = x : hbargraph("High Reduction", 0.0, 30.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.040) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) =
    outLeft, outRight
with {
    wetSourceLeft = frontEnd(leftIn);
    wetSourceRight = frontEnd(rightIn);

    lowLeft = lowBandTap(wetSourceLeft);
    midLeft = midBandTap(wetSourceLeft);
    highLeft = highBandTap(wetSourceLeft);
    lowRight = lowBandTap(wetSourceRight);
    midRight = midBandTap(wetSourceRight);
    highRight = highBandTap(wetSourceRight);

    lowDetectLeft = detectorEnvelope(lowLeft + (lowLeft : fi.lowpass(1, max(40.0, lowCrossoverHz * 0.55))) * (0.10 + characterWarm * 0.12), lowAttack, lowRelease);
    lowDetectRight = detectorEnvelope(lowRight + (lowRight : fi.lowpass(1, max(40.0, lowCrossoverHz * 0.55))) * (0.10 + characterWarm * 0.12), lowAttack, lowRelease);
    midDetectLeft = detectorEnvelope(midLeft, midAttack, midRelease);
    midDetectRight = detectorEnvelope(midRight, midAttack, midRelease);
    highDetectLeft = detectorEnvelope(highLeft + (highLeft : fi.highpass(1, min(18000.0, highCrossoverHz * 0.90))) * (0.08 + characterBold * 0.12 + modeOpen * 0.06), highAttack, highRelease);
    highDetectRight = detectorEnvelope(highRight + (highRight : fi.highpass(1, min(18000.0, highCrossoverHz * 0.90))) * (0.08 + characterBold * 0.12 + modeOpen * 0.06), highAttack, highRelease);

    lowStereo = mix((lowDetectLeft + lowDetectRight) * 0.5, max(lowDetectLeft, lowDetectRight), 0.62 + modeTight * 0.10);
    midStereo = mix((midDetectLeft + midDetectRight) * 0.5, max(midDetectLeft, midDetectRight), 0.56 + modeTight * 0.08);
    highStereo = mix((highDetectLeft + highDetectRight) * 0.5, max(highDetectLeft, highDetectRight), 0.58 + modeTight * 0.06);

    lowEnvLeftPre = mix(lowDetectLeft, lowStereo, stereoLinkAmount);
    lowEnvRightPre = mix(lowDetectRight, lowStereo, stereoLinkAmount);
    midEnvLeftPre = mix(midDetectLeft, midStereo, stereoLinkAmount);
    midEnvRightPre = mix(midDetectRight, midStereo, stereoLinkAmount);
    highEnvLeftPre = mix(highDetectLeft, highStereo, stereoLinkAmount);
    highEnvRightPre = mix(highDetectRight, highStereo, stereoLinkAmount);

    lowSummary = (lowEnvLeftPre + lowEnvRightPre) * 0.5;
    midSummary = (midEnvLeftPre + midEnvRightPre) * 0.5;
    highSummary = (highEnvLeftPre + highEnvRightPre) * 0.5;
    sharedBandEnv = mix((lowSummary + midSummary + highSummary) / 3.0, max(max(lowSummary, midSummary), highSummary), 0.42 + modeTight * 0.16);

    lowEnvLeft = mix(lowEnvLeftPre, sharedBandEnv, bandLinkAmount);
    lowEnvRight = mix(lowEnvRightPre, sharedBandEnv, bandLinkAmount);
    midEnvLeft = mix(midEnvLeftPre, sharedBandEnv, bandLinkAmount);
    midEnvRight = mix(midEnvRightPre, sharedBandEnv, bandLinkAmount);
    highEnvLeft = mix(highEnvLeftPre, sharedBandEnv, bandLinkAmount);
    highEnvRight = mix(highEnvRightPre, sharedBandEnv, bandLinkAmount);

    lowReductionLeft = smoothedGainReduction(gainReductionTarget(lowEnvLeft, lowThreshold, lowRatio, kneeDb * 1.1, effectiveRange), lowAttack, lowRelease);
    lowReductionRight = smoothedGainReduction(gainReductionTarget(lowEnvRight, lowThreshold, lowRatio, kneeDb * 1.1, effectiveRange), lowAttack, lowRelease);
    midReductionLeft = smoothedGainReduction(gainReductionTarget(midEnvLeft, midThreshold, midRatio, kneeDb, effectiveRange), midAttack, midRelease);
    midReductionRight = smoothedGainReduction(gainReductionTarget(midEnvRight, midThreshold, midRatio, kneeDb, effectiveRange), midAttack, midRelease);
    highReductionLeft = smoothedGainReduction(gainReductionTarget(highEnvLeft, highThreshold, highRatio, kneeDb * 0.9, effectiveRange), highAttack, highRelease);
    highReductionRight = smoothedGainReduction(gainReductionTarget(highEnvRight, highThreshold, highRatio, kneeDb * 0.9, effectiveRange), highAttack, highRelease);

    lowWetLeft = mix(lowLeft * gainFromReduction(lowReductionLeft), ma.tanh((lowLeft * gainFromReduction(lowReductionLeft)) * 1.30), 0.10 + characterWarm * 0.10 + characterBold * 0.08) * lowLiftGain;
    lowWetRight = mix(lowRight * gainFromReduction(lowReductionRight), ma.tanh((lowRight * gainFromReduction(lowReductionRight)) * 1.30), 0.10 + characterWarm * 0.10 + characterBold * 0.08) * lowLiftGain;
    midWetLeft = mix(midLeft * gainFromReduction(midReductionLeft), ma.tanh((midLeft * gainFromReduction(midReductionLeft)) * 1.55), 0.06 + characterBold * 0.10) * midLiftGain;
    midWetRight = mix(midRight * gainFromReduction(midReductionRight), ma.tanh((midRight * gainFromReduction(midReductionRight)) * 1.55), 0.06 + characterBold * 0.10) * midLiftGain;
    highWetLeft = (highLeft * gainFromReduction(highReductionLeft) + (highLeft * gainFromReduction(highReductionLeft) : fi.highpass(1, 4500.0)) * (0.04 + modeOpen * 0.05 + characterBold * 0.06)) * highLiftGain;
    highWetRight = (highRight * gainFromReduction(highReductionRight) + (highRight * gainFromReduction(highReductionRight) : fi.highpass(1, 4500.0)) * (0.04 + modeOpen * 0.05 + characterBold * 0.06)) * highLiftGain;

    wetFullLeft = lowWetLeft + midWetLeft + highWetLeft;
    wetFullRight = lowWetRight + midWetRight + highWetRight;

    programLeft = mix(leftIn, wetFullLeft, mixAmount) * outputGain;
    programRight = mix(rightIn, wetFullRight, mixAmount) * outputGain;
    deltaLeft = (leftIn - wetFullLeft) * outputGain;
    deltaRight = (rightIn - wetFullRight) * outputGain;
    lowMonitorLeft = lowWetLeft * outputGain;
    lowMonitorRight = lowWetRight * outputGain;
    midMonitorLeft = midWetLeft * outputGain;
    midMonitorRight = midWetRight * outputGain;
    highMonitorLeft = highWetLeft * outputGain;
    highMonitorRight = highWetRight * outputGain;

    monitoredLeft =
        programLeft * monitorProgram +
        lowMonitorLeft * monitorLow +
        midMonitorLeft * monitorMid +
        highMonitorLeft * monitorHigh +
        deltaLeft * monitorDelta;
    monitoredRight =
        programRight * monitorProgram +
        lowMonitorRight * monitorLow +
        midMonitorRight * monitorMid +
        highMonitorRight * monitorHigh +
        deltaRight * monitorDelta;

    inputMono = (leftIn + rightIn) * 0.5;
    lowEnergyMono = (lowLeft + lowRight) * 0.5;
    midEnergyMono = (midLeft + midRight) * 0.5;
    highEnergyMono = (highLeft + highRight) * 0.5;
    lowReductionMono = (lowReductionLeft + lowReductionRight) * 0.5;
    midReductionMono = (midReductionLeft + midReductionRight) * 0.5;
    highReductionMono = (highReductionLeft + highReductionRight) * 0.5;
    outputMono = (monitoredLeft + monitoredRight) * 0.5;

    outLeft = attach(attach(attach(attach(monitoredLeft, inputPeakView(inputMono)), lowEnergyView(lowEnergyMono)), midEnergyView(midEnergyMono)), lowReductionView(lowReductionMono));
    outRight = attach(attach(attach(attach(monitoredRight, highEnergyView(highEnergyMono)), midReductionView(midReductionMono)), highReductionView(highReductionMono)), outputPeakView(outputMono));
};

process = _,_ : ba.bypass2(bypass, effect);
