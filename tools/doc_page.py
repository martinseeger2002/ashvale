"""doc_page.py <in.md> <out.html> <title> - render one of our markdown docs (headings, lists, tables, code) as a
phone-friendly private page (same look as plan_page.py)."""
import re, html, sys
src, dst, title = sys.argv[1], sys.argv[2], sys.argv[3]
def inline(t):
    t = html.escape(t); t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t); return re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
out, inl, code, table = [], None, None, None
def close():
    global inl, table
    if inl: out.append(f'</{inl}>'); inl = None
    if table is not None:
        out.append('<div class="tw"><table>' + ''.join(table) + '</table></div>'); table = None
for line in open(src).read().splitlines():
    if line.startswith('```'):
        if code is None: close(); code = []
        else: out.append('<pre>' + html.escape('\n'.join(code)) + '</pre>'); code = None
        continue
    if code is not None: code.append(line); continue
    if line.startswith('|'):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if all(re.fullmatch(r':?-+:?', c) for c in cells): continue
        if table is None: close(); table = []; tag = 'th'
        else: tag = 'td'
        table.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in cells) + '</tr>'); continue
    if table is not None and not line.startswith('|'): close()
    if line.startswith('# '): close(); out.append(f'<h1>{inline(line[2:])}</h1>'); continue
    if line.startswith('## '): close(); out.append(f'<h2>{inline(line[3:])}</h2>'); continue
    m = re.match(r'^(\d+)\. (.*)', line)
    if line.startswith('- ') or m:
        tag = 'ol' if m else 'ul'
        if inl != tag:
            close(); out.append(f'<{tag}>'); inl = tag
        out.append('<li>' + inline(m.group(2) if m else line[2:])); continue
    if line.startswith('  ') and inl: out[-1] += ' ' + inline(line.strip()); continue
    if not line.strip(): close(); continue
    close(); out.append(f'<p>{inline(line)}</p>')
close()
css = """:root{--bg:#f6f3ec;--fg:#1f1b14;--mut:#6b5f4b;--acc:#8a4b12;--line:#d9cfbd;--code:#ece5d6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15130f;--fg:#ece5d6;--mut:#a8997e;--acc:#e8a35a;--line:#3a3328;--code:#221e17;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15130f;--fg:#ece5d6;--mut:#a8997e;--acc:#e8a35a;--line:#3a3328;--code:#221e17;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.55 Georgia,'Iowan Old Style',serif}
main{max-width:46rem;margin:0 auto;padding-inline:16px;padding-block:20px 60px}
h1{font-size:1.6rem;line-height:1.2;text-wrap:balance;margin:.2em 0 .6em}
h2{font-size:1.15rem;color:var(--acc);margin:1.8em 0 .5em;border-bottom:1px solid var(--line);padding-bottom:.2em;text-wrap:balance}
li{margin:.25em 0}code{background:var(--code);padding:0 .25em;border-radius:3px;font-size:.88em;font-family:ui-monospace,Menlo,monospace}
pre{background:var(--code);padding:10px 12px;border-radius:6px;overflow-x:auto;font:12px/1.45 ui-monospace,Menlo,monospace}
.tw{overflow-x:auto;margin:.8em 0}table{border-collapse:collapse;font:13px/1.4 system-ui,sans-serif;font-variant-numeric:tabular-nums;min-width:100%}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600}
strong{color:var(--fg)}p{margin:.6em 0}"""
open(dst, 'w').write(f'<title>{html.escape(title)}</title>\n<style>\n{css}\n</style>\n<main>\n' + '\n'.join(out) + '\n</main>')
