# Framework Architecture Self-Audit: Agentic Plugin Design

This audit evaluates the framework as a system for agentically designing plugin suites, not just as a packaging shell for hand-authored Faust files.

## Executive Finding

The framework already has several strong architectural seams:

- Project manifests define plugin identity, targets, Faust sources, and UI family selection.
- UI family manifests provide shared visual language, surfaces, interaction grammar, formatters, and layout variants.
- Generated schemas are the durable contract used by previews, Playwright checks, and native metadata.
- Suite catalogs preserve clone context through reference products, categories, variants, and feature anchors.

The missing abstraction was a reusable DSP primitive library. Without it, an agent can infer that a product is an EQ, compressor, or saturation tool only from prose and control labels. That invites slider-first designs and product-by-product drift. The new primitive layer makes the intended assemblage explicit: a product can now resolve to typed primitives such as `eq.parametric-band`, `compression.detector-ballistics`, or `saturation.antialiasing-strategy`, and those primitives carry control roles, surface roles, analysis probes, and design notes.

## Research Synthesis

### Equalization

EQ is not a set of independent frequency/gain/Q sliders. It is a topology of filter entities with perceptual mapping, coefficient stability, analyzer context, and direct manipulation. The W3C Audio EQ Cookbook documents the RBJ biquad coefficient family and highlights the practical need to account for digital frequency warping. Faust's `filters.lib` and filterbank libraries provide implementation-level primitives for these structures.

Framework implication: EQ products should model bands as semantic objects. Frequency, gain, Q, slope, bypass, dynamic range, and detector behavior should be owned by graph surfaces and band popovers before falling back to control docks.

### Compression

Dynamic range compression is nonlinear and time-dependent. The Giannoulis, Massberg, and Reiss compressor tutorial frames compressor design around level detection, static curve, smoothing, timing, and gain staging. Treating attack/release/threshold as isolated controls hides the actual system behavior.

Framework implication: dynamics products need explicit detector, sidechain, transfer-curve, gain-history, and meter primitives. Compression style should be represented as a topology or ballistics preset rather than a cosmetic mode label.

### Saturation

Saturation is not simply drive. Nonlinear processing introduces harmonic and aliasing behavior; more advanced character stages can require oversampling, antiderivative/continuous-time approaches, or virtual-analog circuit models. DAFx work on anti-aliased waveshaping and wave-digital-filter research both point toward making aliasing, topology, and stability explicit design dimensions.

Framework implication: saturation products should declare the nonlinear curve, anti-aliasing strategy, gain staging, tone context, and sonic probes. A multiband saturation product should compose crossover, per-band drive, modulation, and alias-budget primitives.

## Implemented Architecture Change

The new framework primitive library lives at:

`framework/primitives/audio-primitives.json`

It defines:

- Research-backed primitive families for equalization, compression, and saturation.
- Adjacent starter primitives for reverb, delay, and instrument voices so every suite product resolves at least one agent-readable assemblage.
- DMG-informed primitives for EQ model topology, true-peak limiting, split-band detector focus, channel utility, metering/analysis, and pitch-time feedback.
- Reusable primitive definitions with DSP intent, Faust library hints, control roles, surface roles, analysis probes, and agent design notes.
- Variant/category/product maps that resolve suite products into primitive assemblages.

The reference corpus lives at:

`framework/reference-corpus/plugin-references.json`

It treats Northline as a disposable sample suite and outside manuals as evidence for primitive extraction. Generated schemas now include reference-corpus evidence for each resolved primitive so agents can see which examples informed an assemblage without making any one suite the framework identity.

Export generation now embeds a resolved primitive architecture in every generated `ui_schema.json`:

```json
{
  "ui": {
    "primitiveIds": ["eq.parametric-band", "eq.dynamic-band"],
    "primitiveArchitecture": {
      "library": { "id": "fwak-audio-primitives" },
      "primitiveIds": ["eq.parametric-band", "eq.dynamic-band"],
      "primitives": {
        "eq.parametric-band": {
          "family": "equalization",
          "analysisProbes": ["log-sine magnitude response"]
        }
      }
    }
  }
}
```

## Sophistication Path For The Three Core Subjects

### EQ

- Baseline: stable parametric bands with log-frequency control, gain, Q, slope, and bypass.
- Intermediate: graph-owned band entities, analyzer overlays, typed band popovers, and linked control clusters.
- Advanced: dynamic/spectral bands with per-band detector probes, static-versus-dynamic curve separation, and magnitude/phase regression.
- Agentic requirement: every EQ-like product should resolve at least one EQ primitive and bind its primary roles to visual surfaces.

### Compression

- Baseline: threshold, ratio, knee, makeup, and feed-forward sidechain.
- Intermediate: detector filtering, attack/release/hold/lookahead, gain-reduction history, and transfer curve editing.
- Advanced: style presets as topology/ballistics configurations, multiband regions, loudness-aware staging, and tone-burst/step-response tests.
- Agentic requirement: every dynamics product should expose detector and transfer behavior as schema-level primitives, not merely as label conventions.

### Saturation

- Baseline: memoryless transfer curve with drive, bias, mix, trim, and level compensation.
- Intermediate: declared oversampling or anti-aliasing strategy, harmonic/intermodulation probes, and pre/post tone shaping.
- Advanced: multiband drive, modulation targets, virtual-analog stages, feedback stability guards, and CPU-versus-alias budget reporting.
- Agentic requirement: every saturation or analog-character claim should carry an analysis probe and an anti-aliasing/topology statement.

## Architectural Recommendations

- Keep primitives framework-level, not product-level. Products should assemble primitives rather than invent private language for the same EQ/compression/saturation concepts.
- Treat generated schemas as the agent API. Anything an agent needs to design, preview, stage, or test should be visible there.
- Make surfaces primitive-aware next. The current pass embeds primitive metadata; the next pass should let graph, transfer, region, and modulation surfaces read primitive roles directly.
- Extend the sonic staging harness to consume `analysisProbes`. This turns primitive declarations into automated audio tests instead of static descriptions.
- Move Faust snippets toward primitive modules over time. The current library is metadata-first; future work should add reusable Faust includes for crossover, detector, waveshaper, and band-handle control normalization patterns.

## Source Trail

- W3C Audio EQ Cookbook: https://www.w3.org/TR/audio-eq-cookbook/
- AES compressor tutorial by Giannoulis, Massberg, and Reiss: https://aes2.org/publications/elibrary-page/?id=16354
- DAFx anti-aliased waveshaping paper: https://www.dafx.de/paper-archive/2016/dafxpapers/20-DAFx-16_paper_41-PN.pdf
- Werner wave-digital-filter dissertation entry: https://searchworks.stanford.edu/view/11891203
- Faust filters library: https://faustlibraries.grame.fr/libs/filters/
- Faust compressors library: https://faustlibraries.grame.fr/libs/compressors/
- Faust wave-digital-models library: https://faustlibraries.grame.fr/libs/wdmodels/
