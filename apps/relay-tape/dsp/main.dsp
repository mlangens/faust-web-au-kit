import("stdfaust.lib");

declare name "Relay Tape";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.2.0";
declare description "Stereo modulation delay with deeper routing, offset timing, age and flutter shaping, diffusion bloom, freeze hold, and a richer meter contract.";
declare license "MIT";

mix(a, b, t) = a * (1.0 - t) + b * t;
db2lin(x) = ba.db2linear(x);
safeLin2db(x) = ba.linear2db(max(x, ma.EPSILON));
clamp(x, lo, hi) = min(max(x, lo), hi);
clamp01(x) = clamp(x, 0.0, 1.0);
ms2samples(x) = max(1.0, x * ma.SR / 1000.0);

mode = hslider("Mode", 1.0, 0.0, 2.0, 1.0) : si.smoo;
routing = hslider("Routing", 1.0, 0.0, 3.0, 1.0) : si.smoo;
timeMs = hslider("Time [unit:ms][scale:log]", 380.0, 8.0, 1600.0, 0.1) : si.smoo;
offsetPct = hslider("Offset [unit:%]", 34.0, 0.0, 100.0, 1.0) : si.smoo;
feedbackPct = hslider("Feedback [unit:%]", 52.0, 0.0, 98.0, 0.1) : si.smoo;
smearPct = hslider("Smear [unit:%]", 58.0, 0.0, 100.0, 1.0) : si.smoo;
agePct = hslider("Age [unit:%]", 46.0, 0.0, 100.0, 1.0) : si.smoo;
tonePct = hslider("Tone [unit:%]", 54.0, 0.0, 100.0, 1.0) : si.smoo;
modDepthMs = hslider("Mod Depth [unit:ms]", 9.0, 0.0, 35.0, 0.1) : si.smoo;
modRateHz = hslider("Mod Rate [unit:Hz][scale:log]", 0.28, 0.03, 8.0, 0.01) : si.smoo;
flutterPct = hslider("Flutter [unit:%]", 32.0, 0.0, 100.0, 1.0) : si.smoo;
widthPct = hslider("Width [unit:%]", 76.0, 0.0, 100.0, 1.0) : si.smoo;
freeze = checkbox("Freeze");
mixPct = hslider("Mix [unit:%]", 44.0, 0.0, 100.0, 0.1) : si.smoo;
outputDb = hslider("Output [unit:dB]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
bypass = checkbox("Bypass");

modeClear = mode == 0.0;
modeWorn = mode == 1.0;
modeBloom = mode == 2.0;

routeStereo = routing == 0.0;
routeBounce = routing == 1.0;
routeMono = routing == 2.0;
routeCrossfeed = routing == 3.0;

smear = smearPct / 100.0;
age = agePct / 100.0;
tone = tonePct / 100.0;
flutter = flutterPct / 100.0;
width = widthPct / 100.0;
mixAmount = mixPct / 100.0;
freezeAmount = freeze;
outputGain = db2lin(outputDb);

modeTimeScale = modeClear * 0.92 + modeWorn * 1.0 + modeBloom * 1.12;
modeSmearScale = modeClear * 0.46 + modeWorn * 0.88 + modeBloom * 1.18;
modeAgeScale = modeClear * 0.28 + modeWorn * 0.92 + modeBloom * 0.72;
modeBloomScale = modeClear * 0.18 + modeWorn * 0.36 + modeBloom * 0.78;

maxDelay = 131072;
baseDelay = clamp(ms2samples(timeMs * modeTimeScale), 16.0, maxDelay - 8.0);
offsetSamples = baseDelay * (offsetPct / 100.0) * 0.38;
feedbackGain = mix(feedbackPct / 100.0, 0.9993, freezeAmount);

wow = os.osc(modRateHz) * (modDepthMs * ma.SR / 1000.0);
flutterOsc = os.osc(modRateHz * (4.2 + flutter * 2.6) + 0.19) * (modDepthMs * ma.SR / 1000.0) * (0.18 + flutter * 0.46);
motionAmount = clamp01((abs(wow) + abs(flutterOsc)) / max(1.0, modDepthMs * ma.SR / 1000.0 * 1.8));

delayLeft = clamp(baseDelay - offsetSamples + wow - flutterOsc, 8.0, maxDelay - 8.0);
delayRight = clamp(baseDelay + offsetSamples - wow + flutterOsc, 8.0, maxDelay - 8.0);

ageTone(x) = worn
with {
  lowCut = 40.0 + age * 120.0;
  highCut = 18000.0 - age * 12000.0 - modeBloom * 2200.0;
  soft = x : fi.highpass(1, lowCut) : fi.lowpass(1, max(900.0, highCut));
  worn = mix(soft, ma.tanh(soft * (1.0 + age * 2.6)), age * 0.28 + modeWorn * 0.12);
};

toneStage(x) = x : fi.lowpass(1, 600.0 + tone * 16000.0);

smearStage(x) = x
  : fi.allpass_fcomb(4096, 17.0 + smear * 48.0 * modeSmearScale, 0.18 + smear * 0.32)
  : fi.allpass_fcomb(4096, 27.0 + smear * 72.0 * modeSmearScale, 0.14 + smear * 0.28);

delayVoice(x, delaySamples) = wet
with {
  pre = x : ageTone : toneStage;
  wet = pre : fi.ffbcombfilter(maxDelay, delaySamples, feedbackGain) : smearStage;
};

inputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Input Peak", -72.0, 6.0);
echoDriveView(x) = x : abs : an.rms_envelope_rect(0.05) : safeLin2db : hbargraph("Echo Drive", -72.0, 6.0);
motionView(x) = x * 100.0 : hbargraph("Motion", 0.0, 100.0);
diffuseTailView(x) = x : abs : an.rms_envelope_rect(0.08) : safeLin2db : hbargraph("Diffuse Tail", -72.0, 6.0);
stereoSpreadView(side, mid) = spread : hbargraph("Stereo Spread", 0.0, 100.0)
with {
  sideEnv = side : abs : an.rms_envelope_rect(0.08);
  midEnv = mid : abs : an.rms_envelope_rect(0.08);
  spread = clamp01(sideEnv / max(ma.EPSILON, sideEnv + midEnv)) * 100.0;
};
freezeHoldView(x) = x * 100.0 : hbargraph("Freeze Hold", 0.0, 100.0);
outputPeakView(x) = x : abs : an.rms_envelope_rect(0.04) : safeLin2db : hbargraph("Output Peak", -72.0, 6.0);

effect(leftIn, rightIn) = outLeft, outRight
with {
  dryLeft = leftIn;
  dryRight = rightIn;
  monoIn = (leftIn + rightIn) * 0.5;

  routeLeftIn =
    leftIn * routeStereo +
    (leftIn * 0.72 + rightIn * 0.28) * routeBounce +
    monoIn * routeMono +
    (leftIn * 0.48 + rightIn * 0.52) * routeCrossfeed;
  routeRightIn =
    rightIn * routeStereo +
    (rightIn * 0.72 + leftIn * 0.28) * routeBounce +
    monoIn * routeMono +
    (rightIn * 0.48 + leftIn * 0.52) * routeCrossfeed;

  echoDriveLeft = routeLeftIn * (1.0 + modeWorn * 0.08 + modeBloom * 0.04);
  echoDriveRight = routeRightIn * (1.0 + modeWorn * 0.08 + modeBloom * 0.04);

  delayWetLeft = delayVoice(echoDriveLeft, delayLeft);
  delayWetRight = delayVoice(echoDriveRight, delayRight);

  bloomSend = modeBloomScale * (0.12 + smear * 0.22);
  diffuseLeft = delayWetLeft + (delayWetRight : fi.lowpass(1, 8200.0)) * bloomSend;
  diffuseRight = delayWetRight + (delayWetLeft : fi.lowpass(1, 8200.0)) * bloomSend;

  wetMid = (diffuseLeft + diffuseRight) * 0.5;
  wetSide = (diffuseLeft - diffuseRight) * 0.5 * (0.42 + width * 0.96);
  widenedLeft = wetMid + wetSide;
  widenedRight = wetMid - wetSide;

  freezeHold = freezeAmount * (0.64 + feedbackGain * 0.36);
  finalLeft = mix(dryLeft, widenedLeft, mixAmount) * outputGain;
  finalRight = mix(dryRight, widenedRight, mixAmount) * outputGain;
  finalMid = (finalLeft + finalRight) * 0.5;

  outLeft = attach(
    attach(
      attach(
        attach(finalLeft, inputPeakView(monoIn)),
        echoDriveView((echoDriveLeft + echoDriveRight) * 0.5)
      ),
      motionView(motionAmount)
    ),
    diffuseTailView((diffuseLeft + diffuseRight) * 0.5)
  );
  outRight = attach(
    attach(
      attach(finalRight, stereoSpreadView(wetSide, wetMid)),
      freezeHoldView(freezeHold)
    ),
    outputPeakView(finalMid)
  );
};

process = _,_ : ba.bypass2(bypass, effect);
