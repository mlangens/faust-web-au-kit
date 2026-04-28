# FET-76 Primitive Fitting Proof

This pass turns the UADx 1176 Rev A profiling result into a first framework-native emulation proof: a dedicated Faust app, a profiled FET gain-cell primitive, a hardware-style preview faceplate, and a packageable plugin target.

## Primitive Changes

- Added `compression.fet-76-gain-cell` as a 1176-style submodel primitive.
- The primitive models fixed-threshold input drive, reverse-numbered fast attack/release controls, 4/8/12/20/all ratio-button topology, gain-reduction-dependent color, and explicit fitting trims for bias and sidechain high-pass.
- `framework/profiling/probe-signals.json` maps the primitive to dynamics, nonlinear-character, and musical-program probes so future agent runs get the right signal vocabulary automatically.
- The Faust profiling harness now merges WAST-embedded control indexes back into JSON metadata before applying `setParamValue`; this fixed a real bug where candidate renders could ignore intended control states.

## UADx Comparison

Run command:

```sh
npm run profile:emulation-pilots -- --target uad-1176-rev-a --signal-limit 4 --state-limit 3 --candidate-limit 4 --out generated/profiling/fet76-uadx-proof
```

Result summary:

- Reference: `uaudio_ua_1176_rev_a` resolved as native UADx Audio Unit.
- References rendered: 12 engaged, 0 pass-through.
- Faust comparisons: 48 valid, 0 invalid.
- Candidate app: `fet-76`.
- Best state: `default`, average score `1.972647` across 12 comparisons.
- Largest residuals remain transient-click and driven tone-burst behavior, so the next fitting target is release-memory/overshoot calibration rather than host engagement.

This is a behavioral emulation baseline, not a claim of binary identity with UADx. The useful proof is that the framework can profile a real owned plugin, derive/update primitives, assemble a Faust candidate, score residuals, and package the result as a normal framework app.

## Product Proof

The `fet-76` app provides:

- 4x oversampled Faust DSP.
- A 1176-style faceplate preview surface with input/output knobs, ratio buttons, VU-style gain reduction, timing controls, meter mode, and power.
- Native AUv2, CLAP, VST3, and standalone target metadata.
- Package aliases:

```sh
npm run package:fet-76-installer
npm run package:fet-76-uninstaller
```

Local sonic contract:

```sh
node ./tools/run-sonic-stages.mjs --app fet-76 --profile contracts
```

This validates the framework smoke stage plus a level-disciplined input-drive stage that keeps driven output within peak tolerance while exercising the FET gain-cell/color path.
