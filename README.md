# Faust Web AU Kit

`faust-web-au-kit` is now organized as a monorepo-native framework for building a suite of Faust-driven plugins with one shared set of export, preview, native-wrapper, validation, and packaging conventions.

The repo is designed around a simple rule: product identity lives in `apps/<app-key>`, while framework behavior lives in shared workspace tooling. That keeps new plugins from becoming one-off snowflakes and lets shared DSP export, UI schema generation, native runtime glue, installers, and tests scale across the suite.

## Workspace Model

The workspace root is described by `fwak.workspace.json`. It defines:

- the workspace name and version
- the default app used by commands with no explicit selection
- the canonical app registry
- the namespaced output roots for generated files, builds, and installers

Each app follows the same convention:

- `apps/<app-key>/project.json`
  Product manifest and target metadata.
- `apps/<app-key>/dsp/main.dsp`
  Faust source of truth for that app.
- `generated/apps/<app-key>/`
  Generated schema, target exports, and benchmark snapshots.
- `build/apps/<app-key>/`
  Native build products for that app only.
- `dist/apps/<app-key>/`
  Installer artifacts for that app only.

Shared framework code stays centralized:

- `src/`
  Shared native runtime core and AppKit editor layer.
- `tools/`
  Shared export, workspace orchestration, preview, benchmark, and validation tooling.
- `scripts/`
  Shared native build, install, doctor, and packaging entrypoints.
- `vendor/cplug/`
  Shared wrapper layer for AUv2, CLAP, VST3, and standalone targets.
- `preview/`
  Shared schema-driven browser preview for rapid UI iteration.

## Naming Conventions

The framework now treats plugin products as workspace apps with explicit, repeatable conventions:

- App keys are lowercase kebab-case, for example `limiter-lab` and `pulse-pad`.
- The default app is selected by `fwak.workspace.json`, not by a magic root `project.json`.
- CLI app selection uses `--app <app-key>`.
- Product manifests are always named `project.json`.
- Faust entrypoints are always `dsp/main.dsp`.
- Generated artifacts, native builds, and installers are always namespaced by app key.
- Shared framework behavior belongs in root-level shared code, not duplicated inside app folders.

That means a new plugin should be added by registering a new app, not by copying Limiter Lab into a parallel ad hoc structure.

## Current Apps

- `Limiter Lab`
  The flagship proof of concept: an oversampled limiter with native AU/CLAP/VST3/standalone targets, analyzer history, and drive-before-limiter routing.
- `Pulse Pad`
  A synth example that exercises the same manifest, export, preview, and native wrapper conventions.

## Commands

Default app commands target `limiter-lab` unless another app is selected.

```sh
npm run export
npm run export:all
npm run export:pulse-pad
npm run benchmark
npm run benchmark:pulse-pad
npm run build:au
npm run build:au -- --app pulse-pad
npm run build:native
npm run install:local
npm run validate:au
npm run doctor:au
npm run package:installer
npm run preview
```

What they do:

- `npm run export`
  Exports generated artifacts for the default app into `generated/apps/limiter-lab/`.
- `npm run export:all`
  Exports every registered app in the workspace.
- `npm run export:pulse-pad`
  Exports generated artifacts for `pulse-pad`.
- `npm run benchmark`
  Rebuilds the default app’s generated targets and writes `generated/apps/limiter-lab/benchmark-results.json`.
- `npm run benchmark:pulse-pad`
  Rebuilds the `pulse-pad` benchmark snapshot.
- `npm run build:au`
  Builds the default app’s AUv2 bundle into `build/apps/limiter-lab/`.
- `npm run build:native`
  Builds AUv2, CLAP, VST3, and standalone outputs for the selected app.
- `npm run install:local`
  Installs the selected app into `~/Library/Audio/Plug-Ins` and `~/Applications`.
- `npm run validate:au`
  Rebuilds, installs, and runs `auval` for the selected app.
- `npm run doctor:au`
  Reports user vs system AU installs, versions, hashes, and a compact `auval` summary for the selected app.
- `npm run package:installer`
  Builds a namespaced unsigned macOS installer for the selected app.
- `npm run preview`
  Starts the shared preview server. Use `/` for the default app or `/?app=<app-key>` for any other registered app.

The scripts also honor `FWAK_APP=<app-key>` if you prefer selecting an app through the environment.

## Testing

The framework is validated in layers:

- `npm test`
  Runs the workspace export prepare step, unit tests, schema contract tests, export integration tests, and Playwright preview tests.
- `npm run test:unit`
  Exercises low-level framework helpers such as atomic publication and scratch cleanup.
- `npm run test:contracts`
  Validates generated UI schema against the current app manifests and Faust metadata.
- `npm run test:integration`
  Stress-tests export behavior, including concurrent publication into shared workspace outputs.
- `npm run test:preview`
  Exercises the shared browser preview across workspace routes and failure states.
- `npm run test:native`
  Runs the AU validation path and keeps host-dependent checks at the top of the pyramid.

For app-specific native regression, pass an app key through the native scripts:

```sh
npm run build:au -- --app pulse-pad
npm run validate:au -- --app pulse-pad
npm run package:installer -- --app pulse-pad
```

## Outputs

For `Limiter Lab`, the shared conventions now produce:

- `generated/apps/limiter-lab/`
- `build/apps/limiter-lab/LimiterLab.component`
- `build/apps/limiter-lab/LimiterLab.clap`
- `build/apps/limiter-lab/LimiterLab.vst3`
- `build/apps/limiter-lab/LimiterLab.app`
- `dist/apps/limiter-lab/LimiterLab-0.3.0.pkg`

The preview server also publishes `generated/workspace_manifest.json`, which the web preview uses to render app navigation and route-aware schema loading.

## Logic And Installer Notes

Logic can be confused by duplicate AU installs in both `/Library` and `~/Library`. The framework now makes this easier to reason about because `doctor:au` reports both versions and both binary hashes for the selected app.

Recommended local flow:

1. Build or validate the selected app.
2. Install locally with `npm run install:local`.
3. Run `npm run doctor:au`.
4. If the user and system copies differ, either remove the stale copy or install the fresh `.pkg` so `/Library` matches the current build.

## Practical Caveats

- The native runtime layer is still macOS-first today.
- The generated preview is development tooling only; shipped plugin bundles do not embed a web runtime.
- The installer is unsigned and intended for local testing until a signed/notarized distribution path is added.
- AU validation passes, but the thin AUv2 wrapper still emits non-fatal warnings about CFString parameter naming and layout reporting.

## Research Note

A short feasibility summary with source links lives in `docs/feasibility.md`.
A first-pass Northline suite catalog and shared-component plan lives in `docs/northline-suite-research.md`.
