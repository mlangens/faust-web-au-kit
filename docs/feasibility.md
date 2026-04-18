# Feasibility Notes

## Short answer

Yes, this framework direction is feasible.

The strongest reason is Faust's separation between DSP and architecture: one DSP source can be exported to multiple backends while the runtime shell stays target-specific. That makes it realistic to treat Faust as the source of truth, use web tooling for manifest generation and UI preview, and still ship native plugin binaries with native UI runtimes.

## Why the architecture makes sense

1. Faust already supports multiple backend targets, which makes a target-agnostic framework realistic instead of hypothetical.
   Sources:
   [Faust options / backends](https://faustdoc.grame.fr/manual/options/)
   [Faust documentation portal](https://faustdoc.grame.fr/)

2. Apple still documents the Audio Unit v2 C API and Audio Unit component metadata path, so an AUv2 proof of concept remains practical for a thin native wrapper.
   Sources:
   [Audio Unit v2 C API](https://developer.apple.com/documentation/audiotoolbox/audio_unit_v2_c_api?language=objc)
   [Audio Unit Programming Guide (archived)](https://developer.apple.com/library/archive/documentation/MusicAudio/Conceptual/AudioUnitProgrammingGuide/Introduction/Introduction.html)

3. CPLUG is a good fit for the proof of concept because it is intentionally a thin C99 wrapper over plugin APIs rather than a full opinionated framework.
   Sources:
   [CPLUG README](https://github.com/Tremus/CPLUG/blob/master/README.md)
   [CPLUG source](https://github.com/Tremus/CPLUG)

4. VST3 and CLAP both have well-documented native plugin formats, which supports the long-term plan of keeping the framework adapter-based rather than AU-specific.
   Sources:
   [VST3 Technical Documentation](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical+Documentation/Index.html)
   [CLAP Developers: Getting Started](https://cleveraudio.org/developers-getting-started/)

## What this implies for framework design

- The framework should stay manifest-driven.
  The target adapter should consume generated control/schema metadata instead of baking limiter-specific UI assumptions into host code.

- Web UI belongs in the development loop, not the shipping runtime.
  Using web tech for a fast preview surface is a strength, but the production plugin UI should continue to compile to native toolkits per platform.

- AUv2 should be treated as a proof-of-concept target, not the permanent center of gravity.
  The adapter boundary should remain clean enough that AUv3, VST3, CLAP, or standalone shells can be added without moving DSP authoring out of Faust.

## Current repo stance

- Implemented now:
  Faust export pipeline, generated manifests, benchmark harness, native AUv2 adapter, native AppKit UI, web preview surface.

- Deliberately left open:
  VST3/CLAP packaging, synth/instrument target adapters, AUv3, Linux-native plugin bundles, and richer preview/runtime synchronization.
