# Faust Web AU Kit

`faust-web-au-kit` is a manifest-driven framework experiment for building native audio plugins around a Faust DSP source of truth without making handwritten C++ the center of the workflow.

The repo splits responsibilities on purpose:

- Faust owns DSP and control metadata.
- Node scripts handle export, schema generation, benchmarking, packaging, and preview tooling.
- Native adapters stay thin and format-specific.
- The shipped runtime UI is native, while web tooling stays in the fast-iteration loop.

## Current proof of concept

The flagship project is `Limiter Lab`, a 4x oversampled stereo limiter with:

- `Modern` and `Vintage Response` timing options plus independent `Tube Drive` and `Transformer Tone` coloration that can be combined.
- Native real-time peak and gain-reduction metering plus a scrolling analyzer view for input/output waveform history and gain reduction.
- Native AppKit UI backed by generated schema metadata.
- AUv2, CLAP, VST3, and standalone macOS outputs.
- Local installer and `.pkg` packaging.
- Cross-target Faust export for `c`, `cpp`, `wasm`, `cmajor`, and `rust`.
- A benchmark harness for `c`, `cpp`, and `wasm`.

The repo also includes `Pulse Pad`, a synth manifest/example that uses the same export and preview path so the framework is not boxed into effect-only workflows.

## Layout

- `faust/`
  Faust DSP sources.
- `projects/`
  Additional project manifests beyond the default root project.
- `tools/`
  Export, benchmark, preview, and packaging tooling.
- `generated/`
  Generated Faust targets plus framework manifests.
- `src/`
  Native runtime core and AppKit UI layer.
- `vendor/cplug/`
  Vendored CPLUG wrappers for AUv2, CLAP, VST3, and standalone macOS hosting.
- `preview/`
  Browser-based preview for rapid visual iteration only.

## Commands

```sh
npm run export
npm run export:synth
npm run benchmark
npm run build:au
npm run build:native
npm run doctor:au
npm run install:local
npm run package:installer
npm run validate:au
npm run preview
```

What they do:

- `npm run export`
  Exports the default limiter project into `generated/`.
- `npm run export:synth`
  Exports the `Pulse Pad` example into `generated/pulse_pad/`.
- `npm run benchmark`
  Rebuilds generated targets and writes `generated/benchmark-results.json`.
- `npm run build:au`
  Builds the AUv2 bundle only.
- `npm run build:native`
  Builds AUv2, CLAP, VST3, and the standalone app.
- `npm run doctor:au`
  Reports user vs system AU installs, version mismatches, and a compact `auval` summary.
- `npm run install:local`
  Installs the built bundles into `~/Library/Audio/Plug-Ins` and `~/Applications`.
- `npm run package:installer`
  Writes an unsigned macOS installer package to `dist/`.
- `npm run validate:au`
  Installs the AUv2 bundle into the user Components folder and runs `auval`.
- `npm run preview`
  Starts the schema-driven preview server. Use `/` for `Limiter Lab` and `/?project=pulse_pad` for `Pulse Pad`.

## Testing

The repo now has a small test pyramid that matches how the project is built:

- `npm test`
  Re-exports the default limiter plus `Pulse Pad`, runs unit tests for file-safe generation helpers, schema contract tests, export integration tests, then runs Playwright smoke tests against the preview server.
- `npm run test:unit`
  Exercises low-level framework helpers such as atomic file publication and scratch-directory cleanup.
- `npm run test:contracts`
  Validates generated `ui_schema.json` files against the current manifests and Faust metadata.
- `npm run test:integration`
  Stress-tests the shared export pipeline, including concurrent runs against the same generated output path.
- `npm run test:preview`
  Exercises the browser preview for `/` and `/?project=pulse_pad` so parallel UI work collides in one place before shipping.
- `npm run test:native`
  Runs the AU validation path. Keep this as the host-dependent top of the pyramid rather than the default local/CI path.

## Current local outputs

After `npm run build:native`, the default project produces:

- `build/LimiterLab.component`
- `build/LimiterLab.clap`
- `build/LimiterLab.vst3`
- `build/LimiterLab.app`

After `npm run package:installer`, the installer artifact is:

- `dist/LimiterLab-0.1.3.pkg`

If Logic sees the plugin but hangs while instantiating it, run `npm run doctor:au` first. A stale `/Library` AU bundle plus a newer `~/Library` AU bundle can make Logic validate one copy and try to open another.

## Latest local benchmark snapshot

On an Apple M4 at 48 kHz / 256 samples / 6 seconds, the latest limiter run produced roughly:

- `c`: `129.9x` real time
- `cpp`: `132.2x` real time
- `wasm`: `6.9x` real time

## Practical caveats

- The native runtime layer is macOS-first today even though the project/config/export model is intentionally broader.
- The `.pkg` installer is unsigned, which is fine for local testing but not for public notarized distribution.
- AU validation passes, but the thin AUv2 wrapper still emits non-fatal warnings about CFString parameter naming and layout reporting.
- Web preview is development tooling only. The shipped plugin bundles do not embed a web runtime.

## Research note

A short feasibility summary with source links lives in [docs/feasibility.md](/Users/mlangens/Documents/Playground/faust-web-au-kit/docs/feasibility.md).
