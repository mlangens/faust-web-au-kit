import("stdfaust.lib");

declare name "Latch Line";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Character gate-expander with richer detector routing, closure shaping, stereo linking, and monitor utilities.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;
clamp01(x) = min(1.0, max(0.0, x));
sq(x) = x * x;
cube(x) = x * x * x;
gainReductionDb(gainLin) = max(0.0, 0.0 - safeLin2db(gainLin));

mode = hslider("Mode", 1.0, 0.0, 2.0, 1.0);
style = hslider("Style", 1.0, 0.0, 3.0, 1.0);
detectorMode = hslider("Detector Mode", 1.0, 0.0, 2.0, 1.0);
thresholdDb = hslider("Threshold [unit:dB]", -34.0, -80.0, 0.0, 0.1) : si.smoo;
rangeDb = hslider("Range [unit:dB]", 30.0, 0.0, 60.0, 0.1) : si.smoo;
floorPct = hslider("Floor [unit:%]", 4.0, 0.0, 100.0, 1.0) : si.smoo;
attackMs = hslider("Attack [unit:ms][scale:log]", 6.0, 0.05, 250.0, 0.1) : si.smoo;
holdMs = hslider("Hold [unit:ms][scale:log]", 55.0, 0.0, 1200.0, 0.1) : si.smoo;
releaseMs = hslider("Release [unit:ms][scale:log]", 170.0, 10.0, 3000.0, 0.1) : si.smoo;
hysteresisDb = hslider("Hysteresis [unit:dB]", 6.0, 0.0, 24.0, 0.1) : si.smoo;
stereoLinkPct = hslider("Stereo Link [unit:%]", 80.0, 0.0, 100.0, 1.0) : si.smoo;
detectorHpHz = hslider("Detector HP [unit:Hz][scale:log]", 90.0, 20.0, 4000.0, 1.0) : si.smoo;
detectorTiltPct = hslider("Detector Tilt [unit:%]", 0.0, -100.0, 100.0, 1.0) : si.smoo;
detectorFocus = hslider("Detector Focus", 0.0, 0.0, 2.0, 1.0);
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
monitor = hslider("Monitor", 0.0, 0.0, 2.0, 1.0);
bypass = checkbox("Bypass");

modeGate = mode == 0.0;
modeExpand = mode == 1.0;
modeDuck = mode == 2.0;

styleSoft = style == 0.0;
styleBalanced = style == 1.0;
styleTight = style == 2.0;
styleClamp = style == 3.0;

detectorPeak = detectorMode == 0.0;
detectorContour = detectorMode == 1.0;
detectorAverage = detectorMode == 2.0;

focusFull = detectorFocus == 0.0;
focusBody = detectorFocus == 1.0;
focusEdge = detectorFocus == 2.0;

monitorProgram = monitor == 0.0;
monitorDetector = monitor == 1.0;
monitorDifference = monitor == 2.0;

mixAmount = mixPct / 100.0;
outputGain = db2lin(outputDb);
floorGain = floorPct / 100.0;
stereoLinkAmount = clamp01(stereoLinkPct / 100.0);
tiltNorm = detectorTiltPct / 100.0;
tiltLow = max(0.0, -tiltNorm);
tiltHigh = max(0.0, tiltNorm);

styleAttackScale = styleSoft * 1.28 + styleBalanced * 1.0 + styleTight * 0.62 + styleClamp * 0.34;
styleReleaseScale = styleSoft * 1.42 + styleBalanced * 1.0 + styleTight * 0.72 + styleClamp * 0.55;
styleHoldScale = styleSoft * 1.15 + styleBalanced * 1.0 + styleTight * 0.82 + styleClamp * 1.25;
modeRangeScale = modeGate * 1.0 + modeExpand * 0.70 + modeDuck * 0.84;

baseAttack = max(0.00005, toSeconds(attackMs) * styleAttackScale);
baseRelease = max(0.006, toSeconds(releaseMs) * styleReleaseScale);
holdSeconds = max(0.0, toSeconds(holdMs) * styleHoldScale);
effectiveRange = rangeDb * modeRangeScale;

peakAttack = max(0.00003, baseAttack * (detectorPeak * 0.35 + detectorContour * 0.68 + detectorAverage * 1.1));
peakRelease = max(0.006, baseRelease * (detectorPeak * 0.78 + detectorContour * 1.0 + detectorAverage * 1.28));
closeTime = max(0.006, baseRelease + holdSeconds);

gateMinimumGain = max(floorGain, db2lin(0.0 - effectiveRange));
expandMinimumGain = max(floorGain, db2lin(0.0 - effectiveRange * 0.55));
duckMinimumGain = max(floorGain, db2lin(0.0 - effectiveRange * 0.82));

openThresholdDb = thresholdDb + hysteresisDb * 0.5;
closeThresholdDb = thresholdDb - hysteresisDb * 0.5;
thresholdBandDb = max(openThresholdDb - closeThresholdDb, 0.5);

styleTone(x) =
    (x : fi.lowpass(1, 16000.0)) * styleSoft +
    x * styleBalanced +
    (x + (x : fi.highpass(1, 2400.0)) * 0.08) * styleTight +
    (ma.tanh(x * 1.12) / max(ma.tanh(1.12), ma.EPSILON)) * styleClamp;

focusTone(x) =
    x * focusFull +
    (x : fi.lowpass(2, 1400.0)) * focusBody +
    (x : fi.highpass(2, 2200.0)) * focusEdge;

tiltTone(x) =
    x * (1.0 - max(tiltLow, tiltHigh)) +
    (x + (x : fi.lowpass(1, 280.0)) * 0.72) * tiltLow +
    (x + (x : fi.highpass(1, 3400.0)) * 0.72) * tiltHigh;

detectorTap(x) = x : fi.highpass(1, detectorHpHz) : focusTone : tiltTone;

peakSense(x) = x : abs : an.amp_follower_ar(peakAttack, peakRelease);
averageSense(x) = x : abs : an.rms_envelope_rect(0.024);
contourSense(x) = mix(peakSense(x), averageSense(x), 0.45);
detectorEnvelope(x) =
    peakSense(x) * detectorPeak +
    contourSense(x) * detectorContour +
    averageSense(x) * detectorAverage;

linkedEnvelope(leftEnv, rightEnv) = mix((leftEnv + rightEnv) * 0.5, max(leftEnv, rightEnv), 0.65 + styleClamp * 0.12);
blendLinked(freeEnv, linkEnv) = mix(freeEnv, linkEnv, stereoLinkAmount);

windowOpen(levelDb) = clamp01((levelDb - closeThresholdDb) / thresholdBandDb);
shapeOpen(x) = clamp01(
    sqrt(clamp01(x)) * styleSoft +
    x * styleBalanced +
    sq(x) * styleTight +
    cube(x) * styleClamp
);
openTrace(x) = x : si.onePoleSwitching(baseAttack, closeTime);

gateGain(openAmt) = gateMinimumGain + (1.0 - gateMinimumGain) * openAmt;
expandGain(openAmt) = max(expandMinimumGain, db2lin(0.0 - effectiveRange * 0.82 * sq(1.0 - openAmt)));
duckGain(openAmt) = max(duckMinimumGain, db2lin(0.0 - effectiveRange * (0.18 + 0.82 * sq(openAmt))));
targetGain(openAmt) =
    gateGain(openAmt) * modeGate +
    expandGain(openAmt) * modeExpand +
    duckGain(openAmt) * modeDuck;

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
detectorDriveView(x) = x : safeLin2db : hbargraph("Detector Drive", -72.0, 6.0);
closureDepthView(x) = x * 100.0 : hbargraph("Closure Depth [unit:%]", 0.0, 100.0);
gainReductionView(x) = x : hbargraph("Gain Reduction", 0.0, 60.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) =
    outLeft, outRight
with {
    frontLeft = styleTone(leftIn);
    frontRight = styleTone(rightIn);
    inputMono = (frontLeft + frontRight) * 0.5;

    detectorLeftTap = detectorTap(frontLeft);
    detectorRightTap = detectorTap(frontRight);
    freeLeftEnv = detectorEnvelope(detectorLeftTap);
    freeRightEnv = detectorEnvelope(detectorRightTap);
    linkedEnv = linkedEnvelope(freeLeftEnv, freeRightEnv);
    detectorLeft = blendLinked(freeLeftEnv, linkedEnv);
    detectorRight = blendLinked(freeRightEnv, linkedEnv);

    detectorLeftDb = safeLin2db(detectorLeft);
    detectorRightDb = safeLin2db(detectorRight);
    openLeft = detectorLeftDb : windowOpen : shapeOpen : openTrace;
    openRight = detectorRightDb : windowOpen : shapeOpen : openTrace;

    gainLeft = targetGain(openLeft);
    gainRight = targetGain(openRight);
    wetLeftCore = frontLeft * gainLeft;
    wetRightCore = frontRight * gainRight;

    programLeft = mix(frontLeft, wetLeftCore, mixAmount) * outputGain;
    programRight = mix(frontRight, wetRightCore, mixAmount) * outputGain;
    differenceLeft = (frontLeft - wetLeftCore) * outputGain;
    differenceRight = (frontRight - wetRightCore) * outputGain;
    detectorMonitorLeft = detectorLeftTap * (0.84 + styleTight * 0.10 + focusEdge * 0.08);
    detectorMonitorRight = detectorRightTap * (0.84 + styleTight * 0.10 + focusEdge * 0.08);

    monitorLeftSig =
        programLeft * monitorProgram +
        detectorMonitorLeft * monitorDetector +
        differenceLeft * monitorDifference;
    monitorRightSig =
        programRight * monitorProgram +
        detectorMonitorRight * monitorDetector +
        differenceRight * monitorDifference;

    detectorMono = (detectorLeft + detectorRight) * 0.5;
    closureDepth = (1.0 - (openLeft + openRight) * 0.5);
    gainReductionMono = (gainReductionDb(gainLeft) + gainReductionDb(gainRight)) * 0.5;
    outputMono = (monitorLeftSig + monitorRightSig) * 0.5;

    outLeft = attach(
        attach(
            attach(monitorLeftSig, inputPeakView(inputMono)),
            detectorDriveView(detectorMono)
        ),
        closureDepthView(closureDepth)
    );
    outRight = attach(
        attach(monitorRightSig, gainReductionView(gainReductionMono)),
        outputPeakView(outputMono)
    );
};

process = _,_ : ba.bypass2(bypass, effect);
