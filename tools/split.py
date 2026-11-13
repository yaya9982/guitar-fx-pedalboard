# Combine Gemini's split images into a knob-sprite skin: knobless body + one top-down knob.
# usage: python -I tools/split.py <id> <body.jpg> <knob.jpg> [scale]
#   writes img/<id>-body.webp (400px wide) and img/<id>-knob.webp, points the registry skin at them
#   (src/aspect/knob) and sets each knob row's --kd from the knob's real outer size in the old photo,
#   times [scale] (default .95: a touch smaller so spacing round the labels stays comfortable).
import re, sys, os, numpy as np
from PIL import Image

def key(im):  # flat screen colour (green or magenta, read from the border) -> alpha, with spill removed
    a = np.array(im.convert('RGB')).astype(float); h, w = a.shape[:2]
    bd = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(bd, 0); dist = np.abs(a - bg).sum(-1)
    al = np.clip((dist - 60) / 70, 0, 1)
    if bg[1] > bg[0] and bg[1] > bg[2]: a[..., 1] = np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2]) + 8)   # green spill
    else:  # magenta spill: pull red/blue down to green, only on the soft edge, so red/purple knobs keep their colour
        e = ((al > 0) & (al < .98))[..., None]; m = np.minimum(a[..., 0], a[..., 2])
        fix = a.copy(); fix[..., 0] = np.minimum(a[..., 0], a[..., 1] + 8); fix[..., 2] = np.minimum(a[..., 2], a[..., 1] + 8); a = np.where(e, fix, a)
    if not (bg[1] > bg[0] and bg[1] > bg[2]):   # magenta: trim the tinted rim a few px
        r, g, b = a[..., 0], a[..., 1], a[..., 2]; mag = ((r - g > 35) & (b - g > 35) & (np.abs(r - b) < 70)) | ((r - g > 20) & (b - g > 10) & (b > r - 60) & (al < .999))   # reflected magenta
        for ch in (0, 2): a[..., ch] = np.where(mag, g + (a[..., ch] - g) * .35, a[..., ch])
        from PIL import ImageFilter
        al = np.array(Image.fromarray((al * 255).astype('uint8')).filter(ImageFilter.MinFilter(15)).filter(ImageFilter.GaussianBlur(2))).astype(float) / 255
    return np.dstack([a, al * 255])

def circ(x, y):
    A = np.c_[2 * x, 2 * y, np.ones_like(x)]; (a, b, c), *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
    return a, b, np.sqrt(c + a * a + b * b)

TH = np.linspace(-np.pi, np.pi, 96, endpoint=False)
def outer(K, cx, cy, R):  # knob's outer edge in the old photo (strongest colour step on each ray)
    rs = np.arange(.6 * R, 1.5 * R, .5)
    X = np.clip(np.rint(cx + rs[:, None] * np.cos(TH)).astype(int), 0, K.shape[1] - 1)
    Y = np.clip(np.rint(cy + rs[:, None] * np.sin(TH)).astype(int), 0, K.shape[0] - 1)
    P = K[Y, X]; g = np.abs(P[4:] - P[:-4]).sum(-1); re_ = rs[g.argmax(0) + 2]; w = g.max(0)
    x, y = cx + re_ * np.cos(TH), cy + re_ * np.sin(TH); keep = w > np.percentile(w, 30)
    for _ in range(6):
        a, b, r = circ(x[keep], y[keep]); res = np.abs(np.hypot(x - a, y - b) - r); keep = res <= max(1.0, np.percentile(res, 55))
    return r if .7 * R < r < 1.6 * R else R

pid, bodyf, knobf = sys.argv[1:4]; scale = float(sys.argv[4]) if len(sys.argv) > 4 else .95
reg = open('js/pedal-registry.js', encoding='utf8').read()
m = re.search(r"id: '%s',.*?skin: \{ src: '(img/[^']+)'[^}]*\}" % pid, reg, re.S); old_src = m.group(1).split('?')[0]
if '-body' in old_src: old_src = old_src.replace('-body', '')
B = key(Image.open(bodyf)); al = B[..., 3] > 128
th = .03 if 'round' in reg[m.start():m.end()] or pid == 'fuzzface' else .3   # round enclosures: keep the whole circle
rows = np.where(al.sum(1) > th * al.sum(1).max())[0]; cols = np.where(al.sum(0) > th * al.sum(0).max())[0]
body = Image.fromarray(B.astype('uint8')).crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1))
body = body.resize((400, round(body.height * 400 / body.width)), Image.LANCZOS)
# Gemini sometimes drifts the paint colour: match each channel's mean/spread to the old photo
O = np.array(Image.open(old_src).convert('RGBA').resize(body.size, Image.LANCZOS)).astype(float); Bb = np.array(body).astype(float)
both = (O[..., 3] > 200) & (Bb[..., 3] > 200)
drift = np.abs(np.median(O[..., :3][both], 0) - np.median(Bb[..., :3][both], 0)).max()
if drift > 6:                                  # only when the paint clearly changed; median-based so dark parts stay neutral
    for ch in range(3):
        mo, mb = np.median(O[..., ch][both]), np.median(Bb[..., ch][both])
        g = min(1.25, max(.8, mo / max(mb, 1))); Bb[..., ch] = np.clip(Bb[..., ch] * g, 0, 255)
print('colour drift', round(float(drift), 1))
body = Image.fromarray(Bb.astype('uint8')); body.save('img/%s-body.webp' % pid, quality=92)
Kn = key(Image.open(knobf)); km = Kn[..., 3] > 128; ys, xs = np.where(km); cx0, cy0 = xs.mean(), ys.mean(); H, W = km.shape
px, py = [], []
for t in np.linspace(np.radians(-200), np.radians(20), 120):  # upper outline: no perspective there
    rr = np.arange(20, max(H, W)); x = np.clip((cx0 + rr * np.cos(t)).astype(int), 0, W - 1); y = np.clip((cy0 + rr * np.sin(t)).astype(int), 0, H - 1)
    hit = np.where(km[y, x])[0]
    if len(hit): px.append(cx0 + rr[hit.max()] * np.cos(t)); py.append(cy0 + rr[hit.max()] * np.sin(t))
cx, cy, Rb = circ(np.array(px), np.array(py)); Rb -= 3
yy, xx = np.mgrid[0:H, 0:W]; dist = np.hypot(xx - cx, yy - cy)
R = max(Rb, np.percentile(dist[km], 99.9) + 2)   # include a pointer tip that sticks out past the round body
tipk = R / Rb                                     # sprite is this much wider than the knob body
Kn[..., 3] = np.minimum(Kn[..., 3], np.clip(R - dist, 0, 1) * 255)
Image.fromarray(Kn.astype('uint8')).crop((round(cx - R), round(cy - R), round(cx + R), round(cy + R))).resize((176, 176), Image.LANCZOS).save('img/%s-knob.webp' % pid, quality=94)
reg = reg.replace(m.group(0), re.sub(r"skin: \{[^}]*\}", "skin: { src: 'img/%s-body.webp', aspect: '400 / %d', knob: 'img/%s-knob.webp' }" % (pid, body.height, pid), m.group(0)))
open('js/pedal-registry.js', 'w', encoding='utf8', newline='').write(reg)
K = np.array(Image.open(old_src).convert('RGB')).astype(float); f = K.shape[1] / 200
vs = (body.height / body.width) / (K.shape[0] / K.shape[1]); print('vertical scale', round(vs, 3))
css = open('style.css', encoding='utf8').read()
PAT = r'(\.photo-skin\[data-pedal-type="%s"\][^{]*\{ )--kx: ([\d.]+)px; --ky: ([\d.]+)px; --kd: ([\d.]+)px;' % pid
ks = [tuple(float(mm.group(i)) for i in (2, 3, 4)) for mm in re.finditer(PAT, css)]
def size(kx, ky, k):
    d = 2 * outer(K, kx * f, ky * f, k / 2 * f) / f * scale * tipk
    near = [np.hypot(kx - x, ky - y) for x, y, _ in ks if (x, y) != (kx, ky)]
    return min(d, .82 * min(near) * tipk) if near else d          # keep a comfortable gap between neighbours
out = []
def kd(mm):
    kx, ky, k = (float(mm.group(i)) for i in (2, 3, 4)); d = size(kx, ky, k); out.append(round(d, 1))
    ky2 = ky * vs                                     # body came back taller/shorter: keep the knob's relative height
    return '%s--kx: %.1fpx; --ky: %.1fpx; --kd: %.1fpx;' % (mm.group(1), kx, ky2, d)
css = re.sub(PAT, kd, css)
open('style.css', 'w', encoding='utf8', newline='').write(css)
print(pid, 'body', body.size, 'knob R', round(R), 'tip x%.2f' % tipk, 'kd', out)
