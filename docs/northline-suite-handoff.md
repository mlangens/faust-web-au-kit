# Northline Suite Handoff

## Snapshot

This repo now contains a full "Northline" suite scaffold built as a shared-family exercise inside the monorepo.

Completed foundation:

- Shared family manifest: `ui/families/northline-core/manifest.json`
- Shared suite catalog: `ui/catalog/northline-suite.json`
- Shared family resolution/runtime plumbing: `tools/lib/ui-family-tools.mjs`, `tools/lib/project-tools.mjs`, `tools/export-targets.mjs`
- Shared preview runtime: `preview/lib/*`
- Shared bulk suite install, uninstall, and package scripts: `scripts/install-suite-local.sh`, `scripts/uninstall-suite-local.sh`, `scripts/package-suite-installer.sh`
- Research baseline: `docs/northline-suite-research.md`

Completed app set:

- Flagship surfaces: `atlas-curve`, `press-deck`, `room-bloom`
- Dynamics lane: `headroom`, `latch-line`, `silk-guard`, `split-stack`
- Creative lane: `ember-drive`, `relay-tape`, `contour-forge`, `mirror-field`
- Reduced variants: `seed-tone`, `span-pair`, `pocket-cut`
- Existing framework examples kept aligned: `limiter-lab`, `pulse-pad`

Validation status at handoff:

- `npm test` passed on 2026-04-21
- That includes exports, unit tests, contract tests, integration tests, and Playwright preview coverage

## What Is Already Good

- The repo is no longer organized as one-off clones. The suite is routed through one reusable family layer.
- The preview understands multiple product families instead of a couple of hardcoded demos.
- Product naming and codebase language are scrubbed to the neutral "Northline" vocabulary.
- The visual direction is intentionally more generic and studio-neutral than the original inspiration set.
- Both the dynamics lane and the creative lane now have first-pass fidelity scaffolds instead of only placeholder manifests.

## Main Remaining Gaps

- Interaction fidelity is still shallower than feature breadth.
- DSP behavior is best-effort and musically plausible, but not deeply tuned.
- Graph-heavy products still need stronger editor primitives instead of slider-first approximations.
- Hidden views, alternate panels, monitor modes, and modulation-routing UX need a second pass.
- Meter ballistics, transient feel, and per-mode heuristics still need refinement.

## Recommended Next Sequence

1. Build the missing shared editor primitives before deepening more individual products.
   Focus on graph canvas, node popovers, multiband overlays, modulation slots, and richer meter widgets.

2. Run a flagship interaction-fidelity pass on `atlas-curve`.
   Goal: make it the proving ground for analyzer-led editing, band handles, contextual popovers, and reusable graph behavior.

3. Reuse that work across `press-deck`, `headroom`, `split-stack`, and `room-bloom`.
   Goal: extract shared metering, detector, audition, and macro-editor patterns instead of forking per app.

4. Run the creative interaction wave across `ember-drive`, `relay-tape`, `contour-forge`, and `mirror-field`.
   Goal: consolidate modulation language, route visualization, and animated feedback surfaces.

5. Leave `seed-tone`, `span-pair`, and `pocket-cut` for last.
   Goal: keep them as reduced siblings built from the richer shared primitives rather than bespoke mini-products.

## Parallelization Guidance

Parallel work is now appropriate, but only with a shared-core owner.

Keep one central track responsible for:

- `ui/families/northline-core/manifest.json`
- `preview/lib/*`
- `preview/styles.css`
- `tools/lib/ui-family-tools.mjs`
- shared schema conventions and test updates

Parallelize app-local work by family:

- Dynamics family: `press-deck`, `headroom`, `latch-line`, `silk-guard`, `split-stack`
- Space and EQ family: `atlas-curve`, `room-bloom`
- Creative and modulation family: `ember-drive`, `relay-tape`, `contour-forge`, `mirror-field`
- Reduced variants only after shared primitives stabilize: `seed-tone`, `span-pair`, `pocket-cut`

## Guardrails

- Keep the Northline visual language generic and neutral. Do not drift back toward direct brand mimicry.
- Keep feature inspiration stronger than pixel imitation.
- Do not reintroduce original vendor naming into code, docs, or exported metadata.
- Prefer extracting shared vocabulary immediately when two apps start to converge.

## Resume Commands

On the next machine:

1. `git pull origin main`
2. `npm install`
3. `npm test`
4. `npm run preview`

Useful preview routes:

- `http://localhost:4173/?app=atlas-curve`
- `http://localhost:4173/?app=press-deck`
- `http://localhost:4173/?app=room-bloom`
- `http://localhost:4173/?app=ember-drive`
- `http://localhost:4173/?app=split-stack`

## Suggested Immediate Next Task

Start with `atlas-curve` and extract a reusable graph-editor layer while keeping the control schema and preview shell shared. That is the highest-leverage next move for the suite.
