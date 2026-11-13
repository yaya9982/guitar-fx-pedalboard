# Fit every photo-skin knob: find its true centre (point of best rotational symmetry) and its edge
# radius in the photo, then rewrite --kx/--ky/--kd in style.css so the rotating cut-out is exactly
# the knob, turning about its real axis.   usage: python -I tools/knobfit.py [ids...]
import re, sys, os, numpy as np
from PIL import Image
only = set(sys.argv[1:]); css = open('style.css', encoding='utf8').read()
TH = np.linspace(-np.pi, np.pi, 96, endpoint=False)

def samp(Y, cx, cy, rr, th):
    x = np.clip(np.rint(cx + rr[:, None] * np.cos(th)).astype(int), 0, Y.shape[1] - 1)
    y = np.clip(np.rint(cy + rr[:, None] * np.sin(th)).astype(int), 0, Y.shape[0] - 1)
    return Y[y, x]

def circ(x, y):                                   # least-squares circle through points
    A = np.c_[2 * x, 2 * y, np.ones_like(x)]; (a, b, c), *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
    return a, b, np.sqrt(c + a * a + b * b)

TH2 = np.linspace(-np.pi, np.pi, 144, endpoint=False); SH = (24, 48, 72, 96, 120)   # turn angles tried: 60..300deg

def polar(K, cx, cy, rs):
    return np.stack([samp(K[..., i], cx, cy, rs, TH2) for i in range(3)], -1)        # radius x angle x rgb

# Per-pedal rules where the automatic cut is wrong (checked by eye with knobcheck.py):
#   keep      = hand-set values already right (tick marks round the knob confuse the fit)
#   ('tip',n) = pointer tip sticks out past the body: cut n px (200px basis) wider than the body so it turns too
#   ('cap',q) = heavy parallax: turn only the top face, at most q x the body radius
MODE = {'reverb': 'keep', 'vintagecomp': 'keep', 'tremolo': ('tip', 15), 'overdrive': ('tip', 5), 'klon': ('tip', 13),
        'fuzz': ('tip', 6), 'distortion': ('cap', .8), 'phase90': ('cap', .86), 'analogdelay': ('cap', .7)}

def fit(K, cx, cy, R, mode=None):
    """Edge circle first, then the cut (centre, radius) whose seam breaks least when the disc turns."""
    rs = np.arange(.72 * R, 1.3 * R, .5)
    P = np.stack([samp(K[..., i], cx, cy, rs, TH) for i in range(3)], -1)
    g = np.abs(P[4:] - P[:-4]).sum(-1); re = rs[g.argmax(0) + 2]; w = g.max(0)
    x, y = cx + re * np.cos(TH), cy + re * np.sin(TH); keep = w > np.percentile(w, 30)
    for _ in range(6):
        a, b, r = circ(x[keep], y[keep]); res = np.abs(np.hypot(x - a, y - b) - r)
        keep = res <= max(1.0, np.percentile(res, 55))
    if not (keep.sum() >= 30 and np.hypot(a - cx, b - cy) < .3 * R and .75 * R < r < 1.25 * R): a, b, r = cx, cy, R
    if mode == 'keep': return cx, cy, R
    if mode and mode[0] == 'tip': return a, b, r + mode[1] * K.shape[1] / 400
    top_r = r * mode[1] if mode else r + .6
    # how far out the pointer reaches (12 o'clock): the cut must contain all of it
    rr = np.arange(2, 1.3 * r, 1.0); C = polar(K, a, b, rr); Q = C @ [.299, .587, .114]; top = 36           # index of -90deg
    d = np.abs(Q[:, top - 2:top + 3].mean(1) - np.median(Q, 1)); tc = C[:, top - 1:top + 2].mean(1)
    lo, hi = int(.3 * r / 1.0), int(.85 * r / 1.0); pk = lo + d[lo:hi].argmax(); ext = .5 * r
    if d[pk] > 38:                                                  # walk outward while it is still pointer-coloured
        k = pk
        while k + 1 < len(rr) and d[k + 1] > 30 and np.abs(tc[k + 1] - tc[pk]).mean() < 45: k += 1
        ext = rr[k]
    best = None; cand = np.arange(min(max(ext + 1.5, .55 * r), top_r - 2), max(top_r, ext + 3) if not mode else top_r, .5)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            A = polar(K, a + dx, b + dy, np.r_[cand - 1, cand + 1]); I, O = A[:len(cand)], A[len(cand):]
            now = np.abs(I - O).sum(-1).mean(1)                     # seam contrast already in the photo
            turned = np.mean([np.abs(np.roll(I, k, 1) - O).sum(-1).mean(1) for k in SH], 0)
            sc = (turned - now) - .35 * cand + .25 * np.hypot(dx, dy)   # least new break, then biggest cut
            k = sc.argmin()
            if best is None or sc[k] < best[0]: best = (sc[k], a + dx, b + dy, cand[k])
    return best[1], best[2], best[3]

imgs = {}; log = {}; circles = {}
PAT = r'(?m)^(?=.*data-pedal-type="(\w+)")(.*?)--kx: ([\d.]+)px; --ky: ([\d.]+)px; --kd: ([\d.]+)px;'
fits = {}                                             # (pid, kx, ky) -> [dx, dy, dd]
for m in re.finditer(PAT, css):
    pid = m.group(1)
    if only and pid not in only: continue
    if pid not in imgs:
        imgs[pid] = np.array(Image.open(os.path.join('img', pid + ('.jpg' if pid == 'reverb' else '.webp'))).convert('RGB')).astype(float)
    K = imgs[pid]; f = K.shape[1] / 200; kx, ky, kd = (float(m.group(i)) for i in (3, 4, 5))
    cx, cy, r = fit(K, kx * f, ky * f, kd / 2 * f, MODE.get(pid)); fits[(pid, kx, ky)] = [cx / f - kx, cy / f - ky, 2 * r / f - kd, kd]
# knobs in one row of a pedal are the same part at the same height: share the row's median size and
# height, and drop a sideways shift that came with an outlier size
for (pid, kx, ky), v in fits.items():
    row = [w for (p, x, y), w in fits.items() if p == pid and abs(y - ky) < 1 and abs(w[3] - v[3]) < 1]
    md, my = np.median([w[2] for w in row]), np.median([w[1] for w in row])
    v += [0.0 if abs(v[2] - md) > 1.5 else v[0], my, md]
def repl(m):
    pid = m.group(1); kx, ky, kd = (float(m.group(i)) for i in (3, 4, 5))
    if (pid, kx, ky) not in fits: return m.group(0)
    dx, dy, dd = fits[(pid, kx, ky)][4:]; nx, ny, nd = kx + dx, ky + dy, kd + dd
    circles.setdefault(pid, []).append((nx, ny, nd)); log.setdefault(pid, []).append('%+.1f,%+.1f d%+.1f' % (dx, dy, dd))
    return '%s--kx: %.1fpx; --ky: %.1fpx; --kd: %.1fpx;' % (m.group(2), nx, ny, nd)
css = re.sub(PAT, repl, css)
open('style.css', 'w', encoding='utf8', newline='').write(css)
# overlay sheet for eyeballing the fits
from PIL import ImageDraw
sh = Image.new('RGB', (max(1, len(imgs)) * 204, 300), 'black')
for n, (pid, K) in enumerate(imgs.items()):
    im = Image.fromarray(K.astype('uint8')).resize((200, round(K.shape[0] * 200 / K.shape[1]))); d = ImageDraw.Draw(im)
    for x, y, k in circles[pid]: d.ellipse((x - k / 2, y - k / 2, x + k / 2, y + k / 2), outline=(0, 255, 0)); d.point((x, y), (255, 0, 255))
    sh.paste(im.crop((0, 0, 200, 300)), (n * 204, 0))
sh.save(os.path.join(os.environ.get('TEMP', '.'), 'knobfit-check.png'))
for k, v in log.items(): print(k, ' | '.join(v))
