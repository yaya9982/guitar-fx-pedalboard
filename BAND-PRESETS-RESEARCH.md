# Band presets and classic amps: research notes

The band setups in `js/demo-presets.js` are built from the classic amp models in
`js/amp-registry.js` and the existing pedals. They aim at what players use to copy each sound,
not an exact replica of the recording rig. Each topic was researched by three independent
agents and fact-checked by three more; `test-presets.html` renders every setup offline and
checks it is not silent, not clipping and within 12 dB of the median loudness.

Engine facts that shaped the values:
- The amp always runs last, after every pedal, so delay and reverb sit in front of it.
- Cab impulse responses use a fixed-seed noise source (`js/ir-synth.js`), so an amp sounds the
  same on every page load. Makeup gains were calibrated against that.

## Amps

Numbers are estimates fitted to the sourced facts below; tune by ear.

| Amp | Modelled on | Sourced facts |
|---|---|---|
| Blackface | Fender Princeton / Deluxe Reverb | tone-stack mid dip near 500 Hz (robrobinette.com TMB tone stack); clean until cranked |
| Plexi | Marshall 1959 Super Lead | no master volume, mid-heavy, bright top (Wikipedia); not a high-gain amp (robrobinette.com JCM800 page); Greenback 75 Hz-5 kHz (celestion.com) |
| Brit 800 | Marshall JCM800 2203 | master volume, more preamp gain than the Plexi (robrobinette.com, Wikipedia) |
| AC30 | Vox AC30 Top Boost | no mid control, no negative feedback, cathode bias, chime, early smooth breakup, Alnico Blue (Wikipedia) |
| DR103 | Hiwatt DR103 | headroom over distortion, big punchy cleans, fuller low end, Fane speakers (Wikipedia) |
| Mark IIC+ | Mesa/Boogie Mark IIC+ | graphic EQ at 80/240/750/2200/6600 Hz (Mesa owner's manual), set to +2.5/-1.4/-10.9/-2.8/+2.0 dB from the Metallica screenshot; bass kept low before the gain; tight lows, mid focus (Wikipedia) |

Unverified: exact scoop depths, the AC30 chime frequency, Fane speaker response, and how much
each real amp clips at each volume setting.

## Band setups

Nine setups were rebuilt from Tone Master Pro screenshots of each rig (primary source for the
knob values). Mapping used: percent tone knobs (bass/mid/treble/presence, drive, gain, fuzz, mix)
copy straight across; level/output knobs map 50% = unity (so 76% output is level 152); dual-volume
Marshalls (Vol I / Vol II) use their average as Gain; reverb/delay controls the sim lacks (decay,
room size, pre-delay, dwell, depth, tape bias) are dropped. Amp level was then trimmed per setup so
every setup renders within +-5 dB of the median (`test-presets.html`).

| Setup | Screenshot chain (signal order) | Our chain |
|---|---|---|
| AC/DC: Thunderstruck | Mythic Drive (gain 8, treble 36, output 76) > British Plexi (Vol 73/68, treble 50, mid 76, bass 35, presence 63) > Large Plate Reverb (mix 25) | Klon (gain 8, treble -3.4, level 152) > Reverb plate 25 > Plexi gain 70, bass 35, mid 76, treble 50, presence 63 |
| Led Zeppelin | Greenbox 8 (drive 29, tone 40, level 69) > '65 Princeton (vol 100, treble 64, bass 53) > Large Room Reverb (mix 45, size 100) | TS9 (29/40/138) > Reverb room 45 > Blackface gain 100, bass 53, treble 64, presence 0 (the video says a Supro is closer to the original) |
| Jimi Hendrix: Purple Haze | EQ-7 (400 Hz +1.4, 3.2 kHz +4.5) > Ranger Boost 50 > Round Fuzz Germanium (fuzz 50, vol 75) > British 45 (Vol 52/18, treble 69, mid 28, bass 18, presence 68) > '63 Spring Reverb (mix 45) | GE-7 > Boost (150, tone +6, my choice for a treble booster) > Fuzz Face (50/50/150) > Pitch Shifter (off, octave for the solo, from earlier research) > Reverb spring 45 > Plexi gain 35, bass 18, mid 28, treble 69, presence 68 |
| Guns N' Roses: Sweet Child O' Mine | Ranger Boost 58 > British 800 (gain 50, master 80, treble 89, mid 55, bass 61, presence 50) > Stereo Tape Echo (1/4 and 1/8, feedback 10, mix 8) | Cry Baby (off, solo wah from earlier research) > Boost (174, tone +6) > Tape Delay 500 ms (assumes 120 BPM; the tempo is not shown), feedback 10, mix 8 > Brit 800 gain 50, bass 61, mid 55, treble 89, presence 50 |
| Red Hot Chili Peppers: Can't Stop | Seventy Sixer comp (in 31, out 32, attack 1.7, release 3.2, 4:1) > Ranger Boost 53 > British Plexi (Vol 49/52, treble 50, mid 69, bass 53, presence 64) > '63 Spring Reverb (mix 26) | Compressor (-20 dB, 4:1, attack 1, release 400) > Boost (159, tone +6) > Reverb spring 26 > Plexi gain 50, bass 53, mid 69, treble 50, presence 64 |
| Metallica | Greenbox 10 (drive 5, tone 50, level 50) > Marksman Ch2 (gain 90, treble 90, mid 0, bass 18, presence 18, master 80) > graphic EQ (80 +2.5, 240 -1.4, 750 -10.9, 2.2k -2.8, 6.6k +2.0) > Large Room Reverb (mix 6) | TS9 (5/50/100) > Reverb room 6 > Mark IIC+ gain 90, bass 18, mid 0, treble 90, presence 18. The Mark IIC+ amp's built-in graphic EQ was changed to the screenshot's curve |
| Pink Floyd: Time | Dynamic Compressor (sens 30) > Sustain compressor (sens 50) > CSD Drive (drive 34, tone 40, level 25) > Hiway 100 (normal 63, bright 50, bass 31, mid 42, treble 48, presence 48, master 42) > Tape Echo (feedback 15, mix 29) > Large Hall Reverb (mix 32). This is the 2000s Gilmour recipe; the video tips say a Big Muff also works | Dyna Comp 30 > CS-3 (-30 dB) > Overdrive (34/40/50) > Big Muff (off) > Tape Delay (time not shown, 350 ms assumed) 15/29 > Reverb hall 32 > DR103 gain 57, bass 31, mid 42, treble 48, presence 48 |
| Eric Clapton: 80s Strat | EQ-7 (800 +2.6, 1.6k +7.4, 3.2k +5.4, gain +2.7) > Greenbox (60/32/90) > '65 Princeton (100/47/74) > Large Room Reverb (mix 32) | GE-7 (same bands) > TS9 (60/32/180) > Reverb room 32 > Blackface gain 100, bass 47, treble 74, presence 0. The EQ-7 output gain has no GE-7 equivalent |
| Oasis | Mythic Drive (gain 40, treble 64, output 69) > Brit Breaker combo (Vol 55/37, treble 70, mid 44, bass 40, presence 64) > Memory Delay (feedback 50, mix 27, depth 20, gain 33) > Large Room Reverb (mix 38) | Klon (40, +3.4, 138) > Analog Delay (time not shown, 350 ms assumed) 50/27 > Reverb room 38 > Plexi gain 46, bass 40, mid 44, treble 70, presence 64. Gem Archer (per the video) says a Strat was used on the record |

No screenshots exist for Van Halen, The Smiths or Dire Straits; those keep the earlier researched
setups (sources: Wikipedia "Eruption", guitar.com Van Halen I rig, whereseric/mixdown/groundguitar
for Marr, mk-guitar.com for Knopfler).

Unverified or disputed: Van Halen's Variac voltage; whether the MXR flanger is on the first album
(left out); which fuzz Hendrix used on the session; Gilmour's amp on Time; Knopfler's studio amp and
compressor; the delay times for the Oasis, Gilmour and Slash echoes (not shown in the screenshots).
