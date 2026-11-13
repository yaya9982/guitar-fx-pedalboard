# Split each photo knob into a rotating "cap" (pointer + texture, lighting flattened) and a static
# "light" map (the photo's shading + drop shadow, applied with mix-blend-mode: multiply).
# At rest cap*light == the original photo. usage: python -I knobsplit.py <repo> <geo.txt> [ids]
import sys, os, numpy as np
from PIL import Image, ImageFilter
repo, geo = sys.argv[1:3]; only = set(sys.argv[3:])
G = {}
for part in open(geo).read().split('#'):
    w = part.split(); 
    if not w: continue
    pid, rest = w[0], ' '.join(w[1:]); ks = [list(map(float, k.split())) for k in rest.split('/') if k.strip()]
    if ks: G[pid] = ks
os.makedirs(os.path.join(repo, 'img', 'knobs'), exist_ok=True)

def split(K, cx, cy, R):
    H, W = K.shape[:2]; x0, x1 = max(0, int(cx - R - 2)), min(W, int(cx + R + 3)); y0, y1 = max(0, int(cy - R - 2)), min(H, int(cy + R + 3))
    yy, xx = np.mgrid[y0:y1, x0:x1]; dx, dy = xx - cx, yy - cy; r = np.hypot(dx, dy); th = np.arctan2(dy, dx)
    Y = K[y0:y1, x0:x1, :3] @ [.299, .587, .114]
    B = np.stack([np.ones_like(th), np.cos(th), np.sin(th), np.cos(2 * th), np.sin(2 * th)], -1)
    ptr = np.abs(np.angle(np.exp(1j * (th + np.pi / 2)))) < np.radians(35)   # pointer drawn at 12 o'clock
    g = np.ones_like(Y); ring = np.floor(r).astype(int)
    for i in range(int(R) + 1):
        m = ring == i; fit = m & ~ptr
        if fit.sum() < 8: continue
        c, *_ = np.linalg.lstsq(B[fit], Y[fit], rcond=None)
        if c[0] < 4: continue
        L = B[m] @ c; g[m] = np.clip(L / c[0], .15, 4); g[m] /= g[m].max()      # per-ring gain, max 1
    g = np.array(Image.fromarray((g * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255
    g = np.clip(g, .45, 1)   # deeper shadows would blow the de-lit cap out to white
    a = np.clip((R - r) / (.14 * R), 0, 1)                                       # feathered rim
    lv = 1 - a * (1 - g)                                                          # same faded gain for both layers
    cap = np.zeros((y1 - y0, x1 - x0, 4)); cap[..., :3] = np.clip(K[y0:y1, x0:x1, :3] / lv[..., None], 0, 255); cap[..., 3] = a * 255
    light = np.zeros_like(cap); light[..., :3] = (lv * 255)[..., None]; light[..., 3] = (r <= R) * 255
    return (y0, y1, x0, x1), cap, light

for pid, ks in G.items():
    if only and pid not in only: continue
    src = os.path.join(repo, 'img', pid + ('.jpg' if pid == 'reverb' else '.webp'))
    K = np.array(Image.open(src).convert('RGB')).astype(float); H, W = K.shape[:2]; f = W / 200
    cap = np.zeros((H, W, 4)); light = np.zeros((H, W, 4))
    for kx, ky, kd in ks:
        (y0, y1, x0, x1), c, l = split(K, kx * f, ky * f, kd / 2 * f)
        m = c[..., 3:] > 0; cap[y0:y1, x0:x1] = np.where(m, c, cap[y0:y1, x0:x1])
        m = l[..., 3:] > 0; light[y0:y1, x0:x1] = np.where(m, l, light[y0:y1, x0:x1])
    for name, arr in (('cap', cap), ('light', light)):
        Image.fromarray(arr.round().astype('uint8')).save(os.path.join(repo, 'img', 'knobs', f'{pid}-{name}.webp'), quality=92)
    # self-check: at rest cap*light reproduces the photo inside the knobs
    c, l = cap[..., :3] / 255, light[..., :3] / 255; ins = (light[..., 3] == 255)
    err = np.abs(c * l * 255 - K)[ins].mean() if ins.any() else 0
    print(pid, len(ks), 'rest err %.2f' % err)
