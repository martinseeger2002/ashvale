/* play_lib.js - the test player's toolbox, loaded into every tools/live_play.py run (inside the live game frame, where
   window.ASH is the game). Every function waits until its action is done (or times out) and returns what happened.
   Play fair on the live game: use only what a player can do (no ASH.give / ASH.teleport there).
   The lines starting with three slashes are the reference that tools/make_play_guide.js copies into handoff/play_guide.md. */
/// sleep(ms)                          wait
/// me()                               {x, y, hp, maxHp, energy, burden, zone, hawk}
/// bag()                              {itemId: count} of what you carry (bag + worn)
/// chat(n=8)                          the last n chat lines (what NPCs said, "You get some logs", warnings)
/// walkTo(x, y, ms=90000)             walk there; true when you arrive
/// talk(npcId)                        walk to an NPC and talk; returns the chat lines it produced (quest dialogue, gifts)
/// nearest(monsterKey)                the nearest living monster of that kind {uid, x, y, hp} or null
/// kill(monsterKey, ms=120000)        fight the nearest one until it dies (eats food when HP is low); true if it died
/// killN(monsterKey, n)               kill n of them, one after another; returns how many died
/// pickUp(radius=4)                   take everything lying within radius; returns item ids taken
/// gatherAt(x, y, ms=60000)           chop / mine / fish / cook at that spot until it stops; returns what you gained
/// gatherN(itemId, n, radius=60)      find spots that give itemId and gather until you carry n; returns the count
/// eat()                              eat the first food in your bag
/// equip(itemId)                      wear / wield it from your bag
/// buy(npcId, itemId, n=1)            buy from that shopkeeper
/// sell(npcId, itemId, n=1)           sell to that shopkeeper
/// useItem(itemId)                    use it (light logs, the Ashvale stone, ...)
/// travel(townId)                     walk to the nearest town portal and travel to an attuned town
/// quests()                           {ids: your quest states, panel: the Quests panel text}
/// report(label)                      {label, me, bag, quests, chat} - a snapshot to log in handoff/qwen_quest_bugs.md
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = () => { const p = ASH.me; return { x: p.x, y: p.y, hp: p.hp, maxHp: ASH.core.maxHp(p), energy: p.energy, burden: p.burden || 0, zone: ASH.core.zoneOf ? ASH.core.zoneOf(p.x, p.y) : null, hawk: !!(ASH.core.isHawk && ASH.core.isHawk(p)) }; };
const bag = () => { const o = {}; for (const s of ASH.me.inv) if (s) o[s.id] = (o[s.id] || 0) + s.n; for (const s of Object.values(ASH.me.eq || {})) if (s) o[s.id] = (o[s.id] || 0) + s.n; return o; };
const chatEl = () => [...document.querySelectorAll('.ash *')].find(e => e.children.length > 2 && /Welcome to Ashvale/.test(e.innerText || '') && (e.innerText || '').length < 8000);
const chat = (n = 8) => { const e = chatEl(); return e ? e.innerText.split('\n').filter(Boolean).slice(-n) : []; };
const until = async (fn, ms, step = 400) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
const cmd = c => ASH.core.cmd('me', c);
async function walkTo(x, y, ms = 90000) { cmd({ c: 'walk', x, y }); return until(() => ASH.me.x === x && ASH.me.y === y || (!ASH.me.path.length && Math.max(Math.abs(ASH.me.x - x), Math.abs(ASH.me.y - y)) <= 1), ms); }
async function talk(id) { const before = chat(40).length; cmd({ c: 'npc', id }); await until(() => !ASH.me.act || ASH.me.act.k !== 'npc', 60000); await sleep(1500); const after = chat(40); return after.slice(Math.max(0, before - 40 + after.length - 40)); }
function nearest(key) { let best = null, bd = 1e9; for (const m of ASH.core.S.mobs) if (m.key === key && !m.dead) { const d = Math.max(Math.abs(m.x - ASH.me.x), Math.abs(m.y - ASH.me.y)); if (d < bd) { bd = d; best = m; } } return best && { uid: best.uid, x: best.x, y: best.y, hp: best.hp, dist: bd }; }
async function eat() { const i = ASH.me.inv.findIndex(s => s && ASH.core.item(s.id).edible); if (i < 0) return false; cmd({ c: 'eat', slot: i }); await sleep(1200); return true; }
async function kill(key, ms = 120000) {
  const t = nearest(key); if (!t) return false; cmd({ c: 'attack', uid: t.uid });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = ASH.core.mobByUid(t.uid); if (!m || m.dead) { await sleep(1500); return true; }
    if (ASH.me.hp < ASH.core.maxHp(ASH.me) * 0.4) { await eat(); cmd({ c: 'attack', uid: t.uid }); }
    if (!ASH.me.act) cmd({ c: 'attack', uid: t.uid });
    if (ASH.me.dead) return false;
    await sleep(600);
  }
  return false;
}
async function killN(key, n) { let k = 0; for (let i = 0; i < n * 3 && k < n; i++) { if (!nearest(key)) { await sleep(5000); continue; } if (await kill(key)) { k++; await pickUp(3); } } return k; }
async function pickUp(r = 4) { const got = []; for (const g of ASH.core.S.ground.slice()) { if (Math.max(Math.abs(g.x - ASH.me.x), Math.abs(g.y - ASH.me.y)) > r) continue; cmd({ c: 'take', uid: g.uid }); await until(() => !ASH.core.S.ground.some(q => q.uid === g.uid), 15000); got.push(g.id); } return got; }
async function gatherAt(x, y, ms = 60000) { const b0 = bag(); cmd({ c: 'gather', x, y }); await sleep(1500); await until(() => !ASH.me.act && !ASH.me.skilling, ms, 600); const b1 = bag(), d = {}; for (const k in b1) if ((b1[k] || 0) > (b0[k] || 0)) d[k] = b1[k] - (b0[k] || 0); return d; }
function spotsFor(itemId, r) { const out = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const n = ASH.core.nodeAt(ASH.core.idx(ASH.me.x + dx, ASH.me.y + dy)); if (n && n.item === itemId) out.push([n.x, n.y, Math.max(Math.abs(dx), Math.abs(dy))]); } return out.sort((a, b) => a[2] - b[2]); }
async function gatherN(itemId, n, r = 60) { for (let i = 0; i < n * 4 && (bag()[itemId] || 0) < n; i++) { const s = spotsFor(itemId, r)[i % 5]; if (!s) break; await gatherAt(s[0], s[1]); } return bag()[itemId] || 0; }
async function equip(id) { const i = ASH.me.inv.findIndex(s => s && s.id === id); if (i < 0) return false; cmd({ c: 'equip', slot: i }); await sleep(1200); return true; }
async function useItem(id) { const i = ASH.me.inv.findIndex(s => s && s.id === id); if (i < 0) return false; cmd({ c: 'use', slot: i }); await sleep(2000); return true; }
async function buy(npc, item, n = 1) { cmd({ c: 'npc', id: npc }); await until(() => ASH.me.shop, 60000); const sh = ASH.me.shop; if (!sh) return false; cmd({ c: 'buy', shop: sh, item, n }); await sleep(1500); return (bag()[item] || 0) > 0; }
async function sell(npc, item, n = 1) { cmd({ c: 'npc', id: npc }); await until(() => ASH.me.shop, 60000); const i = ASH.me.inv.findIndex(s => s && s.id === item); if (!ASH.me.shop || i < 0) return false; cmd({ c: 'sell', shop: ASH.me.shop, slot: i, n }); await sleep(1500); return true; }
async function travel(town) { const P = ASH.core.M.npcs.filter(n => n.portal).sort((a, b) => Math.max(Math.abs(a.x - ASH.me.x), Math.abs(a.y - ASH.me.y)) - Math.max(Math.abs(b.x - ASH.me.x), Math.abs(b.y - ASH.me.y)))[0]; if (!P) return false; await talk(P.id); cmd({ c: 'portal', to: town }); await sleep(2500); return true; }
function quests() { ASH.hud.setTab && ASH.hud.setTab('quest'); const p = document.querySelector('.ash .panel'); return { ids: JSON.parse(JSON.stringify(ASH.me.quests || {})), panel: p ? p.innerText : '' }; }
function report(label) { return { label, me: me(), bag: bag(), quests: quests(), chat: chat(12) }; }
