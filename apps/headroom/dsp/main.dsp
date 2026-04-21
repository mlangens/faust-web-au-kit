import("stdfaust.lib");

declare name "Headroom";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Adaptive mastering limiter with richer voicing, linked clamp behavior, and matched-output audition utilities.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;
clamp01(x) = min(1.0, max(0.0, x));
sq(x) = x * x;

algorithm = hslider("Algorithm", 1.0, 0.0, 3.0, 1.0);
style = hslider("Style", 1.0, 0.0, 2.0, 1.0);
detail = hslider("Detail", 1.0, 0.0, 2.0, 1.0);
inputGainDb = hslider("Input Gain [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
driveDb = hslider("Drive [unit:dB]", 4.0, 0.0, 18.0, 0.1) : si.smoo;
ceilingDb = hslider("Ceiling [unit:dB]", -1.0, -12.0, 0.0, 0.1) : si.smoo;
lookaheadMs = hslider("Lookahead [unit:ms][scale:log]", 2.5, 0.1, 12.0, 0.01) : si.smoo;
releaseMs = hslider("Release [unit:ms][scale:log]", 180.0, 10.0, 2000.0, 0.1) : si.smoo;
stereoLinkPct = hslider("Stereo Link [unit:%]", 82.0, 0.0, 100.0, 1.0) : si.smoo;
transientPreservePct = hslider("Transient Preserve [unit:%]", 45.0, 0.0, 100.0, 1.0) : si.smoo;
lowGuardPct = hslider("Low Guard [unit:%]", 48.0, 0.0, 100.0, 1.0) : si.smoo;
ceilingShapePct = hslider("Ceiling Shape [unit:%]", 34.0, 0.0, 100.0, 1.0) : si.smoo;
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
loudnessMatch = checkbox("Loudness Match");
audition = hslider("Audition", 0.0, 0.0, 2.0, 1.0);
bypass = checkbox("Bypass");

algorithmClear = algorithm == 0.0;
algorithmAdaptive = algorithm == 1.0;
algorithmFirm = algorithm == 2.0;
algorithmLift = algorithm == 3.0;

styleOpen = style == 0.0;
styleFocused = style == 1.0;
styleDense = style == 2.0;

detailBroad = detail == 0.0;
detailBalanced = detail == 1.0;
detailEdge = detail == 2.0;

auditionProgram = audition == 0.0;
auditionDelta = audition == 1.0;
auditionClamp = audition == 2.0;

inputGain = db2lin(inputGainDb);
driveAmount = clamp01(driveDb / 18.0);
transientAmount = transientPreservePct / 100.0;
lowGuardAmount = lowGuardPct / 100.0;
ceilingShapeAmount = ceilingShapePct / 100.0;
stereoLinkAmount = clamp01((stereoLinkPct / 100.0) + styleFocused * 0.08 + styleDense * 0.12);

lookaheadSeconds =
    toSeconds(lookaheadMs) * (
        algorithmClear * 1.18 +
        algorithmAdaptive * 1.28 +
        algorithmFirm * 0.84 +
        algorithmLift * 1.02
    );
responseAttack =
    max(
        0.00003,
        lookaheadSeconds * (
            algorithmClear * 0.22 +
            algorithmAdaptive * 0.18 +
            algorithmFirm * 0.10 +
            algorithmLift * 0.14
        )
    );
responseHold =
    max(
        0.00025,
        (0.00045 + transientAmount * 0.00065) * (
            styleOpen * 0.82 +
            styleFocused * 1.0 +
            styleDense * 1.22
        )
    );
responseRelease =
    max(
        0.008,
        toSeconds(releaseMs) * (
            styleOpen * 0.88 +
            styleFocused * 1.0 +
            styleDense * 1.26
        ) * (
            algorithmClear * 1.05 +
            algorithmAdaptive * 1.18 +
            algorithmFirm * 0.76 +
            algorithmLift * 0.92
        )
    );
detectorBlend =
    clamp01(
        algorithmClear * 0.22 +
        algorithmAdaptive * 0.58 +
        algorithmFirm * 0.12 +
        algorithmLift * 0.38 +
        detailBroad * 0.10
    );
effectiveRatio =
    algorithmClear * 10.0 +
    algorithmAdaptive * 16.0 +
    algorithmFirm * 28.0 +
    algorithmLift * 18.0;
effectiveKnee =
    styleOpen * 2.2 +
    styleFocused * 1.4 +
    styleDense * 0.8 +
    detailBroad * 0.6;
effectiveThreshold =
    ceilingDb - (
        3.0 +
        driveDb * 0.52 +
        styleDense * 1.35 +
        algorithmFirm * 0.9 +
        algorithmLift * 0.5 -
        transientAmount * 0.6
    );
ceilingLin = db2lin(ceilingDb);
softClipDrive = 1.2 + ceilingShapeAmount * 3.0 + styleDense * 0.7 + algorithmFirm * 0.5;
autoTrimDb =
    loudnessMatch * (
        driveDb * 0.36 +
        (0.0 - ceilingDb) * 0.28 +
        styleDense * 0.30 +
        algorithmLift * 0.18 -
        ceilingShapeAmount * 0.12
    );
outputGain = db2lin(outputTrimDb + autoTrimDb);

normalizedTanh(x, amount) = ma.tanh(x * amount) / max(ma.tanh(amount), ma.EPSILON);

adaptiveTone(x) = x : fi.lowpass(1, 18500.0);
firmTone(x) = mix(x, normalizedTanh(x, 1.35 + driveAmount * 1.9), 0.22 + driveAmount * 0.12);
liftTone(x) = x + (x : fi.highpass(1, 3200.0)) * 0.10;
algorithmTone(x) =
    x * algorithmClear +
    adaptiveTone(x) * algorithmAdaptive +
    firmTone(x) * algorithmFirm +
    liftTone(x) * algorithmLift;

openTone(x) = x;
focusedTone(x) = x * 0.88 + (x : fi.highpass(1, 2100.0)) * 0.12;
denseTone(x) = mix(x, normalizedTanh(x, 1.20 + driveAmount * 1.6), 0.24);
styleTone(x) =
    openTone(x) * styleOpen +
    focusedTone(x) * styleFocused +
    denseTone(x) * styleDense;

driveTone(x) = mix(x, normalizedTanh(x, 1.0 + driveAmount * 3.0 + styleDense * 0.4), 0.16 + driveAmount * 0.34 + styleDense * 0.10);
frontEnd(x) = x * inputGain : algorithmTone : styleTone : driveTone;

broadDetector(x) = x * 0.78 + (x : fi.lowpass(2, 1700.0)) * 0.42;
balancedDetector(x) = x;
edgeDetector(x) = x * 0.54 + (x : fi.highpass(2, 2400.0)) * 0.68;
detailDetector(x) =
    broadDetector(x) * detailBroad +
    balancedDetector(x) * detailBalanced +
    edgeDetector(x) * detailEdge;

guardDetector(x) = mix(x, x : fi.highpass(1, 35.0 + lowGuardAmount * 280.0), lowGuardAmount * 0.72);
detectorTap(x) = x : detailDetector : guardDetector;

peakSense(x) = x : abs : an.amp_follower_ar(max(0.00003, responseAttack * 0.7), max(0.006, responseRelease * 0.84));
averageSense(x) = x : abs : an.rms_envelope_rect(0.018 + styleDense * 0.014 + detailBroad * 0.008);
detectorEnvelope(x) = mix(peakSense(x), averageSense(x), detectorBlend);

linkedEnvelope(leftEnv, rightEnv) = mix((leftEnv + rightEnv) * 0.5, max(leftEnv, rightEnv), 0.72);
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
    min(30.0, compressionDb(safeLin2db(detectorEnv), effectiveThreshold, effectiveRatio, effectiveKnee));
smoothedGainReduction(x) = x : si.onePoleSwitching(max(responseAttack, 0.00003), responseRelease);
gainFromReduction(grDb) = db2lin(0.0 - grDb);

transientLift(x) = x - (x : fi.lowpass(1, 1800.0 + detailEdge * 1400.0 + detailBalanced * 600.0));
preserveTransients(wet, source) =
    wet + transientLift(source) * transientAmount * (
        styleOpen * 0.18 +
        styleFocused * 0.12 +
        styleDense * 0.08 +
        algorithmLift * 0.05
    );

softCeiling(x) =
    mix(
        x,
        normalizedTanh(x / max(ceilingLin, 0.0001), softClipDrive) * ceilingLin,
        ceilingShapeAmount * (0.72 + styleDense * 0.14)
    );
safetyLimiter(x) =
    x : co.limiter_lad_mono(
        0.003,
        ceilingLin,
        max(0.00002, responseAttack * 0.55),
        responseHold,
        max(0.006, responseRelease * 0.72)
    );
finalStage(x) = x : softCeiling : safetyLimiter;

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
driveLevelView(x) = x : abs : an.rms_envelope_rect(0.03) : safeLin2db : hbargraph("Drive Level", -72.0, 6.0);
gainReductionView(x) = x : hbargraph("Gain Reduction", 0.0, 30.0);
ceilingActivityView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Ceiling Activity", -72.0, 6.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(x, y) =
    outputLeft, outputRight
with {
    dryLeft = x;
    dryRight = y;
    inputMono = (dryLeft + dryRight) * 0.5;

    frontLeft = frontEnd(dryLeft);
    frontRight = frontEnd(dryRight);
    driveMono = (frontLeft + frontRight) * 0.5;

    detectorLeftTap = detectorTap(frontLeft);
    detectorRightTap = detectorTap(frontRight);
    freeLeftEnv = detectorEnvelope(detectorLeftTap);
    freeRightEnv = detectorEnvelope(detectorRightTap);
    linkedEnv = linkedEnvelope(freeLeftEnv, freeRightEnv);
    detectorLeft = blendLinked(freeLeftEnv, linkedEnv);
    detectorRight = blendLinked(freeRightEnv, linkedEnv);

    gainReductionLeft = smoothedGainReduction(gainReductionTarget(detectorLeft));
    gainReductionRight = smoothedGainReduction(gainReductionTarget(detectorRight));
    reducedLeft = frontLeft * gainFromReduction(gainReductionLeft);
    reducedRight = frontRight * gainFromReduction(gainReductionRight);

    preservedLeft = preserveTransients(reducedLeft, frontLeft);
    preservedRight = preserveTransients(reducedRight, frontRight);
    limitedLeft = finalStage(preservedLeft);
    limitedRight = finalStage(preservedRight);

    programLeft = limitedLeft * outputGain;
    programRight = limitedRight * outputGain;
    deltaLeft = dryLeft - programLeft;
    deltaRight = dryRight - programRight;
    clampLeft = (preservedLeft - limitedLeft) * outputGain;
    clampRight = (preservedRight - limitedRight) * outputGain;

    auditionLeftSig =
        programLeft * auditionProgram +
        deltaLeft * auditionDelta +
        clampLeft * auditionClamp;
    auditionRightSig =
        programRight * auditionProgram +
        deltaRight * auditionDelta +
        clampRight * auditionClamp;

    gainReductionMono = (gainReductionLeft + gainReductionRight) * 0.5;
    clampMono = (abs(clampLeft) + abs(clampRight)) * 0.5;
    outputMono = (programLeft + programRight) * 0.5;

    wetLeft =
        attach(
            attach(
                attach(auditionLeftSig, inputPeakView(inputMono)),
                driveLevelView(driveMono)
            ),
            gainReductionView(gainReductionMono)
        );
    wetRight =
        attach(
            attach(auditionRightSig, ceilingActivityView(clampMono)),
            outputPeakView(outputMono)
        );

    outputLeft = wetLeft;
    outputRight = wetRight;
};

process = _,_ : ba.bypass2(bypass, effect);
