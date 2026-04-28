# AU DSP Engagement Strategy

The profiler now separates three questions that were previously tangled together:

1. Can the built-in host make any Audio Unit process audio?
2. Can a specific vendor Audio Unit be instantiated and controlled?
3. Does the rendered output differ from the dry probe enough to be valid profiling evidence?

## Current Findings

`npm run check:au-dsp-engagement` confirms that the built-in profiling path is headless and can engage Apple AUs:

- The profiling binary is audited with `otool -L` and must not link AppKit, Cocoa, or WebKit.
- `Apple: AULowpass` engages with the callback render path.
- `Apple: AULowpass` also engages with direct in-place `AudioUnitProcess`.
- `AudioUnitProcessMultiple` returns `-4` for the tested effect path and should be treated as diagnostic, not the default render path.

The same check confirms the current UAD state:

- `Universal Audio (UADx): UADx 1176 Rev A Compressor` exposes parameters, accepts overrides, and engages in callback rendering.
- `Universal Audio (UADx): UADx Pultec EQP-1A EQ` exposes parameters, accepts overrides, and engages in callback rendering.
- Hardware-backed `!UAD` plugins can validate with `auval` while still rendering dry when UAD hardware is unavailable or powered off, so profiling prefers the native `UADx` path whenever a matching product exists.
- UADx and `!UAD` direct `AudioUnitProcess` / `AudioUnitProcessMultiple` calls return `-4`; callback rendering remains the supported path.
- No macOS or UAD authorization prompt appeared during the diagnostic run.

The GUI stage can instantiate plugin editor views only when explicitly allowed:

```sh
npm run stage:au-plugin -- --allow-gui --name "Universal Audio (UADx): UADx 1176 Rev A Compressor" --exact --seconds 10
```

The first smoke loaded the UAD 1176 Rev A Cocoa view without surfacing an authorization prompt. Prefer the native UADx editor for future visual diagnostics when a matching UADx product exists.

## Framework Behavior

Profiling is headless-only by default. The GUI stage is a diagnostic surface for screenshots and state inspection; it is not part of candidate scoring or sonic profiling, and it cannot run without the explicit `--allow-gui` flag.

The emulation pilot now resolves the actual host component name from the parameter map and renders with `--exact`, which prevents fuzzy matching from silently selecting a legacy or wrapper component.

Every reference render is compared against the dry input. Pass-through captures are retained as artifacts but excluded from Faust candidate scoring.

The headless host now sets minimal tempo/transport host callbacks and explicitly forces `kAudioUnitProperty_BypassEffect` off before rendering. Native UADx plugins engage through this path; hardware-backed `!UAD` plugins are retained as diagnostics but no longer drive primitive profiling when a matching UADx reference is installed.

## Next Execution Targets

The remaining work has moved from host engagement to primitive fitting:

- Extend native UADx pilots across more product families and signal classes.
- Improve primitive fitting for the largest measured residuals, starting with 1176 tone-burst harmonic/timing behavior and Pultec phase/group-delay behavior.
- Keep hardware-backed `!UAD` captures separate until powered hardware can prove non-dry output.
