---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

## Direction contract

THESIS: This is a rack of real stompboxes bolted to a road-worn pedalboard, not a
grid of colored cards with knob icons — every prior UI in this app family (photoreal
skin, then a kraft-cardboard retail-box redesign) either over-rendered the hardware or
abandoned it for print/packaging metaphor; this direction refuses both by building the
literal object (diecast enclosure, footswitch, jack, screws) at flat/vector fidelity
rather than photoreal gloss or paper flatness.

OWN-WORLD: Board = matte near-black brushed-metal rail (`--board: #1c1d1f` family) with
a felt-strip texture band and visible cable-channel groove, exactly like a Pedaltrain
board photographed on hardwood. Each pedal is a rounded-corner diecast box
(`--radius: 6px`, per-pedal glossy powder-coat hue as `--pedal-color`) with: a subtle
top-to-bottom gloss gradient (paint sheen, not chrome-photoreal), 4 corner phillips-screw
glyphs, a brushed-steel or color-matched silkscreen ID plate with a bold condensed
poster wordmark (like BIG MUFF's block lettering) for the pedal name, black knurled
knobs (radial dark gradient + white pointer tick + printed tick-arc beneath, per the
Ibanez TS9 reference) in a single row, a large circular chrome-ring footswitch with a
jewel LED beside it, and a 1/4" jack nub on the side. Type: a condensed
grotesk/poster-block face for pedal wordmarks and section headers (e.g. Oswald/Anton
territory — self-hosted, no CDN), a plain system sans for body/help copy, monospace
tabular figures for knob values and the latency/tuner readout. Shadows are soft
directional drop-shadows under each pedal (object-on-a-surface, not flat-offset print
shadow). No kraft/paper/cardboard color anywhere; no barcode or rubber-stamp print
flourishes — those belong to the rejected direction.

STORY: A guitarist opens the page and immediately recognizes "this is my pedalboard" —
dark board, colorful stompboxes, cables implied between them, a footswitch to click per
pedal. They understand the chain order by left-to-right position on the board (matching
the redesign's drag-to-reorder, kept), see which pedals are engaged by a lit LED, and
trust the tool because it looks like the gear it emulates, not like a shopping app.

FIRST VIEWPORT: A dark tolex/brushed-metal topbar (app title in the poster-block face,
brass/amber accent for the primary "Enable Audio" footswitch-style button) sits above a
tab strip styled as amp-channel selector buttons. Below that, the board surface fills
the viewport: the empty-state board shows 2-3 demo stompboxes already racked (so the
hardware register reads instantly, not an empty dark rectangle), a felt-strip texture
running the board's length, and an "Add Pedal" affordance styled as a pedal-shaped empty
slot outline rather than a generic plus-tile.

FORM: Candidate 1 of my own 7-candidate ranked list ("the stompbox itself" — literal
diecast pedal hardware), built as a user/brief-pinned direction that overrides the
script's rolled assignment (index 4, a 19"-rack-mount studio-panel world); the assigned
candidate's discipline (precision metal, engraved/printed labels, jewel indicators) is
folded in as a raise on the board surface and ID-plate treatment rather than replacing
the pinned stompbox reading. Seed key: 038a91f9 (concept-seed --scope direction --mode
operate). No image generation is available in this environment, so this build is
code-led: no comp exists; ambition is carried in this contract's FIRST VIEWPORT and
signature interaction (Pointer-Events drag reorder with a tilted "lifted pedal" drag
state, inherited from the incumbent app) and audited at the finish review.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
