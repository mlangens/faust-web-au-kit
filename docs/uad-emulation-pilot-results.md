# UADx Emulation Pilot Results

Run command:

```sh
npm run profile:emulation-pilots -- --target uad-1176-rev-a --target uad-pultec-eqp-1a --signal-limit 4 --state-limit 3 --candidate-limit 3 --out generated/profiling/uadx-emulation-pilots
```

## Pilot Coverage

The pilot prefers native UADx Audio Units over hardware-backed `!UAD` plugins when a matching product is installed. After the workspace pivot, active candidates are `fet-76` for 1176-style compression and `omniplugin`/Primitive Workbench for passive EQ primitive experiments.

- `uaudio_ua_1176_rev_a` resolved to `Universal Audio (UADx): UADx 1176 Rev A Compressor` and is compared against `fet-76`.
- `uaudio_pultec_eqp-1a` resolved to `Universal Audio (UADx): UADx Pultec EQP-1A EQ` and is compared against Primitive Workbench tone-slot candidate states.

Both targets rendered 4 probe signals across 3 UADx parameter states. Every UADx reference render passed the dry-input engagement check.

## Results

- Historical pre-pivot `uad-1176-rev-a`: 12 engaged reference renders, 0 pass-through reference renders, 36 valid comparisons. The early best candidate was `press-deck/default`; this was superseded by the dedicated `fet-76` follow-up below.
- Historical pre-pivot `uad-pultec-eqp-1a`: 12 engaged reference renders, 0 pass-through reference renders, 12 valid comparisons, 24 invalid candidate comparisons filtered out. The early best candidate was `atlas-curve/default`; the active pilot now uses Primitive Workbench candidate states because `atlas-curve` is archived reference evidence.

The Pultec invalid comparisons came from retired non-default EQ candidate states producing non-finite output analysis. Those comparisons are now excluded from scoring so they cannot masquerade as primitive fit evidence.

## Primitive Derivation

The 1176 pilot moves `compression.vintage-compressor-model` from manual-observed to audio-profiled. The largest residual is the driven-fast tone-burst case: score `2.682641`, spectral distance `40.525 dB`, harmonic distance `76.444 dB`, and RMS delta `0.264 dB`. This points to a missing FET-specific gain-cell timing and harmonic-memory model rather than a simple threshold/ratio mismatch.

The Pultec pilot moves `eq.passive-vintage-program-eq` from manual-observed to audio-profiled. The largest residuals are phase-null probes, with low-bloom score `5.238929` and RMS delta `135.623 dB`. This points to missing phase/group-delay topology and passive boost/attenuation coupling even when broad magnitude response residuals are comparatively smaller.

## Follow-Up

- Add a FET compressor primitive submodel for ratio-button transfer, tone-burst recovery, and level-dependent harmonic emphasis.
- Add a passive EQ phase/group-delay primitive path so Pultec-style program EQs can be fitted as coupled topology rather than independent shelves.
- Fit passive EQ candidates against the active Primitive Workbench tone-slot graph rather than reviving retired clone apps.

## FET-76 Follow-Up Pass

The 1176 pilot now has a dedicated framework candidate app, `fet-76`, and a new `compression.fet-76-gain-cell` primitive. The fitting run:

```sh
npm run profile:emulation-pilots -- --target uad-1176-rev-a --signal-limit 4 --state-limit 3 --candidate-limit 4 --out generated/profiling/fet76-uadx-proof
```

resolved `uaudio_ua_1176_rev_a` as a native UADx Audio Unit, rendered 12 engaged references with 0 pass-through captures, and produced 48 valid Faust comparisons. The best FET-76 state scored `1.972647`; residuals now point at transient-click and driven tone-burst recovery as the next primitive-fitting targets.

See `docs/fet-76-primitive-fitting.md` for the product proof, package commands, and the framework bug fix that makes Faust WASM candidate control overrides reliable.
