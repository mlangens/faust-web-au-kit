# Sonic Profiling Harness

The framework now has a first-class profiling path for comparing primitive assemblages with installed reference plugins that the developer owns locally.

## Core Loop

1. Resolve a plugin or Faust app to primitive IDs.
2. Resolve those primitives to probe profiles in `framework/profiling/probe-signals.json`.
3. Generate deterministic float WAV inputs with `npm run generate:probe-signals`.
4. Render probe inputs through either a Faust assemblage or a local third-party plugin host.
5. Analyze the outputs into JSON metrics and compare reference versus candidate behavior.

This is behavioral profiling, not binary extraction. Reports should describe frequency response, harmonic growth, dynamics timing, modulation sidebands, noise, phase, latency, and program-material behavior.

## UAD Profiling

Use:

```sh
npm run profile:uad -- --plugin studer --signal-limit 8
```

This inventories locally installed UAD AU/VST3 plugins, infers primitive IDs from plugin names, generates a matching probe set, and writes:

- `uad-plugin-inventory.json`
- `uad-profile-plan.json`
- `uad-profile-report.json`
- `probes/probe-manifest.json`
- `input-analysis.json`

To attempt Audio Unit rendering through the built-in headless host:

```sh
npm run profile:uad -- --plugin "1176" --render --render-limit 1 --signal-limit 4
```

The built-in host currently targets Audio Units. VST3 rendering should use an external command backend until the framework has a native VST3 host.

## Parameter Control

Competent sonic capture requires parameter control. Default plugin state is useful for identity and smoke checks, but it is not enough for character profiling.

The AU profiling host supports parameter enumeration and explicit overrides:

```sh
npm run profile:uad -- --plugin "1176" --render --set "Input=35" --set "Output=20"
```

Each rendered plugin gets a `parameters.json` snapshot when the built-in AU host can instantiate it. The profiler accepts parameter names or raw parameter IDs. If a plugin hides key behavior behind proprietary preset/state paths, use saved presets or an external host command that can load those states.

## Faust Assemblage Profiling

Use:

```sh
npm run profile:faust -- --app relay-tape --signal-limit 8
```

This exports the app, renders the generated WASM against the primitive-derived probe set, and writes output WAVs plus per-signal analysis reports.

## Primitive Coverage

The probe corpus covers universal health checks, dynamics, nonlinear character, tape transport, reverb/space, phase alignment, and musical program material. UAD-derived additions include tape, vintage compression, passive EQ, preamp/console, amp/cab/mic chains, modulation, mechanical room/reverb, microphone modeling, and the newly extracted `phase.all-pass-alignment-network` primitive.
