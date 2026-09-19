---
name: Guitar FX Pedalboard
description: A rack of real diecast stompboxes racked onto a felt-lined pedalboard rail — literal hardware, not an icon set.
colors:
  bg: "oklch(14% 0.01 260)"
  mat: "oklch(11% 0.01 260)"
  panel: "oklch(22% 0.012 260)"
  panel-2: "oklch(27% 0.012 260)"
  border: "oklch(33% 0.012 260)"
  text: "oklch(94% 0.005 260)"
  text-dim: "oklch(68% 0.01 260)"
  board: "oklch(19% 0.012 260)"
  board-dark: "oklch(13% 0.01 260)"
  felt: "oklch(9% 0.008 260)"
  brass: "oklch(75% 0.11 85)"
  chrome-hi: "#e6e8eb"
  chrome-lo: "#6b6f76"
  ok: "oklch(72% 0.17 145)"
  danger: "oklch(60% 0.19 25)"
  text-warm: "oklch(98% 0.01 90)"
  text-warm-dim: "oklch(94% 0.01 90)"
  enable-accent: "oklch(80% 0.15 145)"
  enable-accent-dark: "oklch(62% 0.14 150)"
  demo-accent: "oklch(80% 0.14 330)"
  demo-accent-dark: "oklch(64% 0.14 330)"
  test-accent: "oklch(80% 0.10 195)"
  test-accent-dark: "oklch(64% 0.10 195)"
  amp-clean: "oklch(85% 0.02 90)"
  amp-crunch: "oklch(45% 0.08 75)"
  amp-lead: "oklch(50% 0.20 25)"
  acdc-body: "#874b4b"
  acdc-panel: "#fd5714"
  acdc-trim: "#e7e3c0"
  ledzeppelin-body: "#a7a195"
  ledzeppelin-panel: "#030207"
  ledzeppelin-trim: "#fdf7e7"
  oasis-body: "#dec182"
  oasis-panel: "#3e7474"
  oasis-trim: "#a3b49a"
  direstraits-body: "#3e6390"
  direstraits-panel: "#9d2a2f"
  direstraits-trim: "#dbdee6"
typography:
  display:
    fontFamily: "Anton, Arial Narrow, sans-serif"
    fontSize: "13px–22px, contextual"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.3px–0.6px, uppercase"
  body:
    fontFamily: "Segoe UI, -apple-system, Roboto, Arial, sans-serif"
    fontSize: "12px–13.5px"
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, SF Mono, Consolas, monospace"
    fontSize: "11px–14px"
    fontWeight: "400–700"
    letterSpacing: "0.3px–1.4px, usually uppercase for labels"
rounded:
  hairline: "1px"
  xs: "2px"
  sm: "3px"
  ms: "4px"
  md: "6px"
  lg: "7px"
  xl: "8px"
  2xl: "9px"
  3xl: "10px"
  4xl: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "22px"
  xl: "34px"
components:
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "oklch(18% 0.04 85)"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "10px 15px"
  button-enable:
    backgroundColor: "oklch(80% 0.15 145)"
    textColor: "oklch(16% 0.03 150)"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card-pedal:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "10px 12px 14px"
  panel-surface:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "14px"
---

# Design System: Guitar FX Pedalboard

## Overview

**Creative North Star: "The Rack, Not the Icon Set"**

The app is a real pedalboard: diecast stompbox enclosures with phillips screws, a
silkscreen ID plate, knurled pots, a chrome footswitch with a jewel LED, and a side
jack — racked onto a felt-lined pedalboard rail under a dark rack-strip topbar. This is
the second visual identity this app has shipped. The first was a photoreal-skeuomorphic
stompbox skin; a second attempt replaced it with a kraft-cardboard "retail box art"
register (barcode corners, rubber-stamp marks, print-shop typography) that the user
rejected outright for reading as stationery, not music gear. This build is a from-scratch
rebuild grounded in reference photography of real Boss/Ibanez/Electro-Harmonix pedals and
a Pedaltrain board, refusing both the earlier chrome-photoreal extreme and the paper-flat
retreat: every fill is CSS gradient/conic-gradient standing in for real material (paint
sheen, brushed steel, knurled plastic), never a flat icon-style swatch.

**Key Characteristics:**
- Literal diecast pedal enclosures — 4 corner phillips screws, a side-mounted jack barrel,
  a silkscreen ID plate — per pedal/amp category, tinted by a single `--pedal-color`.
- Knurled black-plastic knobs with a printed tick-mark reference arc underneath, matching
  real stompbox pots (e.g. Ibanez TS9).
- A chrome-ribbed footswitch with a jewel LED that only glows when the pedal is engaged —
  a light-emission effect, not a decorative glow.
- A felt-and-cable-groove pedalboard rail (`.board-surface` / `.pedal-chain`) standing in
  for a real Pedaltrain board, not a generic dark card grid.
- Amps render as a distinct brushed-aluminum rack finish rather than painted stompbox
  plastic, since real amp heads are a different material register than pedals.
- Anton (self-hosted condensed poster-grotesk) for every pedal wordmark and headline;
  plain system sans for body copy; monospace for anything read as a live measurement
  (knob values, latency, tuner readout, rack-label tags).

## Colors

A dark workshop palette: near-black rack/board surfaces, one warm brass accent for
calls-to-action and active/lit states, and per-category pedal paint colors supplied
dynamically by the pedal registry (never a fixed palette — see the Named Rule below).

### Primary
- **Brass** (`oklch(75% 0.11 85)`): active-tab underline + LED, focus-visible outline,
  the Add Pedal button, and near-brass tonal variants used for the Add-Pedal-menu
  category headings — the system's one warm, attention-holding hue, reading as an
  amp's brass/gold pilot lamp.

### Secondary (accent buttons)
- **Enable-accent** (`oklch(80% 0.15 145)` → `oklch(62% 0.14 150)`): the "Click to
  Enable Audio" button — green reads as "go/ready," like a powered-on pilot light.
- **Demo-accent** (`oklch(80% 0.14 330)` → `oklch(64% 0.14 330)`): the "Demo Setups"
  button — a distinct violet so it never competes visually with Enable or Add Pedal.
- **Test-accent** (`oklch(80% 0.10 195)` → `oklch(64% 0.10 195)`): the "Play Test
  Chords" button — a cool teal, the calmest of the three action accents.
  All three gradients keep their darkest stop at ≥62% lightness so the paired
  near-black text clears 4.5:1 contrast across the whole gradient, not just its
  lightest pixel.

### Neutral
- **Text-warm / Text-warm-dim** (`oklch(98% 0.01 90)` / `oklch(94% 0.01 90)`): the
  off-white used for pedal wordmarks, the topbar H1, and stompbox body text; the dim
  variant is reserved for amp-card labels against the brushed-aluminum finish.

### Signature amp palettes
Each of the four signature amps carries a three-tone palette (`body` / `panel` / `trim`)
numerically extracted (dominant-color quantization, plain hex values only — never the
artwork itself) from that band's real album cover, so the four signature amps read as
genuinely distinct hardware rather than sharing one brushed-aluminum skin:
- **AC/DC**: body `#874b4b` (dusty rose-brick, from *Highway to Hell*), panel `#fd5714`
  (vivid orange, extracted from a reference the user pointed to as "the AC/DC orange" —
  numeric value only), trim `#e7e3c0` (warm cream).
- **Led Zeppelin** (from the band's own reference image): body `#a7a195` (warm gray),
  panel `#030207` (near-black), trim `#fdf7e7` (warm parchment).
- **Oasis** (from *Definitely Maybe*): body `#dec182` (warm gold), panel `#3e7474`
  (teal), trim `#a3b49a` (sage).
- **Dire Straits** (from the album's newer cover art): body `#3e6390` (steel blue),
  panel `#9d2a2f` (brick red), trim `#dbdee6` (pale blue-gray).

`body` drives the enclosure paint gradient (`--pedal-color`), `panel` tints the recessed
control-panel strip behind the knobs (`--pedal-accent`), and `trim` sets the piping
outline and label color (`--pedal-trim`) — see Components → Signature-amp construction.

### Named Rules
**The Extracted-Not-Reproduced Rule.** Real-world reference material (album covers,
product photography) may only ever contribute numeric color values pulled out by
quantization; the source image, logo, or artwork itself is never placed in the app.
- **Bg / Mat** (`oklch(14% 0.01 260)` / `oklch(11% 0.01 260)`): the app's dark workshop
  ground, with a faint diagonal grain texture as ambient chrome.
- **Panel / Panel-2** (`oklch(22% 0.012 260)` / `oklch(27% 0.012 260)`): rack-strip UI
  chrome — toolbar, menus, popovers, tuner/looper/presets boxes.
- **Board / Board-dark** (`oklch(19% 0.012 260)` / `oklch(13% 0.01 260)`): the pedalboard
  rail's own metal frame, one step lighter than the felt bed it holds.
- **Felt** (`oklch(9% 0.008 260)`): the recessed felt/carpet bed the stompboxes sit on.
- **Text / Text-dim** (`oklch(94% 0.005 260)` / `oklch(68% 0.01 260)`): primary and
  secondary text on dark chrome surfaces.
- **Chrome-hi / Chrome-lo** (`#e6e8eb` / `#6b6f76`): the metal ramp used in screws,
  the jack barrel, and the footswitch's brushed-ribbed face.
- **Ok / Danger** (`oklch(72% 0.17 145)` / `oklch(60% 0.19 25)`): success/on-state
  (level meter, in-tune indicator) and destructive/record-state accents.
- **Wood-hi / Wood-mid / Wood-lo** (`oklch(34% 0.045 55)` / `oklch(24% 0.04 50)` /
  `oklch(18% 0.035 48)`) and **Bone-hi / Bone-lo** (`oklch(90% 0.02 90)` /
  `oklch(78% 0.02 85)`) and **Fretboard-hi / Fretboard-lo** (`oklch(15% 0.03 50)` /
  `oklch(10% 0.025 45)`): quantized from a real 6-in-line headstock reference photo, scoped
  only to the tuner panel's headstock/nut/fretboard illustration — not used elsewhere.

### Named Rules
**The One-Color-Per-Category Rule.** Each pedal/amp type owns exactly one flat paint
color (`--pedal-color`, sourced from the pedal/amp registry, not a fixed design token),
applied to its enclosure gradient, knob-pointer accent, and footswitch LED consistently.
No hex is canonical across categories — treat "one saturated paint color per pedal type"
as the rule, not any specific value.

**The Metal-Stays-Metal Rule.** Screws, the jack barrel, and the footswitch face are
always rendered in the chrome ramp regardless of the enclosure's paint color — real
stompbox hardware is metal fastened to painted plastic/metal, never body-color plastic.

## Typography

**Display Font:** Anton (self-hosted, with Arial Narrow, sans-serif fallback)
**Body Font:** Segoe UI / system sans (with Roboto, Arial fallback)
**Label/Mono Font:** ui-monospace (with Cascadia Mono, SF Mono, Consolas fallback)

**Character:** A condensed all-caps poster-grotesk for anything that behaves like a
silkscreened pedal wordmark or section headline, a plain system sans for readable prose,
and monospace for anything that is a live reading — knob values, latency, tuner cents/Hz,
rack-label tags. The pairing avoids any serif or humanist face entirely: this is print-on-
metal type, not editorial type.

### Hierarchy
- **Display** (400, 13–22px, line-height 1.05, uppercase, 0.3–0.6px tracking): pedal/amp
  wordmarks, topbar H1, Add-Pedal/Demo/Enable button labels, Setup section headings.
- **Body** (400, 12–13.5px, line-height 1.55): Setup/Help prose — the only place the
  plain system sans carries meaningful reading text.
- **Label/Mono** (400–700, 11–14px, uppercase for labels, tabular-nums for numerals):
  toolbar control labels, knob value readouts, latency/tuner readouts, rack-label tags.

### Named Rules
**The Data-Is-Mono Rule.** Any numeral read as a live measurement (knob values, latency,
tuner cents/Hz) renders in monospace with tabular figures; Anton never carries a numeral.

**The 11px Floor Rule.** No functional label drops below 11px, even in the densest
toolbar control strip — legibility is never traded for control density.

## Layout

A single-column flow: a dark rack-strip topbar, an amp-channel tab strip, then one
active panel. The Pedalboard panel is primary: a bordered utility toolbar (rack-strip
chrome) above a `.board-surface` frame holding the felt-lined `.pedal-chain` rail, where
racked pedal enclosures sit in a wrapping flex row, bottom-aligned so every footswitch
sits on one common baseline, matching a real board's flat mounting surface. Add-Pedal and
Demo menus are absolutely-positioned popovers anchored to their trigger, not modals.

Spacing runs on a five-step scale (4/8/14/22/34px) for toolbar gaps, card padding, and
section margins. At the 720px breakpoint the topbar stacks vertically and pedal cards
switch to `width: 100%, max-width: 220px`.

## Elevation & Depth

Physical-object elevation, not card-float decoration: every stompbox casts a soft,
directionally-offset shadow as if lifted slightly off the dark felt bed under one
overhead light, and the toolbar/board frame cast a matching hard-edged rack-mount
shadow. The one deliberate exception is the jewel LED glow (enable pilot light, active
tab indicator, engaged-pedal footswitch LED) — a light-emission effect standing in for
a physically lit indicator bulb, not an ambient decorative halo.

### Shadow Vocabulary
- **Stompbox rest** (`0 20px 30px -14px rgba(0,0,0,0.75), 0 6px 12px -4px rgba(0,0,0,0.55)`
  plus inset bevel highlights): default pedal-enclosure elevation off the felt bed.
- **Stompbox dragging** (`0 30px 48px -14px rgba(0,0,0,0.8), 0 12px 20px -4px rgba(0,0,0,0.6)`,
  with `scale(1.05) rotate(-1.2deg)`): the lifted, actively-dragged card.
- **Rack panel** (`0 10px 18px -8px rgba(0,0,0,0.6)` with a 2px metal-edge border):
  Add-Pedal menu, Demo menu, and info popovers — a harder, tighter shadow than a typical
  floating card, paired with a heavier border so the edge itself reads as machined metal.
- **Board frame** (`0 18px 34px -18px rgba(0,0,0,0.8)`): the pedalboard rail sitting on
  the page.

### Named Rules
**The Lit-Not-Glowing Rule.** The only colored, blurred glow in the system is a genuine
LED indicator (pilot light, active tab, engaged footswitch); no other element ever
borrows that treatment as decoration.

## Shapes

Corners are moderate and hardware-plausible: pedal enclosures round to 9px (a diecast
box's real edge radius), rack panels/menus to 7–8px, small controls to 3–4px, and the
finest hardware details (screw heads, LED bezels, slider thumbs, hairline dividers) use
the 1–2px steps at the bottom of the scale — a control-panel this dense needs a finer
radius ladder than a typical app card grid, run the full 1/2/3/4/6/7/8/9/10/18px scale
plus one pill (999px) step for the rocker-style mini-toggle, never introduce a radius
outside it. The pedal-stompbox enclosure itself is the one deliberate exception to
uniform corners: it mixes four different radii (7/18/9/4px) into one asymmetric
silhouette, reading as a small hand-built/boutique enclosure rather than a stamped,
identical diecast box — see Components → Stompbox card. Screws are
true phillips crosses (two intersecting slot lines over a metal disc) at all four
enclosure corners, never a bare dot. Borders read as a machined seam: 1.5–2px on
enclosures, panels, and the board frame — heavier than a typical hairline card border,
paired with a tighter shadow rather than an ambient blur (the "commit to one" resolution
of the thin-border/wide-shadow default).

## Components

### Buttons
- **Shape:** 7px radius, Anton uppercase label.
- **Primary accent** (Add Pedal): brass fill, dark warm text, flat-offset press feel.
- **Enable/Demo/Test:** each carries its own hue (green/violet/teal) at a light-enough
  gradient range that dark text stays ≥4.5:1 across the whole gradient, not just its
  lightest stop.
- **Hover/Focus:** hover lifts filled buttons 1px; `:focus-visible` always gets a 2px
  brass outline, never a browser default ring.

### Stompbox card (signature component)
- **Structure:** grip strip (drag handle) → silkscreen ID plate (wordmark + info/remove)
  → knob row (knurled pots with tick-arc) → footswitch + jewel LED. A racked card never
  omits any of these four bands.
- **Silhouette:** an asymmetric 7/18/9/4px corner mix (top-left/top-right/bottom-right/
  bottom-left), never a uniform single radius — the hand-built-enclosure signature.
- **Screws:** 4 phillips-cross metal screws at each corner, always metal regardless of
  enclosure paint color.
- **Jack:** a chrome barrel nub on the right edge, purely referential (not functional).
- **Primary knob:** the first control in the knob row renders at 1.22x scale — every
  pedal has one dominant "character" control (Drive, Rate, Time...), and sizing it up
  breaks the equal-knob grid the way boutique pedal faces do.
- **Category motif:** a faint (14% opacity) original line-art watermark sits behind the
  knob row, one abstract mark per pedal category — a spring for Dynamics, jagged peaks
  for Drive, radiating arcs for Filter/Wah, a sine wave for Modulation, chevrons for
  Pitch, receding rings for Time-Based, bar-graph ticks for EQ. Every mark is drawn from
  scratch for this system; none references any other pedal brand's actual artwork.
- **Amp variant:** brushed-aluminum finish instead of painted-plastic gradient, marking
  amps as a different hardware class from stompboxes.
- **Signature-amp construction:** the four signature amps add a real head-amp build on
  top of the amp variant — a `body`-toned tolex gradient, a recessed `panel`-toned
  control-panel strip behind the knob row (`inset` shadow, darker fill), and a `trim`-
  toned 2px piping outline plus label color. See Colors → Signature amp palettes for
  the four bands' extracted three-tone values and their source album covers.

### Knob (signature component)
A knurled black-plastic dial (34px, radial + repeating-conic knurl texture) with a white
pointer line, ringed by a printed tick-mark reference arc (a masked conic-gradient) —
the technical-reference-marks detail lifted directly from real stompbox pots.

### Inputs / Fields
- **Range sliders:** custom-drawn 4px track, 20px round metal-ball thumb, 40px invisible
  hit target for grab accuracy.
- **Toggles (mini-toggle):** pill-shaped track (this is the one pill form in the system,
  inherited from real amp-panel rocker-switch conventions), ok-green fill when checked.

### Navigation
- **Tabs:** dark channel-select strip, Anton uppercase labels, a small LED dot per tab
  that lights brass when active — no background pill or fill change otherwise.

## Do's and Don'ts

### Do:
- **Do** keep every enclosure gradient standing in for real paint sheen (a top highlight
  + mid + shadowed base), never a flat single-color fill.
- **Do** render screws, the jack, and the footswitch face in the metal ramp regardless of
  `--pedal-color`.
- **Do** keep the jewel-LED glow as the system's only decorative blur; everything else
  uses offset+blur elevation shadows, never a zero-offset colored halo.
- **Do** keep functional text at 11px or larger, even in dense toolbar control strips.
- **Do** pair any 1.5–2px "machined" border with a tightened shadow (≤20px blur), never
  a hairline border with a large diffuse blur.

### Don't:
- **Don't** reintroduce kraft/paper/cardboard color, barcode corners, or rubber-stamp
  print flourishes anywhere — that is the explicitly rejected prior identity.
- **Don't** flatten a pedal enclosure to a single solid fill "icon" swatch; the gradient
  sheen is load-bearing for the hardware read.
- **Don't** use a colored `border-left` strip as a category-color legend (use a small
  swatch dot instead — the side-tab border is a recognizable generated-UI tell).
- **Don't** add a second pill-shaped control beyond the mini-toggle; every other control
  (buttons, tiles, footswitch) stays circular or near-square, matching real hardware.
