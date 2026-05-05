# UADx Primitive Exhaustion

This pass exhausts the locally accessible native UADx Audio Unit inventory on this Mac for framework-level primitive derivation. It does not clone individual source plugins; it uses owned, installed plugins as sonic reference specimens for reusable DSP, analysis, and UI primitive planning.

## Capture Command

```sh
npm run profile:uad -- --runtime uadx-native --format au --prefer-products --render --signal-limit 6 --out generated/profiling/uadx-exhaustive-native-render-v2
```

The command filters to native UADx AU components, collapses duplicate AU/VST products, maps each product to primitive IDs, creates deterministic probe WAVs, renders those probes through the headless AU host, and writes per-render sonic analyses.

## Result

- Selected native UADx AU products: 65
- Parameter maps captured: 65/65
- Probe renders captured: 390/390
- Products with at least one successful render: 65/65
- Products with fallback-only primitive inference: 0
- Report path: `generated/profiling/uadx-exhaustive-native-render-v2/uad-profile-report.json`

The pass also hardened AU component resolution. UADx bundles often use compact names like `uaudio_la3a`, while the AU registry exposes richer names like `Universal Audio (UADx): UADx LA-3A Compressor`. The resolver now uses canonical compact keys plus token overlap, which fixed the first-pass misses for LA-3A, Century, Manley Preamp, Dream/Ruby/Lion/Showtime/Woodrow amps, and Verve Essentials. It also prevents broad prefix matches such as Capitol Compressor accidentally resolving to Capitol Chambers.

The profiling flow now writes dry-vs-render engagement checks for each successful capture. A plugin that instantiates but does not transform active probes is flagged `likely-no-transform`; a plugin that renders silence is flagged `silent-output`. These flags are intended to catch licensing, authorization, bypass, or host-engagement failures before a local profile is treated as primitive evidence.

A later cabinet-focused pass split cabinet behavior out of the broader amp-chain primitive. See `docs/cabinet-primitive-captures.md` for the 42/42 UADx cabinet render pass and the new `cabinet.speaker-mic-simulation` primitive.

## New Primitive Types

- `analog.channel-strip-signal-path`
- `compression.opto-program-leveler`
- `compression.tube-vari-mu-stage`
- `compression.vca-bus-detector`
- `delay.tape-echo-feedback`
- `eq.resonant-subharmonic-enhancer`
- `instrument.morphing-analog-synth`
- `modulation.rotary-speaker-chain`
- `pitch.vocal-tuning-formant-chain`
- `saturation.multiband-enhancer-exciter`
- `space.plate-reverb`
- `space.recording-room-scene`
- `space.vintage-digital-reverb`

These primitives are marked `profiled` in `framework/primitives/audio-primitives.json` with evidence linked to the local UADx harvest. Existing primitives were also reinforced by the run, especially vintage compression, analog preamp/console coloration, passive program EQ, tape recorder stages, amp/cabinet chains, vintage delay modulation, mechanical room reverb, and electromechanical instruments.

## Coverage Shape

The rendered inventory produced this primitive distribution:

- 17 `compression.vintage-compressor-model`
- 14 `analog.preamp-console-stage`
- 7 `eq.passive-vintage-program-eq`
- 6 `analog.channel-strip-signal-path`
- 6 `amp.cabinet-mic-chain`
- 5 `compression.tube-vari-mu-stage`
- 4 `compression.opto-program-leveler`
- 4 `instrument.electromechanical-keyboard`
- 4 `instrument.morphing-analog-synth`
- 4 `space.mechanical-room-reverb`
- 4 `space.recording-room-scene`
- 4 `tape.magnetic-recorder-stage`
- 3 `compression.vca-bus-detector`
- 3 `modulation.vintage-delay-modulation`
- 2 `eq.circuit-model-topology`
- 2 `pitch.vocal-tuning-formant-chain`
- 2 `saturation.multiband-enhancer-exciter`
- 1 each for `delay.tape-echo-feedback`, `eq.resonant-subharmonic-enhancer`, `metering.analysis-suite`, `modulation.rotary-speaker-chain`, `saturation.virtual-analog-stage`, `space.plate-reverb`, and `space.vintage-digital-reverb`

## Framework Impact

The framework now has a broader primitive vocabulary for vintage-derived assemblages without turning the Northline suite or any UADx product into the framework's identity. Agents can use these types to reason about expected control roles, UI surface roles, probe families, and DSP intent before writing Faust or preview code.

The most important architectural shift is that primitives now describe sonic jobs rather than plugin labels. For example, a future compressor assemblage can choose a FET gain cell, opto program leveler, tube vari-mu stage, or VCA bus detector based on capture evidence. A future space processor can distinguish recording-room scenes, plates, vintage digital algorithms, and generic mechanical rooms instead of collapsing them into a single reverb knob.
