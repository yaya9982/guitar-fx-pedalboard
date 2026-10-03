# guitar-fx-pedalboard

Local/offline/free Web Audio guitar pedal + amp simulator. No build step, no npm, no
bundler — plain ES modules and the Web Audio API.

## Running it

Serve the directory, don't open `index.html` as `file://` — AudioWorklet modules require it:

```
python -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000/`.

## File map

- `js/pedal-registry.js` / `js/amp-registry.js` — effect definitions. Each entry is a plain
  object with `createNodes(ctx)` (builds the Web Audio graph) and `params[]` (knobs, each with
  an `apply(nodes, value)` callback).
- `js/audio-engine.js` — signal graph / chain management.
- `js/ui.js` — rendering (`renderChain`, `renderAmp`, `buildParamRow`).
- `js/main.js` — DOM wiring, event handlers.
- `js/*-worklet.js` — AudioWorkletProcessors. Some files register a processor under a
  different name than the filename suggests (e.g. `noise-gate-worklet.js` also registers
  `envelope-follower-processor`) — grep for `registerProcessor` before assuming.
- `style.css` — one stylesheet; per-pedal look is driven by CSS custom properties
  (`--pedal-color` / `--pedal-accent` / `--pedal-trim`) set from each pedal's definition, not
  separate stylesheets or per-pedal markup.
- `test-*.html` — DSP test harnesses (`OfflineAudioContext`-based). Not a JS test runner —
  open the file via a local server + browser and read the PASS/FAIL text it renders.
- `../sources/photos/pedals/{id}.jpg` — real product photos used as visual reference for
  pedals modeled on specific real hardware. **Lives one directory above this project root
  (`claude_code_project/sources/...`), not inside it — this repo's own git only covers
  `guitar-fx-pedalboard/`, so these images are NOT version-controlled and won't exist in a
  fresh clone.** If you need them tracked, move `sources/` into this repo and commit it.

## Conventions

- **Real-pedal-accuracy work**: the established convention (not a hard rule — use judgment)
  is to add a new pedal id alongside the untouched original, reusing the generic knob/UI
  system, rather than modifying the original's behavior in place.
- **Brand logos/wordmarks**: hand-built CSS/SVG approximating a brand's font, shape, and
  character is fine (see the `brand`/`brandLabel` fields and the `.pedal-brand` element).
  Never copy an actual logo file or trace its exact vector path.
- **Research rigor**: see the Research methodology section below and `PEDAL-RESEARCH.md`.
  Cite sources, verify via direct fetch where possible, explicitly flag unverified claims
  rather than guessing or fabricating.
- **Impeccable design-hook**: per-pedal unique `oklch` colors are expected/established, not
  drift — but verify an unfamiliar flagged value before dismissing it as a false positive.

## Pedal/amp visual design system

- Every pedal/amp renders from one shared HTML template (`.pedal-stompbox` for pedals,
  `.amp-unit` for amps), skinned per-type via CSS custom properties set from its definition:
  `color` → body tint, `accent`/`trim` → knob-cap/label tone. No separate markup per pedal.
- 3 real-enclosure shape modifiers exist as CSS classes, opted into via a `shape` field on a
  pedal definition: `round` (Fuzz Face), `wedge` (Cry Baby), `lowbox` (Klon). Everything else
  uses the default box shape.
- Amps use the same CSS-variable mechanism on their own bigger template — tolex body,
  control panel strip, cloth grille, chrome brand plate.
- Pull exact colors/shapes from `../sources/photos/pedals/{id}.jpg` (one directory above this
  project — see the File map note above) — don't guess them. Not there for a new pedal yet?
  Download a reference photo first (see Reference images below).

## Core DSP math

Almost every drive/fuzz pedal is built from one shared function in `pedal-registry.js`:

```js
driveCurve(k, bias) // curve(x) = tanh(k·(x+bias)) − tanh(k·bias)
```

`k` = drive amount (grows with the knob), `bias` = asymmetry/DC offset.

**Known failure mode — already fixed once, don't reintroduce it**: if `bias` is a *fixed*
constant while `k` grows large, `tanh(k·bias)` saturates toward the same ceiling as the rest
of the curve, canceling almost the entire positive half of the waveform (this made two pedals
go nearly silent at their own default knob position). Fix pattern: scale `bias` as
`constant / k` so `k·bias` stays fixed regardless of knob position.

A second curve family, `driveCurveAsinh(k, bias)`, exists for pedals confirmed to have a
gentler asinh-type clipping shoulder (e.g. TS9/SD-1) rather than tanh's harder knee — it's
peak-normalized since raw asinh output isn't bounded to ±1 the way tanh is.

`PEDAL-RESEARCH.md` has the full sourced circuit research per pedal; this section is just the
reusable implementation math.

## Research & testing methodology for real-pedal-inspired work

When building something modeled on a real pedal, dispatch a research agent for that pedal.
What it should do:

1. **Ground every claim in named primary sources** — circuit-teardown sites (e.g.
   Electrosmash), academic virtual-analog-modeling papers (DAFx conference papers),
   manufacturer spec pages — not generic search snippets.
2. **Fetch and quote actual page text directly**, not snippet guesses. If a source's main
   domain is unreachable, find a working mirror and re-verify through that instead of giving
   up on the source.
3. **Self-audit adversarially before reporting** — re-check its own draft for fabricated
   details, backwards claims, or anything attributed to the article that's actually from a
   reader comment or an unrelated page.
4. **Try different search angles for anything still unresolved** — patents, service manuals,
   less-common technical archives — before marking something a genuine boundary.
5. **Treat user-supplied material as a primary source** — if the user provides an article,
   schematic, or image directly, read that instead of re-researching it.
6. **Tag every claim honestly**: sourced / self-calculated-from-a-cited-value / explicitly
   unverified. Call out genuine boundaries (manufacturer secrecy, hardware variance, no public
   teardown exists) separately from gaps that just need a different search angle.

**Post-implementation verification**: once the DSP is built, a separate agent independently
writes test cases against the actual code and checks it matches the research claims — this is
what catches real implementation bugs, not just research gaps.

**Reference images**: a separate agent can search + download real product photos
(manufacturer sites, Wikipedia/Wikimedia Commons preferred) into `../sources/photos/pedals/`
(one directory above this project — create it if it doesn't exist yet) for visual-matching
work.

**Testing**: every DSP claim gets a runnable check in a `test-*.html` harness — render a known
signal (sweep/tone/step/noise) through the pedal via `OfflineAudioContext`, measure
transfer-curve/harmonic/timing/frequency-response, compare against the cited real number.
Compare, don't eyeball.

## Deployment

GitHub Pages via `.github/workflows/pages.yml`, deploys `master` to the site root.

For a branch preview at `/branch-name/`:
1. Add the branch to the workflow's trigger list and add a checkout step for it into
   `site/branch-name/` (alongside the existing master checkout into `site/`).
2. **Also** add the branch to the `github-pages` environment's deployment-branch allowlist —
   repo Settings → Environments → github-pages → Deployment branches, or via
   `gh api repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies -f name='branch-name' -f type='branch'`.
   Skipping this step fails with "branch not allowed to deploy to github-pages due to
   environment protection rules" even though the build step succeeds.

Note: a branch-preview subfolder only persists across deploys if its checkout step is
unconditional (not gated on which ref triggered the run) — otherwise the next push to
master rebuilds the site from scratch without it, since the official Pages deploy action
replaces the whole site on every run rather than updating incrementally.

## Other docs

- `PEDAL-RESEARCH.md` — full sourced circuit research per pedal.
- `DESIGN.md` / `PRODUCT.md` / `CREDITS.md` — existing project docs.
- `System-Architecture.pdf` — generated architecture overview.
