# Faust Web AU Kit

`faust-web-au-kit` is a monorepo-native framework for designing Faust-driven audio plugins with shared preview, export, native-wrapper, profiling, validation, and packaging conventions.

The repo has pivoted away from treating clone suites as end products. Reference plugins and sample suites are now research specimens for extracting reusable DSP primitives, UI surfaces, and sonic tests. Active product work lives in a small framework studio suite, while archived clone-derived learning lives in the reference corpus.

## Workspace Model

The workspace root is described by `fwak.workspace.json`. It defines the default app, app registry, and output roots for generated files, builds, and installers.

Each registered app follows the same convention:

- `apps/<app-key>/project.json`
  Product manifest and target metadata.
- `apps/<app-key>/dsp/main.dsp`
  Faust source of truth.
- `generated/apps/<app-key>/`
  Generated schema, Faust exports, and benchmark snapshots.
- `build/apps/<app-key>/`
  Native build products.
- `dist/apps/<app-key>/`
  App installer artifacts.
- `dist/suites/<suite-id>/`
  Bulk installer artifacts for an operational catalog such as `framework-studio`.

Shared framework code stays centralized in `src/`, `tools/`, `scripts/`, `preview/`, `types/`, and `vendor/cplug/`.

## Current Apps

- `omniplugin`
  Product name: Primitive Workbench. This is the default GUI-first primitive-chain builder for assembling reusable DSP roles into real-time plugin candidates.
- `fet-76`
  The profiled 1176-style FET compressor proof. This validates profiling-to-primitive-to-Faust assembly and keeps the strongest emulation path alive.
- `pulse-pad`
  The retained synth proof for instrument surfaces, oscillator/filter primitives, modulation UI, and performance-aware preview routes.
- `limiter-lab`
  The original limiter proof, kept as a legacy framework smoke target for exports, meters, and native-wrapper validation.

The former Northline clone apps were removed from the active workspace. Their useful primitive/surface/control evidence is preserved in `framework/reference-corpus/reference-assemblages.json`, and `ui/catalog/northline-suite.json` is marked `reference-only`.

## Commands

Default app commands now target `omniplugin` unless another app is selected.

```sh
npm run export
npm run export:all
npm run export:omniplugin
npm run export:fet-76
npm run export:pulse-pad
npm run benchmark
npm run benchmark:omniplugin
npm run build:native
npm run build:native -- --app fet-76
npm run install:local
npm run install:suite
npm run uninstall:local
npm run uninstall:suite
npm run package:installer
npm run package:uninstaller
npm run package:suite-installer
npm run package:suite-uninstaller
npm run preview
```

Useful details:

- `npm run export` writes generated artifacts for Primitive Workbench into `generated/apps/omniplugin/`.
- `npm run export:all` refreshes every active workspace app.
- `npm run install:local` and `npm run package:installer` operate on the selected app.
- `npm run install:suite` and `npm run package:suite-installer` use the operational `framework-studio` catalog by default.
- `npm run preview` starts the shared web preview. Use `/` for Primitive Workbench or `/?app=<app-key>` for another active app.
- App-scoped commands honor either `-- --app <app-key>` or `FWAK_APP=<app-key>`.

## Primitive Workbench

`apps/omniplugin` is the first installable primitive workbench. It keeps the DAW-facing parameter list fixed: four primitive slots expose `Type`, `Amount`, `Tone`, and `Mix`, while `Macro Intent`, `Macro Motion`, and `Macro Guard` provide stable automation targets for larger sound-building moves.

The goal is not to clone a product. The goal is a GUI-only composition surface where users can assemble LEGO-like DSP primitives, audition them against real sound input, and eventually export the result as a Faust/native plugin.

Build it with:

```sh
npm run export:omniplugin
npm run build:native -- --app omniplugin
npm run package:installer -- --app omniplugin
```

## Testing

The framework is validated in layers:

- `npm run check:structure`
  Enforces workspace naming, manifest placement, DSP entrypoint paths, active catalog references, and shared file naming conventions.
- `npm run check:type-coverage`
  Enforces which JS/MJS framework files must participate in TypeScript-backed checking.
- `npm run check:types`
  Runs `tsc --noEmit` over the enforced checked set.
- `npm run test:unit`
  Exercises low-level framework helpers and primitive/reference tooling.
- `npm run test:contracts`
  Validates generated UI schema, active suite contracts, sonic stage declarations, and archived assemblage evidence.
- `npm run test:integration`
  Stress-tests export behavior, sonic reports, scratch workspaces, and cache reuse.
- `npm run test:preview`
  Exercises the shared browser preview across active workspace routes and failure states.
- `npm test`
  Runs the full default regression suite.

When adding or splitting shared JS/MJS framework files:

1. Add the file to `tsconfig.check.json`, or add a temporary reasoned exemption in `tools/type-coverage-policy.json`.
2. Run `npm run check:type-coverage`.
3. Run `npm run check:types`.

## Native Notes

The native runtime layer is macOS-first today. Installer and uninstaller packages are unsigned and intended for local testing until a signed/notarized distribution path exists.

Logic can be confused by duplicate AU installs in both `/Library` and `~/Library`. Use `npm run doctor:au` for the selected app to inspect user/system installs, versions, hashes, and `auval` output.

Recommended local flow:

1. Build or validate the selected app.
2. Install with `npm run install:local`.
3. Run `npm run doctor:au`.
4. If user and system copies differ, clean both with `npm run uninstall:local -- --scope both`.

Recommended active-suite flow:

1. Install the active framework studio suite with `npm run install:suite`.
2. Generate standalone artifacts with `npm run package:suite-installer` or `npm run package:suite-uninstaller`.
3. Clean stale suite copies with `npm run uninstall:suite -- --scope both`.

## Research Notes

- `docs/reference-corpus-methodology.md` explains the specimen-to-primitive extraction loop.
- `framework/reference-corpus/plugin-references.json` tracks outside plugin evidence.
- `framework/reference-corpus/reference-assemblages.json` preserves the retired Northline clone-suite assemblages as framework evidence.
- `framework/profiling/probe-signals.json` defines deterministic sonic inputs for staged plugin profiling.
