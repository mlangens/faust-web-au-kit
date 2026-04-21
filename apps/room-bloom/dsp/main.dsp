import("stdfaust.lib");

re = library("reverbs.lib");

declare name "Room Bloom";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Stereo ambience processor with layered early reflections, dual-tail bloom shaping, duck timing, width control, and freeze-aware hold behavior.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp01(x) = min(1.0, max(0.0, x));
msToSamples(ms) = int(max(ms, 0.0) * ma.SR / 1000.0);
onePole(a) = *(1.0 - a) : + ~ *(a);
delayLineMax = 32768;
tap(delayMs, toneHz, gain, x) = x
    : de.fdelay(delayLineMax, msToSamples(delayMs))
    : fi.lowpass(1, min(18000.0, toneHz))
    : *(gain);

space = hslider("Space", 2.0, 0.0, 3.0, 1.0);
character = hslider("Character", 1.0, 0.0, 3.0, 1.0);
sizePct = hslider("Size [unit:%]", 64.0, 0.0, 100.0, 1.0);
preDelayMs = hslider("Pre-Delay [unit:ms]", 18.0, 0.0, 180.0, 0.1);
decaySec = hslider("Decay [unit:s]", 3.6, 0.3, 12.0, 0.01);
diffusionPct = hslider("Diffusion [unit:%]", 66.0, 0.0, 100.0, 1.0);
widthPct = hslider("Width [unit:%]", 62.0, 0.0, 100.0, 1.0);
bloomPct = hslider("Bloom [unit:%]", 58.0, 0.0, 100.0, 1.0);
lowCutHz = hslider("Low Cut [unit:Hz][scale:log]", 130.0, 20.0, 1200.0, 1.0);
highCutHz = hslider("High Cut [unit:Hz][scale:log]", 7600.0, 1200.0, 18000.0, 1.0);
duckingPct = hslider("Ducking [unit:%]", 28.0, 0.0, 100.0, 1.0);
duckReleaseMs = hslider("Duck Release [unit:ms][scale:log]", 360.0, 40.0, 1500.0, 1.0);
mixPct = hslider("Mix [unit:%]", 32.0, 0.0, 100.0, 1.0);
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1);
freeze = checkbox("Freeze");
bypass = checkbox("Bypass");

spaceRoom = space == 0.0;
spaceChamber = space == 1.0;
spaceHall = space == 2.0;
spaceVast = space == 3.0;

charClear = character == 0.0;
charWarm = character == 1.0;
charDense = character == 2.0;
charAir = character == 3.0;

spaceSizeScale = spaceRoom * 0.76 + spaceChamber * 0.92 + spaceHall * 1.08 + spaceVast * 1.32;
spaceDecayScale = spaceRoom * 0.72 + spaceChamber * 0.90 + spaceHall * 1.08 + spaceVast * 1.30;
spacePredelayScale = spaceRoom * 0.70 + spaceChamber * 0.88 + spaceHall * 1.02 + spaceVast * 1.24;
spaceWidthScale = spaceRoom * 0.70 + spaceChamber * 0.86 + spaceHall * 1.00 + spaceVast * 1.18;
spaceBloomScale = spaceRoom * 0.74 + spaceChamber * 0.90 + spaceHall * 1.04 + spaceVast * 1.20;
spaceEarlyMs = spaceRoom * 6.0 + spaceChamber * 10.0 + spaceHall * 15.0 + spaceVast * 23.0;

characterToneScale = charClear * 1.02 + charWarm * 0.82 + charDense * 0.72 + charAir * 1.12;
characterWidthScale = charClear * 0.98 + charWarm * 0.86 + charDense * 0.78 + charAir * 1.10;
characterBloomScale = charClear * 0.86 + charWarm * 0.98 + charDense * 1.12 + charAir * 0.92;
characterDiffusionScale = charClear * 0.94 + charWarm * 1.00 + charDense * 1.14 + charAir * 0.90;

size = sizePct / 100.0;
diffusion = diffusionPct / 100.0;
width = widthPct / 100.0;
bloom = bloomPct / 100.0;
duckAmount = duckingPct / 100.0;
mixAmount = mixPct / 100.0;
outputGain = db2lin(outputDb);
freezeAmount = freeze;

effectiveHighCut = min(18000.0, max(lowCutHz + 400.0, highCutHz * characterToneScale + bloom * 1200.0));
inputLowCut = max(20.0, lowCutHz * 0.24);
inputHighCut = min(19000.0, max(inputLowCut + 600.0, effectiveHighCut + 2600.0));
wetLowCut = max(20.0, lowCutHz);
wetHighCut = min(18000.0, effectiveHighCut);

roomInput(x) = x
    : fi.highpass(1, inputLowCut)
    : fi.lowpass(2, inputHighCut);

predelaySamples = msToSamples(preDelayMs * spacePredelayScale);

decayTarget = decaySec * spaceDecayScale * (0.72 + size * 0.90);
diffusionTarget = clamp01(diffusion * characterDiffusionScale);
bloomMix = clamp01(bloom * (0.60 + (spaceBloomScale - 0.74) * 0.70) * characterBloomScale);
wetWidth = 0.50 + width * 1.15 * spaceWidthScale * characterWidthScale;

feedbackA = min(0.986, 0.52 + decayTarget / 28.0 + size * 0.08 + bloom * 0.04);
feedbackB = min(0.948, 0.20 + diffusionTarget * 0.60 + decayTarget / 38.0 + size * 0.05);
dampingA = min(0.92, 0.06 + (1.0 - diffusionTarget) * 0.28 + (1.0 - wetHighCut / 18000.0) * 0.32);
dampingB = min(0.94, dampingA * 0.84 + 0.05 + bloom * 0.08);
spreadA = int(18.0 + size * 22.0 + spaceEarlyMs * 0.55 + width * 12.0);
spreadB = int(28.0 + size * 28.0 + spaceEarlyMs * 0.85 + width * 18.0);

freezeFeedbackA = mix(feedbackA, 0.9993, freezeAmount);
freezeFeedbackB = mix(feedbackB, 0.9988, freezeAmount);
freezeDampingA = mix(dampingA, 0.02, freezeAmount);
freezeDampingB = mix(dampingB, 0.01, freezeAmount);
freezeSpreadA = int(mix(spreadA, max(8.0, spreadA * 0.52), freezeAmount));
freezeSpreadB = int(mix(spreadB, max(12.0, spreadB * 0.58), freezeAmount));

duckCoeff = exp(-1.0 / max(1.0, duckReleaseMs * ma.SR / 1000.0));
inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
earlyEnergyView(x) = x : abs : an.rms_envelope_rect(0.06) : safeLin2db : hbargraph("Early Energy", -72.0, 6.0);
tailEnergyView(x) = x : abs : an.rms_envelope_rect(0.10) : safeLin2db : hbargraph("Tail Energy", -72.0, 6.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);
duckReductionView(x) = (1.0 - x) * 24.0 : hbargraph("Duck Reduction", 0.0, 24.0);
stereoSpreadView(side, mid) = spread : hbargraph("Stereo Spread", 0.0, 100.0)
with {
    sideEnv = side : abs : an.rms_envelope_rect(0.08);
    midEnv = mid : abs : an.rms_envelope_rect(0.08);
    spread = clamp01(sideEnv / max(ma.EPSILON, sideEnv + midEnv)) * 100.0;
};

effect(x, y) =
    outLeft, outRight
with {
    dryLeft = x;
    dryRight = y;
    dryMid = (dryLeft + dryRight) * 0.5;
    drySide = (dryLeft - dryRight) * 0.5;
    widthSeed = mix(0.55, wetWidth, 0.72);
    seedLeft = dryMid + drySide * widthSeed;
    seedRight = dryMid - drySide * widthSeed;
    preLeft = seedLeft : roomInput : de.fdelay(delayLineMax, predelaySamples);
    preRight = seedRight : roomInput : de.fdelay(delayLineMax, predelaySamples);
    freezeGate = 1.0 - freezeAmount;
    feedLeft = preLeft * freezeGate;
    feedRight = preRight * freezeGate;

    earlyBase = spaceEarlyMs + size * 18.0;
    earlyLeft = tap(2.0 + earlyBase * 0.42, wetHighCut * 0.92, 0.55, feedLeft)
      + tap(5.0 + earlyBase * 0.74, wetHighCut * 0.78, 0.34, feedRight)
      + tap(9.0 + earlyBase * 1.08, wetHighCut * 0.64, 0.24, feedLeft)
      + tap(14.0 + earlyBase * 1.44, wetHighCut * 0.52, 0.18, feedRight);
    earlyRight = tap(2.0 + earlyBase * 0.42, wetHighCut * 0.92, 0.55, feedRight)
      + tap(5.0 + earlyBase * 0.74, wetHighCut * 0.78, 0.34, feedLeft)
      + tap(9.0 + earlyBase * 1.08, wetHighCut * 0.64, 0.24, feedRight)
      + tap(14.0 + earlyBase * 1.44, wetHighCut * 0.52, 0.18, feedLeft);

    earlyWetLeft = earlyLeft
      : fi.highpass(1, wetLowCut)
      : fi.lowpass(2, wetHighCut * 0.96);
    earlyWetRight = earlyRight
      : fi.highpass(1, wetLowCut)
      : fi.lowpass(2, wetHighCut * 0.96);

    tankSeedLeft = feedLeft * 0.32 + earlyWetLeft * (0.60 + diffusionTarget * 0.24) + earlyWetRight * 0.10;
    tankSeedRight = feedRight * 0.32 + earlyWetRight * (0.60 + diffusionTarget * 0.24) + earlyWetLeft * 0.10;

    tankA_Left = tankSeedLeft : re.mono_freeverb(freezeFeedbackA, freezeFeedbackB, freezeDampingA, freezeSpreadA);
    tankA_Right = tankSeedRight : re.mono_freeverb(freezeFeedbackA, freezeFeedbackB, freezeDampingA, freezeSpreadA);
    tankB_Left = (tankSeedLeft + earlyWetRight * 0.18)
      : fi.lowpass(1, min(18000.0, wetHighCut * (0.80 + bloom * 0.12)))
      : re.mono_freeverb(min(0.9992, freezeFeedbackA * 0.985 + bloom * 0.01), min(0.9990, freezeFeedbackB * 0.990 + diffusionTarget * 0.005), freezeDampingB, freezeSpreadB);
    tankB_Right = (tankSeedRight + earlyWetLeft * 0.18)
      : fi.lowpass(1, min(18000.0, wetHighCut * (0.80 + bloom * 0.12)))
      : re.mono_freeverb(min(0.9992, freezeFeedbackA * 0.985 + bloom * 0.01), min(0.9990, freezeFeedbackB * 0.990 + diffusionTarget * 0.005), freezeDampingB, freezeSpreadB);

    tailBlendLeft = mix(tankA_Left, tankB_Left, bloomMix);
    tailBlendRight = mix(tankA_Right, tankB_Right, bloomMix);
    tailMid = (tailBlendLeft + tailBlendRight) * 0.5;
    tailSide = (tailBlendLeft - tailBlendRight) * 0.5 * wetWidth;
    earlySend = 0.18 + (1.0 - bloom) * 0.18 + (1.0 - diffusionTarget) * 0.08;
    wetLeft = (tailMid + tailSide + earlyWetLeft * earlySend)
      : fi.highpass(1, wetLowCut)
      : fi.lowpass(2, wetHighCut);
    wetRight = (tailMid - tailSide + earlyWetRight * earlySend)
      : fi.highpass(1, wetLowCut)
      : fi.lowpass(2, wetHighCut);

    duckDetector = dryMid : abs : onePole(duckCoeff);
    duckDrive = clamp01((duckDetector - 0.01) * (3.0 + size * 1.6));
    effectiveDuck = duckAmount * (1.0 - freezeAmount * 0.85);
    wetDuck = 1.0 - effectiveDuck * duckDrive;
    duckedWetLeft = wetLeft * wetDuck;
    duckedWetRight = wetRight * wetDuck;

    mixedLeft = mix(dryLeft, duckedWetLeft, mixAmount) * outputGain;
    mixedRight = mix(dryRight, duckedWetRight, mixAmount) * outputGain;
    earlyMono = (earlyWetLeft + earlyWetRight) * 0.5;
    tailMono = (tailBlendLeft + tailBlendRight) * 0.5;
    wetMid = (duckedWetLeft + duckedWetRight) * 0.5;
    wetSide = (duckedWetLeft - duckedWetRight) * 0.5;

    finalLeft = mix(mixedLeft, dryLeft, bypass);
    finalRight = mix(mixedRight, dryRight, bypass);

    outLeft = attach(
        attach(
            attach(finalLeft, inputPeakView(dryMid)),
            earlyEnergyView(earlyMono)
        ),
        tailEnergyView(tailMono)
    );
    outRight = attach(
        attach(
            attach(
                attach(finalRight, stereoSpreadView(wetSide, wetMid)),
                duckReductionView(wetDuck)
            ),
            outputPeakView((finalLeft + finalRight) * 0.5)
        )
    );
};

process = effect;
