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

## Other program features

The pedalboard is one tab of a larger app (`index.html` has Pedalboard / Tuner / Looper /
Information tabs). These don't get the same depth of research/testing rigor as the pedals —
they're simpler, self-contained features:

- **Tuner** (`js/tuner.js`): autocorrelation pitch detection with parabolic interpolation
  (no external library), run off a dedicated `AnalyserNode` fed from the pre-effects signal
  tap at ~30fps via `requestAnimationFrame`. `GUITAR_STRINGS` holds standard tuning + real
  string gauges (used only to scale the UI's string-thickness illustration, not for pitch
  math).
- **Looper** (`js/looper.js`): `MediaRecorder`-based recording of the guitar signal alone, or
  guitar + screen/tab audio together (via `getDisplayMedia`, opt-in per recording since the
  browser's share picker can't be triggered silently). Playback/looping/seeking is manual
  buffer management (`AudioBufferSourceNode` has no native seek — seeking just stops and
  restarts the source at a new offset). WAV export via `js/wav-encoder.js`.
- **Drum pads + beat presets** (`js/drum-kit.js`, `js/beat-presets.js`): fully synthesized —
  oscillators/filtered noise, no sample files (matches the project's offline/no-binary-assets
  rule). `DRUM_KITS` define each pad's sound as `tone` / `noise` / `layered` recipes;
  `BEAT_PRESETS` are 16-step (one bar of 4/4) patterns driven by a `PatternPlayer`. Lives in
  the Looper tab and gets captured into the same recording as the guitar.
- **Noise gate / Denoise** (`js/noise-gate-worklet.js`, `js/spectral-denoise-worklet.js`):
  two independent, user-toggleable input-cleanup AudioWorklets early in the signal chain,
  before the pedal chain. Both default OFF; see the Presets section below for why loading a
  saved state can't turn the gate back on.
- **YouTube embed + Signal Preview**: a play-along video panel and a small scope showing what
  a plain sine wave would look like after the current chain — practice/visual aids, not part
  of the audio engine.

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
- **Display scaling**: the entire UI lives in `#appStage`, a fixed 1920x1080 canvas scaled
  uniformly to fit the window (`--ui-scale`, set by the inline script in `index.html`;
  leftover window area is black). So never use `vw`/`vh`, `window.innerWidth` or `@media`
  breakpoints for layout; size in px against the 1920x1080 canvas. Any code that turns
  `getBoundingClientRect()` or pointer coordinates into layout px must divide by the stage
  scale (see `stageScale()`/`placeFloating()` in `ui.js`), and floating menus must be appended
  to `#appStage`, not `document.body`. `test-layout.html` renders the default board with no
  audio; screenshot it with `chrome --headless=new --window-size=W,H` to check any display size.
- **Browser testing**: whenever a new feature is implemented, deploy it locally and test it
  in Chrome via the `mcp__claude-in-chrome__*` tools. Assume Claude in Chrome is already
  connected; don't ask the user to set it up first. After testing, **leave the tab open**
  (don't close it), and on the next test **reuse the tab you opened earlier** (check
  `tabs_context_mcp`, then `navigate` it) instead of opening a new one.

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

## Presets system

Everything is handled in `js/presets.js`, wired up in `js/main.js`'s `restoreState()`.

- **Storage**: browser `localStorage` only — no server, no files on disk unless the user
  explicitly exports. Three separate keys:
  - `guitarfx.presets.v1` — array of named presets: `{ name, state, savedAt }`.
  - `guitarfx.autosave.v1` — a single slot holding the most recent state, written
    automatically (not a user action).
  - `guitarfx.ampLogos.v1` — custom amp-logo PNGs as data URLs, kept separate since they're
    far bigger than everything else combined; currently unused (the feature is archived —
    `AMP_LOGO_CUSTOMIZATION_ENABLED = false` in `ui.js` — but left fully intact).
- **What's actually stored** (`buildStateObject(engine)` builds this — plain JSON, no custom
  file format): input gain %, mute flag, master volume %, noise gate settings (enabled +
  threshold/hold/release), denoise settings (enabled + strength), tuner volume %, acoustic-sim
  enabled flag, and `chain` — every pedal/amp instance from `engine.getChainSnapshot()` as
  `{ instanceId, kind, typeId, enabled, params }`.
- **Saving**: the toolbar's Save button prompts for a name, then `savePreset(name, state)`
  reads the current list from `localStorage`, drops any existing preset with that same name,
  appends the new one, and writes the whole array back as one JSON string.
- **Autosave**: every change debounces 400ms into overwriting the single autosave slot. On
  page load, an existing autosave is restored automatically — no explicit save needed to
  survive a refresh.
- **Loading** (Browse button, autosave-on-load, or a demo preset — all three funnel into the
  same `restoreState(state)`): restores input/master/tuner volume and denoise/acoustic-sim
  settings, **always forces the noise gate OFF regardless of what the saved state says**
  (hard-coded, deliberate — see below), then `engine.clearChain()` and replays the chain by
  calling `engine.addToChain(inst.kind, inst.typeId, inst.params)` for each saved entry in
  order, disabling any that were saved bypassed.
- **Export/Import**: same JSON shape, just written to/read from an actual downloaded `.json`
  file instead of `localStorage` (`exportStateAsFile`/`importStateFromFile`).
- **Deliberate behavior, not a bug**: loading any preset/demo/autosave always leaves the noise
  gate OFF even if it was ON when saved — an explicit earlier user request ("I don't want it
  to open unless I switch it on no matter what, even when switching demo setups"), hard-coded
  in `restoreState`.

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

### Merging a feature branch back to master and retiring its preview

Once a branch's work is done and approved, to merge it into master, get it live at the site
root, and remove its separate `/branch-name/` preview:

1. **Merge the branch into master as usual** (`git merge` or a PR). Since the branch's own
   commits modified `.github/workflows/pages.yml` to add its preview checkout step, merging
   brings that modified workflow into master too — don't skip the next step or master's
   future deploys will keep pointlessly checking out the now-merged branch.
2. **Revert `pages.yml` on master back to the plain single-branch form** — remove the
   branch's name from the `on: push: branches: [...]` trigger list and delete its dedicated
   checkout step, so master goes back to just deploying itself to the site root.
3. **Push master.** This triggers a fresh deploy that rebuilds the site from master only —
   since the official Pages deploy action replaces the whole site every run, the old
   `/branch-name/` subfolder simply isn't included anymore and disappears from the live site
   once this deploy completes (no separate "delete" step needed for the site content itself).
4. **Remove the branch from the `github-pages` environment's deployment-branch allowlist** —
   repo Settings → Environments → github-pages → Deployment branches (or
   `gh api -X DELETE repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies/<policy-id>`,
   where `<policy-id>` comes from listing them via
   `gh api repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies`).
   Not strictly required for the site content to update, but leaves the permission grant from
   step 2 of the preview setup needlessly in place otherwise.
5. **Delete the branch itself**, local and remote: `git branch -d branch-name` and
   `git push origin --delete branch-name`.

## Other docs

- `PEDAL-RESEARCH.md` — full sourced circuit research per pedal.
- `DESIGN.md` / `PRODUCT.md` / `CREDITS.md` — existing project docs.
- `System-Architecture.pdf` — generated architecture overview.
