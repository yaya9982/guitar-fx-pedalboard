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
| Mark IIC+ | Mesa/Boogie Mark IIC+ | graphic EQ at 80/240/750/2200/6600 Hz, V curve scoops 750 Hz, bass kept low before the gain (Mesa owner's manual); tight lows, mid focus (Wikipedia) |

Unverified: exact scoop depths, the AC30 chime frequency, Fane speaker response, and how much
each real amp clips at each volume setting.

## Band setups

| Setup | Recording rig (source) | What the setup does |
|---|---|---|
| AC/DC | SG into Marshall Super Lead / JTM50, no pedals, Schaffer-Vega wireless as a boost (guitar.com) | mild boost, Plexi gain 65, mids up |
| Led Zeppelin | Les Paul, Marshall Super Bass / Vox, wah, tape echo (guitar.com); Page names other amps elsewhere | boost, Plexi gain 70, fat lows, 120 ms tape slap |
| Van Halen: Eruption | Marshall Super Lead, MXR Phase 90, Echoplex, Univox echo, studio reverb room (Wikipedia "Eruption") | slow Phase 90, dimed Plexi, tape echo, plate |
| Van Halen: You Really Got Me | same amp; no modulation documented for this track | as above without the phaser |
| Jimi Hendrix: Purple Haze | fuzz + Roger Mayer Octavia on the solo, Marshall (Wikipedia "Octavia", IEEE Spectrum) | Fuzz Face, Pitch Shifter +12 (off until the solo), Plexi gain 35 |
| Guns N' Roses: Sweet Child O' Mine | Derrig Les Paul replica, rented modified Marshall, no drive pedal (guitar.com); wah and ~425 ms delay are recreation advice (guitarchalk.com) | Brit 800 gain 45, mids up, 425 ms delay, plate, Cry Baby off until the solo |
| Metallica | Mesa Mark IIC+, mids cut with outboard EQ (groundguitar, mixdownmag) | TS9 push (a player trick, not documented on the records), Mark IIC+ |
| The Smiths: Heaven Knows | Gibson ES-355; Marr's Fender Twin and Boss CE-2 are documented in general, not for this track | compressor, Blackface clean, light CE-2, spring reverb |
| Pink Floyd: Time | Fuzz Face on the solo, Binson Echorec, Hiwatt or Fender Twin (gilmourish.com) | Fuzz Face, DR103, 320 ms tape delay, plate |
| Dire Straits: Sultans of Swing | Strat, Fender amp (studio amp not identified, mk-guitar.com); compression is a player recommendation | Dyna Comp, bright Blackface, spring reverb |
| Eric Clapton: 80s Strat | a fan recipe from a Tone Master Pro video: EQ-7 mid boost, Greenbox, '65 Princeton at full volume, large room reverb. Clapton's documented 80s rig was Marshall 800-series heads and, from 1988, an active mid boost in the guitar (whereseric.com, Wikipedia) | GE-7 +3/+7/+5 dB at 800/1.6k/3.2k Hz, TS9 drive 60 tone 32, Blackface gain 100, room reverb 32% |
| Oasis | AC30 and Marshall Bluesbreaker on Morning Glory, Space Echo (mixdownmag, groundguitar); Tube Screamer is from the live rig | TS9, AC30 gain 85, short tape echo |

Unverified or disputed: Van Halen's Variac voltage; whether the MXR flanger is on the first
album (left out); which fuzz Hendrix used on the session; Gilmour's amp on Time; Knopfler's
studio amp and compressor; which rented Marshall is on Appetite for Destruction; the exact Mesa
model on each Metallica album.
