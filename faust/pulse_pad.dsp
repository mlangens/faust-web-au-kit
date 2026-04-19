import("stdfaust.lib");

declare name "Pulse Pad";
declare author "Max Langensiepen + OpenAI Codex";
declare version "0.1.2";
declare description "Synth example manifest for framework export and preview.";
declare license "MIT";
declare options "[midi:on][nvoices:8]";

attackMs = hslider("Attack[unit:ms][scale:log]", 18.0, 1.0, 600.0, 0.1);
releaseMs = hslider("Release[unit:ms][scale:log]", 220.0, 10.0, 4000.0, 1.0);
tone = hslider("Tone", 0.55, 0.0, 1.0, 0.01);
motion = hslider("Motion", 0.35, 0.0, 1.0, 0.01);
driveDb = hslider("Drive[unit:dB]", 3.0, 0.0, 18.0, 0.1);
stereoWidth = hslider("Stereo Width", 0.75, 0.0, 1.0, 0.01);

gate = button("gate");
freq = hslider("freq", 220.0, 20.0, 2000.0, 1.0);
gain = hslider("gain", 0.3, 0.0, 1.0, 0.001);

attackSeconds = max(attackMs, 0.1) / 1000.0;
releaseSeconds = max(releaseMs, 1.0) / 1000.0;
drive = ba.db2linear(driveDb);
cutoff = 320.0 + tone * 5600.0;
spreadHz = 0.08 + motion * 0.55;
drift = os.osc(spreadHz) * (10.0 + motion * 18.0);

env = en.asr(attackSeconds, 1.0, releaseSeconds, gate);
body(f) = os.square(f) * (0.34 + tone * 0.1) + os.sawtooth(f * 0.5) * (0.22 + motion * 0.12);
leftVoice = body(freq + drift) : fi.lowpass(3, cutoff) : *(drive) : ma.tanh;
rightVoice = body(freq - drift) : fi.lowpass(3, cutoff * (1.0 + stereoWidth * 0.12)) : *(drive) : ma.tanh;

process = leftVoice * env * gain, rightVoice * env * gain;
