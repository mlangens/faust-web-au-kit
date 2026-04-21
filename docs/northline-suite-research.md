# Northline Suite Research

Researched on 2026-04-20 using the official product catalog, the linked product pages, and the screenshot links exposed from those pages where available.

This started as a product-page pass and has now been upgraded with the official manual PDFs for all 14 suite members. It is enough to define the suite shape, the first reusable component families, the clone-critical interaction patterns, and the places where the current framework will need a richer UI schema before cloning individual apps.

## Executive Read

- The product line currently presents 14 core plug-ins across three families: mixing/mastering, creative tools, and basic plug-ins.
- The suite should not be treated as 14 unrelated UIs. The product pages repeatedly point to the same core surfaces: interactive frequency canvases, analyzer overlays, dynamics displays, multiband editors, modulation systems, and a shared product shell.
- The manuals confirm that the real reuse opportunity is even stronger than the catalog suggests: there is a shared shell, a shared knob/value-entry system, a shared graph-editing grammar, shared popover and hover trays, and a shared modulation-slot model reused across multiple products.
- The current monorepo shape already matches the right ownership model: product identity in `apps/<app-key>`, shared behavior in common framework code. The main missing piece is a more expressive UI composition schema than the current flat `controls[]` plus `meters[]` export.

## Official Catalog

### Mixing And Mastering

| Product | Official focus | Likely shared primitives | Gaps still not exposed clearly |
| --- | --- | --- | --- |
| Flagship EQ | up to 24 bands, dynamic EQ, spectral dynamics, multiple phase modes, Atmos support, analyzer, sketching and matching aids, instance list | frequency canvas, band handles, analyzer overlay, speaker/channel scope selector, instance list, preset browser | exact per-band inspector layout, spectral dynamics control grouping, keyboard gestures, copy/paste and band management flows |
| Flagship Compressor | 14 compression styles, character modes, side-chain EQ, host-tempo triggering, auto-threshold, auto-gain, Atmos support, high oversampling | dynamics display, side-chain EQ canvas, large meter bridge, style selector, character panel | exact compact vs large view layout, style-specific parameter behavior, side-chain routing details, advanced panel grouping |
| Flagship Limiter | true-peak limiting, loudness metering, eight algorithms, surround support, dithering, audition and unity-gain utilities | limiter history display, true-peak and loudness meter stack, algorithm switcher, advanced options panel | exact display mode variants, loudness sub-panels, advanced settings grouping, compact layout behavior |
| Flagship Reverb | room models, plate-like and vintage-like algorithms, decay shaping EQ, post EQ, IR import, thickness, ducking, auto gate, freeze | reverb display canvas, decay-rate EQ editor, post-EQ editor, room-model selector, preset browser | exact curve editing gestures, IR import workflow, room-model browser details, freeze and ducking visualization |
| Multiband Dynamics | freely placed bands, optional crossover snapping, dynamic/linear/minimum phase, per-band dynamics controls, analyzer | multiband canvas, band creation handles, per-band inspector, analyzer overlay, phase-mode selector | band popover layout, side-chain editor layout, crossover interaction rules, band focus states |
| Vocal Dynamics | vocal and broad detection modes, real-time de-essing display, split/wide band modes, look-ahead, oversampling, analyzer in HP/LP controller | compact dynamics display, threshold/range editor, analyzer plus filter controller, side-chain meter | exact detection visualization details, compact vs large layout states, HP/LP editor gestures, preset grouping |
| Gate/Expander | multiple gate and expander algorithms, expert side-chain routing, transfer curve, level display, MIDI triggering | gate transfer display, meter bridge, routing panel, expert-mode surface, preset browser | expert-mode layout, routing editor details, per-algorithm control emphasis, how much of the view is always visible |

### Creative Tools

| Product | Official focus | Likely shared primitives | Gaps still not exposed clearly |
| --- | --- | --- | --- |
| Saturation Suite | 28 distortion styles, up to 6 bands, optional linear phase, live modulation visualization, 50-slot modulation matrix, per-band drive/dynamics/tone | multiband canvas, per-band control strip, modulation matrix, source editors, style browser, floating slot panel | source editor parameter sets, style-specific control availability, exact band visualization, preset taxonomy |
| Delay Suite | tape-like and time-stretch delay behavior, five effects, up to six filters, tap patterns, diffusion, drag-and-drop modulation, per-component presets | delay timeline or tap editor, filter modules, modulation matrix, component preset picker, effect sub-panels | exact tap pattern UI, delay routing view, effect chain arrangement, per-component preset storage UX |
| Routing Filter Suite | four analog-style filters, flexible routing, non-linear bell/shelf filters, drag-and-drop modulation, floating slot panel | filter canvas, routing selector, modulation matrix, source editors, floating slots | routing view details, graph interaction rules, filter module expansion states, per-filter inspector design |
| Synth Rack | four oscillators, four filters, effects rack, preset browser, arpeggiator, 100-slot modulation matrix, polyphony and unison | oscillator modules, filter rack, effect rack, modulation matrix, arpeggiator panel, preset browser | exact voice architecture visualization, module layout, mod source editor details, keyboard and arp interaction model |

### Basic Plug-ins

| Product | Official focus | Likely shared primitives | Gaps still not exposed clearly |
| --- | --- | --- | --- |
| Minimal Synth | single-oscillator synth with aliasing-free oscillator, self-oscillating low-pass filter, LFO, EG, PWM, polyphony | simple oscillator block, filter block, ADSR/LFO section, preset browser | full panel layout, exact modulation routing presentation, performance controls beyond the feature list |
| Dual Filter | two multimode filters, serial/parallel routing, multiple characteristics, large interactive filter display | dual-filter canvas, routing toggle, characteristic selector, preset browser | exact dual-filter manipulation gestures, performance layout, visual hierarchy between filter and utility controls |
| Compact Filter | single filter, low/high-pass modes, interactive filter display, envelope follower, input/output gain | single-filter canvas, envelope follower control, gain-staging controls | exact display behaviors, compact layout rules, modulation depth and saturation interaction details |

## Cross-Suite Visual And Interaction Grammar

The official product pages consistently emphasize the same UI ideas:

- A large central interactive display is the hero on most products.
  Examples include the flagship EQ display, multiband display, compressor level and knee display, reverb decay/post EQ display, and the filter or delay displays in the routing and delay suites.
- Metering is treated as product-defining UI, not a side widget.
  The limiter, compressor, gate, vocal dynamics, and flagship EQ families all call out real-time visual feedback as a core workflow feature.
- Many products are panelized views on top of the same canvas language.
  The flagship family leans on analyzers, transfer curves, and band displays. The creative family leans on modulation panels, floating slot UIs, and per-module controls.
- Modulation is a reusable system, not a one-off per product.
  The saturation, delay, routing-filter, and synth-rack families all stress drag-and-drop modulation, LFO-like sources, envelope-based sources, MIDI sources, and floating or slotted modulation views.
- The suite also has a strong shared shell around the DSP-specific view.
  Preset browsing, MIDI Learn, undo/redo, A/B comparison, scalable interfaces, and help are repeatedly listed as common suite behaviors.

## The Reusable Component Families We Should Build

If we want to clone the suite without fracturing the monorepo, the shared library should be built around component families like these:

### 1. Product Shell

Used by almost every app:

- title, subtitle, and version/status area
- preset browser with search, tags, favorites, and A/B state
- global toolbar actions such as undo/redo, MIDI Learn, scaling/full screen
- compact vs expanded layout modes

### 2. Frequency And Curve Surfaces

Used by the flagship EQ, multiband, reverb, vocal dynamics, gate/expander, routing-filter, dual-filter, and compact-filter families:

- logarithmic frequency grid
- band or filter handles
- analyzer overlays
- transfer curves
- decay-rate and post-EQ curve overlays
- selectable scopes such as left/right, mid/side, or surround views

### 3. Metering Surfaces

Used heavily by the compressor, limiter, gate/expander, vocal dynamics, flagship EQ, and likely future mastering tools:

- peak meters
- gain reduction meters
- true-peak meters
- loudness meters
- side-chain input meters
- meter-history or scrolling level displays

### 4. Multiband Editors

Used by the multiband dynamics and saturation suites directly, and relevant for future band-splitting tools:

- create band, drag band, snap crossover
- per-band enable, solo, mute
- per-band inspector
- per-band meter overlays
- crossover slope and phase mode controls

### 5. Modulation System

Used by the saturation, delay, routing-filter, and synth-rack suites:

- drag-and-drop assignment model
- modulation matrix or slot list
- source editors for LFO, EG, envelope follower, XY, and MIDI
- live modulation visualization
- reusable target badges and amount arcs

### 6. Module Racks

Used by the synth-rack, delay, routing-filter, and likely any future synth/effects rack:

- oscillator modules
- filter modules
- effects modules
- arpeggiator or note tools
- per-module presets

### 7. Cross-Plugin Workflow Surfaces

Used at least by the flagship EQ and linked flagship products:

- instance list
- quick navigation between instances
- cross-instance comparison or targeting

## Manual-Backed Interaction Grammar

The manuals give us the first reliable pass at the suite's real interaction language. This is the part that should drive the shared component library.

### Shared Shell Behaviors

Repeated across much of the suite:

- preset browser plus `A/B`, undo/redo, help, and global scaling
- resizable and full-screen UI states
- bottom-bar global controls and pop-out output or analyzer panels
- lockable output or global-state panels on products that need persistent mastering state

### Shared Control Behavior

Repeated broadly, though not always with identical modifiers on every product:

- vertical knob drag
- mouse-wheel adjustment
- `Shift` for fine adjustment
- `Ctrl/Cmd` reset on many controls
- double-click or direct text entry for precise values
- click-and-hold variants for momentary actions such as solo, freeze, audition, or temporary mute

### Shared Graph And Canvas Editing Idioms

These recur often enough that they should be framework primitives instead of product-local code:

- drag a yellow curve or double-click empty space to create a band, filter, or tap
- `Alt`-click to bypass an item
- `Ctrl/Cmd+Alt` to change shape on curve and filter-style editors
- `Alt+Shift` to change slope on applicable filters and bands
- rectangle selection and modifier-based multi-selection
- attached parameter popovers or floating inspectors near the currently hovered or selected item
- optional piano overlays or note quantization on pitch-aware displays

### Shared Hover And Popup Patterns

The manuals repeatedly describe UI that appears only when needed:

- hover I/O trays on the simpler products
- sticky output popovers on newer flagship products
- floating band or slot editors near the selected target
- contextual analyzer settings and output options

### Shared Modulation System

The creative line is clearly built around one reusable interaction model:

- drag a source to a target
- dim the rest of the UI while showing valid targets
- create or reveal a slot popup next to the target
- let the popup handle depth, invert, bypass, remove, and source-target reassignment
- support alternate controller modes such as `XY` and `Slider`

## Manual-Backed Family Build Notes

### EQ And Graph Family

Members:

- flagship EQ
- reverb curve editor
- delay filter editor
- routing filter suite
- dual filter suite
- compact filter suite

What the manuals add:

- The suite reuses one strong graph-editing language across very different apps.
- The flagship EQ and reverb curve editor lean on band dots plus attached parameter popovers.
- The delay filter editor and routing filter suite reuse the same curve gestures inside different apps.
- The dual filter suite and compact filter suite are older, simpler members of the same family and keep the same underlying drag and modifier logic in a reduced shell.

Implementation implication:

- We should build one shared graph surface engine with pluggable node types, overlays, and modifier maps.
- Product variants should configure capabilities like note quantization, analyzer overlays, dynamic ranges, routing overlays, or piano displays instead of replacing the editor.

### Dynamics And Metering Family

Members:

- compressor
- limiter
- gate/expander
- vocal dynamics
- multiband dynamics

What the manuals add:

- These are not just plug-ins with meters. They each revolve around a specialized central display plus a right-side or integrated meter system.
- The compressor, gate/expander, and vocal dynamics apps all combine detector logic, side-chain editing, and visible response feedback.
- The limiter turns metering modes, loudness views, and an advanced slide-out panel into first-class workflow.
- Multiband dynamics bridges the dynamics and graph families through freely placed bands and floating band inspectors.

Implementation implication:

- We should treat detector meters, transfer/history displays, side-chain editors, and meter stacks as reusable surfaces.
- Multiband dynamics should be built after the simpler dynamics family because it combines the graph engine, dynamics controls, and multiband layout logic.

### Modulation Family

Members:

- saturation suite
- delay suite
- routing filter suite
- synth rack

What the manuals add:

- The modulation system is clearly a single family platform reused across four apps.
- All four describe source rails, target highlighting, floating slot panels, source-target reassignment, and drag-first assignment flows.
- The synth rack adds the richest synth-specific module stack, while the saturation suite adds multiband crossover editing, the delay suite adds delay and tap editing, and the routing filter suite adds filter routing.

Implementation implication:

- We should build the modulation system once as a framework subsystem, not as a plugin-specific overlay.
- The module or editor beneath it should vary by product, but the source rail, slot popup, target indicator, and drag-to-assign behavior should remain shared.

### Basic Line Family

Members:

- minimal synth
- dual filter suite
- compact filter suite

What the manuals add:

- The older basic products still share the same design DNA but use a lighter shell.
- Hover-revealed I/O trays, dimmed MIDI Learn modes, and simpler grouped panels dominate here.
- These are ideal validation targets for whether the shared system can express smaller skins of the same primitives.

Implementation implication:

- These should come late in the cloning order as reduced variants of already-built shells, filter editors, and control groups.
- If they need bespoke code, that is a sign the shared component model is still too narrow.

## Clone-Critical Gestures We Should Preserve

These interactions showed up often enough in the manuals that they should be treated as product requirements, not optional polish:

- typed value entry through double-click or direct numeric editing
- click-hold for temporary solo, mute, freeze, or audition states
- drag modifiers that change what a gesture edits without changing tools
- contextual popovers attached to the currently selected graph entity
- compact, normal, and full-screen variants for the same product
- linked or inverse-linked controls with `Alt` on certain mastering and utility controls
- note or frequency quantization layers in graph displays where the product supports them

## What The Manuals Still Do Not Fully Give Us

The manuals dramatically reduce uncertainty, but they do not eliminate it.

Still missing or only qualitatively described:

- exact pixel layout, spacing, and transition choreography
- animation timing, meter ballistics, and decay-label behavior
- internal heuristics such as sketching, spectrum-grab, or vocal-detection logic
- exact DSP transfer laws behind distortion styles, filter styles, and character modes
- some DAW-specific or cross-instance presentation details

That means the manuals are strong enough for architecture, interaction modeling, and component boundaries, but not yet enough for pixel-perfect or behavior-perfect clones on their own.

## What This Means For The Current Framework

The current generated schema is intentionally simple and flat:

- [`generated/apps/limiter-lab/ui_schema.json`](/Users/mlangens/dev/faust-web-au-kit/generated/apps/limiter-lab/ui_schema.json)
- [`generated/apps/pulse-pad/ui_schema.json`](/Users/mlangens/dev/faust-web-au-kit/generated/apps/pulse-pad/ui_schema.json)

That works for slider-and-meter proof-of-concept apps, but it is not enough for this suite. To avoid turning every new product into a custom snowflake, we should evolve the schema from:

```json
{
  "controls": [],
  "meters": []
}
```

toward something closer to:

```json
{
  "shell": {},
  "surfaces": [],
  "panels": [],
  "meters": [],
  "modules": [],
  "modulation": {},
  "instances": {}
}
```

The important change is not the exact field names. The important change is to let each app describe how shared primitives are assembled, instead of forcing the preview and native UI layers to infer everything from a flat control list.

## Suggested Monorepo Landing Zones

Based on the current repo layout, the cleanest next step is to introduce a shared top-level `ui/` layer instead of pushing reusable family logic into `apps/*` or hiding it inside `preview/`.

- Keep `apps/<app-key>/project.json` as the source of product identity and target metadata.
- Add a shared family manifest layer under `ui/`, for example:
  - `ui/families/northline-core/manifest.json`
- Let each app opt into that family and override only the product-specific parts, for example:

```json
{
  "ui": {
    "family": "northline-core",
    "variant": "limiter",
    "overrides": {}
  }
}
```

- Add browser-side reusable implementations under:
  - `preview/lib/components/`
  - `preview/lib/theme/`
- Add schema and inheritance tooling under:
  - `tools/lib/ui-family-tools.mjs`
- Add native reusable widgets under:
  - `src/ui/`

That gives us a single shared family definition consumed by both the web preview and native editor layers, while keeping `apps/*` focused on product DSP and overrides.

## Refactor Hotspots Before The Suite Grows

These files will start duplicating quickly if we clone products without first extracting shared surfaces:

- [`preview/app.js`](/Users/mlangens/dev/faust-web-au-kit/preview/app.js)
  It already hardcodes app-specific value formatting and per-product meter simulation branches.
- [`preview/styles.css`](/Users/mlangens/dev/faust-web-au-kit/preview/styles.css)
  It is still a single global theme instead of a shared token system plus product or family variants.
- [`tools/export-targets.mjs`](/Users/mlangens/dev/faust-web-au-kit/tools/export-targets.mjs)
  It currently reads app metadata directly; it should resolve family inheritance and compile a richer UI manifest.
- [`src/plugin_gui.m`](/Users/mlangens/dev/faust-web-au-kit/src/plugin_gui.m)
  The native editor still carries limiter-shaped assumptions and should be decomposed into manifest-selected widgets and surfaces.
- [`apps/limiter-lab/project.json`](/Users/mlangens/dev/faust-web-au-kit/apps/limiter-lab/project.json)
- [`apps/pulse-pad/project.json`](/Users/mlangens/dev/faust-web-au-kit/apps/pulse-pad/project.json)
  These should eventually hold product-specific overrides instead of repeating shared UI or benchmark defaults that belong in a family layer.

## Recommended Clone Order

To maximize reuse and keep shared component cohesion intact, the most leverage-heavy order looks like this:

1. Flagship EQ
   Builds the frequency canvas, analyzer overlay, band editing, and shared shell expectations.
2. Compressor, limiter, gate/expander, vocal dynamics
   Reuses the shell while building the dynamics and metering family.
3. Multiband dynamics
   Generalizes the canvas into true multiband editing.
4. Saturation suite
   Forces the multiband editor and modulation system to become first-class shared primitives.
5. Routing filter suite, delay suite, synth rack
   Reuses the modulation system while adding filter, delay, synth, and module-rack composition.
6. Reverb curve editor
   Adds the more unique reverb display and decay-shaping surface.
7. Minimal synth, dual filter suite, compact filter suite
   These should become simplified skins of the already-built synth and filter primitives, not fresh implementations.

## Information Gaps We Should Call Out Early

The official product pages are strong on product positioning, hero features, and recurring UI ideas. They are not strong enough for a faithful control-by-control clone on their own.

Before building each product in earnest, we will still want at least one of these from the source site:

- product manuals or online help for exact control lists and parameter behaviors
- official screenshots or press-kit images for panel arrangement and spacing
- tutorial videos for hidden states, flyouts, and interaction flow

Most important missing details across the catalog:

- exact panel layouts and resizing behavior
- control ranges and units for every secondary parameter
- how compact, large, and full-screen layouts differ
- modulation source editors and slot layouts
- per-band or per-module inspector structure
- preset browser detail, tagging, and component preset behaviors
- cross-instance workflows beyond the brief Instance List overview

## Bottom Line

The exercise is feasible, but only if we treat it as a shared-surface program, not a product-by-product copy sprint.

The current framework already has the right monorepo ownership boundaries. The next architectural milestone is a richer product composition schema that can describe interactive canvases, module racks, modulation systems, and workflow panels as reusable primitives shared by every app in the suite.

## Primary Reference Sources

- 14 official manuals from the source catalog
