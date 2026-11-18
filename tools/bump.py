# Bump the ?v= cache strings after image/CSS/JS changes. usage: python tools/bump.py
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
def sub(path, pat):
    p = os.path.join(R, path); s = open(p, encoding='utf-8').read()
    s = re.sub(pat, lambda m: m.group(1) + str(int(m.group(2)) + 1), s)
    open(p, 'w', encoding='utf-8', newline='').write(s)
sub('index.html', r'(style\.css\?v=)(\d+)')
for f in ('js/ui.js', 'js/audio-engine.js', 'js/amp-registry.js', 'test-layout.html'):
    sub(f, r'(pedal-registry\.js\?v=)(\d+)')
for f in ('js/main.js',):
    sub(f, r"(ui\.js\?v=)(\d+)"); sub(f, r"(audio-engine\.js\?v=)(\d+)")
sub('test-layout.html', r'(ui\.js\?v=)(\d+)')
for f in ('js/audio-engine.js', 'js/ui.js', 'test-layout.html'):
    sub(f, r'(amp-registry\.js\?v=)(\d+)')
sub('index.html', r'(main\.js\?v=)(\d+)')
print('bumped')
