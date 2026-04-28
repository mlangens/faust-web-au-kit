# Sonic Stage Harness

The sonic stage harness is the framework-level regression layer for proving that plugin behavior still moves in the expected direction after DSP, UI, export, or native wrapper changes.

It has two complementary jobs:

- Render deterministic test audio through generated DSP and evaluate sonic metrics.
- Stage native host requests so an agent can load standalone or VST3 artifacts, screenshot the plugin UI, and replay the same sonic scenes in an external host.

## Commands

```sh
npm run sonic:smoke
npm run sonic:contracts
npm run sonic:native:plan
npm run sonic:standalone:plan
npm run sonic:vst3:plan
```

`sonic:smoke` renders the default app through the C++/DSP-direct path. `sonic:contracts` runs every suite app stage. The host plan commands write `sonic-host-request.json` and `sonic-agent-session.json` into each generated app directory without requiring a native host to be installed.

Direct sonic runs use the dedicated `sonic` export profile, which emits only the generated C++ target plus UI metadata needed for DSP rendering. Native packaging checks stay in the normal native test lane.

Set `FWAK_SONIC_HOST_COMMAND` to a host adapter command to execute native staging. The command receives the request JSON path and should return a report compatible with `sonic-report.json`.

## Stage Manifests

Each app can declare `sonicStages` in `project.json`. The framework automatically adds a `framework-smoke` stage to every app, so manifests should focus on feature behavior:

```json
{
  "id": "ceiling-clamps-peaks",
  "fixture": {
    "kind": "drum-loop",
    "seconds": 1.3,
    "amplitude": 0.62
  },
  "renders": [
    { "id": "baseline", "parameters": { "Drive": 1 } },
    { "id": "feature", "parameters": { "Drive": 10, "Ceiling": -2 } }
  ],
  "assertions": [
    { "render": "feature", "metric": "nanSamples", "eq": 0 },
    { "render": "feature", "metric": "peakDb", "lte": 3 }
  ]
}
```

## Metrics

The direct renderer writes reusable metrics including:

- `peakDb`, `rmsDb`, `dcOffset`, `nanSamples`, `infSamples`
- `bandEnergyDb.low`, `bandEnergyDb.mid`, `bandEnergyDb.presence`, `bandEnergyDb.air`
- `tailToEarlyDb`, `harmonicRatioDb`, `airToMidDb`, `sibilanceToBodyDb`
- `stereoCorrelation`, `stereoSideToMidDb`, `latencySamples`

Assertions can compare absolute values or deltas against another render in the same stage using `reference`, `minDelta`, and `maxDelta`.

## Agentic Host Contract

The native host plan writes two files per app:

- `sonic-host-request.json` contains the app, plugin artifact paths, fixtures, renders, and sonic assertions.
- `sonic-agent-session.json` contains screenshot targets for the browser preview, standalone app, and external VST3 host adapter.

This lets Codex or another agent run a front-to-back loop:

1. Build or locate the standalone/VST3 artifact.
2. Launch the stage host or external VST host.
3. Load the plugin using `sonic-host-request.json`.
4. Apply the render scene parameters.
5. Capture screenshots from the declared screenshot targets.
6. Render test audio and return the same metrics used by the direct harness.

The direct C++ path remains the deterministic CI baseline; the native host path verifies packaging, parameter mapping, and real editor behavior when a compatible host is available.

## Fixture Catalog

The built-in fixture generator is deterministic and intentionally broad:

- `sine`, `two-tone`, and `imd-two-tone` cover level, tone purity, and intermodulation-style probes.
- `sweep` and `stepped-sine` cover broad frequency-response and resonance movement.
- `impulse`, `step`, `tone-burst`, and `pulse-train` cover latency, transient response, envelope followers, gates, limiters, delays, and reverbs.
- `white-noise`, `pink-noise`, and `brown-noise` cover broadband electrical-style, octave-balanced, and low-frequency-weighted stress cases.
- `multitone` covers fast full-band checks that behave more like program material than a single sine.
- `drum-loop`, `bass-loop`, `vocal-sibilance`, and `stereo-ambience` cover musical and speech-like behavior for dynamics, saturation, de-essing, spatial, stereo, and synth-style stages.

This taxonomy follows common audio-measurement practice: Listen SoundCheck exposes sweeps, pink/white noise, multitone, two-tone, and speech/music stimuli; Audio Precision highlights multitone for fast spectrum-wide and signal-present noise checks; ITU-T P.501 includes both low-complexity technical signals and speech-like signals.

References:

- [Listen SoundCheck stimulus options](https://www.listeninc.com/products/soundcheck/soundcheck-stimulus-options/)
- [Audio Precision: Using Multitones in Audio Test](https://www.ap.com/news/using-multitones-in-audio-test)
- [ITU-T P.501 test signals](https://www.itu.int/ITU-T/recommendations/rec.aspx?rec=14271)
