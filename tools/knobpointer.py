# Pointer-only knobs: the photographed knob body never rotates (so its lighting, shadow and edge stay
# exactly as shot). The printed pointer is lifted off into a sprite that turns, and the body underneath
# is filled from the knob's own surface either side of it.
#   img/knobs/<id>-base.webp  static knobs with the pointer removed
#   img/knobs/<id>-ptr.webp   the pointer alone (transparent elsewhere), rotated by --knob-angle
# usage: python -I tools/knobpointer.py <repo> tools/knob-geo.txt [ids]   (geo = "id kx ky kd / ... # id ...", 200px basis)
import sys, os, numpy as np
from PIL import Image, ImageFilter
repo, geo = sys.argv[1:3]; only = set(sys.argv[3:])
G = {}
for part in open(geo).read().split('#'):
    w = part.split()
    if w: G[w[0]] = [list(map(float, k.split())) for k in ' '.join(w[1:]).split('/') if k.strip()]

def bil(K, y, x):
    H, W = K.shape[:2]; x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0, y0 = x.astype(int), y.astype(int); fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return (K[y0, x0] * (1 - fx) + K[y0, x0 + 1] * fx) * (1 - fy) + (K[y0 + 1, x0] * (1 - fx) + K[y0 + 1, x0 + 1] * fx) * fy

def knob(K, cx, cy, R):
    H, W = K.shape[:2]; x0, x1 = max(0, int(cx - R - 1)), min(W, int(cx + R + 2)); y0, y1 = max(0, int(cy - R - 1)), min(H, int(cy + R + 2))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float); dx, dy = xx - cx, yy - cy; r = np.hypot(dx, dy) + 1e-6; th = np.arctan2(dy, dx)
    w = .17 * R                                                    # half-width of the strip the pointer lives in (12 o'clock)
    phi = np.clip(2.5 * np.arcsin(np.clip(w / r, 0, 1)), 0, np.pi / 2)   # swing far enough to leave the strip at this radius
    A = bil(K, cy + r * np.sin(th + phi), cx + r * np.cos(th + phi)); B = bil(K, cy + r * np.sin(th - phi), cx + r * np.cos(th - phi))
    fill = (A + B) / 2; orig = K[y0:y1, x0:x1]
    m = np.clip((w - np.abs(dx)) / 2, 0, 1) * np.clip(-dy / 2, 0, 1) * np.clip((.96 * R - r) / 2, 0, 1) * np.clip((r - w) / 2, 0, 1)
    d = np.abs(orig - fill).max(-1) * m; thr = 14
    a = np.clip((d - thr) / 30, 0, 1)                              # pointer = where the photo differs from clean knob surface
    a = np.array(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.7))).astype(float) / 255 * (m > 0)
    base = orig * (1 - m[..., None]) + fill * m[..., None]
    disc = np.clip((R - r) / 1.5, 0, 1)
    return (y0, y1, x0, x1), base, disc, orig, a

os.makedirs(os.path.join(repo, 'img', 'knobs'), exist_ok=True)
for pid, ks in G.items():
    if (only and pid not in only) or not ks: continue
    K = np.array(Image.open(os.path.join(repo, 'img', pid + ('.jpg' if pid == 'reverb' else '.webp'))).convert('RGB')).astype(float)
    H, W = K.shape[:2]; f = W / 200; base = np.zeros((H, W, 4)); ptr = np.zeros((H, W, 4)); cov = []
    for kx, ky, kd in ks:
        (y0, y1, x0, x1), b, disc, o, a = knob(K, kx * f, ky * f, kd / 2 * f)
        sl = (slice(y0, y1), slice(x0, x1)); keep = disc > base[sl][..., 3] / 255
        base[sl] = np.where(keep[..., None], np.dstack([b, disc * 255]), base[sl])
        ptr[sl] = np.where(keep[..., None], np.dstack([o, a * 255]), ptr[sl]); cov.append((a > .5).mean())
    for n, arr in (('base', base), ('ptr', ptr)):
        Image.fromarray(arr.round().astype('uint8')).save(os.path.join(repo, 'img', 'knobs', f'{pid}-{n}.webp'), quality=94)
    assert all(c < .2 for c in cov), (pid, cov)                    # a "pointer" covering >20% of the knob means detection failed
    print(pid, ' '.join('%.3f' % c for c in cov))
