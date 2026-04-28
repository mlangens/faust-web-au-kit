import("stdfaust.lib");

declare name "FET-76";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "1176-style FET compressor proof built from framework primitives and UADx profiling residuals.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp01(x) = min(1.0, max(0.0, x));
sq(x) = x * x;

inputKnob = hslider("Input", 5.2, 0.0, 10.0, 0.01) : si.smoo;
outputKnob = hslider("Output", 5.6, 0.0, 10.0, 0.01) : si.smoo;
ratioMode = hslider("Ratio", 1.0, 0.0, 4.0, 1.0);
attackKnob = hslider("Attack", 6.2, 1.0, 7.0, 0.01) : si.smoo;
releaseKnob = hslider("Release", 5.8, 1.0, 7.0, 0.01) : si.smoo;
biasKnob = hslider("Bias", 4.8, 0.0, 10.0, 0.01) : si.smoo;
sidechainHpHz = hslider("Sidechain HP [unit:Hz][scale:log]", 55.0, 20.0, 400.0, 1.0) : si.smoo;
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
meterMode = hslider("Meter", 2.0, 0.0, 3.0, 1.0);
power = hslider("Power", 1.0, 0.0, 1.0, 1.0);

ratio4 = ratioMode == 0.0;
ratio8 = ratioMode == 1.0;
ratio12 = ratioMode == 2.0;
ratio20 = ratioMode == 3.0;
ratioAll = ratioMode == 4.0;

ratioValue =
    ratio4 * 4.0 +
    ratio8 * 8.0 +
    ratio12 * 12.0 +
    ratio20 * 20.0 +
    ratioAll * 60.0;

inputNorm = inputKnob / 10.0;
outputNorm = outputKnob / 10.0;
biasNorm = biasKnob / 10.0;
mixAmount = mixPct / 100.0;

inputGainDb = (inputKnob - 5.0) * 4.4;
outputGainDb = (outputKnob - 5.0) * 3.6;
inputGain = db2lin(inputGainDb);
outputGain = db2lin(outputGainDb);

attackNorm = clamp01((attackKnob - 1.0) / 6.0);
releaseNorm = clamp01((releaseKnob - 1.0) / 6.0);

// The 1176-style controls are intentionally reversed: larger knob numbers are faster.
attackSeconds = max(0.000018, 0.00082 * pow(0.024, attackNorm));
releaseSeconds = max(0.045, 1.15 * pow(0.042, releaseNorm));
allButtonTiming = ratioAll * 0.72 + (1.0 - ratioAll);
effectiveAttack = attackSeconds * allButtonTiming;
effectiveRelease = releaseSeconds * (1.0 + ratioAll * 0.55);

thresholdDb = -27.5 - inputNorm * 11.0 + ratioAll * 2.0;
kneeDb = ratioAll * 1.2 + (1.0 - ratioAll) * 3.6;
rangeDb = 31.0;
compressionSlope = 1.0 - (1.0 / max(1.0, ratioValue));

// A small transformer-like pre-emphasis keeps the detector from being a plain broadband slider.
inputTransformer(x) = (x + (x : fi.highpass(1, 2600.0)) * (0.035 + biasNorm * 0.055)) * inputGain;
sidechainTap(x) = x : fi.highpass(1, sidechainHpHz);
detectorEnvelope(x) = x : abs : an.amp_follower_ar(effectiveAttack, effectiveRelease);

compressionDb(levelDb) =
    ba.if(
        levelDb - thresholdDb <= (-0.5 * kneeDb),
        0.0,
        ba.if(
            levelDb - thresholdDb >= (0.5 * kneeDb),
            max(levelDb - thresholdDb, 0.0) * compressionSlope,
            compressionSlope * sq(levelDb - thresholdDb + 0.5 * kneeDb) / max(kneeDb * 2.0, ma.EPSILON)
        )
    );

gainReductionTarget(env) = min(rangeDb, compressionDb(safeLin2db(env)));
gainReductionSmooth(gr) = gr : si.onePoleSwitching(effectiveAttack, effectiveRelease);
gainFromReduction(grDb) = db2lin(0.0 - grDb);

fetHarmonicStage(x, grDb) =
    mix(
        x,
        (ma.tanh((x + asymmetry) * drive) / max(ma.tanh(drive), ma.EPSILON)) - asymmetry,
        colorAmount
    )
with {
    drivenReduction = clamp01(grDb / 22.0);
    asymmetry = (biasNorm - 0.5) * 0.030 + drivenReduction * 0.010;
    drive = 1.18 + inputNorm * 1.90 + biasNorm * 0.85 + drivenReduction * 1.10 + ratioAll * 0.52;
    colorAmount = clamp01(0.16 + inputNorm * 0.22 + drivenReduction * 0.28 + ratioAll * 0.18);
};

postTone(x, grDb) =
    mix(
        x,
        (x : fi.lowpass(1, 18500.0)) + (x : fi.highpass(1, 5200.0)) * (0.025 + clamp01(grDb / 24.0) * 0.055),
        0.42
    );
fetProgramStage(x, grDb) = postTone(fetHarmonicStage(x, grDb), grDb);

inputLevelView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Level", -72.0, 12.0);
outputLevelView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Level", -72.0, 12.0);
gainReductionView(x) = x : hbargraph("Gain Reduction", 0.0, 30.0);

effect(leftIn, rightIn) =
    outLeft, outRight
with {
    inLeft = inputTransformer(leftIn);
    inRight = inputTransformer(rightIn);
    inputMono = (inLeft + inRight) * 0.5;
    detector = detectorEnvelope(sidechainTap(inputMono));
    gainReductionDb = gainReductionSmooth(gainReductionTarget(detector));
    reductionGain = gainFromReduction(gainReductionDb);

    wetLeft = fetProgramStage(inLeft * reductionGain, gainReductionDb);
    wetRight = fetProgramStage(inRight * reductionGain, gainReductionDb);
    programLeft = mix(inLeft, wetLeft, mixAmount) * outputGain;
    programRight = mix(inRight, wetRight, mixAmount) * outputGain;
    outputMono = (programLeft + programRight) * 0.5;

    outLeft = attach(attach(attach(programLeft, meterMode), inputLevelView(inputMono)), gainReductionView(gainReductionDb));
    outRight = attach(programRight, outputLevelView(outputMono));
};

process = _,_ : ba.bypass2(1.0 - power, effect);
