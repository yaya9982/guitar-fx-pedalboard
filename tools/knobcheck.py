# Offline check: composite every knob turned 110deg exactly as the CSS does, at full photo resolution.
# usage: python -I tools/knobcheck.py <out-prefix> [ids]
import re, sys, os, numpy as np
from PIL import Image, ImageDraw
css = open('style.css', encoding='utf8').read(); K = {}
for m in re.finditer(r'(?m)^(?=.*data-pedal-type="(\w+)").*?--kx: ([\d.]+)px; --ky: ([\d.]+)px; --kd: ([\d.]+)px;', css):
    K.setdefault(m.group(1), []).append(tuple(float(m.group(i)) for i in (2, 3, 4)))
ids = sys.argv[2:] or list(K); tiles = []
for pid in ids:
    im = Image.open(os.path.join('img', pid + ('.jpg' if pid == 'reverb' else '.webp'))).convert('RGB'); f = im.width / 200; out = im.copy()
    for kx, ky, kd in K[pid]:
        r = kd * f / 2; box = tuple(round(v) for v in (kx * f - r, ky * f - r, kx * f + r, ky * f + r)); S = 4
        c = im.crop(box).resize(((box[2] - box[0]) * S,) * 2, Image.LANCZOS).rotate(-110, Image.BICUBIC)
        m = Image.new('L', c.size, 0); ImageDraw.Draw(m).ellipse((0, 0, c.size[0] - 1, c.size[1] - 1), fill=255)
        out.paste(c.resize((box[2] - box[0],) * 2, Image.LANCZOS), box[:2], m.resize((box[2] - box[0],) * 2, Image.LANCZOS))
    bot = int(max(ky + kd / 2 for _, ky, kd in K[pid]) * f + 12); tiles.append(out.crop((0, 0, im.width, min(bot, 400))))
for n in range(0, len(tiles), 5):
    row = tiles[n:n + 5]; sh = Image.new('RGB', (sum(t.width + 6 for t in row), max(t.height for t in row)), 'black'); x = 0
    for t in row: sh.paste(t, (x, 0)); x += t.width + 6
    sh.save(f'{sys.argv[1]}{n // 5}.png')
print(len(tiles), ids)
