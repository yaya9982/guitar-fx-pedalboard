# Turn Gemini's cable photos into the two textures the patch cables are drawn from.
# usage: python -I tools/cabletex.py <section.png> <plug.png>
#   section: one straight horizontal cable running off both edges, on chroma green
#            -> img/cable-tile.webp: straightened, cropped to the cable, seamless left/right.
#   plug:    one horizontal 1/4" plug, tip pointing right, cable leaving left
#            -> img/cable-plug.webp: cropped to the plug (cable trimmed), same height scale as the tile.
# ui.js (updateChainWires) sweeps the tile along every cable path and draws the plug at each jack.
import sys, numpy as np
from PIL import Image
src = open('tools/split.py', encoding='utf8').read()
ns = {}; exec(src[src.index('import re'):src.index('TH =')], ns); key = ns['key']   # same keyer as the skins

TILE_H = 48            # px across the cable in the texture (drawn at ~8.6 px, so ~5x for crisp hi-dpi)

def centre_rows(alpha):
    """Per column: centre and half-thickness of the cable (alpha > .5)."""
    m = alpha > 128; ys = np.arange(m.shape[0])[:, None]
    n = m.sum(0); c = (m * ys).sum(0) / np.maximum(n, 1)
    return c, n / 2, n > 0

def section(path):
    A = key(Image.open(path)).astype(float)
    c, half, ok = centre_rows(A[..., 3])
    cols = np.where(ok & (half > np.median(half[ok]) * .8))[0]
    x0, x1 = cols[0] + 8, cols[-1] - 8                         # drop the frame-edge columns
    r = int(np.ceil(np.median(half[x0:x1]) * 1.12))            # keep the fuzzy fibre edge
    H = 2 * r
    out = np.zeros((H, x1 - x0, 4))
    for j, x in enumerate(range(x0, x1)):                      # straighten: re-centre every column
        y = int(round(c[x]))
        lo, hi = y - r, y + r
        col = A[max(lo, 0):min(hi, A.shape[0]), x]
        out[max(0, -lo):max(0, -lo) + len(col), j] = col
    # seamless: cut at the length (>= 60% of the strip) where the braid best lines up with
    # its own start (normalised correlation of the luminance), then blend a short overlap
    L = out[..., :3].mean(-1); L = L - L.mean(0)
    n = L.shape[1]; F = 24; a = L[:, :F].ravel()
    def corr(p):
        b = L[:, p:p + F].ravel(); return (a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9)
    p = max(range(int(n * .6), n - F), key=corr)
    t = np.linspace(0, 1, F)[None, :, None]
    out[:, :F] = out[:, p:p + F] * (1 - t) + out[:, :F] * t
    out = out[:, :p]
    print('tile period', p, 'corr %.2f' % corr(p))
    im = Image.fromarray(np.clip(out, 0, 255).astype('uint8'))
    return im.resize((round(im.width * TILE_H / H), TILE_H), Image.LANCZOS), H

def plug(path, cable_h):
    A = key(Image.open(path)).astype(float); al = A[..., 3] > 128
    c, half, ok = centre_rows(A[..., 3])
    cols = np.where(ok)[0]
    tipx = cols[-1]
    cable = np.median(half[cols[0]:cols[0] + 40]) * 2           # cable thickness at the left edge
    wide = np.where(half[cols] * 2 > cable * 1.25)[0]            # strain relief / barrel start
    x0 = max(cols[0], cols[wide[0]] - int(cable * 1.5)) if len(wide) else cols[0]
    rows = np.where(al[:, x0:tipx + 1].any(1))[0]
    im = Image.fromarray(A.astype('uint8')).crop((x0, rows[0], tipx + 1, rows[-1] + 1))
    s = TILE_H / cable                                           # same cable scale as the tile
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)

if __name__ == '__main__':
    tile, h = section(sys.argv[1])
    tile.save('img/cable-tile.webp', quality=90)
    p = plug(sys.argv[2], h)
    p.save('img/cable-plug.webp', quality=90)
    print('tile', tile.size, 'plug', p.size)
