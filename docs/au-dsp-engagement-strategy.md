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

- `Universal Audio: UAD UA 1176 Rev A` exposes parameters and accepts overrides.
- `Universal Audio: UAD Moog Multimode Filter` exposes parameters and accepts overrides.
- UAD callback renders are dry pass-through in this host.
- UAD direct `AudioUnitProcess` and `AudioUnitProcessMultiple` return `-4`.
- No macOS or UAD authorization prompt appeared during the diagnostic run.

The GUI stage can instantiate plugin editor views only when explicitly allowed:

```sh
npm run stage:au-plugin -- --allow-gui --name "Universal Audio: UAD UA 1176 Rev A" --exact --seconds 10
```

The first smoke loaded the UAD 1176 Rev A Cocoa view without surfacing an authorization prompt. This gives Codex a screenshotable surface for verifying bypass, authorization, and parameter state only when visual diagnostics are intentionally requested.

## Framework Behavior

Profiling is headless-only by default. The GUI stage is a diagnostic surface for screenshots and state inspection; it is not part of candidate scoring or sonic profiling, and it cannot run without the explicit `--allow-gui` flag.

The emulation pilot now resolves the actual host component name from the parameter map and renders with `--exact`, which prevents fuzzy matching from silently selecting a legacy or wrapper component.

Every reference render is compared against the dry input. Pass-through captures are retained as artifacts but excluded from Faust candidate scoring.

The headless host now sets minimal tempo/transport host callbacks and explicitly forces `kAudioUnitProperty_BypassEffect` off before rendering. UAD still returns dry output in callback mode, so the remaining gap is not simply missing host callbacks or bypass state.

## Next Execution Targets

The remaining work is not primitive fitting yet. It is host engagement:

- Reproduce the `auval`-style headless render lifecycle that validates UAD plugins without opening editor windows.
- Validate the same UAD plugins inside a known-working headless external host through the existing `profile:uad -- --render-command` seam.
- Capture and parse UAD logs around failed engagement to distinguish authorization, bypass, and unsupported-host lifecycle cases.
- Once any UAD fixture engages, promote one UAD fixture to a required regression in `check:au-dsp-engagement`.
