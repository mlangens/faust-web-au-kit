# Reference Corpus Methodology

The framework now treats reference plugins as source material for primitive extraction rather than as products to clone forever. Northline remains useful, but only as a disposable validation suite: it proves that framework-level primitives can drive generated schemas, preview surfaces, native exports, and tests.

## Corpus Role

The reference corpus lives at `framework/reference-corpus/plugin-references.json`. Each entry records the reference type, manual URL, observed primitive IDs, feature signals, extraction status, and notes about what the framework should learn from the reference.

The corpus currently includes Northline as a `sample-suite` and DMGAudio manuals as `outside-plugin` references. DMG examples broaden the framework with deeper dynamics modeling, EQ topology, split-band detector workflows, multiband limiting/dynamics, pitch/time feedback, channel utility, and analysis surfaces.

## Extraction Loop

1. Observe a reference plugin manual, staged UI, or sample suite.
2. Record feature signals in the corpus without copying product identity.
3. Map those signals to primitive IDs or introduce a new primitive.
4. Promote primitive maturity from `observed` toward `native-ready`.
5. Bind the primitive to reusable UI surfaces and sonic probes.
6. Use sample suites only as regression packs that can be replaced later.

## Maturity Meaning

- `observed`: Seen in a reference or sample suite.
- `modeled`: Captured as framework metadata with DSP intent, surface roles, and probes.
- `implemented`: Has reusable DSP, schema, or preview implementation support.
- `surface-bound`: Appears in generated schemas and preview regressions.
- `sonically-verified`: Backed by automated sonic behavior checks.
- `native-ready`: Validated in native plugin builds and staging hosts.

## Current DMG-Informed Primitive Additions

- `eq.circuit-model-topology`: extracted from EQuality, EQuick, and EQuilibrium model/curve workflows.
- `compression.true-peak-limiter`: extracted from Limitless and TrackLimit-style limiter workflows.
- `compression.split-band-focus`: extracted from Essence, Expurgate, TrackDS-style detector and audition workflows.
- `spatial.channel-toolkit`: extracted from Dualism and TrackControl-style channel utility workflows.
- `metering.analysis-suite`: extracted from Dualism and TrackMeter-style analyzer workflows.
- `pitch.modulated-feedback-shifter`: extracted from PitchFunk's pitch/delay/filter/modulation matrix.

## Guardrail

The framework should be able to discard Northline without losing primitive knowledge. If removing a sample suite would delete framework vocabulary, that vocabulary is in the wrong place.
