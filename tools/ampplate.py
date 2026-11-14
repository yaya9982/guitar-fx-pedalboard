# Wipe the text Gemini printed on an amp's nameplate, so the live label (styled per amp in
# style.css) can sit there in a chosen font.
# usage: python -I tools/ampplate.py <id> x0 y0 x1 y1
#   (x0..x1, y0..y1) = the text area inside the plate, in img/<id>-body.webp pixels (1300x650).
#   Each row is refilled by blending the plate surface just left and right of the box, which
#   keeps horizontal brushing; the box's position is printed as CSS % for the label.
import sys, numpy as np
from PIL import Image

pid = sys.argv[1]; x0, y0, x1, y1 = map(int, sys.argv[2:6])
path = 'img/%s-body.webp' % pid
im = Image.open(path).convert('RGBA'); a = np.array(im).astype(float)
L = a[y0:y1, x0 - 6:x0].mean(1); R = a[y0:y1, x1:x1 + 6].mean(1)       # plate just outside the text, per row
t = np.linspace(0, 1, x1 - x0)[None, :, None]
fill = L[:, None, :] * (1 - t) + R[:, None, :] * t
grain = np.random.default_rng(1).normal(0, 2.5, fill.shape[:2])[..., None] * [1, 1, 1, 0]   # faint fresh grain, so the fill isn't flat
a[y0:y1, x0:x1] = np.clip(fill + grain, 0, 255)
Image.fromarray(a.astype('uint8')).save(path, quality=90)
W, H = im.size
print('left: %.2f%%; top: %.2f%%; width: %.2f%%; height: %.2f%%;' % (100 * x0 / W, 100 * y0 / H, 100 * (x1 - x0) / W, 100 * (y1 - y0) / H))
