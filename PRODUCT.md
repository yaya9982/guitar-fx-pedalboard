# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/vanilla JS on the native Web Audio API, no framework, no build step.
Directed by the user: reuse the existing DSP/audio-engine modules (audio engine, pedal
registry, amp registry, worklets, tuner, looper, presets, WAV encoder, IR synth) from the
sibling `guitar-fx-pedalboard` projects verbatim where sensible; only the UI layer
(markup, styling, and the UI-binding script) is rebuilt from scratch.

## Users

Home/bedroom electric guitarists who plug their guitar directly into their PC (via the
mic/line-in jack) to get live-processed effects, instead of buying physical pedals or
paid amp-simulation software (e.g. Neural DSP, Guitar Rig). Solo, personal use: casual
practice, tone experimentation, and light home recording — not a live-performance or
studio-production tool.

## Product Purpose

A fully free, 100% offline, browser-based electric guitar effects pedalboard built on
nothing but the native Web Audio API. Success means a guitarist can open the page, plug
in, and get usable, characterful live tones within seconds — no install, no account, no
payment, no cloud round-trip.

## Positioning

Zero-install, zero-cost, fully offline — runs entirely in the browser with no cloud
processing, no subscription, and no CDN or third-party service dependency. A neighboring
product (a paid plugin suite or a physical pedal) cannot truthfully match "free, instant,
and runs anywhere a browser does."

## Operating Context

Local desktop use only. The guitar is plugged into the PC's mic/line-in jack; the app
must be served from a local web server (mic access is blocked on `file://`). Typical
measured round-trip latency is 15–35ms through a mic input. Used for practice, tone
experimentation, and casual recording via the built-in looper/WAV export.

## Capabilities and Constraints

- 23 pedals across 8 categories (Dynamics, Drive, Filter/Wah, Modulation, Pitch,
  Time-Based, EQ), each with per-pedal color, hover blurb, and an info popover.
- Amp library: Clean/Crunch/Lead standard amps plus 4 "Signature" band-tribute amps
  (AC/DC, Led Zeppelin, Oasis, Dire Straits).
- Acoustic-guitar-simulation toggle, built-in tuner (reads pre-effects signal), looper
  with WAV export, preset save/load/autosave/export/import.
- Drag-to-reorder pedal chain via a dedicated grip handle (Pointer Events, not native
  HTML5 drag-and-drop — native DnD proved unreliable and must not be reintroduced).
- Adaptive spectral-subtraction "Denoise" (off by default, adds ~16–17ms latency), noise
  gate, input trim/mute, master volume, live latency readout.
- Constraint (hard): 100% offline — no cloud APIs, no paid services, no CDN script/font
  dependencies, no third-party binaries.
- Constraint: no comments in code unless the *why* is genuinely non-obvious.

## Brand Commitments

- Name: "Guitar FX Pedalboard." Existing tagline: "local · offline · free."
- Honesty requirement (binding): signature amps are documented as DSP tuned to *evoke*
  a band's tonal character, never marketed as licensed or official emulations. "Denoise"
  is documented as DSP (spectral subtraction), never marketed as "AI."

## Evidence on Hand

None — no real customer testimonials, benchmarks, press, or case studies exist. Future
work must not fabricate any of these. Real guitar pedal product photography was gathered
purely as visual/material reference for this build (hardware proportions, paint finish,
knob/footswitch/LED conventions) — not as licensed assets, brand claims, or product
endorsements.

## Product Principles

1. Never claim more than the DSP actually does — no invented "AI" or "licensed
   emulation" language, ever.
2. Zero friction: open the page and play — no installs, accounts, or payments at any
   point in the experience.
3. Real-hardware fidelity in interaction and proportion (matching actual pedal/amp
   panel conventions) is what makes the tool feel credible to a guitarist. This build
   restores that fidelity after a prior "print/retail-box" redesign was rejected for
   reading as stationery rather than music gear.
4. The offline/browser-native constraint is load-bearing, not incidental — never trade
   it away for a visual or feature goal.
5. Prefer pragmatic, testable technical choices over trendier ones (e.g. Pointer Events
   over native drag-and-drop, spectral-subtraction denoise over an ML model).
