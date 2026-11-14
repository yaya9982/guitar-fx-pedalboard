# Even out each photo pedal's value readouts and sliders.
# usage: python -I tools/spacing.py <pedals.json> [--write]
#   pedals.json = positions measured in the browser (card px): per knob row the knob, readout
#   chip and slider boxes. For each tier of knobs this finds the blank band in the body photo
#   between the knob's printed name and the next printed thing below (name, seam, LED), then
#   places chip and slider there with equal gaps. Writes `translate` nudges into style.css
#   between the spacing:begin/end markers.
import json, re, sys, numpy as np
from PIL import Image

CHIP_H, THUMB = 11, 20          # readout chip and slider thumb heights (px in the 200px card)
MIN_GAP, MAX_GAP = 3, 9         # never tighter than MIN; don't spread wider than MAX

def ink_rows(img, x0, x1):
    """Per row of the strip: True where something is printed (pixels off the row's paint
    colour) or where the paint itself changes (a seam or panel edge)."""
    a = img[:, max(0, x0):x1].astype(float)
    med = np.median(a, axis=1)                                   # (H, 3) paint colour per row
    off = (np.abs(a - med[:, None, :]).max(-1) > 42).mean(1)     # share of pixels that differ
    step = np.zeros(len(med)); step[3:] = np.abs(med[3:] - med[:-3]).max(-1)
    return (off > .05) | (step > 30)

def band(ink, start, limit):
    """First blank band below `start` tall enough for chip + slider: printed things on the way
    (the knob's name, a divider line) are stepped over. Returns (top, bottom) or None."""
    y = start; need = CHIP_H + THUMB + 3 * MIN_GAP
    while y < min(limit, start + 70):
        while y < limit and (ink[y] or ink[y:y + 3].any()): y += 1     # through print, bridging 2px gaps
        top = y
        while y < limit and not ink[y]: y += 1
        if y - top >= need: return top, y
    return None

def main():
    data = json.load(open(sys.argv[1])); write = '--write' in sys.argv; css = []
    for pid, p in data.items():
        src = re.search(r'img/[\w.-]+', p['img']).group(0)
        im = Image.open(src).convert('RGBA'); H = p['h']
        img = np.array(im.resize((p['w'], H), Image.LANCZOS))[..., :3]
        rows = [(i, r) for i, r in enumerate(p['rows']) if r['knob'] and r['chip'] and r['slider']]
        tiers = {}
        for i, r in rows: tiers.setdefault(round(r['knob'][3] / 12), []).append((i, r))
        for _, tier in sorted(tiers.items()):
            kb = int(max(r['knob'][3] for _, r in tier))
            x0 = int(min(r['slider'][0] for _, r in tier)); x1 = int(max(r['slider'][2] for _, r in tier))
            ink = ink_rows(img, x0, x1)
            limit = int(H * .8)
            others = [r2['knob'][1] for r2 in p['rows'] if r2['knob'] and r2['knob'][1] > kb + 20]   # a lower tier of knobs
            if others: limit = min(limit, int(min(others)) - 2)
            found = band(ink, kb, limit)
            if not found: print('%-14s tier@%3d no blank band found, left as is' % (pid, kb)); continue
            top, bot = found
            chip0 = tier[0][1]['chip'][1]; sl0 = (tier[0][1]['slider'][1] + tier[0][1]['slider'][3]) / 2
            room = bot - top - CHIP_H - THUMB
            gap = min(MAX_GAP, room / 3)
            note = ''
            if gap < MIN_GAP:
                note = 'TIGHT'; gap = max(1.5, (bot - top - CHIP_H - THUMB) / 3) if room > 4 else None
            if gap is None:
                print('%-14s tier@%3d band %3d-%3d (%2dpx) too small, left as is' % (pid, kb, top, bot, bot - top)); continue
            chip = top + gap; sl = chip + CHIP_H + gap + THUMB / 2
            dc, ds = chip - chip0, sl - sl0
            print('%-14s tier@%3d band %3d-%3d gap %.1f  chip %+.1f  slider %+.1f %s' % (pid, kb, top, bot, gap, dc, ds, note))
            for i, _ in tier:
                sel = '.photo-skin[data-pedal-type="%s"] .knob-row:nth-child(%d)' % (pid, i + 1)
                css.append('%s > label { translate: 0 %.1fpx; }' % (sel, dc))
                css.append('%s > input[type="range"] { translate: 0 %.1fpx; }' % (sel, ds))
    if write:
        s = open('style.css', encoding='utf8').read()
        block = '/* spacing:begin (tools/spacing.py) */\n' + '\n'.join(css) + '\n/* spacing:end */'
        s = re.sub(r'/\* spacing:begin.*?/\* spacing:end \*/', lambda m: block, s, flags=re.S) if 'spacing:begin' in s else s + '\n' + block + '\n'
        open('style.css', 'w', encoding='utf8', newline='').write(s)

main()
