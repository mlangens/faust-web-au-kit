# Local AU Remainder Primitive Harvest

This pass scans the functional Audio Unit effect inventory left after the dedicated FWAK, UAD/UADx, and Soundtoys harvests. It treats installed third-party plugins as framework research specimens for primitive extraction, not clone targets.

## Capture Command

```sh
npm run profile:au -- --exclude-manufacturer UADx,!UAD,SToy,Mlng --type aufx,aumf --signal log-sweep-fullband,musical-drum-bass-loop --prefer-products --render --progress --parameter-timeout-ms 7000 --render-timeout-ms 12000 --out generated/profiling/au-remainder-product-functional-render
```

The command inventories local AU effects, excludes prior dedicated passes, collapses mono/stereo/component variants into distinct products, maps names to framework primitives, renders two active probes through the headless AU host, and writes dry-vs-render engagement checks.

## Result

- AU effect components discovered after exclusions: 381
- Distinct products selected with `--prefer-products`: 264
- Generic AU parameter maps captured: 256/264
- Probe render attempts: 528
- Successful probe WAV renders: 494
- Failed or timed-out render attempts: 34
- Products with transformed/engaged audio: 231/264
- Products flagged as silent output: 20
- Primitive IDs inferred from inventory: 42
- Primitive IDs with functional sonic evidence: 40
- Fallback-only primitive inference: 1 product (`e47: AGridder`)
- Report path: `generated/profiling/au-remainder-product-functional-render/au-profile-report.json`

Silent-output products were not accepted as functional primitive evidence. The biggest example is the McDSP APB hardware-bridge family, which instantiated but rendered silence in this headless pass. That keeps `analog.external-hardware-bridge` as an observed hardware/staging primitive until a real loopback or attached-device pass proves sonic engagement.

## Functional Primitive Coverage

The strongest functional primitive clusters were:

- 43 `eq.circuit-model-topology`
- 27 `spatial.stereo-image-matrix`
- 25 `mastering.integrated-mastering-chain`
- 22 `compression.vintage-compressor-model`
- 22 `restoration.spectral-repair-module`
- 22 `spatial.channel-toolkit`
- 15 `saturation.virtual-analog-stage`
- 14 `space.algorithmic-reverb-suite`
- 12 `delay.style-morphing-echo-engine`
- 12 `saturation.clip-limiter-stage`
- 11 `amp.cabinet-mic-chain`
- 11 `space.reverb-macro-field`
- 10 `pitch.modulated-feedback-shifter`

The pass added or reinforced restoration, mastering, stereo imaging, utility, codec/source, gate/expander, transient, algorithmic reverb, vocal alignment, and broad vendor-shell profiling behavior beyond the earlier UADx and Soundtoys-focused primitive harvests.

## Framework Impact

The generic AU profiler is now the default local remainder-harvest path. It adds product-level deduping, plugin include/exclude filters, progress logging, hard render timeouts, and engagement summaries so autonomous scans can safely profile large installed plugin sets.

This pass also tightened primitive inference for compact product names such as FabFilter `Pro-Q`, Waves `RComp`/`Q10`/`RVerb`, Apple `AU*` units, and utility/source plugins. That reduced fallback-only classification from 88 products in the first inventory pass to 1 product in the final pass.
