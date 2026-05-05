# Cabinet Primitive Captures

This pass splits cabinet behavior out of the broad `amp.cabinet-mic-chain` assemblage. Amp products remain useful as whole-chain references, but cabinet/speaker/mic behavior is now represented by `cabinet.speaker-mic-simulation` so agents can fit cabinet response separately from preamp drive, tone stack, and power-stage nonlinearities.

## Primitive Split

- `amp.cabinet-mic-chain` is now treated as a full amp-chain assemblage: preamp drive, tone stack, power amp, cabinet handoff, mic placement, room, and output gain.
- `cabinet.speaker-mic-simulation` is the narrower cabinet primitive: speaker resonance, cabinet IR/filter response, mic model/position, room/air blend, phase, and multi-mic routing.
- Full amp products should generally resolve both primitives; stomp/tuner products may resolve only the broader amp-adjacent chain or neither cabinet primitive if they do not materially model a cabinet.

## Capture Commands

UADx native amp/cabinet references:

```sh
npm run profile:uad -- --runtime uadx-native --format au --prefer-products --plugin dream --plugin ruby --plugin lion --plugin showtime --plugin woodrow --plugin waterfall --render --signal-limit 6 --out generated/profiling/cabinet-uadx-render
```

Generic AU cabinet candidates:

```sh
npm run profile:au -- --exclude-manufacturer UADx,!UAD,SToy,Mlng --type aufx,aumf --plugin AmpCraft --plugin rockrack --plugin GTR --plugin PRS --signal dirac-impulse-stereo,log-sweep-fullband,guitar-di-chords,phase-null-sweep --prefer-products --render --progress --parameter-timeout-ms 7000 --render-timeout-ms 15000 --out generated/profiling/cabinet-au-render
```

## Results

- UADx selected products: 7
- UADx render success: 42/42
- UADx engaged products: 7/7
- Generic AU selected products: 12
- Generic AU render success: 39/48
- Generic AU engaged products: 10/12
- Generic AU cabinet-primitive engaged products: 7

The generic AU failures were contained to individual products/probes: Waves GTR Amp 2Cab and GTR Tuner failed through the Waves shell, and bx_rockrack timed out on the phase-null probe after succeeding on the other cabinet probes.

## Observed Cabinet Types

- Strongly voiced speaker-cabinet filters: UADx Dream, Ruby, Lion, Showtime, Woodrow; Kazrog AmpCraft; bx_rockrack; Waves GTR Amp, GTR Tool Rack, PRS Archon, and PRS V9.
- Stereo or multi-mic cabinet field: Waves PRS Dallas showed lower stereo correlation and stronger comb/phase behavior than the more mono-centered cabinet captures.
- Rotary speaker cabinet: UADx Waterfall Rotary Speaker clearly belongs to both `modulation.rotary-speaker-chain` and `cabinet.speaker-mic-simulation`.
- Amp-adjacent non-cabinet utilities: Waves GTR Stomp 2/4/6 engaged but behaved like stomp/rack utilities rather than cabinet simulations, so they are not treated as cabinet primitive evidence.

## Capture Signals

The cabinet primitive maps to:

- `dirac-impulse-stereo` for IR onset, polarity, and time-domain cabinet/room response.
- `log-sweep-fullband` for magnitude and phase coloration, low/high rolloff, resonant notches, and speaker-style voicing.
- `guitar-di-chords` for program-material coloration and cone-like emphasis.
- `phase-null-sweep` for mic alignment, phase rotation, and multi-mic comb filtering.

This is enough evidence to treat cabinet emulation as a separate primitive family and a separate Faust fitting target. The next fitting pass should choose between static convolution, minimum-phase/filterbank approximation, dynamic speaker nonlinearity, and multi-mic/room-coupled models based on these probe summaries.
