import("stdfaust.lib");

declare name "Silk Guard";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Precision de-esser with richer detector styling, focus control, monitor paths, stereo linking, and split-depth handling.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;
clamp01(x) = min(1.0, max(0.0, x));

detectionStyle = hslider("Detection Style", 1.0, 0.0, 2.0, 1.0);
detectionFocus = hslider("Detection Focus", 1.0, 0.0, 2.0, 1.0);
thresholdDb = hslider("Threshold [unit:dB]", -30.0, -48.0, 0.0, 0.1) : si.smoo;
rangeDb = hslider("Range [unit:dB]", 10.0, 0.0, 24.0, 0.1) : si.smoo;
attackMs = hslider("Attack [unit:ms][scale:log]", 3.5, 0.1, 60.0, 0.1) : si.smoo;
releaseMs = hslider("Release [unit:ms][scale:log]", 120.0, 10.0, 1500.0, 0.1) : si.smoo;
sensitivityPct = hslider("Sensitivity [unit:%]", 56.0, 0.0, 100.0, 1.0) : si.smoo;
centerHz = hslider("Center Frequency [unit:Hz][scale:log]", 6800.0, 1800.0, 12000.0, 1.0) : si.smoo;
focusWidthPct = hslider("Focus Width [unit:%]", 42.0, 0.0, 100.0, 1.0) : si.smoo;
lookaheadMs = hslider("Lookahead [unit:ms][scale:log]", 1.5, 0.1, 12.0, 0.1);
splitDepthPct = hslider("Split Depth [unit:%]", 86.0, 0.0, 100.0, 1.0) : si.smoo;
stereoLinkPct = hslider("Stereo Link [unit:%]", 78.0, 0.0, 100.0, 1.0) : si.smoo;
monitor = hslider("Monitor", 0.0, 0.0, 2.0, 1.0);
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
bypass = checkbox("Bypass");

styleSmooth = detectionStyle == 0.0;
styleSplit = detectionStyle == 1.0;
styleEdge = detectionStyle == 2.0;

focusBody = detectionFocus == 0.0;
focusPresence = detectionFocus == 1.0;
focusAir = detectionFocus == 2.0;

monitorProgram = monitor == 0.0;
monitorDelta = monitor == 1.0;
monitorDetector = monitor == 2.0;

sensitivity = sensitivityPct / 100.0;
widthAmount = focusWidthPct / 100.0;
splitDepth = splitDepthPct / 100.0;
stereoLink = clamp01(stereoLinkPct / 100.0);
mixAmount = mixPct / 100.0;
outputGain = db2lin(outputDb);

focusScale = focusBody * 0.74 + focusPresence * 1.0 + focusAir * 1.34;
focusLowerBase = mix(0.74, 0.36, widthAmount);
focusUpperBase = mix(1.85, 3.10, widthAmount);
effectiveCenter = min(12000.0, max(1800.0, centerHz * focusScale));
bandLower = max(900.0, effectiveCenter * focusLowerBase);
bandUpper = min(19000.0, max(bandLower + 800.0, effectiveCenter * focusUpperBase));
splitCrossover = min(14000.0, max(1800.0, effectiveCenter * mix(0.78, 1.08, widthAmount)));

styleAttackScale = styleSmooth * 1.35 + styleSplit * 0.92 + styleEdge * 0.55;
styleReleaseScale = styleSmooth * 1.22 + styleSplit * 0.96 + styleEdge * 0.82;
styleSensitivityBias = styleSmooth * 0.92 + styleSplit * 1.08 + styleEdge * 1.28;
styleRangeBias = styleSmooth * 0.0 + styleSplit * 1.5 + styleEdge * 2.8;

effectiveAttack = max(0.00005, toSeconds(attackMs) * styleAttackScale);
effectiveRelease = max(0.005, toSeconds(releaseMs) * styleReleaseScale);
effectiveRange = min(24.0, rangeDb + styleRangeBias);
lookaheadNorm = clamp01((lookaheadMs - 0.1) / 11.9);
effectiveAttackAhead = mix(effectiveAttack, effectiveAttack * 0.45, lookaheadNorm);
effectiveThreshold = thresholdDb + focusBody * 0.6 - focusAir * 1.2 - lookaheadNorm * 2.1;
detectorScale = (0.75 + sensitivity * 1.25) * styleSensitivityBias * (1.0 + lookaheadNorm * 0.22);

smoothBand(x) = x
    : fi.highpass(2, bandLower * 0.92)
    : fi.lowpass(2, bandUpper * 0.96);
splitBand(x) = x
    : fi.highpass(2, max(1200.0, effectiveCenter * 0.90))
    : fi.lowpass(2, min(19000.0, max(effectiveCenter * 1.85, bandUpper * 0.88)));
edgeBand(x) = x
    : fi.highpass(2, max(1500.0, effectiveCenter * 1.12))
    : fi.lowpass(2, min(19000.0, max(effectiveCenter * 2.45, bandUpper * 1.10)));

focusBand(x) =
    smoothBand(x) * styleSmooth +
    splitBand(x) * styleSplit +
    edgeBand(x) * styleEdge;

peakSense(x) = x : abs : an.amp_follower_ar(effectiveAttackAhead, effectiveRelease);
smoothSense(x) = x : abs : an.amp_follower_ar(
    max(0.0015, effectiveAttackAhead * 2.8 + 0.001 + lookaheadNorm * 0.003),
    max(0.012, effectiveRelease * 1.22 + 0.012)
);
hybridSense(x) = mix(peakSense(x), smoothSense(x), 0.42);

detectorEnvelope(x) =
    smoothSense(x) * styleSmooth +
    hybridSense(x) * styleSplit +
    peakSense(x) * styleEdge;

linkedEnvelope(leftEnv, rightEnv) = mix((leftEnv + rightEnv) * 0.5, max(leftEnv, rightEnv), 0.68);
blendLinked(freeEnv, linkEnv) = mix(freeEnv, linkEnv, stereoLink);

reductionTarget(detectorEnv) =
    min(
        effectiveRange,
        max(
            0.0,
            (safeLin2db(detectorEnv * detectorScale) - effectiveThreshold) * (0.58 + sensitivity * 0.90)
        )
    );

smoothedReduction(x) = x : si.onePoleSwitching(effectiveAttackAhead, effectiveRelease);
gainFromReduction(grDb) = db2lin(0.0 - grDb);

wideProcess(x, gain) = x * gain;
splitProcess(x, gain) =
    lowBand + highBand * gain
with {
    lowBand = x : fi.lowpass(2, splitCrossover);
    highBand = x : fi.highpass(2, splitCrossover);
};

applyGain(x, gain) = mix(wideProcess(x, gain), splitProcess(x, gain), splitDepth);

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
detectorDriveView(x) = x : safeLin2db : hbargraph("Detector Drive", -72.0, 6.0);
focusEnergyView(x) = x : abs : an.rms_envelope_rect(0.05) : safeLin2db : hbargraph("Focus Energy", -72.0, 6.0);
gainReductionView(x) = x : hbargraph("Gain Reduction", 0.0, 24.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) =
    outLeft, outRight
with {
    inputMono = (leftIn + rightIn) * 0.5;

    detectorLeftTap = leftIn : focusBand;
    detectorRightTap = rightIn : focusBand;
    freeLeftEnv = detectorEnvelope(detectorLeftTap);
    freeRightEnv = detectorEnvelope(detectorRightTap);
    linkedEnv = linkedEnvelope(freeLeftEnv, freeRightEnv);
    detectorLeft = blendLinked(freeLeftEnv, linkedEnv);
    detectorRight = blendLinked(freeRightEnv, linkedEnv);

    reductionLeft = smoothedReduction(reductionTarget(detectorLeft));
    reductionRight = smoothedReduction(reductionTarget(detectorRight));
    wetLeftCore = applyGain(leftIn, gainFromReduction(reductionLeft));
    wetRightCore = applyGain(rightIn, gainFromReduction(reductionRight));

    programLeft = mix(leftIn, wetLeftCore, mixAmount) * outputGain;
    programRight = mix(rightIn, wetRightCore, mixAmount) * outputGain;
    deltaLeft = (leftIn - wetLeftCore) * outputGain;
    deltaRight = (rightIn - wetRightCore) * outputGain;
    detectorMonitorLeft = detectorLeftTap * (0.88 + focusAir * 0.16 + styleEdge * 0.12);
    detectorMonitorRight = detectorRightTap * (0.88 + focusAir * 0.16 + styleEdge * 0.12);

    monitorLeftSig =
        programLeft * monitorProgram +
        deltaLeft * monitorDelta +
        detectorMonitorLeft * monitorDetector;
    monitorRightSig =
        programRight * monitorProgram +
        deltaRight * monitorDelta +
        detectorMonitorRight * monitorDetector;

    detectorMono = (detectorLeft + detectorRight) * 0.5;
    focusMono = (detectorLeftTap + detectorRightTap) * 0.5;
    reductionMono = (reductionLeft + reductionRight) * 0.5;
    outputMono = (monitorLeftSig + monitorRightSig) * 0.5;

    outLeft = attach(
        attach(
            attach(monitorLeftSig, inputPeakView(inputMono)),
            detectorDriveView(detectorMono)
        ),
        gainReductionView(reductionMono)
    );
    outRight = attach(
        attach(
            attach(monitorRightSig, focusEnergyView(focusMono)),
            outputPeakView(outputMono)
        ),
        gainReductionView(reductionMono)
    );
};

process = _,_ : ba.bypass2(bypass, effect);
