/* ASHVALE 3D net module: other players. The engine only sees this normalized interface:
     const r = await net.join(roomId, {game, loopback})   -> {online, room, why, backend}
     room.me                     {id, tag, address, guest}   (tag without '@'; '' for guests)
     room.send(obj) -> Promise<bool>   never throws or rejects (false = dropped: too big, too fast, not in room)
     room.on('message', fn({from, data})) / on('join', fn({from})) / on('leave', fn({from})) / on('closed', fn(why))
     room.members() -> [player]  ;  room.leave() -> Promise
   A player is {id, tag, address, guest}; remote state is keyed by id. The sender is stamped by the arcade node, never
   taken from the message.
   Backends: the arcade realtime SDK (the page loads /r/realtime.js: window.arcade.realtime; decentralized relays on the
   arcade nodes; join never rejects, room.online false + room.why when unavailable, e.g. in the feed embed); a dev-only
   BroadcastChannel loopback (?loopback: two tabs on the same origin see each other); otherwise {online:false} = solo.
   Rooms are zone ids ('village', 'whisperwood'); game family id 'ashvale' so every version shares rooms. */
(function (G) {
  'use strict';
  const MAX = 512;
  const norm = p => p ? { id: String(p.id || p.address || p.tag || '?'), tag: String(p.tag || '').replace(/^@/, ''), address: p.address || null, guest: !!p.guest } : { id: '?', tag: '', address: null, guest: true };
  function arcadeRoom(r, roomId) {
    const me = norm(r.me);
    const room = {
      id: roomId, me,
      send(obj) {
        try { return Promise.resolve(r.send(obj)).then(() => true, () => false); } catch (e) { return Promise.resolve(false); }
      },
      members() { try { return (r.members() || []).map(norm); } catch (e) { return [me]; } },
      on(t, fn) {
        if (t === 'message') r.on('message', (data, p) => { const from = norm(p); if (from.id !== me.id) fn({ from, data }); });
        else if (t === 'join' || t === 'leave') r.on(t, p => { const from = norm(p); if (from.id !== me.id) fn({ from }); });
        else if (t === 'closed') r.on('closed', why => fn(why));
        return room;
      },
      leave() { try { return Promise.resolve(r.leave()).catch(() => { }); } catch (e) { return Promise.resolve(); } }
    };
    return room;
  }
  const LOOP_K = Math.random().toString(36).slice(2, 7);   /* one id per tab in every room, as the arcade keeps one per player */
  function loopback(roomId, opts) {
    const k = LOOP_K;
    const me = { id: 'dev-' + k, tag: 'dev_' + k, address: null, guest: false };
    const ch = new BroadcastChannel('ashvale3d:' + (opts.game || 'dev') + ':' + roomId), fns = { message: [], join: [], leave: [], closed: [] }, members = new Map();
    const fire = (t, o) => { for (const f of fns[t]) { try { f(o); } catch (e) { console.error(e); } } };
    ch.onmessage = (ev) => {
      const m = ev.data; if (!m || !m.from || m.from.id === me.id) return;
      if (m.t === 'hello' || m.t === 'here') { const isNew = !members.has(m.from.id); members.set(m.from.id, m.from); if (m.t === 'hello') ch.postMessage({ t: 'here', from: me }); if (isNew) fire('join', { from: m.from }); }
      else if (m.t === 'bye') { members.delete(m.from.id); fire('leave', { from: m.from }); }
      else if (m.t === 'msg') { if (!members.has(m.from.id)) { members.set(m.from.id, m.from); fire('join', { from: m.from }); } fire('message', { from: m.from, data: m.data }); }
    };
    ch.postMessage({ t: 'hello', from: me });
    const sent = [];
    const room = {
      id: roomId, me,
      send(obj) {
        const s = JSON.stringify(obj), now = Date.now(); while (sent.length && now - sent[0] > 2000) sent.shift();
        if (new TextEncoder().encode(s).length > MAX || sent.length >= 10) return Promise.resolve(false);   /* same limits as the mesh: 512 B, ~5/s burst 10 */
        sent.push(now); ch.postMessage({ t: 'msg', from: me, data: JSON.parse(s) }); return Promise.resolve(true);
      },
      members() { return [me].concat(Array.from(members.values())); },
      on(t, fn) { if (fns[t]) fns[t].push(fn); return room; },
      leave() { try { ch.postMessage({ t: 'bye', from: me }); ch.close(); } catch (e) { /* closed */ } return Promise.resolve(); }
    };
    return { online: true, room, backend: 'loopback' };
  }
  const net = {
    api: 2,
    /* proximity voice (planned with the Arcade session's realtime layer): opt-in mic, per room. Not available yet. */
    voice: { available: false, async start(room) { return { ok: false, reason: 'voice chat is not available yet' }; }, stop() { } },
    async join(roomId, opts) {
      opts = opts || {};
      const RT = G.arcade && G.arcade.realtime;
      if (RT && typeof RT.join === 'function') {
        let r = null;
        try { r = await RT.join(String(roomId).slice(0, 60), { game: opts.game || 'ashvale' }); } catch (e) { r = { online: false, why: e && e.message }; }
        if (!r || r.online === false) return { online: false, why: (r && r.why) || 'unavailable', backend: 'arcade' };
        try { console.info('ASHVALE realtime: joined ' + roomId + ' as ' + JSON.stringify(r.me)); } catch (e) { /* ignore */ }
        return { online: true, room: arcadeRoom(r, roomId), backend: 'arcade' };
      }
      if (opts.loopback && typeof BroadcastChannel !== 'undefined') return loopback(roomId, opts);
      return { online: false, why: 'solo', backend: 'none' };
    },
    /* NEIGHBOUR ROOMS, game-agnostic: any zoned/tiled/chunked world where a player near a border should see the players
       on the other side. Built only on join() (arcade.realtime allows several rooms at once), so it needs no Arcade change.
       The game says which rooms it wants; this keeps that set joined and tells the game what it hears there.
         const nb = net.neighbours({game, loopback, max, on: {message(roomId, ev), join(roomId, ev), leave(roomId, ev), closed(roomId, why)}})
         nb.update(near, keep)   join every id in `near` not joined yet (up to `max`, default 3); leave every joined id
                                 not in `keep` (pass a wider `keep` than `near` so walking along a border does not flap)
         nb.rooms() -> [room]    the joined neighbour rooms (each the same shape as join()'s room)
         nb.close()              leave them all
       A room that fails to join, or closes, is not retried for 30 s. Sending is the game's business: send small, low-rate
       presence (the mesh budget of ~5 msgs/s is per player, shared with the game's main room). */
    neighbours(opts) {
      opts = opts || {};
      const on = opts.on || {}, max = opts.max || 3, joined = new Map(), pending = new Set(), backoff = new Map();
      const call = (k, a, b) => { try { if (on[k]) on[k](a, b); } catch (e) { console.error(e); } };
      async function enter(id) {
        pending.add(id);
        let res = null; try { res = await net.join(id, { game: opts.game, loopback: opts.loopback }); } catch (e) { res = null; }
        pending.delete(id);
        if (!res || !res.online) { backoff.set(id, Date.now() + 30000); return; }
        const R = res.room;
        if (!wanted.has(id) || joined.has(id)) { R.leave(); return; }   /* walked away (or joined twice) while joining */
        joined.set(id, R);
        R.on('message', ev => { if (joined.get(id) === R) call('message', id, ev); });
        R.on('join', ev => { if (joined.get(id) === R) call('join', id, ev); });
        R.on('leave', ev => { if (joined.get(id) === R) call('leave', id, ev); });
        R.on('closed', why => { if (joined.get(id) !== R) return; joined.delete(id); backoff.set(id, Date.now() + 30000); call('closed', id, why); });
        call('join', id, { from: R.me, self: true });
      }
      let wanted = new Set();
      return {
        update(near, keep) {
          const now = Date.now(); keep = new Set((keep || near || []).concat(near || [])); wanted = keep;
          for (const [id, R] of Array.from(joined)) if (!keep.has(id)) { joined.delete(id); R.leave(); call('closed', id, 'left'); }
          for (const id of near || []) {
            if (joined.has(id) || pending.has(id) || (backoff.get(id) || 0) > now) continue;
            if (joined.size + pending.size >= max) break;
            enter(id);
          }
        },
        rooms() { return Array.from(joined.values()); },
        close() { wanted = new Set(); for (const [id, R] of Array.from(joined)) { joined.delete(id); R.leave(); call('closed', id, 'left'); } }
      };
    }
  };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('net', { api: 2, v: 3 }, () => net);
})(typeof globalThis !== 'undefined' ? globalThis : this);
