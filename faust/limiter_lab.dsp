import("stdfaust.lib");

declare name "Limiter Lab";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.2";
declare description "Oversampled limiter proof of concept with modern and vintage characteristics.";
declare license "MIT";

lookaheadSeconds = 0.0015;

db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
toSeconds(ms) = max(ms, 0.0) / 1000.0;

characterMix = checkbox("Vintage Character") : si.smoo;
bypass = checkbox("Bypass");

inputGainDb = hslider("Input Gain [unit:dB]", 0.0, -18.0, 18.0, 0.1);
ceilingDb = hslider("Ceiling [unit:dB]", -1.0, -12.0, 0.0, 0.1);
attackMs = hslider("Attack [unit:ms][scale:log]", 0.35, 0.05, 25.0, 0.01);
holdMs = hslider("Hold [unit:ms][scale:log]", 3.0, 0.0, 50.0, 0.1);
releaseMs = hslider("Release [unit:ms][scale:log]", 80.0, 5.0, 500.0, 0.1);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);

inputGain = db2lin(inputGainDb);
outputTrim = db2lin(outputTrimDb);
ceiling = db2lin(ceilingDb);

modernAttack = toSeconds(attackMs);
modernHold = toSeconds(holdMs);
modernRelease = toSeconds(releaseMs);

vintageAttack = modernAttack * 1.7;
vintageHold = modernHold * 1.35;
vintageRelease = modernRelease * 1.9;
vintageCeiling = db2lin(ceilingDb + 0.6);
vintageDrive = db2lin(inputGainDb + 2.0);
vintageTrim = db2lin(outputTrimDb - 0.8);

modernPath(x, y) =
    x * inputGain,
    y * inputGain
    : co.limiter_lad_stereo(lookaheadSeconds, ceiling, modernAttack, modernHold, modernRelease)
    : _,_ : *(outputTrim), *(outputTrim);

vintagePath(x, y) =
    x * vintageDrive,
    y * vintageDrive
    : co.limiter_lad_stereo(lookaheadSeconds, vintageCeiling, vintageAttack, vintageHold, vintageRelease)
    : aa.softclipQuadratic2, aa.softclipQuadratic2
    : fi.lowpass(2, 14500), fi.lowpass(2, 14500)
    : *(vintageTrim / max(vintageDrive, ma.EPSILON)), *(vintageTrim / max(vintageDrive, ma.EPSILON));

blend(sel, modernL, modernR, vintageL, vintageR) =
    modernL * (1.0 - sel) + vintageL * sel,
    modernR * (1.0 - sel) + vintageR * sel;

effect(x, y) = modernPath(x, y), vintagePath(x, y) : blend(characterMix);

process = _,_ : ba.bypass2(bypass, effect);
