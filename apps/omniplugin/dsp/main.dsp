import("stdfaust.lib");

declare name "Omniplugin";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "Slot-based omniplugin prototype with fixed realtime-safe primitive roles for DAW sound-building.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);
percent(x) = x / 100.0;

slot1Type = hslider("Slot 1 Type", 1.0, 0.0, 5.0, 1.0);
slot1Amount = hslider("Slot 1 Amount [unit:%]", 42.0, 0.0, 100.0, 1.0);
slot1Tone = hslider("Slot 1 Tone [unit:%]", 58.0, 0.0, 100.0, 1.0);
slot1Mix = hslider("Slot 1 Mix [unit:%]", 100.0, 0.0, 100.0, 1.0);

slot2Type = hslider("Slot 2 Type", 2.0, 0.0, 5.0, 1.0);
slot2Amount = hslider("Slot 2 Amount [unit:%]", 36.0, 0.0, 100.0, 1.0);
slot2Tone = hslider("Slot 2 Tone [unit:%]", 45.0, 0.0, 100.0, 1.0);
slot2Mix = hslider("Slot 2 Mix [unit:%]", 100.0, 0.0, 100.0, 1.0);

slot3Type = hslider("Slot 3 Type", 3.0, 0.0, 5.0, 1.0);
slot3Amount = hslider("Slot 3 Amount [unit:%]", 24.0, 0.0, 100.0, 1.0);
slot3Tone = hslider("Slot 3 Tone [unit:%]", 52.0, 0.0, 100.0, 1.0);
slot3Mix = hslider("Slot 3 Mix [unit:%]", 80.0, 0.0, 100.0, 1.0);

slot4Type = hslider("Slot 4 Type", 5.0, 0.0, 5.0, 1.0);
slot4Amount = hslider("Slot 4 Amount [unit:%]", 44.0, 0.0, 100.0, 1.0);
slot4Tone = hslider("Slot 4 Tone [unit:%]", 48.0, 0.0, 100.0, 1.0);
slot4Mix = hslider("Slot 4 Mix [unit:%]", 100.0, 0.0, 100.0, 1.0);

macroIntent = hslider("Macro Intent [unit:%]", 50.0, 0.0, 100.0, 1.0);
macroMotion = hslider("Macro Motion [unit:%]", 30.0, 0.0, 100.0, 1.0);
macroGuard = hslider("Macro Guard [unit:%]", 58.0, 0.0, 100.0, 1.0);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);
bypass = checkbox("Bypass");

typeWeight(slotType, index) = max(0.0, 1.0 - abs(slotType - index));

primitiveSlot(slotType, amountPct, tonePct, mixPct, detector, x) =
    mix(x, selected, percent(mixPct))
with {
    amount = clamp(percent(amountPct) * (0.7 + percent(macroIntent) * 0.7), 0.0, 1.5);
    tone = percent(tonePct);
    motion = percent(macroMotion);
    guard = percent(macroGuard);

    toneOut = x * (1.0 + amount * (tone - 0.5) * 0.8);
    dynamicsOut = x * (1.0 - clamp((detector - (0.08 + (1.0 - motion) * 0.24)) * 2.8, 0.0, 0.72) * amount);
    saturationOut = mix(x, ma.tanh(x * (1.0 + amount * (2.0 + tone * 7.0))), amount * 0.72);
    spaceOut = x * (1.0 + amount * (tone - 0.5) * 0.28);
    guardOut = ma.tanh(x * (1.0 + amount * (1.0 + guard * 3.0))) * (0.94 - guard * 0.22);

    selected =
        x * typeWeight(slotType, 0.0) +
        toneOut * typeWeight(slotType, 1.0) +
        dynamicsOut * typeWeight(slotType, 2.0) +
        saturationOut * typeWeight(slotType, 3.0) +
        spaceOut * typeWeight(slotType, 4.0) +
        guardOut * typeWeight(slotType, 5.0);
};

inputMeter(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
motionMeter(x) = x : abs : an.rms_envelope_rect(0.16) : hbargraph("Primitive Motion", 0.0, 1.0);
guardMeter(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Guard Peak", -72.0, 6.0);
outputMeter(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(left, right) =
    attach(finalLeft, inputMeter(inputMono)),
    attach(finalRight, attach(motion, attach(guardProbe, outputMeter(outputMono))))
with {
    inputMono = (left + right) * 0.5;
    detector = inputMono : abs : an.rms_envelope_rect(0.035 + percent(macroMotion) * 0.22);
    motion = motionMeter(detector * (0.5 + percent(macroIntent)));

    s1l = primitiveSlot(slot1Type, slot1Amount, slot1Tone, slot1Mix, detector, left);
    s1r = primitiveSlot(slot1Type, slot1Amount, slot1Tone, slot1Mix, detector, right);
    s2l = primitiveSlot(slot2Type, slot2Amount, slot2Tone, slot2Mix, detector, s1l);
    s2r = primitiveSlot(slot2Type, slot2Amount, slot2Tone, slot2Mix, detector, s1r);
    s3l = primitiveSlot(slot3Type, slot3Amount, slot3Tone, slot3Mix, detector, s2l);
    s3r = primitiveSlot(slot3Type, slot3Amount, slot3Tone, slot3Mix, detector, s2r);
    s4l = primitiveSlot(slot4Type, slot4Amount, slot4Tone, slot4Mix, detector, s3l);
    s4r = primitiveSlot(slot4Type, slot4Amount, slot4Tone, slot4Mix, detector, s3r);

    outputGain = db2lin(outputTrimDb);
    finalLeft = s4l * outputGain;
    finalRight = s4r * outputGain;
    outputMono = (finalLeft + finalRight) * 0.5;
    guardProbe = guardMeter(outputMono);
};

process = _,_ : ba.bypass2(bypass, effect);
