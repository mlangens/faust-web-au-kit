# PDF-Grounded UI Overhaul Pass

This pass returns to the original manual-backed interaction goals for the Northline clone suite and moves the preview away from slider-first fallback controls.

## Manual Themes Re-Applied

- EQ, filter, reverb, delay, and multiband products should lead with large direct-manipulation canvases.
- Dynamics products should lead with transfer curves, detector shape, and meter history rather than generic parameter rows.
- Creative products should expose modulation as a source/slot workflow with live target feedback.
- Synth products should read as module racks, voice strips, and performance surfaces instead of a flat control list.
- Compact utility products should be reduced skins of the same shared primitives, not separate miniature renderers.

## Framework Changes

- Every shared surface now emits a `data-surface-workflow` contract and a visible affordance rail such as `drag bands`, `resize edges`, `source rail`, or `watch clamp`.
- Canvas-like surfaces now carry contextual hints directly on the editor surface, so the visual representation explains how to manipulate sound.
- The fallback control panel now reports how many parameters are surface-owned, making the visual editors the primary interface and the remaining controls a parameter dock.
- Product variants now receive stronger family-specific visual treatments for spectral, dynamics, reverb, creative/modulation, synth, and compact-filter surfaces.

## Manual Sources

- [Pro-Q 4 manual](https://www.fabfilter.com/downloads/pdf/help/ffproq4-manual.pdf)
- [Pro-MB manual](https://www.fabfilter.com/downloads/pdf/help/ffpromb-manual.pdf)
- [Timeless 3 manual](https://www.fabfilter.com/downloads/pdf/help/fftimeless3-manual.pdf)
- [Simplon manual](https://www.fabfilter.com/downloads/pdf/help/ffsimplon-manual.pdf)
