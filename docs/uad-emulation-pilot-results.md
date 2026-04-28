# UAD Emulation Pilot Results

Run command:

```sh
npm run profile:emulation-pilots -- --target uad-1176-rev-a --target uad-pultec-eqp-1a --signal-limit 6 --state-limit 3 --candidate-limit 3 --out generated/profiling/emulation-pilots
```

## Pilot Coverage

The pilot exercised two installed UAD Audio Units:

- `UAD UA 1176 Rev A` against the `press-deck` Faust candidate.
- `UAD Pultec EQP-1A` against the `atlas-curve` Faust candidate.

Each target rendered 6 probe signals across 3 UAD parameter states and 3 Faust candidate states, producing 54 UAD-vs-Faust comparison artifacts per target. The runner also wrote 36 dry-input engagement checks across both targets.

## Result

Both UAD targets exposed parameter maps and accepted parameter overrides, but every rendered UAD output was sample-identical to the dry probe input over the input duration:

- `uad-1176-rev-a`: 18 pass-through reference renders, 0 engaged reference renders, 0 valid fit comparisons.
- `uad-pultec-eqp-1a`: 18 pass-through reference renders, 0 engaged reference renders, 0 valid fit comparisons.

Because the reference renders did not engage, the assembler intentionally selected no Faust candidate state. This is the correct behavior: pass-through UAD captures must not be treated as successful emulation evidence.

## Follow-Up

The next host-level task is to make the stage environment engage proprietary AU DSP reliably. Likely avenues are validating authorization/bypass state, testing an `AudioUnitProcessMultiple` render path, and comparing the built-in host against a known-working DAW or pluginval-style host render for the same probes.
