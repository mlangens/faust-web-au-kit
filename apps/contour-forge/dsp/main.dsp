import("stdfaust.lib");

declare name "Contour Forge";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Routable filter with deeper motion-source selection, spread-aware stereo shaping, drive staging, and reusable Northline modulation vocabulary.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);
clamp01(x) = clamp(x, 0.0, 1.0);

mode = hslider("Mode", 1.0, 0.0, 3.0, 1.0);
style = hslider("Style", 2.0, 0.0, 3.0, 1.0);
motionSource = hslider("Motion Source", 2.0, 0.0, 2.0, 1.0);
cutoffHz = hslider("Cutoff [unit:Hz][scale:log]", 1800.0, 40.0, 18000.0, 1.0);
resonancePct = hslider("Resonance [unit:%]", 42.0, 0.0, 100.0, 1.0);
drivePct = hslider("Drive [unit:%]", 18.0, 0.0, 100.0, 1.0);
filterSpreadPct = hslider("Filter Spread [unit:%]", 0.0, 0.0, 100.0, 1.0);
envAmountPct = hslider("Env Amount [unit:%]", 35.0, 0.0, 100.0, 1.0);
envSpeed = hslider("Env Speed [unit:s][scale:log]", 0.06, 0.005, 0.5, 0.001);
motionBiasPct = hslider("Motion Bias [unit:%]", 0.0, -100.0, 100.0, 1.0);
lfoRate = hslider("LFO Rate [unit:Hz][scale:log]", 0.18, 0.03, 6.0, 0.01);
lfoDepthPct = hslider("LFO Depth [unit:%]", 22.0, 0.0, 100.0, 1.0);
stereoLinkPct = hslider("Stereo Link [unit:%]", 65.0, 0.0, 100.0, 1.0);
routing = hslider("Routing", 0.0, 0.0, 2.0, 1.0);
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0);
outputTrimDb = hslider("Output Trim [unit:dB]", 0.0, -18.0, 18.0, 0.1);
bypass = checkbox("Bypass");

modeLow = mode == 0.0;
modeBand = mode == 1.0;
modeNotch = mode == 2.0;
modeHigh = mode == 3.0;

styleNeutral = style == 0.0;
styleWarm = style == 1.0;
styleBite = style == 2.0;
styleWide = style == 3.0;

motionEnv = motionSource == 0.0;
motionLfo = motionSource == 1.0;
motionHybrid = motionSource == 2.0;

routeStereo = routing == 0.0;
routeMidSide = routing == 1.0;
routeMono = routing == 2.0;

driveAmount = drivePct / 100.0;
resonanceAmount = resonancePct / 100.0;
spreadAmount = filterSpreadPct / 100.0;
envAmount = envAmountPct / 100.0;
lfoDepth = lfoDepthPct / 100.0;
stereoLink = stereoLinkPct / 100.0;
mixAmount = mixPct / 100.0;
outputGain = db2lin(outputTrimDb);
biasAmount = motionBiasPct / 100.0;

styleDriveScale = styleNeutral * 0.95 + styleWarm * 1.0 + styleBite * 1.18 + styleWide * 1.06;
styleLowpassBias = styleNeutral * 1.0 + styleWarm * 0.88 + styleBite * 1.14 + styleWide * 1.06;
styleResBias = styleNeutral * 1.0 + styleWarm * 0.92 + styleBite * 1.18 + styleWide * 1.04;
styleSpreadBias = styleNeutral * 0.85 + styleWarm * 0.75 + styleBite * 0.92 + styleWide * 1.26;
modeCutoffBias = modeLow * -0.16 + modeBand * 0.0 + modeNotch * 0.08 + modeHigh * 0.16;
modeResBias = modeLow * 0.12 + modeBand * 0.28 + modeNotch * 0.42 + modeHigh * 0.18;

driveShape(amount, x) = mix(x, ma.tanh(x * (1.0 + amount * 6.0)), amount);

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
motionDepthView(x) = x * 100.0 : hbargraph("Motion Depth", 0.0, 100.0);
driveHeatView(x) = x : abs : an.rms_envelope_rect(0.05) : safeLin2db : hbargraph("Drive Heat", -72.0, 6.0);
stereoSpreadView(side, mid) = spread : hbargraph("Stereo Spread", 0.0, 100.0)
with {
  sideEnv = side : abs : an.rms_envelope_rect(0.08);
  midEnv = mid : abs : an.rms_envelope_rect(0.08);
  spread = clamp01(sideEnv / max(ma.EPSILON, sideEnv + midEnv)) * 100.0;
};
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

motionAmountSignal(x) = selected
with {
  envSignal = x : abs : an.rms_envelope_rect(envSpeed);
  lfoSignal = 0.5 + 0.5 * os.osc(lfoRate);
  hybridSignal = envSignal * 0.58 + lfoSignal * 0.42;
  selected = envSignal * motionEnv + lfoSignal * motionLfo + hybridSignal * motionHybrid;
};

filterBlock(x, cutoff, q) =
  lowTone * modeLow
  + bandTone * modeBand
  + notchTone * modeNotch
  + highTone * modeHigh
with {
  lowTone = x : fi.lowpass(2, cutoff * styleLowpassBias) : *(1.0 + q * 0.06);
  bandTone = x
    : fi.highpass(2, max(24.0, cutoff * (0.58 - q * 0.03)))
    : fi.lowpass(2, clamp(cutoff * (1.62 + q * 0.06), 80.0, 18000.0))
    : *(1.0 + q * 0.08);
  notchTone = x - (
      x
      : fi.highpass(2, max(24.0, cutoff * 0.72))
      : fi.lowpass(2, clamp(cutoff * (1.24 + q * 0.05), 80.0, 18000.0))
    ) * (0.40 + q * 0.48);
  highTone = x : fi.highpass(2, cutoff) : *(1.0 + q * 0.05);
};

styledFilter(x, cutoff, q, driveMix) = styled
with {
  pre = x : fi.highpass(1, max(24.0, cutoff * 0.28)) : *(1.0 + driveMix * 0.28);
  driven = driveShape(driveMix * styleDriveScale, pre);
  warmBlend = mix(driven, driven : fi.lowpass(1, clamp(cutoff * 0.82, 100.0, 18000.0)), styleWarm * 0.18);
  biteBlend = mix(warmBlend, warmBlend + (warmBlend : fi.highpass(1, clamp(cutoff * 1.18, 120.0, 18000.0))) * 0.18, styleBite * 0.16);
  wideBlend = biteBlend + (driven - biteBlend) * styleWide * 0.10;
  styled = filterBlock(wideBlend, cutoff, q);
};

routeLeft(left, right, cutoffL, cutoffR, q, driveMix) =
  styledFilter(left, cutoffL, q, driveMix) * routeStereo
  + (
      styledFilter((left + right) * 0.5, cutoffL, q, driveMix)
      + styledFilter((left - right) * 0.5, cutoffR, q * 0.82, driveMix) * (0.72 + stereoLink * 0.28)
    ) * routeMidSide
  + styledFilter((left + right) * 0.5, cutoffL, q, driveMix) * routeMono;

routeRight(left, right, cutoffL, cutoffR, q, driveMix) =
  styledFilter(right, cutoffR, q, driveMix) * routeStereo
  + (
      styledFilter((left + right) * 0.5, cutoffL, q, driveMix)
      - styledFilter((left - right) * 0.5, cutoffR, q * 0.82, driveMix) * (0.72 + stereoLink * 0.28)
    ) * routeMidSide
  + styledFilter((left + right) * 0.5, cutoffL, q, driveMix) * routeMono;

effect(left, right) = wetOutLeft, wetOutRight
with {
  dryMid = (left + right) * 0.5;
  motionBase = clamp01(motionAmountSignal(dryMid) + biasAmount * 0.28 + 0.5);
  motionDepth = clamp01((motionBase - 0.5) * 0.9 + envAmount * 0.55 + lfoDepth * 0.45 + 0.5);
  cutoffBase = clamp(cutoffHz * (1.0 + modeCutoffBias + (motionDepth - 0.5) * (0.75 + spreadAmount * 0.25)), 40.0, 18000.0);
  spreadOffset = spreadAmount * styleSpreadBias * (0.18 + (motionDepth - 0.5) * 0.24);
  cutoffLeft = clamp(cutoffBase * (1.0 - spreadOffset * (1.0 - stereoLink * 0.45)), 40.0, 18000.0);
  cutoffRight = clamp(cutoffBase * (1.0 + spreadOffset * (1.0 - stereoLink * 0.45)), 40.0, 18000.0);
  q = clamp(0.7 + resonanceAmount * 5.6 * styleResBias + modeResBias + (motionDepth - 0.5) * 1.4, 0.35, 8.5);
  driveMix = driveAmount * (0.76 + motionDepth * 0.52);
  wetLeft = routeLeft(left, right, cutoffLeft, cutoffRight, q, driveMix);
  wetRight = routeRight(left, right, cutoffLeft, cutoffRight, q, driveMix);
  mixedLeft = mix(left, wetLeft, mixAmount) * outputGain;
  mixedRight = mix(right, wetRight, mixAmount) * outputGain;
  wetMid = (mixedLeft + mixedRight) * 0.5;
  wetSide = (mixedLeft - mixedRight) * 0.5;
  meteredLeft = attach(attach(mixedLeft, inputPeakView(dryMid)), motionDepthView(motionDepth));
  meteredRight = attach(
    attach(
      attach(mixedRight, driveHeatView((wetLeft + wetRight) * 0.5)),
      stereoSpreadView(wetSide, wetMid)
    ),
    outputPeakView(wetMid)
  );
  wetOutLeft = meteredLeft;
  wetOutRight = meteredRight;
};

process = _,_ : ba.bypass2(bypass, effect);
