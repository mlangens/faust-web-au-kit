import("stdfaust.lib");

declare name "Limiter Lab";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.3";
declare description "Oversampled limiter proof of concept with modern or vintage response plus tube and transformer coloration.";
declare license "MIT";

lookaheadSeconds = 0.0015;

db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;

vintageResponse = checkbox("Vintage Response") : si.smoo;
bypass = checkbox("Bypass");

tubeDrivePct = hslider("Tube Drive [unit:%]", 0.0, 0.0, 100.0, 1.0);
transformerTonePct = hslider("Transformer Tone [unit:%]", 0.0, 0.0, 100.0, 1.0);
driveTarget = hslider("Drive Target", 0.0, 0.0, 2.0, 1.0);
driveFocus = hslider("Drive Focus", 0.0, 0.0, 3.0, 1.0);
rawDriveLowSplitHz = hslider("Drive Low Split [unit:Hz][scale:log]", 220.0, 60.0, 4000.0, 1.0);
rawDriveHighSplitHz = hslider("Drive High Split [unit:Hz][scale:log]", 3000.0, 800.0, 18000.0, 1.0);
inputGainDb = hslider("Input Gain [unit:dB]", 0.0, -18.0, 18.0, 0.1);
ceilingDb = hslider("Ceiling [unit:dB]", -1.0, -12.0, 0.0, 0.1);
attackMs = hslider("Attack [unit:ms][scale:log]", 0.35, 0.05, 25.0, 0.01);
holdMs = hslider("Hold [unit:ms][scale:log]", 3.0, 0.0, 50.0, 0.1);
releaseMs = hslider("Release [unit:ms][scale:log]", 80.0, 5.0, 500.0, 0.1);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);

mix(a, b, t) = a * (1.0 - t) + b * t;

inputGain = db2lin(inputGainDb);
outputTrim = db2lin(outputTrimDb);
ceiling = db2lin(ceilingDb);
tubeAmount = tubeDrivePct / 100.0;
transformerAmount = transformerTonePct / 100.0;
driveHighSplit = min(20000.0, max(rawDriveHighSplitHz, rawDriveLowSplitHz + 40.0));
driveLowSplit = max(40.0, min(rawDriveLowSplitHz, driveHighSplit - 40.0));

driveBoth = driveTarget == 0.0;
driveMidOnly = driveTarget == 1.0;
driveSideOnly = driveTarget == 2.0;
driveMidMask = driveBoth + driveMidOnly;
driveSideMask = driveBoth + driveSideOnly;

driveFullBand = driveFocus == 0.0;
driveLowBand = driveFocus == 1.0;
driveMidBand = driveFocus == 2.0;
driveHighBand = driveFocus == 3.0;
focusLowMask = driveFullBand + driveLowBand;
focusMidMask = driveFullBand + driveMidBand;
focusHighMask = driveFullBand + driveHighBand;

modernAttack = toSeconds(attackMs);
modernHold = toSeconds(holdMs);
modernRelease = toSeconds(releaseMs);

vintageAttack = modernAttack * 1.7;
vintageHold = modernHold * 1.35;
vintageRelease = modernRelease * 1.9;
vintageCeiling = db2lin(ceilingDb + 0.6);
baseVintageDrive = db2lin(inputGainDb + 1.5);
vintageTrim = db2lin(outputTrimDb - 0.6);
responseAttack = mix(modernAttack, vintageAttack, vintageResponse);
responseHold = mix(modernHold, vintageHold, vintageResponse);
responseRelease = mix(modernRelease, vintageRelease, vintageResponse);
responseCeiling = mix(ceiling, vintageCeiling, vintageResponse);
responseDrive = mix(inputGain, baseVintageDrive, vintageResponse);
responseOutputTrim = mix(outputTrim, vintageTrim, vintageResponse);

tubeShape(amount, x) =
    ((ma.tanh((x + amount * 0.12) * (1.0 + amount * 4.0)) -
      ma.tanh(amount * 0.12 * (1.0 + amount * 4.0))) /
     max(ma.tanh((1.0 + amount * 0.12) * (1.0 + amount * 4.0)) -
         ma.tanh(amount * 0.12 * (1.0 + amount * 4.0)), ma.EPSILON));

transformerShape(amount, x) =
    x
    : fi.highpass(1, 24.0 + amount * 84.0)
    : *(1.0 + amount * 1.75)
    : ma.tanh
    : fi.lowpass(2, 18000.0 - amount * 7000.0);

applyTube(amount, x) = mix(x, tubeShape(amount, x), amount);
applyTransformer(amount, x) = mix(x, transformerShape(amount, x), amount);
driveColor(x) = x : applyTube(tubeAmount) : applyTransformer(transformerAmount);
processDriveBand(mask, x) = mix(x, driveColor(x), mask);

focusedDrive(lowMask, midMask, highMask) =
    fi.crossover3LR4(driveLowSplit, driveHighSplit)
    : processDriveBand(lowMask), processDriveBand(midMask), processDriveBand(highMask)
    :> _;

measureDriveDelta(lowMask, midMask, highMask) =
    _ <: _, focusedDrive(lowMask, midMask, highMask)
    : -
    : abs;

processDriveComponent(targetMask) =
    focusedDrive(targetMask * focusLowMask, targetMask * focusMidMask, targetMask * focusHighMask);

measureDriveComponent(targetMask) =
    measureDriveDelta(targetMask * focusLowMask, targetMask * focusMidMask, targetMask * focusHighMask);

driveBandHeatView =
    fi.crossover3LR4(driveLowSplit, driveHighSplit)
    : bandHeatLow, bandHeatMid, bandHeatHigh
    :> _
with {
    bandHeatLow = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive Low Saturation", 0.0, 1.0);
    bandHeatMid = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive Mid Saturation", 0.0, 1.0);
    bandHeatHigh = an.rms_envelope_rect(0.05) : min(1.0) : hbargraph("Drive High Saturation", 0.0, 1.0);
};

effect(x, y) =
    attach(preLimitLeft, driveBandHeatView(driveDeltaSignal)),
    preLimitRight
    : co.limiter_lad_stereo(lookaheadSeconds, responseCeiling, responseAttack, responseHold, responseRelease)
    : *(responseOutputTrim / max(responseDrive, ma.EPSILON)), *(responseOutputTrim / max(responseDrive, ma.EPSILON))
with {
    drivenLeft = x * responseDrive;
    drivenRight = y * responseDrive;
    drivenMid = (drivenLeft + drivenRight) * 0.5 : processDriveComponent(driveMidMask);
    drivenSide = (drivenLeft - drivenRight) * 0.5 : processDriveComponent(driveSideMask);
    preLimitLeft = drivenMid + drivenSide;
    preLimitRight = drivenMid - drivenSide;
    driveDeltaSignal =
        0.5 *
        (((drivenLeft + drivenRight) * 0.5 : measureDriveComponent(driveMidMask)) +
         ((drivenLeft - drivenRight) * 0.5 : measureDriveComponent(driveSideMask)));
};

process = _,_ : ba.bypass2(bypass, effect);
