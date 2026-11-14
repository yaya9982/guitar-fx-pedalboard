# Turn Gemini's amp images into a photo skin: knobless body + one knob sprite.
# usage: python -I tools/ampskin.py <id> <full.png> <body.png> <knob.png> [label colour]
#   writes img/<id>-body.webp (1300x650, the amp slot's footprint) and img/<id>-knob.webp,
#   sets the registry skin, and writes this amp's knob nudges into style.css (ampskin block).
#   Knobs are found in the full image by matching the knob sprite.
import re, sys, numpy as np
from PIL import Image
sys.path.insert(0, 'tools')
src = open('tools/split.py', encoding='utf8').read()
ns = {}; exec(src[src.index('import re'):src.index('TH =')], ns); key = ns['key']

W, H = 1300, 650
APP_X = [165 + 194 * i for i in range(6)]; APP_Y = 99   # live knob centres in the unit (renderAmp layout)

def ncc(img, tpl):  # normalised cross-correlation (valid region) via FFT
    th, tw = tpl.shape; t = tpl - tpl.mean(); t /= np.sqrt((t * t).sum()) + 1e-9
    F = np.fft.rfft2(img); T = np.fft.rfft2(t[::-1, ::-1], img.shape)
    num = np.fft.irfft2(F * T, img.shape)[th - 1:, tw - 1:]
    c1 = np.cumsum(np.cumsum(np.pad(img, ((1, 0), (1, 0))), 0), 1); c2 = np.cumsum(np.cumsum(np.pad(img * img, ((1, 0), (1, 0))), 0), 1)
    win = lambda c: c[th:, tw:] - c[:-th, tw:] - c[th:, :-tw] + c[:-th, :-tw]
    n = th * tw; var = win(c2) - win(c1) ** 2 / n
    return num / np.sqrt(np.maximum(var, 1e-6))

def knobs_diff(full, body):  # knobs = strong changes between the full image and the knobless body
    d = np.abs(full[..., :3] - body[..., :3]).sum(-1) > 150
    d[int(H * .4):] = 0
    cols = np.where(d.sum(0) > 8)[0]
    groups = [g for g in np.split(cols, np.where(np.diff(cols) > 8)[0] + 1) if len(g) > 15]
    out = []
    for g in groups:
        ys = np.where(d[:, g[0]:g[-1] + 1].sum(1) > 4)[0]
        out.append(((g[0] + g[-1]) / 2, (ys[0] + ys[-1]) / 2, max(len(g), ys[-1] - ys[0] + 1)))   # pointer knobs: long axis sets the size
    return out

def knobs(full, sprite):
    """Find the six knobs in the top strip of the full image by matching the knob sprite
    (grey levels, a few sizes); returns (x, y, diameter) left to right."""
    g = full[: int(H * .45), :, :3].mean(-1)
    best = None
    for d in range(50, 131, 6):
        t = np.array(sprite.convert('L').resize((d, d), Image.LANCZOS)).astype(float)
        c = ncc(g, t); peaks = []; cc = c.copy()
        for _ in range(6):
            y, x = np.unravel_index(cc.argmax(), cc.shape); peaks.append((cc[y, x], x + d / 2, y + d / 2))
            cc[max(0, y - d):y + d, max(0, x - d):x + d] = -1
        score = sum(p[0] for p in peaks)
        if best is None or score > best[0]: best = (score, d, peaks)
    _, d, peaks = best
    return sorted((x, y, d) for _, x, y in peaks)

if __name__ == '__main__':
    pid, fullf, bodyf, knobf = sys.argv[1:5]; label = sys.argv[5] if len(sys.argv) > 5 else None
    B = key(Image.open(bodyf)); al = B[..., 3] > 128
    rows = np.where(al.sum(1) > .3 * al.sum(1).max())[0]; cols = np.where(al.sum(0) > .3 * al.sum(0).max())[0]
    box = (cols[0], rows[0], cols[-1] + 1, rows[-1] + 1)
    body = Image.fromarray(B.astype('uint8')).crop(box).resize((W, H), Image.LANCZOS)
    full = Image.fromarray(key(Image.open(fullf)).astype('uint8')).resize(Image.open(bodyf).size).crop(box).resize((W, H), Image.LANCZOS)
    body.save('img/%s-body.webp' % pid, quality=90)
    K = key(Image.open(knobf)); m = K[..., 3] > 128; ys, xs = np.where(m)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2; r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 2
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    K[..., 3] = np.minimum(K[..., 3], np.clip(r - np.hypot(xx - cx, yy - cy), 0, 1) * 255)
    Image.fromarray(K.astype('uint8')).crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((176, 176), Image.LANCZOS).save('img/%s-knob.webp' % pid, quality=94)
    F = np.array(full).astype(float); ks = knobs_diff(F, np.array(body).astype(float))
    if len(ks) != 6 or max(k[2] for k in ks) > 160:   # Gemini repainted the whole panel: match the sprite instead
        ks = knobs(F, Image.open('img/%s-knob.webp' % pid))
    kd = np.median([k[2] for k in ks])
    sel = '.amp-photo[data-amp-type="%s"]' % pid
    css = ['%s .knob-dial-wrap { scale: %.3f; }' % (sel, kd / 62)]   # scale, not zoom: keeps the label/slider layout put
    css += ['%s .knob-row:nth-child(%d) { translate: %.1fpx %.1fpx; }' % (sel, i + 1, k[0] - APP_X[i], k[1] - APP_Y) for i, k in enumerate(ks)]
    s = open('style.css', encoding='utf8').read()
    s = re.sub(r'\n%s[^\n]*' % re.escape(sel), '', s)
    s = s.replace('/* ampskin:end */', '\n'.join(css) + '\n/* ampskin:end */')
    open('style.css', 'w', encoding='utf8', newline='').write(s)
    reg = open('js/amp-registry.js', encoding='utf8').read()
    skin = "skin: { src: 'img/%s-body.webp', knob: 'img/%s-knob.webp'%s }," % (pid, pid, ", label: '%s'" % label if label else '')
    m = re.search(r"(    id: '%s',[^\n]*\n)((?:    skin: [^\n]*\n)?)" % pid, reg)
    reg = reg[:m.start()] + m.group(1) + '    ' + skin + '\n' + reg[m.end():]
    open('js/amp-registry.js', 'w', encoding='utf8', newline='').write(reg)
    print(pid, 'knobs', [(round(x), round(y), w) for x, y, w in ks], 'kd', kd)
