import("stdfaust.lib");

declare name "Pocket Cut";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "Mini filter utility scaffold with mode switching, cutoff and resonance shaping, envelope follow, drive, mix, output trim, and bypass.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);

mode = hslider("Mode", 0.0, 0.0, 3.0, 1.0);
cutoffHz = hslider("Cutoff [unit:Hz][scale:log]", 1200.0, 40.0, 18000.0, 1.0);
resonancePct = hslider("Resonance [unit:%]", 28.0, 0.0, 100.0, 1.0);
envFollow = hslider("Envelope Follow [unit:s][scale:log]", 0.06, 0.005, 0.5, 0.001);
drivePct = hslider("Drive [unit:%]", 12.0, 0.0, 100.0, 1.0);
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0);
outputTrimDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1);
bypass = checkbox("Bypass");

modeLow = mode == 0.0;
modeBand = mode == 1.0;
modeNotch = mode == 2.0;
modeHigh = mode == 3.0;

resonanceAmount = resonancePct / 100.0;
driveAmount = drivePct / 100.0;
mixAmount = mixPct / 100.0;
outputGain = db2lin(outputTrimDb);

modeCutShift = modeLow * -0.08 + modeBand * 0.0 + modeNotch * 0.06 + modeHigh * 0.12;
modeResShift = modeLow * 0.10 + modeBand * 0.28 + modeNotch * 0.42 + modeHigh * 0.14;

driveShape(amount, x) = mix(x, ma.tanh(x * (1.0 + amount * 5.0)), amount);

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
envelopeView(x) = x : abs : an.rms_envelope_rect(envFollow) : min(1.0) : hbargraph("Envelope", 0.0, 1.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

filterLow(x, cutoff, resQ) =
    x
    : fi.lowpass(2, cutoff * (1.0 + resQ * 0.03))
    : *(1.0 + resQ * 0.05);

filterBand(x, cutoff, resQ) =
    x
    : fi.highpass(2, max(24.0, cutoff * 0.62))
    : fi.lowpass(2, cutoff * (1.4 + resQ * 0.04))
    : *(1.0 + resQ * 0.07);

filterNotch(x, cutoff, resQ) =
    x - (
        x
        : fi.highpass(2, max(24.0, cutoff * 0.62))
        : fi.lowpass(2, cutoff * (1.4 + resQ * 0.04))
      ) * (0.35 + resQ * 0.45);

filterHigh(x, cutoff, resQ) =
    x
    : fi.highpass(2, cutoff * (0.98 + resQ * 0.02))
    : *(1.0 + resQ * 0.04);

modeFilter(x, cutoff, resQ) =
    lowTone * modeLow +
    bandTone * modeBand +
    notchTone * modeNotch +
    highTone * modeHigh
with {
    lowTone = filterLow(x, cutoff, resQ);
    bandTone = filterBand(x, cutoff, resQ);
    notchTone = filterNotch(x, cutoff, resQ);
    highTone = filterHigh(x, cutoff, resQ);
};

effect(left, right) =
    attach(finalLeft, inputPeakView(dryMono)),
    attach(finalRight, attach(envelopeTap, outputPeakView(finalMono)))
with {
    dryMono = (left + right) * 0.5;
    envelope = dryMono : abs : an.rms_envelope_rect(envFollow);
    envelopeTap = envelopeView(envelope);
    cutoffMotion = clamp(cutoffHz * (1.0 + envelope * 0.75 + modeCutShift), 40.0, 18000.0);
    resonanceMotion = clamp(0.4 + resonanceAmount * 5.8 + envelope * 1.6 + modeResShift, 0.25, 8.0);
    driveMotion = driveAmount * (0.8 + envelope * 0.5);
    wetLeft = modeFilter(driveShape(driveMotion, left), cutoffMotion, resonanceMotion);
    wetRight = modeFilter(driveShape(driveMotion, right), cutoffMotion, resonanceMotion);
    mixedLeft = mix(wetLeft, left, 1.0 - mixAmount);
    mixedRight = mix(wetRight, right, 1.0 - mixAmount);
    finalLeft = mixedLeft * outputGain;
    finalRight = mixedRight * outputGain;
    finalMono = (finalLeft + finalRight) * 0.5;
};

process = _,_ : ba.bypass2(bypass, effect);
