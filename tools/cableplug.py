# Render the 1/4" plug sprite for the patch cables (img/cable-plug.webp), in the same pixel
# scale as img/cable-tile.webp (cable = 43 px across): shaded cylinders, not a photo, because
# the image model's quota ran out; only the ~7 px collar shows past each pedal's edge.
# usage: python -I tools/cableplug.py      Tip points right (+x); the cable joins at x = 0.
import numpy as np
from PIL import Image

SS = 3                                     # supersample
# (length, radius at start, radius at end, base rgb, specular, grain) left -> right
PARTS = [
    (34, 21, 25, (22, 22, 24), .25, 4),       # rubber strain relief
    (96, 31, 31, (92, 95, 100), .85, 7),      # gunmetal barrel
    (6, 31, 20, (70, 72, 76), .6, 3),         # barrel shoulder
    (8, 15, 15, (16, 16, 16), .2, 2),         # black insulator
    (64, 14, 14, (205, 160, 70), .9, 3),      # gold shaft
    (6, 14, 11, (16, 16, 16), .2, 2),         # tip insulator ring
    (14, 12, 12, (210, 165, 72), .9, 3),      # gold tip neck
    (14, 12, 0.5, (215, 170, 76), .9, 3),     # gold tip cone
]
H = 2 * 32 + 2
L = sum(p[0] for p in PARTS)
W2, H2 = L * SS, H * SS
img = np.zeros((H2, W2, 4))
rng = np.random.default_rng(3)
ys = (np.arange(H2) + .5) / SS - H / 2
x0 = 0
for length, r0, r1, rgb, spec, grain in PARTS:
    xs = np.arange(int(x0 * SS), int((x0 + length) * SS))
    t = (xs / SS - x0) / length
    r = r0 + (r1 - r0) * t                                   # radius along this part
    n = ys[:, None] / r[None, :]                             # -1..1 across the cylinder
    inside = np.abs(n) < 1
    nz = np.sqrt(np.clip(1 - n * n, 0, 1))                   # surface facing the camera
    light = .28 + .72 * nz ** 1.4                            # lit from straight above
    hl = spec * np.exp(-((n + .28) / .16) ** 2)              # specular band just above centre
    g = rng.normal(0, grain, (H2, 1)) + rng.normal(0, grain * .4, (H2, len(xs)))   # lengthwise brushing
    col = np.array(rgb)[None, None, :] * light[..., None] + 255 * hl[..., None] + g[..., None]
    a = np.clip((1 - np.abs(n)) * r[None, :] * SS, 0, 1) * inside   # soft 1px silhouette edge
    img[:, xs, :3] = np.where(inside[..., None], col, img[:, xs, :3])
    img[:, xs, 3] = np.maximum(img[:, xs, 3], a * 255)
    x0 += length
im = Image.fromarray(np.clip(img, 0, 255).astype('uint8')).resize((L, H), Image.LANCZOS)
im.save('img/cable-plug.webp', quality=92)
print('plug', im.size)
