"""post_pw.py FILE - @ashvale's release note on the feed through Chromium (tools/pw_send.py; ashvale_daily.py --post does
the same through Firefox, which will not unlock @ashvale since 2026-10-04). FILE: one post per paragraph, each <= 280
characters, the first as the post and the rest as replies under it (--thread-only: only the replies). Refuses text that names another game."""
import sys, os, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from pw_send import AshvaleBrowser, APP
BANNED = re.compile(r'runescape|old school|osrs|warcraft|minecraft', re.I)
parts = [p.strip() for p in open(sys.argv[1]).read().split('\n\n') if p.strip()]
for p in parts:
    if len(p) > 280 or BANNED.search(p): sys.exit('REFUSED (over 280 characters or names another game): ' + p[:80])
with AshvaleBrowser() as B:
    pg = B.pg; pg.goto(APP + '/feed'); pg.wait_for_timeout(8000)
    if '--thread-only' not in sys.argv:
        pg.fill('#account-say', parts[0]); pg.click('#account-post'); pg.wait_for_timeout(6000); B.confirm_card()
        print('posted:', parts[0][:70], flush=True)
    key = None
    for _ in range(12):
        pg.goto(APP + '/feed'); pg.wait_for_timeout(8000)
        key = pg.evaluate("t => { for (const p of document.querySelectorAll('.feedpost')) if ((p.innerText || '').includes(t)) return p.dataset.key; return null; }", parts[0][:60])
        if key: break
        time.sleep(15)
    if not key: sys.exit('could not find the post to comment under')
    print('post', APP + '/feed?post=' + key, flush=True)
    for p in parts[1:]:   # the same steps as ashvale_daily._reply: the post's Reply button opens its form (id in its onclick)
        pg.goto(APP + '/feed?post=' + key); pg.wait_for_timeout(8000)
        post = pg.locator('.feedpost').filter(has_text=parts[0][:60]).first
        rb = post.locator("xpath=.//button[starts-with(normalize-space(.),'Reply')]").first
        rid = (rb.get_attribute('onclick') or "'").split("'")[1]
        rb.click(); pg.wait_for_timeout(2000)
        f = pg.locator('#' + rid); f.locator('input[name=text]').first.fill(p); f.locator('button[type=submit]').first.click()
        pg.wait_for_timeout(6000); B.confirm_card(); print('reply:', p[:60], flush=True)
