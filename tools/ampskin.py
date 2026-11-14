# Turn Gemini's amp images into a photo skin: knobless body + one knob sprite.
# usage: python -I tools/ampskin.py <id> <full.png> <body.png> <knob.png> [label colour]
#   writes img/<id>-body.webp (1300x650, the amp slot's footprint) and img/<id>-knob.webp,
#   sets the registry skin, and writes this amp's knob nudges into style.css (ampskin block).
#   Knobs are found where the full image differs from the knobless body.
import re, sys, numpy as np
from PIL import Image
sys.path.insert(0, 'tools')
src = open('tools/split.py', encoding='utf8').read()
ns = {}; exec(src[src.index('import re'):src.index('TH =')], ns); key = ns['key']

W, H = 1300, 650
APP_X = [165 + 194 * i for i in range(6)]; APP_Y = 99   # live knob centres in the unit (renderAmp layout)

def knobs(full, body):
    d = np.abs(full[..., :3] - body[..., :3]).sum(-1) > 150   # only strong changes: knobs, not Gemini's slight repaint
    d[int(H * .4):] = 0                                   # knobs live in the top strip
    cols = np.where(d.sum(0) > 8)[0]
    groups = [g for g in np.split(cols, np.where(np.diff(cols) > 8)[0] + 1) if len(g) > 15]
    out = []
    for g in groups:
        ys = np.where(d[:, g[0]:g[-1] + 1].sum(1) > 4)[0]
        out.append(((g[0] + g[-1]) / 2, (ys[0] + ys[-1]) / 2, max(len(g), ys[-1] - ys[0] + 1)))   # pointer knobs: the long axis sets the sprite size
    return out

if __name__ == '__main__':
    pid, fullf, bodyf, knobf = sys.argv[1:5]; label = sys.argv[5] if len(sys.argv) > 5 else None
    B = key(Image.open(bodyf)); al = B[..., 3] > 128
    rows = np.where(al.sum(1) > .3 * al.sum(1).max())[0]; cols = np.where(al.sum(0) > .3 * al.sum(0).max())[0]
    box = (cols[0], rows[0], cols[-1] + 1, rows[-1] + 1)
    body = Image.fromarray(B.astype('uint8')).crop(box).resize((W, H), Image.LANCZOS)
    full = Image.fromarray(key(Image.open(fullf)).astype('uint8')).resize(Image.open(bodyf).size).crop(box).resize((W, H), Image.LANCZOS)
    body.save('img/%s-body.webp' % pid, quality=90)
    ks = knobs(np.array(full).astype(float), np.array(body).astype(float))
    assert len(ks) == 6, ks
    K = key(Image.open(knobf)); m = K[..., 3] > 128; ys, xs = np.where(m)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2; r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 2
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    K[..., 3] = np.minimum(K[..., 3], np.clip(r - np.hypot(xx - cx, yy - cy), 0, 1) * 255)
    Image.fromarray(K.astype('uint8')).crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((176, 176), Image.LANCZOS).save('img/%s-knob.webp' % pid, quality=94)
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
