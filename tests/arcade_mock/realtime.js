/* MOCK of the arcade realtime SDK (local tests only; the real one is /r/realtime.js on an arcade node, master 7e951fb).
   Final contract: arcade.realtime.join(name, {game}) -> Promise<Room>, never rejects (room.online false + room.why);
   room.me {id, address, tag (no @), guest, node}; room.members(); room.on('join'|'leave', p), on('message', (data, p)),
   on('closed', why); room.send(value) -> Promise (rejects: > 512 B UTF-8, too fast ~5/s burst 10, not in room);
   room.leave() -> Promise. No echo of your own sends. ?guest = a signed-out player, ?offline = feed embed (online:false). */
(function () {
  var A = window.arcade = window.arcade || {};
  var k = Math.random().toString(36).slice(2, 7), guest = /guest/.test(location.search);
  var me = guest ? { id: 'guest-' + k + 'abc', address: null, tag: '', guest: true, node: 'mocknode' } : { id: 'addr_' + k, address: 'addr_' + k, tag: 'mock_' + k, guest: false, node: 'mocknode' };
  var rooms = {};
  A.realtime = {
    join: function (name, opts) {
      if (/offline/.test(location.search)) return Promise.resolve({ online: false, why: 'embedded in the feed' });
      if (rooms[name]) return Promise.resolve(rooms[name]);
      var ch = new BroadcastChannel('arcade-mock:' + (opts && opts.game) + ':' + name), fns = { message: [], join: [], leave: [], closed: [] }, mem = {}, left = false, sent = [];
      var fire = function (t, a, b) { fns[t].forEach(function (f) { f(a, b); }); };
      ch.onmessage = function (ev) { var m = ev.data; if (left || m.from.id === me.id) return;
        if (m.k !== 'bye' && !mem[m.from.id]) { mem[m.from.id] = m.from; fire('join', m.from); if (m.k === 'hi') ch.postMessage({ k: 'hi2', from: me }); }
        if (m.k === 'bye') { delete mem[m.from.id]; fire('leave', m.from); } else if (m.k === 'msg') { var d = m.data; try { d = JSON.parse(m.data); } catch (e) { } fire('message', d, m.from); } };
      ch.postMessage({ k: 'hi', from: me });
      var room = { online: true, me: me,
        send: function (v) { var s = typeof v === 'string' ? v : JSON.stringify(v); if (left) return Promise.reject(new Error('not in the room'));
          if (new TextEncoder().encode(s).length > 512) return Promise.reject(new Error('over 512 bytes'));
          var now = Date.now(); while (sent.length && now - sent[0] > 2000) sent.shift();
          if (sent.length >= 10) { window.__mockRateHits = (window.__mockRateHits || 0) + 1; return Promise.reject(new Error('too fast')); }
          sent.push(now); ch.postMessage({ k: 'msg', from: me, data: s }); return Promise.resolve(); },
        members: function () { return [me].concat(Object.keys(mem).map(function (x) { return mem[x]; })); },
        on: function (t, f) { fns[t] && fns[t].push(f); return room; },
        leave: function () { left = true; delete rooms[name]; ch.postMessage({ k: 'bye', from: me }); ch.close(); return Promise.resolve(); } };
      rooms[name] = room;
      return Promise.resolve(room);
    }
  };
})();
