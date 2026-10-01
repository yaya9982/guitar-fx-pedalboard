# Real-Pedal Circuit Research & Emulation Plan

Research-backed plan to make this app's pedal DSP more faithful to the real analog/digital
circuits it's inspired by. Every claim below is either (a) sourced to a specific citation,
(b) a calculation I did myself from a cited component value (marked as such), or (c) explicitly
flagged as unverified/undocumented. Nothing here is invented to fill a gap — where the real
circuit's exact formula isn't public (several transistor fuzz circuits, all of Boss's modern
digital algorithms), that's stated plainly instead of guessed.

**How this was researched, and a real limitation with it:** three parallel research passes
(drive/fuzz circuits, dynamics/EQ/wah circuits, modulation/pitch/time circuits) each used web
search grounded in named sources — primarily [Electrosmash](https://www.electrosmash.com)
(schematic-level teardowns with measured transfer curves for most classic analog pedals),
academic virtual-analog-modeling literature (DAFx conference papers on diode-clipper modeling),
and manufacturer/technical documentation for the digital units.

**`electrosmash.com`'s main domain is unreachable by direct fetch from this environment
(`ENOTFOUND` — confirmed independently). A mirror, `electrosmash.mas-effects.com`, works** and
was used to directly re-fetch and quote all 10 Electrosmash-cited pages below (Tube Screamer,
Boss DS-1, ProCo Rat, Big Muff Pi, Fuzz Face, Klon Centaur, Boss CE-2, MXR Phase 90, Cry Baby
GCB-95, MXR Dyna Comp) — every citation to these 10 pages below is now a direct quote or close
paraphrase from the actual page content, not a search-snippet guess.

**A concrete example of the earlier, weaker method failing, caught by spot-checking before the
mirror was found:** this document originally called the Boss GE-7's 7-band frequency list "the
one fully exact, zero-ambiguity fix" on the strength of a
[teardown blog](https://mirosol.kapsi.fi/2014/01/boss-ge-7-graphic-equalizer/) that, on direct
fetch, turned out **not** to list the 7 individual frequencies at all. The number was re-verified
a different way instead (manufacturer-manual text cross-referenced across two independent
sources) and held up — see §3. That's the standard this document now holds every other claim to:
direct primary-source text, not a snippet describing it.

**Two real corrections the direct verification surfaced** (detailed in their pedal rows in §3):
the Cry Baby's "tie output gain to sweep position" recommendation is now marked **unconfirmed** —
the source states output is tapped before the pot that varies gain, which may mean that fix
doesn't match the real circuit; and the Klon Centaur is actually a **3-path** summing network
(1 distorted + 2 clean feed-forward paths), not the simple 2-path dry/wet blend this document
proposed as an implementation — the proposed fix is now labeled as a deliberate simplification
of the real circuit, not a replica of it.

---

## 1. The pedal list, and why these 20

Sourced from cross-referencing [Stringjoy's 10 Most Popular Guitar Pedals](https://stringjoy.com/10-most-popular-pedals/),
[GuitarPlayer's Top 50 Stompboxes](https://www.guitarplayer.com/gear/the-top-50-stompboxes-of-all-time-50-years-of-foot-stompin-tone),
[JHS Pedals' Top 25](https://jhspedals.info/blogs/feedback/the-top-25-pedals-ever), and
[Reverb's Best-Selling Effects Pedals](https://reverb.com/news/best-selling-effects-pedals-of-2024)
(which notes Boss held 55% of top-20 best-selling used-pedal spots). Picked to span every
category this app already has (Dynamics, Drive, Filter/Wah, Modulation, Pitch, Time-Based, EQ),
prioritizing pedals with real, publicly-documented circuits over ones that are pure marketing.

| # | Pedal | App category |
|---|---|---|
| 1 | Ibanez TS9 / TS808 Tube Screamer | Drive |
| 2 | Boss DS-1 | Drive |
| 3 | Boss SD-1 Super Overdrive | Drive |
| 4 | Boss BD-2 Blues Driver | Drive |
| 5 | ProCo Rat 2 | Drive |
| 6 | Electro-Harmonix Big Muff Pi | Drive |
| 7 | Dallas Arbiter Fuzz Face (germanium) | Drive |
| 8 | Klon Centaur | Drive |
| 9 | MXR Dyna Comp | Dynamics |
| 10 | Boss CS-3 Compression Sustainer | Dynamics |
| 11 | Boss NS-2 Noise Suppressor | Dynamics |
| 12 | Boss GE-7 Graphic Equalizer | EQ |
| 13 | Dunlop Cry Baby GCB-95 | Filter/Wah |
| 14 | Boss CE-2 / CE-2W Chorus | Modulation |
| 15 | MXR Phase 90 | Modulation |
| 16 | Electro-Harmonix Small Stone | Modulation |
| 17 | Boss TR-2 Tremolo | Modulation |
| 18 | Boss OC-2 / OC-3 Octave | Pitch |
| 19 | Boss DD-3 / DD-8 Digital Delay | Time-Based |
| 20 | Boss RV-6 Reverb | Time-Based |

---

## 2. Shared physics: what real diode clipping actually is

Every op-amp-based overdrive on this list (TS9/808, DS-1, SD-1, BD-2, Klon) clips via real
silicon or germanium diodes, which follow the **Shockley diode equation**:

```
I = Is * (exp(V / (n * Vt)) - 1)
```

where `Vt` (thermal voltage) ≈ 26mV at room temperature, `Is` (reverse saturation current) and
`n` (ideality factor) are diode-specific — for a common 1N4148, `Is ≈ 4.352 nA`, `n ≈ 1.906`
(fitted SPICE parameters reported in circuit-modeling literature).

For two antiparallel diodes across an op-amp's feedback resistor (the TS/SD-1/DS-1/BD-2/Klon
topology), virtual-analog literature (Yeh, Abel & Smith, ["Simplified, Physically-Informed
Models of Distortion and Overdrive Guitar Effects Pedals," DAFx-07](https://ccrma.stanford.edu/~dtyeh/papers/yeh07_dafx_distortion.pdf))
derives a curve of the shape:

```
Vout ≈ 2 * n * Vt * asinh(Vin / (2 * R * Is))
```

**This app currently uses `tanh(k*(x+bias))` for every single drive pedal and every amp
(`driveCurve()` in `js/pedal-registry.js`).** `asinh` and `tanh` are different curve families —
`asinh` has a much gentler, longer "shoulder" into saturation than `tanh`, which saturates
harder and faster. This is the single biggest systemic gap found across all 8 drive pedals.

*(Caveat, now checked three times from three independent hosts — ccrma.stanford.edu, academia.edu,
and a dafx.de mirror — all failing to extract cleanly: the exact printed coefficient arrangement
in the Yeh/Abel/Smith DAFx-07 paper remains unconfirmed as a verbatim quote. This is now a
reproducible finding, not a one-off tooling glitch. However, a second, independent, directly
fetchable source — [a KVR Audio DSP-forum post by "martinvicanek"](https://www.kvraudio.com/forum/viewtopic.php?t=406861),
a recognized developer in that community — gives the same curve family in plain readable text:*

```
y = arcsinh(x) = ln(x + sqrt(x² + 1))
```

*with the same qualitative behavior already claimed here: "onset of distortion is much more
gentle than with tanh(x)" and it "never saturates completely." The qualitative conclusion — asinh
vs. tanh curve-family mismatch — is now backed by an actual citable formula, just not the original
academic paper's own derivation.)*

---

## 3. Per-pedal findings

### Drive / Fuzz

| Pedal | Real topology (source) | Gap vs. this app | Recommended fix | Verification test |
|---|---|---|---|---|
| **TS9/TS808** | ✅ Directly verified. 2 diodes (MA150/1N4148/1N914) **in the feedback loop of a non-inverting op-amp**, symmetric clipping. Article gives no closed-form equation, only oscilloscope images — it notes the clipped output is "curved asymmetrically due to the phase shift introduced by the high pass filter," i.e. the tone filter's phase response measurably distorts the clip shape even though the diodes themselves are symmetric. [Electrosmash](https://electrosmash.mas-effects.com/tube-screamer-analysis.html) | `tanh` curve, tone filter applied *after* shaping, not coupled to it — real circuit's filter interacts with the clip itself. | Swap `driveCurve` to `asinh(k*x)` for this pedal (a reasonable curve-family match per the academic literature in §2, since Electrosmash gives no equation of its own). One-line change. | Render a 1kHz sine sweep -40→0dBFS through both curves in an `OfflineAudioContext`, plot output-vs-input, compare knee shape qualitatively against the oscilloscope images on the source page. |
| **Boss DS-1** | ✅ Directly verified. 2 back-to-back diodes (1S1588/1N2473, "equivalent 1N4148") **shunted to AC ground** — quote: "diodes that shunt the signal to AC ground (4.5V), this kind of clipping technique gives a 'hard-clipping' sound." Feeding it: an asymmetric Q2 booster stage giving +35dB (56×) gain — quote: "the Q2 asymmetric clipping gives rise to even-order harmonics which are more sonically pleasing." [Electrosmash](https://electrosmash.mas-effects.com/boss-ds1-analysis.html) | Symmetric `tanh`, no even-harmonic content, no pre-booster stage. | Add a fixed nonzero `bias` (the app's `driveCurve(k,bias)` already supports this, currently unused here) to model the asymmetric booster's contribution, + prefer a harder-kneed curve than tanh (shunt clipping is harder than feedback-loop clipping). | FFT a clipped 220Hz tone; check for measurable 2nd-harmonic energy (pure symmetric tanh shows only odd harmonics). |
| **Boss SD-1** | ⚠️ **Corrected — the first draft had two invented/backwards details.** Re-fetching [the cited comparison writeup](https://guitarstrive.com/boss-sd1-vs-tube-screamer/) directly shows it does **not** state a diode count or arrangement anywhere — the "3 diodes, 2-vs-1 asymmetric" claim in the first draft wasn't drawn from this source and shouldn't have been presented as sourced. The source does confirm SD-1 uses **asymmetric clipping** (vs. TS9's symmetric), but gives no circuit-level detail on how. It also says the **opposite** of what the first draft claimed about the EQ: TS9 is the one described as having the pronounced/"razor-like" midrange; **SD-1 is described as more scooped (less midrange)** by comparison, not "mid-focused ~800Hz." | Same generic symmetric curve as Overdrive; no distinct EQ. | `asinh` curve + a small nonzero bias (asymmetric clipping is confirmed, just not its exact circuit values) + a tone filter that's *less* mid-prominent than TS9's, not more. **Do not implement an ~800Hz mid-boost for this pedal — that detail was wrong.** | Compare positive vs. negative output peak amplitude at fixed input — should be measurably asymmetric (current `bias=0` is perfectly symmetric). Separately, A/B the tone filter against TS9's and confirm SD-1 reads as less mid-heavy, not more. |
| **Boss BD-2** | ⚠️ **Downgraded.** Re-fetching [Analog Is Not Dead](https://www.analogisnotdead.com/article25/circuit-analysis-the-boss-bd2) directly: the two-cascaded-FET-op-amp-stages topology is confirmed in the article body. **The gain-dependent 2nd→3rd-order harmonic shift claim, however, only appears in a reader comment (#9) on that page, not in the article's own analysis** — the first draft cited it as if it were the author's measured finding. Treat it as an unverified community claim, not a confirmed spec. | Single shaper stage; two-stage topology confirmed missing regardless of the harmonic-shift detail's status. | Chain **two** `WaveShaperNode`s in series (this part is confirmed by the article itself, keep it) — but don't design specifically around "2nd-order at low gain, 3rd-order at high gain" as if it were a verified target; that specific behavior is unconfirmed. | Measure 2nd:3rd harmonic ratio at low vs. high gain settings as an open exploratory test, not a pass/fail against a confirmed number. |
| **ProCo Rat 2** | ✅ Directly verified. **LM308N op-amp** (modern units use a TI OP07DP replacement), 2 silicon 1N914 diodes in a **shunt configuration across the feedback path** — "D1 will clip the positive semi-cycle signal to +VF and D2 will clip the negative signal semi-cycle to -VF." The "Filter" knob's lowpass cutoff sweeps a wide **475Hz–32kHz**. [Electrosmash](https://electrosmash.mas-effects.com/proco-rat.html) | Tone stage is already Rat-appropriate (simple lowpass) but our range isn't tuned to the real 475Hz–32kHz sweep. Main gap: op-amp rail-clipping (from the LM308's very high open-loop gain) isn't modeled, only diode clipping. | Retune the tone-filter knob's frequency range to 475Hz–32kHz; push `curveK` harder and/or cascade an op-amp-rail-clip stage (hard clamp) before the diode-style curve. | Compare the Filter knob's -3dB point/rolloff slope at a few settings against the 475Hz–32kHz range. |
| **Big Muff Pi** | ✅ Directly verified. **2 clipping stages** (not 4 — 4 was miscounted in the first draft; there are 2 clipping stages plus separate booster/output stages): "the first transistor softly clips the waveform" then "the second one repeats the operation again... creating the hard clip." Diodes clip at ≈0.6V. Tone-stack measurement: **"6.5dB loss at the notch (-13.5dB total) at 1kHz,"** plus a separate "overall 7dB loss" across the stage at that setting. [Electrosmash](https://electrosmash.mas-effects.com/big-muff-pi-analysis.html) | Single shaper stage; tone is one filter, not a lowpass/highpass crossfade; no separate ~7dB stage-loss modeled. | Chain **two** `WaveShaperNode`s in series (soft-clip then hard-clip, matching the real 2-stage order — not two identical stages); rebuild Tone as an explicit crossfade between a lowpass branch and a highpass branch. | Set tone to center, measure the dip at 1kHz relative to passband — should be ≈ -13.5dB total. |
| **Fuzz Face (germanium)** | ✅✅ **Boundary substantially resolved — the user obtained and provided the full text of GEOFEX's "Technology of the Fuzz Face" (R.G. Keen) directly**, which this session could only reach via blocked-fetch search snippets before. Confirmed from the full article: the circuit is a **"voltage feedback biasing"** topology (Q2's emitter, via a 100kΩ resistor, feeds DC bias back to Q1's base) — this is *why* it can't hard-saturate cleanly and instead clips "mushy," and *why* the clipping is asymmetric by design (Q1 biases to only ~0.5V on its collector, leaving far more headroom on one side than the other). Q1 clips "soft/mushy" first; **Q2 clips hard** on the *same* polarity Q1 softened, so clipping is soft-then-hard, giving the touch-sensitivity. **A real, usable (if approximate) gain relationship is given**, not just "no formula exists": second-stage AC gain ≈ (sum of collector resistors) / (unbypassed portion of the 1kΩ emitter pot) — ranges from ~8 at minimum to the transistor's raw hFe at maximum, and the *first* stage's gain is simultaneously set by how much of that same signal feeds back through the 100kΩ resistor, so the two stages' gains move in opposite directions as the Fuzz pot turns. **The most important confirmed number for actually modeling this**: musically-good clipping happens at **transistor gain (hFe) ≈ 80–110** (matched pair), widening to **70–130** with a high/low mismatched pair — this is the article's own measured sweet spot from simulation, not a guess. Below/above that range is described as sounding "clunky." Also confirmed: adding a 10–100pF cap collector-to-base "softens" the clipping (this is what later silicon Fuzz Faces did) — a real, concrete tone-shaping detail. Bias targets: Q1 collector ≈ -0.5 to -0.7V, Q2 collector ≈ -4.5V. [GEOFEX "Technology of the Fuzz Face"](http://www.geofex.com/article_folders/fuzzface/fftech.htm) (full text now available), plus the already-confirmed [DAFx17 peer-reviewed paper](https://www.dafx17.eca.ed.ac.uk/papers/DAFx17_paper_28.pdf) explaining *why* no single universal formula exists (per-unit transistor variance is the actual point of the circuit, not a modeling gap) and [Electrosmash](https://electrosmash.mas-effects.com/fuzz-face.html). | **No public closed-form transfer-function formula exists — still true, and still correctly attributed to real hardware variance, not lack of research.** But the current fixed `bias=0.18` with no gain-parameter concept doesn't reflect that a real, simulatable relationship (the hFe range, the two-stage opposing-gain mechanism) is now documented. | **This pedal can move from Tier 4 (out of scope) to a genuine Tier 3 build.** Model it as a 2-stage cascade (matching Big Muff/BD-2's pattern already in this plan) instead of one shaper: stage 1 = soft/mushy asymmetric clip (a `driveCurve` with a small bias, low k), stage 2 = harder clip on the same polarity, with the two stages' gain driven in opposition by the single Fuzz knob (as the pot turns up, stage 2 gets more gain while stage 1's effective gain via feedback decreases — mirrors the real opposing-gain mechanism). Tune the overall "character" against the confirmed 80–110 hFe sweet spot conceptually (e.g. expose it as an internal voicing constant, not necessarily a user knob) rather than modeling one specific transistor. Optionally add a gentle top-end rolloff (a fixed lowpass, emulating the collector-to-base cap trick) for the smoother/vintage-leaning variant. | At low Fuzz, measure positive vs. negative clip level (should be clearly asymmetric, per source — this part is unchanged). New: verify the two-stage handoff — stage 1 alone should sound soft/mushy at low drive, stage 2 should visibly add hard-clipped squaring on top as drive increases, matching the article's "soft then hard, same polarity" description. |
| **Klon Centaur** | ✅ Directly verified, and this is a real correction: it's actually a **3-path summing network** — the distorted op-amp gain stage **plus two separate clean feed-forward paths**, combined at a summing amp — not a simple 2-path dry/wet blend. Diodes are germanium **1N34A**, confirmed — and the audit pass found the mechanistic reason why: germanium's forward voltage is **~0.35V vs. silicon's ~0.7V**, so it starts compressing at a much lower signal level, explaining the "soft knee first" character. A second independent circuit-analysis source, [Coda Effects](https://codaeffects.com/en/), adds a mechanism detail worth implementing precisely: **the Gain control is a dual-gang (dual-section) potentiometer** — "GAIN1 and GAIN2 are in fact one double potentiometer: when the value of one increases, the other one increases" — meaning turning up Gain isn't just "more drive," it *simultaneously* increases the dirty path's level and decreases the clean path's blend as one mechanically-linked motion, not two independent knobs. Source: "as the gain potentiometer goes higher, the diodes start to compress the signal, with a soft knee first and more aggressive at the end" (no specific gain-value threshold given for when clipping becomes audible). [Electrosmash](https://electrosmash.mas-effects.com/klon-centaur-analysis.html) | **Structurally impossible to approximate via `driveCurve` alone** — none of the 3 existing drive pedals have any parallel-path architecture. Current planned fix (2-path dry/wet) is also an explicit simplification of the confirmed 3-path circuit. | **Higher-fidelity option, concretely buildable in this codebase:** a real 3-path summing network instead of the 2-path simplification — one dirty branch (`WaveShaperNode` fed by a germanium-style `driveCurve` with a small bias, low k, to match the soft-knee-first character) **plus two separate clean feed-forward `GainNode` branches**, all summed at one output `GainNode` (same fan-in summing pattern the codebase already uses wherever multiple nodes feed one destination). The key mechanism to replicate precisely is the **dual-gang pot linkage**: implement the Gain knob's single `apply(nodes, v)` callback (the pattern already used throughout `pedal-registry.js`/`amp-registry.js`) so that one `v` drives **both** `dirtyGain.gain.value` up **and** the combined clean-path gain down in the same call — e.g. `dirtyGain.gain.value = f(v)` and `cleanGain.gain.value = 1 - f(v)` computed together — rather than two independent knobs a user could set apart from the real hardware's single mechanically-linked pot. This is a genuine upgrade path from the current 2-path plan, not required to ship Tier 3, but the correct target if higher fidelity is wanted later. | At low Gain (mostly-clean blend), THD should stay very low — a pure series shaper can never do this. For the 3-path version specifically: confirm the two clean branches sum to unity gain with the dirty branch at Gain=0 (pure clean bypass-equivalent), and confirm dirty/clean gains move in the same single-knob motion (not independently settable) when the linked-pot fix is implemented. |

### Dynamics / EQ / Wah

| Pedal | Real topology (source) | Gap vs. this app | Recommended fix | Verification test |
|---|---|---|---|---|
| **MXR Dyna Comp** | ✅ Directly verified. **CA3080** OTA confirmed ("the first commercially available OTA by RCA in 1969"). Envelope detector: **C8 = 10µF, R13 = 150kΩ** confirmed directly (τ ≈ **1.5 seconds**, my calculation from those two values, not stated by the source itself), no separate attack/release, no threshold/ratio knobs. [Electrosmash](https://electrosmash.mas-effects.com/mxr-dyna-comp-analysis.html) | Our compressor worklet is fast (5ms/150ms defaults), independently adjustable, soft-knee — architecturally near-opposite. | Don't retrofit the Compressor pedal — add a distinct "Vintage Comp" pedal: single-pole envelope follower at ~1.5s time constant, no ratio/knee params, just one Sensitivity knob. | Compare gain-vs-time step response: real-circuit model settles over several seconds; current worklet settles in <1s. Clearly measurable difference. |
| **Boss CS-3** | Fixed-threshold, **hard-knee**, high-ratio VCA compressor; Attack and Release knobs are **inversely coupled** (turning one lengthens it and shortens the other) — not independent. [Source](https://backhouse.wtf/blog/fluff/09-04-demystifying-the-boss-compression-sustainer-cs-3-txt/) | Independent Threshold/Ratio/Attack/Release, soft (12dB) knee. | Add a "CS-3" preset: knee ≈ 2 (hard), and couple Attack/Release sliders in the UI only when that preset is active. | With the preset active, sweep Attack and verify Release visibly moves the opposite direction — today's sliders provably don't do this. |
| **Boss NS-2** | VCA + envelope detector; its headline feature is **architectural** — detects at the guitar input but gates inside a separate send/return effects loop, so it can suppress noise picked up by other pedals in that loop. **No public schematic-level teardown found.** | This app has one serial signal path with no "external loop" concept — the loop-based dual-detection feature has no equivalent here. | Don't claim accuracy that isn't verifiable. Keep tightening the existing gate's release smoothness; explicitly document the loop-detection feature as out of scope for this app's architecture. | No exact-spec test possible. Substitute: record a decaying note through the gate, confirm the natural decay tail isn't abruptly chopped (qualitative, matching NS-2's "smooth" reputation). |
| **Boss GE-7** | ✅ Directly verified from **Boss's own official product page** (upgraded citation — stronger than the manual-text search snippets used in the first draft): **"100 Hz, 200 Hz, 400 Hz, 800 Hz, 1.6 kHz, 3.2 kHz, and 6.4 kHz"**, **"±15 dB boost/cut per band"** — verbatim from the primary source. [Boss GE-7 official product page](https://www.boss.info/global/products/ge-7/) | Current Graphic EQ: **6 bands at 100/250/630/1600/4000/10000 Hz** (ISO third-octave spacing), ±20dB. | **The one fully exact, zero-ambiguity fix on this whole list — now confirmed from a primary source, not a snippet.** Change `freqs` to `[100,200,400,800,1600,3200,6400]`, add a 7th band, change range to ±15dB. | Trivial: diff the constant array, confirm 7 knobs render at exactly those frequencies. |
| **Dunlop Cry Baby GCB-95** | ✅ Directly verified, and the VR1 question is now **resolved** (not just re-hedged): L1=500mH, C2=0.01µF, sweep 450Hz–1.6kHz centered at 750Hz — all confirmed exactly. **VR1 is the treadle/sweep pot itself.** The two statements that looked contradictory in the first draft are not actually in conflict: "the voltage gain delivered by the Active Filter Stage is regulated, from 19dB to 1dB" describes the internal resonant-peak gain changing as you sweep (shapes how prominent the peak sounds at different positions), while "the output jack is taken before the variable resistor VR1... the position of the potentiometer does not affect the output volume level" means the pedal deliberately keeps final output level flat regardless of treadle position — these are two different things (internal filter-stage gain vs. final output level), not a contradiction. [Electrosmash](https://electrosmash.mas-effects.com/crybaby-gcb-95.html) | Sweep is 300–2200Hz (wider, shifted, confirmed wrong), Q is an exposed user knob (real pedal has none, confirmed). | Narrow sweep to 450–1600Hz (confirmed fix); hard-code Q (confirmed real pedal has none). **"Tie output gain to sweep position" is RETRACTED, not just unconfirmed — it was wrong. The real pedal keeps output level flat by design.** If the 1↔19dB figure is worth modeling at all, it belongs as a change in the resonant peak's prominence/Q at different sweep positions, not as an output-level knob. | Sweep Treadle across 5 positions, measure center freq + −3dB bandwidth, confirm they land inside 450–1600Hz. Separately confirm overall output loudness stays roughly constant across the sweep — that's the actual real-pedal behavior to match. |

### Modulation / Pitch / Time

| Pedal | Real topology (source) | Gap vs. this app | Recommended fix | Verification test |
|---|---|---|---|---|
| **Boss CE-2/CE-2W** | ✅ Directly verified. **MN3007** BBD (1024-stage, 5.12–51.2ms delay range) + **MN3101** clock driver, confirmed. **Triangle LFO confirmed** — quote: "CE-2 uses triangle LFO waveforms." Anti-aliasing/reconstruction filters: **third-order Sallen-Key lowpass, poles at 6.6kHz and 6.9kHz**, passband ≈14.6Hz–6.6kHz — more precise than the first draft's single "~6.6kHz" figure. [Electrosmash](https://electrosmash.mas-effects.com/boss-ce-2-analysis.html), [Roland specs](https://support.roland.com/hc/en-us/articles/201927549-CE-2-Technical-Specifications) | `createModDelay()` uses a sine LFO and no band-limiting filter on the wet path. | Switch Chorus's LFO from sine to **triangle**; add a fixed lowpass (~6.6–6.9kHz, third-order if feasible) in the wet path only to emulate BBD roll-off; tighten rate range to ~0.3–4Hz. | Freeze the LFO, FFT the wet signal against a white-noise input, confirm energy above ~6.6kHz is attenuated relative to dry. |
| **MXR Phase 90** | ✅ Directly verified. **"4 phase shifting units, creating 2 notches"** — confirmed exactly. JFET-based, confirmed: uses **2N5952** n-channel FETs as voltage-controlled resistors (not OTA). LFO rate range genuinely **not given specific Hz values** by the source itself ("can be trimmed from tenths of Hz to some Hertzs") — confirming the original caveat about using the Phase 95's spec as a stand-in was the right call, not something to fix. [Electrosmash](https://electrosmash.mas-effects.com/mxr-phase90.html) | App's Phaser uses **6** stages (confirmed mismatch — should be 4), sine LFO, 0.05–3Hz range. | Offer a "Phase 90 mode" (or change default) to 4 stages; keep the Phase-95-derived 0.125–10Hz rate range as a documented stand-in, not a verified original spec. | ⚠️ **Test recipe bug found and fixed**: with `mix=100%` the app's shared `setMix` helper sets `wet.gain=1, dry.gain=0` — zero dry signal. Allpass stages don't change magnitude by definition, so notches only appear from dry/wet destructive interference; at 100% wet there's no dry to interfere with, so **the test as originally written would show a perfectly flat response and find nothing.** Corrected: with feedback=0, **mix=50%** (any partial blend works), sweep a test tone and count stationary notches at a frozen LFO position — confirmed formula: N stages → N/2 notches (4→2, vs. current 6→3). Feedback amount doesn't affect notch count (only sharpness/resonance), so feedback=0 as a simplification is fine. |
| **EHX Small Stone** | Sourcing upgraded twice now: originally 1 forum post, then 3 corroborating sources, and a third pass found **actual schematic/service-manual PDFs** (elektrotanya.com, experimentalistsanonymous.com) plus a tagboard-layout site, all agreeing — **4 phase stages + 2 for the LFO**, OTAs are EH1048 (house-labeled CA3094), 2-position "Color" (feedback-depth) switch. Extra detail: the well-regarded **"Issue J" (1977)** revision is the one most builders reference, and modern reproductions substitute an **LM13700** (two CA3094-equivalents in one package) for the discontinued original chip. Still no single authoritative prose teardown (no Electrosmash page exists for this pedal), but the corroboration is now schematic-level, not forum-post-level. [Source](https://scsynth.org/t/reading-diagram-of-electro-harmonix-small-stone-phaser/7045) | Same generic 6-stage phaser; feedback is a continuous knob (actually more flexible than the real 2-position switch). | If a second phaser variant is wanted: 4 stages + feedback presets at the Color switch's documented low/high values (~0.3 / ~0.6); otherwise the existing continuous knob already generalizes this. | Same notch-counting method as Phase 90 above — **use mix=50%, not 100%**, same reasoning. |
| **Boss TR-2** | ✅✅ **Boundary resolved — the user obtained and provided the full official schematic directly** (previously this session could only locate the PDF's existence, not read it). Confirmed from the schematic itself: this is genuinely **VCA-based**, not a simple LFO-on-gain design — the audio path runs through a symmetric pair of transistors (**Q5/Q7, 2SC2458GR**) arranged as a matched attenuator, biased via small-signal diodes (**D2/D3, 1SS133**), forming the actual voltage-controlled-attenuator core. The RATE/WAVE/DEPTH section is a **dedicated oscillator-and-shaper subsystem**, not one simple LFO: a quad op-amp (**M5218AL**, 4 instances: IC2A/IC2B/IC3A/IC3B/IC4A/IC4B — more than one package) builds the core oscillator and buffers, while a **separate JFET-based shaping stage** (**2SK184GR, 2SK118Y**, plus a second dual op-amp **M5207L01** ×2 as IC1A/IC1B) sits between the oscillator and the VCA — this is almost certainly the circuit that morphs the modulation waveform between the sine/square-ish/triangle shapes the "Wave" control selects, confirming that claim with real hardware rather than just the tremolo-project blog's description. Deriving the *exact* waveform equation from this schematic (what the JFET stage's transfer curve actually looks like at each Wave setting) needs deeper circuit tracing than a single read gives — that specific number remains open — but the architecture itself (VCA core + separate LFO-shaping subsystem, not a plain sine-times-gain) is now confirmed from the primary source, not a secondary blog. [Boss TR-2 official schematic — Fig. 1, PCB ASSY 70901390], [Source](http://tremolo-project.blogspot.com/2017/08/boss-tr-2.html) | Fixed sine LFO on gain — confirmed even more clearly wrong now: real circuit has a whole separate op-amp+JFET waveshaping stage between the oscillator and the audio-path VCA, not a single oscillator driving gain directly. | Add a "Wave" param crossfading LFO shape; approximate the trapezoid by clipping a triangle LFO with a `WaveShaperNode` then lightly lowpassing it (still a reasonable practical approximation — building the exact JFET-shaper subcircuit is possible but would need further schematic tracing beyond this pass). If a more accurate model is wanted later, the real circuit is confirmed buildable: an LFO section feeding a JFET-based wave-shaping network, which then drives a symmetric-transistor-pair VCA on the audio path — a genuine architecture to target, not a guess. | Capture the actual gain-modulation waveform at each Wave setting; compare shape/duty-cycle/edge-steepness against documented trapezoidal/square/triangle shapes. |
| **Boss OC-2/OC-3** | ✅ Re-confirmed against the actual code: `OctaverProcessor`'s zero-crossing-triggered sign-flip logic (flip a square wave's sign every other upward zero-crossing) is exactly the documented **zero-crossing square-wave frequency divider** technique. Documented "flaw": harmonically rich/chord input causes mistracking — described as part of the pedal's charm, strictly monophonic. OC-3's "Poly" mode is confirmed **digital** ("COSM-based digital tracking pitch-shifter"), a genuinely different technology from the analog zero-crossing divider, not an extension of it. [Sources](https://www.freestompboxes.org/viewtopic.php?t=2612) | Already a good architectural match. No "chord mistracking is authentic" documentation; no Poly-mode equivalent. | No core algorithm change needed. Optionally document the mistracking as authentic OC-2 behavior rather than a bug. Poly mode = real, separate, larger future effort (different DSP entirely) — not a quick tweak. | Feed a single note (should divide cleanly) then a chord (should audibly mistrack) — confirming the *limitation* matches, an unusual but appropriate test here. |
| **Boss DD-3/DD-8** | DD-3: 12.5–800ms, 12-bit chip + analog feedback-stage degradation. DD-8: up to 10s, 11 named algorithms. **Internal signal-processing algorithm is proprietary/undocumented** — not found beyond marketing names, confirmed again on a targeted second search. One genuine new fact found (hardware history, not algorithm behavior): the actual delay-storage chip has changed across DD-3 production revisions — the 1986 original used a custom **RDD63H101**, the 1991 "DD-3A" used a gate-array **MN51010RBA**, the 2002 "DD-3B" switched to a surface-mount DRAM (**M11B416256A-35T**), and 2014+/DD-3T units use an unnamed Roland DSP chip. This doesn't change any DSP-behavior recommendation, but is worth having on record if hardware-accurate detail ever matters. [Boss DD-3](https://www.boss.info/us/products/dd-3/), [DD-8](https://www.boss.info/us/products/dd-8/), [chip IDs via stompboxelectronics.com] | Single generic Delay (already a reasonable "clean digital delay" match). | To approach DD-8's breadth: add delay-mode variants as new pedals/params — "Analog" (extra feedback-loop saturation + heavier lowpass), "Tape" (saturation + subtle pitch-wobble via a tiny modulated delay), "Reverse" (play the buffer backwards). These are real, buildable techniques, not a fix to the existing pedal. | For a "Tape" mode: verify the wow/flutter shows as visible pitch modulation on repeats in a spectrogram, not just amplitude change. |
| **Boss RV-6** | 8 modes (Room, Hall, Plate, Spring, Modulate, Dynamic, Shimmer, Reverb+Delay). **Internal DSP/chip architecture confirmed genuinely undisclosed — even Boss's own marketing only says "newly developed algorithm"/"all-new algorithms," never naming the actual DSP architecture.** This isn't a case of "a teardown wasn't found," it's that the manufacturer doesn't publish it. [Product listings](https://www.horn-fx.com/boss-rv-6) | `ir-synth.js` already covers 4 of the 8 modes (Room/Plate/Hall/Spring) via synthesized IRs — functionally analogous, algorithmically different (convolution vs. real-time algorithmic engine). | Shimmer (most distinctive missing mode) is buildable now: feed the existing `pitch-shifter-processor` worklet back into a delay/reverb loop for octave-up shimmer. Dynamic mode: envelope-follow the wet mix amount, reusing the same technique as the Envelope Filter pedal. | For Shimmer: confirm the reverb tail's pitch actually climbs an octave over successive repeats (visible as an ascending harmonic series in a spectrogram), not just "reverb with a shifter slapped on." |

---

## 4. Implementation priority

**Tier 1 — exact, zero-judgment-call fixes (do first, cheapest, most confidently correct):**
- Boss GE-7: change EQ band frequencies to `[100,200,400,800,1600,3200,6400]`, range to ±15dB.
- Cry Baby: narrow Wah sweep range to 450–1600Hz.

**Tier 2 — single-parameter/curve changes within the existing architecture:**
- Swap `tanh` → `asinh` in `driveCurve()` for TS9-style pedals; give SD-1 an asymmetric bias too
  (confirmed asymmetric) but **do not** add an ~800Hz mid-boost — that detail was wrong; SD-1 is
  comparatively more scooped than TS9, not more mid-focused.
- Make Fuzz's `bias` a function of the Fuzz knob instead of a fixed constant.
- Add asymmetric bias to Distortion (DS-1-style).
- Rat 2 (Distortion/Fuzz "Rat"-style pedal, if present, or a new pedal alongside it): retune the
  tone-filter range to 475Hz–32kHz and push `curveK` harder to better match the shunt-diode clip.
  (Genuine gap fixed here: this had a documented fix in §3 but was never assigned to a tier below.)
- Chorus: sine → triangle LFO, add a fixed ~6.6–6.9kHz wet-path lowpass.
- Phaser: reduce to 4 stages (or add as a mode) to match Phase 90/Small Stone.
- Tremolo: add a Wave-shape param (triangle/sine/trapezoidal-square).
- ~~Cry Baby: tie output gain to sweep position~~ — **retracted, confirmed wrong** (see §3/§6);
  the real pedal keeps output level flat by design regardless of treadle position.

**Tier 3 — real architecture additions (bigger, still well-scoped):**
- Cascade two `WaveShaperNode`s in series for Blues Driver and Big Muff (mirrors their real 2-stage topology exactly).
- Rebuild Big Muff's Tone as an explicit lowpass/highpass crossfade (not one filter).
- New "Klon"-style pedal: parallel dry/wet blend around a mild shaper — reuses this codebase's existing dry/wet pattern from Reverb/Delay/Chorus.
- New "Vintage Comp" pedal (Dyna Comp): single-pole ~1.5s envelope follower, no ratio/knee/independent-attack-release.
- New "CS-3" compressor preset: hard knee, coupled attack/release.
- Reverb: Shimmer mode (feed the existing pitch-shifter worklet into a feedback loop) and Dynamic mode (envelope-follow the wet mix).
- Delay: "Tape"/"Analog"/"Reverse" mode variants.

**Tier 4 — explicitly out of scope / unverifiable (don't guess, don't build):**
- Fuzz Face's exact transistor model (no public closed-form exists; would need per-unit SPICE data).
- Boss NS-2's loop-based dual-detection architecture (this app has no "external loop" concept).
- Boss OC-3's Poly mode (genuinely different DSP, real future project on its own).
- Boss DD-8's and RV-6's internal proprietary algorithm details.

---

## 5. Testing & validation methodology

**General approach** — every test above follows the same recipe, runnable with tools already
in this codebase:

1. **Generate a known test signal** via `OfflineAudioContext` — a sine sweep (for transfer-curve
   and frequency-response tests), a single sustained tone (for harmonic/THD analysis), a step
   function or decaying envelope (for compressor/gate timing tests), or white noise (for
   frequency-response/filtering tests).
2. **Render the pedal's `createNodes()` output** for that input offline (this app's own
   `wave-preview.js` already does something adjacent to this for the live "Signal Preview"
   scope — the same rendering approach extends directly to automated testing).
3. **Analyze the output**:
   - *Transfer curve*: plot output amplitude vs. input amplitude at each sweep point — compare
     knee shape against the cited source's published curve.
   - *Harmonic content*: FFT a single-tone output, read off the amplitude at 1×/2×/3× the
     fundamental frequency — compare the odd/even harmonic ratio against what the real circuit's
     symmetry (or asymmetry) predicts.
   - *Timing*: sample the effective gain over time in response to a step input — compare the
     settling time/shape against the real circuit's calculated or documented time constant.
   - *Frequency response*: FFT the output against a white-noise or swept-sine input — read off
     -3dB points, peak frequency, and Q — compare against the cited measured values.
4. **Compare, don't just eyeball** — every test above has a concrete cited number to compare
   against (a frequency, a dB figure, a time constant, a harmonic ratio, a notch count), so each
   one is pass/fail, not subjective, except where the source material itself is only qualitative
   (NS-2, Fuzz Face's unit-to-unit variance) — those are marked as such above and given a
   perceptual/qualitative test instead of a fabricated number.

This methodology section describes *how* to verify each change once implemented — it hasn't
been executed against actual code changes yet, since this document is the research-and-planning
deliverable that precedes implementation, not the implementation itself.

---

## 6. What's honestly unverified in this document

Updated three times: after directly re-fetching all 10 Electrosmash-cited pages via a working
mirror; after a second, independent adversarial proofreading pass (three fresh agents, one per
section, tasked with finding errors rather than confirming the document); and after a **third
pass specifically targeting the 8 genuine information boundaries** identified by that point, using
search angles not tried before — patents, service manuals, academic full-text alternatives, and
R.G. Keen's GEOFEX (a legendary pre-Electrosmash deep-technical resource). That third pass moved
two items from "boundary" to "partially resolved" (Fuzz Face, the diode-clipper equation), added
one genuine new fact each to three more (Klon, Small Stone, DD-3/DD-8), correctly identified one
finding-in-the-wild as unsourced and refused to add it (Phase 90's "0.125–9.6Hz"), and confirmed
the remaining boundaries stand after real, documented attempts to break them — not just repeated
the same searches. What's still genuinely open, and what got fixed:

**Resolved in the adversarial pass (previously listed as open questions here):**
- **Cry Baby's VR1 contradiction is now actually resolved, not just re-verified**: VR1 is the
  treadle pot itself; the 1↔19dB figure is the internal filter stage's own gain (shapes resonance
  prominence) and is a separate thing from the final output level, which is tapped before that pot
  and stays flat by design. The two source statements were never actually contradictory. The
  "tie output gain to sweep position" fix is **retracted as wrong**, not merely unconfirmed — see §3.
- **Boss GE-7's citation upgraded** from search-snippet text to Boss's own official product page,
  a genuine primary source — the 7-band/±15dB numbers are now as solid as a citation gets.

**New errors found in the adversarial pass (not present in the first verification round):**
- **Boss SD-1's "3 diodes, 2-vs-1 asymmetric" detail was fabricated** — the cited article never
  states a diode count or arrangement. Corrected in §3.
- **Boss SD-1's "~800Hz mid-focused EQ" claim was backwards** — the source says TS9 has the
  pronounced midrange and SD-1 is comparatively *more scooped*. Corrected in §3.
- **Boss BD-2's gain-dependent 2nd→3rd-harmonic-shift claim was sourced to a reader comment**,
  not the cited article's own analysis — downgraded from a confirmed fact to an unverified
  community claim in §3.
- **Phase 90 and Small Stone's verification-test recipes were logically broken** — both specified
  testing notch count at `mix=100%`, which the app's own `setMix` helper resolves to zero dry
  signal; since allpass stages don't change magnitude, that setting shows a flat response with no
  notches to count. Corrected to `mix=50%` in §3. The underlying N-stages→N/2-notches claim itself
  was independently re-confirmed as correct.

**Partially resolved in the third (boundary-hunting) pass:**
- **The diode-clipper equation now has an actual citable formula** — not from the original
  Yeh/Abel/Smith paper (which failed to extract cleanly a *third* time, from a third independent
  host, confirming this is reproducible, not a fluke), but from a second, legitimate, directly
  fetchable source (a KVR Audio DSP-forum post by a recognized developer): `arcsinh(x) = ln(x +
  sqrt(x² + 1))`, with matching qualitative behavior already claimed here. Upgrade from "no source
  gives a readable equation" to "here's the formula, properly cited, just not from the original
  academic derivation." Separately, no source checked across TS9/DS-1/Rat/SD-1/BD-2 gives a
  closed-form formula either — this remains a systemic gap for the whole op-amp/diode-clipper
  family, now with a workable substitute curve to use instead.
- **Fuzz Face's "no closed-form exists" claim went from absence-of-evidence to a directly-fetched,
  peer-reviewed confirmation** — DAFx17's germanium-BJT-modeling paper explicitly states parameter
  extraction "depend[s] on individual transistor samples... rather than being universal constants."
  Also found (via search snippets, GEOFEX's direct fetch was blocked) two concrete bias-voltage
  reference points: Q1 collector ≈ -0.5 to -0.7V, Q2 collector ≈ -4.5V. The
  asymmetry-converges-to-symmetric-at-max-Fuzz claim **remains this document's own extrapolation,
  not a sourced fact** — still true after this pass, the source confirms asymmetry exists and both
  clipping cycles get harder as Fuzz increases, but never says they converge.
- **Klon Centaur** gained a real mechanism detail (Gain is a dual-gang pot, confirmed by a second
  independent source) but the proposed fix **remains an explicit simplification** (2-path dry/wet)
  of the confirmed **3-path** real circuit — structurally correct, not a full replica. The exact
  gain-threshold-for-audible-clipping figure remains unstated by two independent sources now, not
  just one — a genuine boundary, not under-searched.
- **EHX Small Stone**'s corroboration is now schematic-level (actual service-manual PDFs found),
  up from forum-post-level, though still no single authoritative direct-fetch teardown page exists.
- **Boss DD-3/DD-8** gained real hardware-history detail (exact delay-storage chip per production
  revision) but the internal DSP/algorithm behavior remains proprietary — confirmed again on a
  targeted patent/teardown search that found nothing pedal-specific.
- **Boss TR-2**: fully resolved from "findable, not yet read" to **directly reviewed** — the user
  supplied the actual schematic image, which this session read and confirmed: a symmetric
  2SC2458GR transistor pair biased by 1SS133 diodes forms the audio-path VCA, and a dedicated
  M5218AL/M5207L01 op-amp + 2SK184GR/2SK118Y JFET subsystem shapes the LFO before it reaches that
  VCA — a real multi-stage architecture, not a single sine LFO on gain. The one thing still not
  derived is the exact transfer-curve equation of the JFET shaping stage at each Wave setting,
  which would need further subcircuit tracing beyond a single schematic read — a narrower, now
  well-scoped remainder rather than the previous "can't read the file at all" gap.

**Confirmed as genuine boundaries after an active, documented attempt to break them (not just
repeated searches):**
- **MXR Phase 90's original LFO rate range** — a floating "0.125–9.6Hz" figure was found circulating
  in search results, traced to no citable primary source, and deliberately **not added** to this
  document; Wikipedia was fetched directly and confirmed to give no numeric range at all. The
  Phase 95-derived stand-in remains the best-founded option.
- **Boss OC-3's Poly-mode algorithm** — a specific candidate patent (US6995311) was found, fetched,
  and confirmed **unrelated** (a different inventor's string-tuning hardware, not Roland/Boss
  pitch-tracking). No patent disclosing the actual algorithm was found.
- **Boss NS-2** — confirmed via forum threads of *other people* asking for a schematic that has
  never been posted; patent search returned only unrelated generic envelope-detector patents.
- **Boss RV-6** — confirmed via multiple independent sources converging on "32-bit DSP processor"
  as the only public technical detail; patent search surfaced only unrelated later-generation
  Roland reverb products, no filings for this unit's actual algorithm.
- Also worth noting for implementation, unrelated to any boundary: the actual `driveCurve()`
  function in the code is `tanh(k*(x+bias)) - tanh(k*bias)` (a DC-zeroing correction term), not the
  simplified `tanh(k*(x+bias))` written in §2 — cosmetic difference, but match the real formula if
  this document is used as an implementation spec.
- A minor ambiguity noted in the adversarial pass: §3 doesn't always explicitly state which
  existing app pedal ID (Overdrive vs. Distortion) each real pedal (TS9, SD-1, DS-1) is meant to
  target — inferable from context and made explicit in §4's tiers, but worth spelling out
  per-pedal if this document is handed to someone else to implement from.
