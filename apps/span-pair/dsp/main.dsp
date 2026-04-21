import("stdfaust.lib");

declare name "Span Pair";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.0";
declare description "Dual-filter utility scaffold with routing, linked cutoff spacing, drive, mix, output trim, and bypass.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);
norm01(x) = clamp(x / 100.0, 0.0, 1.0);

mode = hslider("Mode", 0.0, 0.0, 2.0, 1.0) : si.smoo;
routing = hslider("Routing", 0.0, 0.0, 2.0, 1.0) : si.smoo;
filterACutoff = hslider("Filter A Cutoff [unit:Hz][scale:log]", 320.0, 20.0, 18000.0, 1.0) : si.smoo;
filterARes = hslider("Filter A Resonance [unit:%]", 22.0, 0.0, 100.0, 1.0) : si.smoo;
filterBCutoff = hslider("Filter B Cutoff [unit:Hz][scale:log]", 2200.0, 20.0, 18000.0, 1.0) : si.smoo;
filterBRes = hslider("Filter B Resonance [unit:%]", 38.0, 0.0, 100.0, 1.0) : si.smoo;
spacing = hslider("Spacing [unit:%]", 58.0, 0.0, 100.0, 1.0) : si.smoo;
link = hslider("Link [unit:%]", 64.0, 0.0, 100.0, 1.0) : si.smoo;
drive = hslider("Drive [unit:%]", 12.0, 0.0, 100.0, 1.0) : si.smoo;
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
bypass = checkbox("Bypass");

modeSeries = mode == 0.0;
modeParallel = mode == 1.0;
modeSplit = mode == 2.0;

routingStereo = routing == 0.0;
routingCross = routing == 1.0;
routingMono = routing == 2.0;

driveAmount = norm01(drive);
mixAmount = norm01(mixPct);
linkAmount = norm01(link);
spacingAmount = norm01(spacing);
outputGain = db2lin(outputDb);

safeCutoff(x) = clamp(x, 20.0, 18000.0);
resonanceBoost(amount) = 1.0 + amount * 0.55;
resonanceTilt(amount) = 1.0 + amount * 0.15;
driveShape(amount, x) = x * (1.0 + amount * 4.0) : ma.tanh;

sharedCenter = (filterACutoff + filterBCutoff) * 0.5;
spanDistance = 90.0 + spacingAmount * 2200.0;

linkedCutA = safeCutoff(mix(filterACutoff, sharedCenter - spanDistance * 0.5, linkAmount));
linkedCutB = safeCutoff(mix(filterBCutoff, sharedCenter + spanDistance * 0.5, linkAmount));
linkedResA = clamp(mix(filterARes, filterBRes, linkAmount * 0.25), 0.0, 100.0);
linkedResB = clamp(mix(filterBRes, filterARes, linkAmount * 0.25), 0.0, 100.0);

cutAWithSpacing = safeCutoff(linkedCutA * (0.92 + spacingAmount * 0.18));
cutBWithSpacing = safeCutoff(linkedCutB * (1.08 - spacingAmount * 0.14));

routingBlend = routingStereo * 0.0 + routingCross * 0.42 + routingMono * 0.5;

inputRouteLeft(left, right) = mix(left, right, routingBlend);
inputRouteRight(left, right) = mix(right, left, routingBlend);

filterLow(x, cutoff, resonance) =
    x
    : fi.lowpass(2, cutoff * resonanceBoost(resonance))
    : *(resonanceTilt(resonance));

filterHigh(x, cutoff, resonance) =
    x
    : fi.highpass(2, max(20.0, cutoff * (1.0 - resonance * 0.003)))
    : *(resonanceTilt(resonance) * 0.92);

seriesProcess(x) =
    filterHigh(
        filterLow(driveShape(driveAmount, x), cutAWithSpacing, linkedResA),
        cutBWithSpacing,
        linkedResB
    );

parallelProcess(x) =
    mix(lowBranch, highBranch, 0.5)
with {
    lowBranch = filterLow(driveShape(driveAmount * 0.92, x), cutAWithSpacing, linkedResA);
    highBranch = filterHigh(driveShape(driveAmount, x), cutBWithSpacing, linkedResB);
};

splitLeftProcess(x) = filterLow(driveShape(driveAmount, x), cutAWithSpacing, linkedResA);

splitRightProcess(x) = filterHigh(driveShape(driveAmount, x), cutBWithSpacing, linkedResB);

spanProcessLeft(left, right) =
    seriesProcess(routeIn)
    * modeSeries
    + parallelProcess(routeIn) * modeParallel
    + splitLeftProcess(routeIn) * modeSplit
with {
    routeIn = inputRouteLeft(left, right);
};

spanProcessRight(left, right) =
    seriesProcess(routeIn)
    * modeSeries
    + parallelProcess(routeIn) * modeParallel
    + splitRightProcess(routeIn) * modeSplit
with {
    routeIn = inputRouteRight(left, right);
};

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
spanGapView = clamp(abs(linkedCutB - linkedCutA) / 180.0, 0.0, 1.0) : hbargraph("Span Gap", 0.0, 1.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(left, right) =
    outLeft, outRight
with {
    dryLeft = left;
    dryRight = right;
    wetLeft = spanProcessLeft(dryLeft, dryRight);
    wetRight = spanProcessRight(dryLeft, dryRight);
    mixedLeft = mix(dryLeft, wetLeft, mixAmount);
    mixedRight = mix(dryRight, wetRight, mixAmount);
    outLeft = attach(mixedLeft * outputGain, inputPeakView((dryLeft + dryRight) * 0.5));
    outRight = attach(mixedRight * outputGain, attach(spanGapView, outputPeakView((mixedLeft + mixedRight) * 0.5)));
};

process = _,_ : ba.bypass2(bypass, effect);
