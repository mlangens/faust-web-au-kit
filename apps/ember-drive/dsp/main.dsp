import("stdfaust.lib");

declare name "Ember Drive";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Multiband saturation processor with style-selectable drive shaping, per-band tone and bias control, dynamic glue, stereo width, and output management.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(hi, max(lo, x));
clamp01(x) = clamp(x, 0.0, 1.0);

style = hslider("Style", 1.0, 0.0, 3.0, 1.0);
inputGainDb = hslider("Input Gain [unit:dB]", 1.5, -18.0, 18.0, 0.1) : si.smoo;
rawLowCrossoverHz = hslider("Low Crossover [unit:Hz][scale:log]", 160.0, 60.0, 1200.0, 1.0) : si.smoo;
rawHighCrossoverHz = hslider("High Crossover [unit:Hz][scale:log]", 3400.0, 500.0, 16000.0, 1.0) : si.smoo;
lowDrivePct = hslider("Low Drive [unit:%]", 36.0, 0.0, 100.0, 1.0) : si.smoo;
lowTonePct = hslider("Low Tone [unit:%]", 46.0, 0.0, 100.0, 1.0) : si.smoo;
lowBiasPct = hslider("Low Bias [unit:%]", 0.0, -100.0, 100.0, 1.0) : si.smoo;
lowMixPct = hslider("Low Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
midDrivePct = hslider("Mid Drive [unit:%]", 54.0, 0.0, 100.0, 1.0) : si.smoo;
midTonePct = hslider("Mid Tone [unit:%]", 52.0, 0.0, 100.0, 1.0) : si.smoo;
midBiasPct = hslider("Mid Bias [unit:%]", 0.0, -100.0, 100.0, 1.0) : si.smoo;
midMixPct = hslider("Mid Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
highDrivePct = hslider("High Drive [unit:%]", 58.0, 0.0, 100.0, 1.0) : si.smoo;
highTonePct = hslider("High Tone [unit:%]", 54.0, 0.0, 100.0, 1.0) : si.smoo;
highBiasPct = hslider("High Bias [unit:%]", 0.0, -100.0, 100.0, 1.0) : si.smoo;
highMixPct = hslider("High Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
dynamicsPct = hslider("Dynamics [unit:%]", 46.0, 0.0, 100.0, 1.0) : si.smoo;
gluePct = hslider("Glue [unit:%]", 32.0, 0.0, 100.0, 1.0) : si.smoo;
bandLinkPct = hslider("Band Link [unit:%]", 24.0, 0.0, 100.0, 1.0) : si.smoo;
widthPct = hslider("Width [unit:%]", 60.0, 0.0, 100.0, 1.0) : si.smoo;
mixPct = hslider("Mix [unit:%]", 100.0, 0.0, 100.0, 1.0) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
bypass = checkbox("Bypass");

styleClean = style == 0.0;
styleWarm = style == 1.0;
styleEdge = style == 2.0;
styleFold = style == 3.0;

inputGain = db2lin(inputGainDb);
dynamicsAmount = dynamicsPct / 100.0;
glueAmount = gluePct / 100.0;
bandLinkAmount = bandLinkPct / 100.0;
widthAmount = widthPct / 100.0;
mixAmount = mixPct / 100.0;
outputGain = db2lin(outputDb);

styleDriveScale = styleClean * 0.82 + styleWarm * 1.0 + styleEdge * 1.18 + styleFold * 1.34;
styleLowpassBias = styleClean * 1.08 + styleWarm * 0.90 + styleEdge * 1.02 + styleFold * 0.84;
styleHighpassBias = styleClean * 0.92 + styleWarm * 0.86 + styleEdge * 1.18 + styleFold * 1.28;
styleGlueScale = styleClean * 0.72 + styleWarm * 0.92 + styleEdge * 1.0 + styleFold * 1.16;

lowCrossoverHz = clamp(rawLowCrossoverHz, 60.0, rawHighCrossoverHz - 120.0);
highCrossoverHz = clamp(rawHighCrossoverHz, lowCrossoverHz + 120.0, 16000.0);

driveShape(amount, x) =
  cleanTone * styleClean +
  warmTone * styleWarm +
  edgeTone * styleEdge +
  foldTone * styleFold
with {
  cleanTone = mix(x, ma.tanh(x * (1.0 + amount * 2.2)), amount * 0.38);
  warmTone = mix(x, ma.tanh(x * (1.0 + amount * 3.2)), 0.24 + amount * 0.46);
  edgeTone = mix(x, (x + (x : fi.highpass(1, 1600.0)) * 0.18) : ma.tanh, 0.20 + amount * 0.54);
  foldTone = mix(x, ((x * (1.0 + amount * 5.0)) : ma.tanh) - (((x * (1.0 + amount * 5.0)) : ma.tanh) : ma.tanh) * 0.22, 0.28 + amount * 0.60);
};

heatAmount(x) = clamp01((safeLin2db(x : abs : an.rms_envelope_rect(0.05)) + 48.0) / 30.0);

toneStage(toneAmount, biasAmount, x) = voiced
with {
  toneNorm = toneAmount / 100.0;
  biasNorm = biasAmount / 100.0;
  lowTilt = max(0.0, -biasNorm);
  highTilt = max(0.0, biasNorm);
  darkTone = x : fi.lowpass(1, 320.0 + toneNorm * 4200.0 * styleLowpassBias);
  brightTone = x : fi.highpass(1, 220.0 + toneNorm * 3600.0 * styleHighpassBias);
  voiced =
    mix(x, darkTone, toneNorm * 0.34 + lowTilt * 0.28) +
    brightTone * (toneNorm * 0.08 + highTilt * 0.24);
};

dynamicDrive(baseDrive, signal) = adjusted
with {
  env = signal : abs : an.rms_envelope_rect(0.05);
  reduction = clamp01(env * (2.4 + styleFold * 0.9)) * dynamicsAmount * 0.52;
  adjusted = baseDrive * (1.0 - reduction) + dynamicsAmount * 0.12;
};

bandProcess(drivePct, tonePct, biasPct, mixPctLocal, bandSignal) = processed
with {
  driveBase = drivePct / 100.0;
  wetMix = mixPctLocal / 100.0;
  driveAmt = dynamicDrive(driveBase, bandSignal) * styleDriveScale;
  pre = toneStage(tonePct, biasPct, bandSignal);
  saturated = driveShape(driveAmt, pre);
  processed = mix(bandSignal, saturated, wetMix);
};

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
lowHeatView(x) = x * 100.0 : hbargraph("Low Heat", 0.0, 100.0);
midHeatView(x) = x * 100.0 : hbargraph("Mid Heat", 0.0, 100.0);
highHeatView(x) = x * 100.0 : hbargraph("High Heat", 0.0, 100.0);
glueReductionView(x) = x : hbargraph("Glue Reduction", 0.0, 24.0);
stereoWidthView(side, mid) = spread : hbargraph("Stereo Width", 0.0, 100.0)
with {
  sideEnv = side : abs : an.rms_envelope_rect(0.08);
  midEnv = mid : abs : an.rms_envelope_rect(0.08);
  spread = clamp01(sideEnv / max(ma.EPSILON, sideEnv + midEnv)) * 100.0;
};
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) = outLeft, outRight
with {
  dryLeft = leftIn;
  dryRight = rightIn;
  inputLeft = dryLeft * inputGain;
  inputRight = dryRight * inputGain;
  inputMono = (inputLeft + inputRight) * 0.5;

  averageDrive = (lowDrivePct + midDrivePct + highDrivePct) / 3.0;
  lowDriveLinked = mix(lowDrivePct, averageDrive, bandLinkAmount);
  midDriveLinked = mix(midDrivePct, averageDrive, bandLinkAmount);
  highDriveLinked = mix(highDrivePct, averageDrive, bandLinkAmount);

  lowLeft = inputLeft : fi.lowpassLR4(lowCrossoverHz);
  lowRight = inputRight : fi.lowpassLR4(lowCrossoverHz);
  highLeft = inputLeft : fi.highpassLR4(highCrossoverHz);
  highRight = inputRight : fi.highpassLR4(highCrossoverHz);
  midLeft = inputLeft - lowLeft - highLeft;
  midRight = inputRight - lowRight - highRight;

  lowWetLeft = bandProcess(lowDriveLinked, lowTonePct, lowBiasPct, lowMixPct, lowLeft);
  lowWetRight = bandProcess(lowDriveLinked, lowTonePct, lowBiasPct, lowMixPct, lowRight);
  midWetLeft = bandProcess(midDriveLinked, midTonePct, midBiasPct, midMixPct, midLeft);
  midWetRight = bandProcess(midDriveLinked, midTonePct, midBiasPct, midMixPct, midRight);
  highWetLeft = bandProcess(highDriveLinked, highTonePct, highBiasPct, highMixPct, highLeft);
  highWetRight = bandProcess(highDriveLinked, highTonePct, highBiasPct, highMixPct, highRight);

  preGlueLeft = lowWetLeft + midWetLeft + highWetLeft;
  preGlueRight = lowWetRight + midWetRight + highWetRight;

  glueWetLeft = preGlueLeft : co.compressor_mono(
    1.0 + glueAmount * 4.2 * styleGlueScale,
    -18.0 + glueAmount * 10.0 - styleFold * 1.8,
    0.002 + dynamicsAmount * 0.008,
    0.060 + glueAmount * 0.260
  );
  glueWetRight = preGlueRight : co.compressor_mono(
    1.0 + glueAmount * 4.2 * styleGlueScale,
    -18.0 + glueAmount * 10.0 - styleFold * 1.8,
    0.002 + dynamicsAmount * 0.008,
    0.060 + glueAmount * 0.260
  );

  glueInEnv = (preGlueLeft + preGlueRight) * 0.5 : abs : an.rms_envelope_rect(0.04);
  glueOutEnv = (glueWetLeft + glueWetRight) * 0.5 : abs : an.rms_envelope_rect(0.04);
  glueReduction = clamp(safeLin2db(glueInEnv) - safeLin2db(glueOutEnv), 0.0, 24.0);

  wetMid = (glueWetLeft + glueWetRight) * 0.5;
  wetSide = (glueWetLeft - glueWetRight) * 0.5 * (0.42 + widthAmount * 0.96);
  widenedLeft = wetMid + wetSide;
  widenedRight = wetMid - wetSide;

  finalLeft = mix(dryLeft, widenedLeft, mixAmount) * outputGain;
  finalRight = mix(dryRight, widenedRight, mixAmount) * outputGain;
  finalMid = (finalLeft + finalRight) * 0.5;

  lowHeat = heatAmount((lowWetLeft + lowWetRight) * 0.5);
  midHeat = heatAmount((midWetLeft + midWetRight) * 0.5);
  highHeat = heatAmount((highWetLeft + highWetRight) * 0.5);

  outLeft = attach(
    attach(
      attach(
        attach(finalLeft, inputPeakView(inputMono)),
        lowHeatView(lowHeat)
      ),
      midHeatView(midHeat)
    ),
    highHeatView(highHeat)
  );
  outRight = attach(
    attach(
      attach(finalRight, glueReductionView(glueReduction)),
      stereoWidthView(wetSide, wetMid)
    ),
    outputPeakView(finalMid)
  );
};

process = _,_ : ba.bypass2(bypass, effect);
