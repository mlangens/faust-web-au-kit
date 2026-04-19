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

effect(x, y) =
    x * responseDrive,
    y * responseDrive
    : co.limiter_lad_stereo(lookaheadSeconds, responseCeiling, responseAttack, responseHold, responseRelease)
    : applyTube(tubeAmount), applyTube(tubeAmount)
    : applyTransformer(transformerAmount), applyTransformer(transformerAmount)
    : *(responseOutputTrim / max(responseDrive, ma.EPSILON)), *(responseOutputTrim / max(responseDrive, ma.EPSILON));

process = _,_ : ba.bypass2(bypass, effect);
