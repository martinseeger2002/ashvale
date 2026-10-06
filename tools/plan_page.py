"""plan_page.py - render PLAN.md as playtest/plan_page.html (the page the operator reads on his phone)."""
import re, html, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
md = open(os.path.join(R, 'PLAN.md')).read()
def inline(t):
    t = html.escape(t); t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t); return re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
out = []; inl = None
for line in md.splitlines():
    if line.startswith('# '): out.append(f'<h1>{inline(line[2:])}</h1>'); continue
    if line.startswith('## '):
        if inl: out.append(f'</{inl}>'); inl = None
        out.append(f'<h2>{inline(line[3:])}</h2>'); continue
    m = re.match(r'^(\d+)\. (.*)', line)
    if line.startswith('- ') or m:
        tag = 'ol' if m else 'ul'
        if inl != tag:
            if inl: out.append(f'</{inl}>')
            out.append(f'<{tag}>'); inl = tag
        out.append('<li>' + inline(m.group(2) if m else line[2:])); continue
    if line.startswith('  ') and inl: out[-1] += ' ' + inline(line.strip()); continue
    if not line.strip():
        if inl: out.append(f'</{inl}>'); inl = None
        continue
    out.append(f'<p>{inline(line)}</p>')
if inl: out.append(f'</{inl}>')
css = ''':root{--bg:#f6f1e7;--ink:#2a2118;--muted:#6b5d4d;--accent:#8a3a1e;--rule:#d9cdb8;--code:#ece3d2;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17130f;--ink:#ece3d2;--muted:#b0a28e;--accent:#e08a5a;--rule:#3a3027;--code:#262019;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17130f;--ink:#ece3d2;--muted:#b0a28e;--accent:#e08a5a;--rule:#3a3027;--code:#262019;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:16px/1.6 Georgia,"Iowan Old Style",serif;padding-inline:16px;padding-block:24px 48px}
main{max-width:68ch;margin:0 auto}
h1{font-size:1.9rem;line-height:1.2;color:var(--accent);text-wrap:balance;margin:.2em 0 .4em}
h2{font-size:1.15rem;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);border-top:1px solid var(--rule);padding-top:1em;margin-top:1.8em}
p{color:var(--muted)} li{margin:.45em 0} strong{color:var(--ink)}
code{font:.85em ui-monospace,Menlo,monospace;background:var(--code);padding:.1em .35em;border-radius:4px;overflow-wrap:anywhere}'''
open(os.path.join(R, 'playtest', 'plan_page.html'), 'w').write('<title>Ashvale Build Plan</title>\n<style>\n' + css + '\n</style>\n<main>\n' + '\n'.join(out) + '\n</main>')
print('ok')
