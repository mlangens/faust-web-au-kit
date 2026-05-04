# Soundtoys Primitive Harvest

This pass uses locally installed Soundtoys Audio Units as a creative-effect reference corpus. The goal is primitive extraction for the framework, not cloning individual Soundtoys products.

## Capture Command

```sh
npm run profile:soundtoys -- --render --signal-limit 6 --out generated/profiling/soundtoys-local-render
```

The profiler discovers Audio Units whose registry manufacturer code is `SToy`, maps product names to framework primitive IDs, generates deterministic probe WAVs, renders the probes through the headless Audio Unit host, and writes per-render analysis reports.

## Result

- Selected Soundtoys AU products: 21
- Parameter-map instantiations: 21/21
- Exposed generic AU parameters: 0 for each product
- Probe renders captured: 126/126
- Products with at least one successful render: 21/21
- Products with fallback-only primitive inference: 0
- Report path: `generated/profiling/soundtoys-local-render/soundtoys-profile-report.json`

The generic AU parameter list is empty for these Soundtoys components, so this harvest should be treated as default-state sonic evidence and primitive taxonomy coverage. Parameter-swept fitting will need preset/state loading or a host path that can drive Soundtoys-specific parameter exposure.

The ingestion flow now compares each rendered WAV against its dry probe input and writes `engagement-summary.json`. That summary is the licensing/authorization tripwire: active probes that render as dry passthrough are flagged `likely-no-transform`, and active probes that render silence are flagged `silent-output`. The local Soundtoys run showed transformed audio for all 21 products, not dry passthrough.

## Installed Corpus

The local AU registry exposed 21 Soundtoys components:

- Crystallizer
- Decapitator
- Devil-Loc
- Devil-Loc Deluxe
- EchoBoy
- EchoBoy Jr
- EffectRack
- FilterFreak1
- FilterFreak2
- Little AlterBoy
- Little MicroShift
- Little Plate
- Little PrimalTap
- Little Radiator
- MicroShift
- PanMan
- PhaseMistress
- PrimalTap
- Radiator
- Sie-Q
- Tremolator

## Primitive Types

New primitives derived from the Soundtoys install:

- `analog.tube-preamp-drive-stage`
- `compression.crush-pump-dynamics`
- `delay.retro-digital-buffer`
- `delay.style-morphing-echo-engine`
- `modulation.all-pass-phaser-network`
- `modulation.resonant-filter-motion`
- `modulation.rhythmic-amplitude-gate`
- `modulation.rhythmic-auto-pan`
- `pitch.formant-shift-voice-transform`
- `pitch.granular-reverse-echo`
- `routing.serial-effect-rack`
- `saturation.character-model-bank`
- `space.modulated-plate-reverb`
- `spatial.micro-pitch-widener`

Existing primitives reinforced by the Soundtoys corpus include `delay.tap-feedback-network`, `eq.circuit-model-topology`, `eq.passive-vintage-program-eq`, `pitch.modulated-feedback-shifter`, `saturation.virtual-analog-stage`, `space.plate-reverb`, `spatial.channel-toolkit`, `modulation.vintage-delay-modulation`, and `metering.analysis-suite`.

## Framework Impact

Soundtoys adds a different kind of evidence than the UADx vintage harvest. UADx mostly strengthened analog, compressor, room, tape, and hardware-model primitives. Soundtoys pushes the framework toward creative motion and agentic assembly:

- Style banks should be represented as topology presets with sonic probes, not opaque labels.
- Modulation surfaces need drawable lanes, tempo grids, trigger modes, and sideband analysis.
- Pitch effects need separate pitch, formant, grain, reverse-envelope, and feedback-stability roles.
- Stereo widening needs explicit micro-pitch, delay offset, correlation, and mono-compatibility checks.
- Rack-style products need a fixed automation contract so agents can assemble internal chains without invalidating DAW parameters.

The important architectural outcome is the new `routing.serial-effect-rack` primitive family. It gives Omniplugin-style assembly a concrete primitive vocabulary for stable slots, module ordering, macro assignment, per-slot bypass, and gain-staging probes.
