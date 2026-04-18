# Faust Web AU Kit

`faust-web-au-kit` is a proof-of-concept framework for building native audio plugins around a Faust DSP source of truth without making handwritten C++ the center of the workflow.

The repo intentionally splits responsibilities:

- Faust owns DSP and control schema.
- Node scripts handle export, manifest generation, benchmarking, and development-time preview tooling.
- Native target adapters stay thin and target-specific.
- Shipped plugin UI is native, not browser-hosted.

The current flagship example is `Limiter Lab`, a 4x oversampled stereo limiter with:

- `Modern` and `Vintage` character switching.
- Native real-time peak and gain-reduction metering.
- AUv2 bundle output for macOS.
- Cross-target Faust export for `c`, `cpp`, `wasm`, `cmajor`, and `rust`.
- A benchmark harness for locally runnable targets: `c`, `cpp`, and `wasm`.

## Why this repo exists

The goal is not just to build one limiter. The goal is to prove a framework shape:

- A single Faust DSP can drive multiple compile targets.
- Web technology can be used for rapid UI preview during development.
- The shipped plugin runtime can still stay entirely native.
- The adapter layer can grow toward effects, synths, standalone apps, VST3, CLAP, and future AU targets without changing the core authoring model.

## Current layout

- `faust/`
  The DSP source.
- `tools/`
  Export, benchmark, and preview tooling.
- `generated/`
  Generated Faust outputs plus framework manifests.
- `src/`
  Native runtime core and AU/AppKit UI adapter.
- `vendor/cplug/`
  Vendored CPLUG AUv2 host glue.
- `preview/`
  Browser-based UI preview for active design iteration only.

## Commands

```sh
npm run export
npm run benchmark
npm run build:au
npm run preview
npm run validate:au
```

What they do:

- `npm run export`
  Generates Faust target outputs and C/CMake/UI manifests.
- `npm run benchmark`
  Rebuilds the generated targets and writes `generated/benchmark-results.json`.
- `npm run build:au`
  Builds `build/LimiterLab.component`.
- `npm run preview`
  Starts the web-only visual preview server for UI iteration.
- `npm run validate:au`
  Installs the built component into the user AU folder and runs `auval`.

## Latest local benchmark snapshot

At the time of this proof-of-concept pass, the limiter benchmark on an Apple M4 at 48 kHz / 256 samples / 6 seconds produced roughly:

- `c`: `319.2x` real time
- `cpp`: `326.4x` real time
- `wasm`: `20.0x` real time

## Practical caveats

- The AU proof of concept currently targets AUv2 because it is a pragmatic thin-wrapper route for this experiment. The framework is intentionally not AUv2-shaped internally.
- Web preview is development tooling only. The plugin bundle itself does not embed a web runtime.
- The current native plugin adapter is macOS-first. The framework/export/manifest layers are broader than the current packaged target.

## Research note

A short feasibility summary with source links lives in [docs/feasibility.md](/Users/mlangens/Documents/Playground/faust-web-au-kit/docs/feasibility.md).
