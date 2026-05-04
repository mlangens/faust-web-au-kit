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
When both generations are installed, UADx native plugins are preferred over hardware-backed `!UAD` plugins. The native bundles usually appear as `uaudio_*` on disk and as `Universal Audio (UADx): ...` in the AU registry, and they do not require powered-on UAD hardware for profiling.
The built-in host stays headless: it links AudioToolbox/AudioUnit/Foundation only, never AppKit/Cocoa/WebKit. Use `--render-method callback|process|process-multiple` to run render-method diagnostics; `callback` is the default profiling route.
Use `--runtime uadx-native|uad-dsp|unknown`, `--format au|vst3`, and `--prefer-products` to collapse duplicate AU/VST installs into one preferred product reference before planning probes.

The native UADx exhaustion pass used:

```sh
npm run profile:uad -- --runtime uadx-native --format au --prefer-products --render --signal-limit 6 --out generated/profiling/uadx-exhaustive-native-render-v2
```

That run captured 65/65 native UADx AU parameter maps and 390/390 headless probe renders. See `docs/uadx-primitive-exhaustion.md` for the primitive expansion summary.

## Soundtoys Profiling

Use:

```sh
npm run profile:soundtoys -- --render --signal-limit 6 --out generated/profiling/soundtoys-local-render
```

This inventories local Soundtoys Audio Units via the `SToy` AU manufacturer code, infers creative-effect primitive IDs, renders probe signals through the headless AU host, and writes `soundtoys-plugin-inventory.json`, `soundtoys-profile-plan.json`, and `soundtoys-profile-report.json`.

The Soundtoys harvest expands creative primitive coverage for style-morphing echo, retro digital buffers, granular reverse echo, formant voice transform, micro-pitch widening, rhythmic pan/tremolo, resonant filter motion, phaser networks, character saturation, crush/pump dynamics, modulated plate reverb, and serial effect racks. See `docs/soundtoys-primitive-harvest.md`.
The first local run captured 21/21 AU products and 126/126 default-state probe renders. The components instantiated successfully but did not expose generic AU parameters to the headless host, so deeper Soundtoys fitting needs preset/state loading or a host automation path that can see vendor parameters.

To verify that local AU DSP is actually engaging before running expensive profiling:

```sh
npm run check:au-dsp-engagement
```

This compiles the built-in AU host, audits the binary for forbidden UI framework linkage, validates fixtures with `auval` when available, renders known Apple and UADx fixtures through `callback`, `process`, and `process-multiple` methods, and writes `generated/profiling/au-dsp-engagement/au-dsp-engagement-report.json`. The Apple fixture and headless binary audit are required to pass; installed UADx fixtures are required to engage when present. Hardware-backed `!UAD` fixtures remain diagnostic.

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

Control states can be applied to Faust renders for fitting work:

```sh
npm run profile:faust -- --app press-deck --signal stepped-sine-level-sweep,tone-burst-train --control "Ratio=4,Attack=12,Release=90,Threshold=-30"
```

## Emulation Pilots

Use:

```sh
npm run profile:emulation-pilots -- --target uad-1176-rev-a --target uad-pultec-eqp-1a --signal-limit 6
```

This runs the first end-to-end emulation loop:

- Generate one shared probe set per pilot.
- Render owned UAD Audio Units through parameterized states.
- Render candidate Faust assemblages through matching control states.
- Compare UAD and Faust WAVs with time-domain error, correlation, spectral fingerprints, harmonic fingerprints, and loudness deltas.
- Write per-target `assembly-spec.json` files that name the current best candidate state and the largest residuals to fix next.

The two default pilots are intentionally different: `uad-1176-rev-a` exercises vintage compression/nonlinear dynamics through `fet-76`, while `uad-pultec-eqp-1a` exercises passive EQ/analog coloration through `atlas-curve`. Together they prove that the harness is not hard-coded to the 1176 case.

Every UAD render is also compared against its dry probe input. If the reference output is effectively pass-through, the pilot keeps the artifact and parameter snapshot but excludes those comparisons from candidate scoring. This prevents an unengaged host, authorization issue, or bypassed plugin from producing false emulation wins.

See `docs/uad-emulation-pilot-results.md` for the first 1176 Rev A plus Pultec EQP-1A run and the host-engagement issue it exposed.

The pilot accepts `--render-method callback|process|process-multiple` for host-method experiments. In practice, `callback` is the normal AU render route; `process` and `process-multiple` are useful diagnostics because many third-party effects return `-4` for those APIs.

The GUI stage is optional diagnostics only and is not required for profiling. It is gated with `--allow-gui` so it cannot accidentally open a plugin editor during profiling. To instantiate a screenshotable AU editor surface when investigating bypass or authorization state:

```sh
npm run stage:au-plugin -- --allow-gui --name "Universal Audio (UADx): UADx 1176 Rev A Compressor" --exact --seconds 10
```

Use `--detach` to leave the staged editor open for Codex/Computer Use inspection. If an authorization or vendor login prompt appears, pause profiling and resolve that prompt before trusting sonic captures.

## Primitive Coverage

The probe corpus covers universal health checks, dynamics, nonlinear character, tape transport, reverb/space, phase alignment, and musical program material. UAD-derived additions include tape, vintage compression, passive EQ, preamp/console, amp/cab/mic chains, modulation, mechanical room/reverb, microphone modeling, and the newly extracted `phase.all-pass-alignment-network` primitive.
