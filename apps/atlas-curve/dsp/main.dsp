import("stdfaust.lib");
import("maxmsp.lib");

declare name "Atlas Curve";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "Flagship equalizer with selectable cut slope, dual sculpting bands, adaptive guidance, analyzer focus routing, and neutral Northline chrome.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);
ratioDb(num, den) = safeLin2db((num + ma.EPSILON) / (den + ma.EPSILON));

mode = hslider("Mode", 1.0, 0.0, 3.0, 1.0);
style = hslider("Style", 0.0, 0.0, 3.0, 1.0);
cutSlope = hslider("Cut Slope", 1.0, 0.0, 2.0, 1.0);
lowCutHz = hslider("Low Cut [unit:Hz][scale:log]", 28.0, 18.0, 240.0, 1.0);
lowShelfDb = hslider("Low Shelf [unit:dB]", 0.0, -12.0, 12.0, 0.1);
bellFreqHz = hslider("Bell Freq [unit:Hz][scale:log]", 780.0, 120.0, 4000.0, 1.0);
bellGainDb = hslider("Bell Gain [unit:dB]", 0.0, -12.0, 12.0, 0.1);
bellQ = hslider("Bell Q", 1.2, 0.25, 8.0, 0.01);
presenceFreqHz = hslider("Presence Freq [unit:Hz][scale:log]", 3600.0, 1000.0, 12000.0, 1.0);
presenceGainDb = hslider("Presence Gain [unit:dB]", 0.0, -12.0, 12.0, 0.1);
presenceQ = hslider("Presence Q", 1.0, 0.3, 10.0, 0.01);
highShelfDb = hslider("High Shelf [unit:dB]", 0.0, -12.0, 12.0, 0.1);
airPct = hslider("Air [unit:%]", 15.0, 0.0, 100.0, 1.0);
tiltDb = hslider("Tilt [unit:dB]", 0.0, -6.0, 6.0, 0.1);
bandFocus = hslider("Band Focus", 1.0, 0.0, 3.0, 1.0);
guidePct = hslider("Guide [unit:%]", 35.0, 0.0, 100.0, 1.0);
dynamicPct = hslider("Dynamic [unit:%]", 25.0, 0.0, 100.0, 1.0);
analyzer = hslider("Analyzer", 0.0, 0.0, 3.0, 1.0);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);
bypass = checkbox("Bypass");

modeOpen = mode == 0.0;
modeSculpt = mode == 1.0;
modeContour = mode == 2.0;
modePolish = mode == 3.0;

styleNeutral = style == 0.0;
styleWarm = style == 1.0;
styleForward = style == 2.0;
styleOpen = style == 3.0;

analyzerProgram = analyzer == 0.0;
analyzerLow = analyzer == 1.0;
analyzerMid = analyzer == 2.0;
analyzerAir = analyzer == 3.0;

slope12 = cutSlope == 0.0;
slope24 = cutSlope == 1.0;
slope36 = cutSlope == 2.0;

focusBroad = bandFocus == 0.0;
focusBalanced = bandFocus == 1.0;
focusTight = bandFocus == 2.0;
focusSplit = bandFocus == 3.0;

modeLowCutShift = modeOpen * -4.0 + modeSculpt * 6.0 + modeContour * 10.0 + modePolish * 2.0;
modeLowShelfShift = modeOpen * 0.0 + modeSculpt * -0.7 + modeContour * -0.25 + modePolish * 0.8;
modeBellGainShift = modeOpen * 0.0 + modeSculpt * 0.55 + modeContour * -0.35 + modePolish * 0.2;
modePresenceGainShift = modeOpen * 0.0 + modeSculpt * 0.2 + modeContour * 0.75 + modePolish * 0.45;
modeHighShelfShift = modeOpen * 0.0 + modeSculpt * 0.2 + modeContour * 0.45 + modePolish * 1.05;

styleLowShelfShift = styleNeutral * 0.0 + styleWarm * 1.25 + styleForward * -0.35 + styleOpen * -0.9;
styleBellGainShift = styleNeutral * 0.0 + styleWarm * -0.35 + styleForward * 1.15 + styleOpen * 0.4;
stylePresenceGainShift = styleNeutral * 0.0 + styleWarm * -0.2 + styleForward * 0.9 + styleOpen * 0.7;
styleHighShelfShift = styleNeutral * 0.0 + styleWarm * -0.85 + styleForward * 0.55 + styleOpen * 1.55;
styleBellQScale = styleNeutral * 1.0 + styleWarm * 1.1 + styleForward * 0.92 + styleOpen * 0.82;
stylePresenceQScale = styleNeutral * 1.0 + styleWarm * 1.05 + styleForward * 0.96 + styleOpen * 0.86;

focusBellQScale = focusBroad * 0.78 + focusBalanced * 1.0 + focusTight * 1.38 + focusSplit * 1.15;
focusPresenceQScale = focusBroad * 0.75 + focusBalanced * 1.0 + focusTight * 1.42 + focusSplit * 1.72;
focusBellFreqShift = focusBroad * -80.0 + focusBalanced * 0.0 + focusTight * 110.0 + focusSplit * -140.0;
focusPresenceFreqShift = focusBroad * -220.0 + focusBalanced * 0.0 + focusTight * 180.0 + focusSplit * 360.0;
focusDynamicScale = focusBroad * 0.82 + focusBalanced * 1.0 + focusTight * 1.22 + focusSplit * 1.12;

guideNorm = guidePct / 100.0;
dynamicNorm = dynamicPct / 100.0;
airLiftDb = airPct * 0.04;

inputLevel(x) = x : abs : an.rms_envelope_rect(0.04);
inputPeak(x) = x : abs : an.peak_envelope(0.05) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
guideDrive(x) = clamp(x, 0.0, 12.0) : hbargraph("Guide Drive", 0.0, 12.0);
outputPeak(x) = x : abs : an.peak_envelope(0.05) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

analyzerTap(inputMono, lowFocus, midFocus, airFocus) =
    inputMono * analyzerProgram
  + lowFocus * analyzerLow
  + midFocus * analyzerMid
  + airFocus * analyzerAir;

applyLowCut(freq, signal) =
    hp12 * slope12 + hp24 * slope24 + hp36 * slope36
with {
    hp12 = signal : fi.highpass(2, freq);
    hp24 = hp12 : fi.highpass(2, freq);
    hp36 = hp24 : fi.highpass(2, freq);
};

dynamicBandGain(baseGainDb, envDb, depth, scale) = adjusted
with {
    shift = clamp(
        max(0.0, envDb + 26.0) * depth * scale * (0.08 + abs(baseGainDb) * 0.03) * (abs(baseGainDb) > 0.05),
        0.0,
        6.0
    );
    adjusted =
        (baseGainDb >= 0.0) * max(0.0, baseGainDb - shift)
      + (baseGainDb < 0.0) * (baseGainDb - shift);
};

eqChain(lowCutFreq, lowShelfGainDb, bellCenterHz, bellAppliedGainDb, bellAppliedQ, presenceCenterHz, presenceAppliedGainDb, presenceAppliedQ, highShelfGainDb, signal) =
    highShelf(
        peakingEQ(
            peakingEQ(
                lowShelf(
                    applyLowCut(lowCutFreq, signal),
                    max(35.0, lowCutFreq * 2.8),
                    lowShelfGainDb,
                    0.707
                ),
                bellCenterHz,
                bellAppliedGainDb,
                bellAppliedQ
            ),
            presenceCenterHz,
            presenceAppliedGainDb,
            presenceAppliedQ
        ),
        clamp(presenceCenterHz * 1.7, 2200.0, 18000.0),
        highShelfGainDb,
        0.707
    );

process(x, y) = outputLeft, outputRight
with {
    dryLeft = x;
    dryRight = y;
    dryMono = (dryLeft + dryRight) * 0.5;

    lowCutFreq = clamp(lowCutHz + modeLowCutShift, 18.0, 260.0);
    bellCenterHz = clamp(bellFreqHz + focusBellFreqShift, 120.0, 4200.0);
    presenceCenterHz = clamp(presenceFreqHz + focusPresenceFreqShift, 1000.0, 12500.0);
    bellAppliedQ = clamp(bellQ * styleBellQScale * focusBellQScale, 0.25, 8.5);
    presenceAppliedQ = clamp(presenceQ * stylePresenceQScale * focusPresenceQScale, 0.3, 10.0);

    lowEnergy = dryMono
      : fi.lowpass(2, clamp(lowCutFreq * 2.4, 70.0, 420.0))
      : abs
      : an.rms_envelope_rect(0.06);
    bodyEnergy = dryMono
      : fi.highpass(2, clamp(lowCutFreq * 1.35, 80.0, 480.0))
      : fi.lowpass(2, clamp(bellCenterHz * 1.9, 420.0, 3600.0))
      : abs
      : an.rms_envelope_rect(0.06);
    presenceEnergy = dryMono
      : fi.highpass(2, clamp(presenceCenterHz * 0.58, 900.0, 5200.0))
      : fi.lowpass(2, clamp(presenceCenterHz * 1.85, 2500.0, 14000.0))
      : abs
      : an.rms_envelope_rect(0.06);
    airEnergy = dryMono
      : fi.highpass(2, clamp(presenceCenterHz * 1.2, 3200.0, 14000.0))
      : fi.lowpass(2, 19000.0)
      : abs
      : an.rms_envelope_rect(0.06);

    guideLowDb = clamp(ratioDb(bodyEnergy, lowEnergy) * 0.12 * guideNorm, -2.5, 2.5);
    guideHighDb = clamp(ratioDb(bodyEnergy, airEnergy) * 0.1 * guideNorm, -2.5, 2.5);
    guideBellDb = clamp(ratioDb(presenceEnergy, bodyEnergy) * 0.06 * guideNorm, -1.25, 1.25);

    lowShelfAppliedDb = lowShelfDb + modeLowShelfShift + styleLowShelfShift + guideLowDb - tiltDb * 0.75;
    bellBaseGainDb = bellGainDb + modeBellGainShift + styleBellGainShift + guideBellDb;
    presenceBaseGainDb = presenceGainDb + modePresenceGainShift + stylePresenceGainShift - guideBellDb * 0.4;
    highShelfAppliedDb = highShelfDb + modeHighShelfShift + styleHighShelfShift + guideHighDb + airLiftDb + tiltDb * 0.75;

    bodyEnvDb = safeLin2db(bodyEnergy);
    presenceEnvDb = safeLin2db(presenceEnergy);
    bellAppliedGainDb = dynamicBandGain(bellBaseGainDb, bodyEnvDb, dynamicNorm, focusDynamicScale);
    presenceAppliedGainDb = dynamicBandGain(presenceBaseGainDb, presenceEnvDb, dynamicNorm, focusDynamicScale * 1.08);

    guideActivity = abs(guideLowDb) + abs(guideHighDb) + abs(bellBaseGainDb - bellAppliedGainDb) + abs(presenceBaseGainDb - presenceAppliedGainDb);
    outputGain = db2lin(outputTrimDb);

    lowFocus = dryMono
      : fi.lowpass(2, clamp(lowCutFreq * 2.6, 70.0, 420.0));
    midFocus = dryMono
      : fi.highpass(2, clamp(lowCutFreq * 1.2, 90.0, 600.0))
      : fi.lowpass(2, clamp(presenceCenterHz * 1.1, 2200.0, 12000.0));
    airFocus = dryMono
      : fi.highpass(2, clamp(presenceCenterHz * 1.15, 3000.0, 14000.0))
      : fi.lowpass(2, 19000.0);

    wetLeft = eqChain(
        lowCutFreq,
        lowShelfAppliedDb,
        bellCenterHz,
        bellAppliedGainDb,
        bellAppliedQ,
        presenceCenterHz,
        presenceAppliedGainDb,
        presenceAppliedQ,
        highShelfAppliedDb,
        dryLeft
    );
    wetRight = eqChain(
        lowCutFreq,
        lowShelfAppliedDb,
        bellCenterHz,
        bellAppliedGainDb,
        bellAppliedQ,
        presenceCenterHz,
        presenceAppliedGainDb,
        presenceAppliedQ,
        highShelfAppliedDb,
        dryRight
    );

    analyzerLevel = analyzerTap(dryMono, lowFocus, midFocus, airFocus) : abs : an.peak_envelope(0.05) : safeLin2db : hbargraph("Guide Focus", -72.0, 6.0);
    meteredLeft = attach(wetLeft * outputGain, inputPeak(dryMono));
    meteredRight = attach(wetRight * outputGain, outputPeak((wetLeft + wetRight) * 0.5 * outputGain));
    guidedLeft = attach(meteredLeft, guideDrive(guideActivity));
    wetOutLeft = attach(guidedLeft, analyzerLevel);
    wetOutRight = meteredRight;

    outputLeft = mix(wetOutLeft, dryLeft, bypass);
    outputRight = mix(wetOutRight, dryRight, bypass);
};
