/* ASHVALE 3D engine part: the soundtrack (2026-10-18, the operator: "generate music tracks referencing old school runescape music -
   that unlocks new tracks when you visit new areas and towns"). The tracks are data (data/music.json, tools/music/compose.py:
   original tunes in the manner of the old MIDI soundtracks); this part plays them through a small WebAudio synth - modal lead
   voices (flute, recorder, harp, lute, oboe, horn, strings, pipe), a bass, held string chords and hand percussion - one bar ahead
   of the clock, and crossfades when the track changes.
   - Each area has a track (music.areas: zone id -> track; music.regions: boxes of the open world, e.g. the castle lakes; anything
     else is music.wild). Walking into an area for the first time unlocks its track, as the old game did: "You have unlocked a new
     music track: <name>." The starting tracks are unlocked from the first step.
   - The Music tab lists every track, green when unlocked and red when not: tap one to loop it, Auto to follow the area again,
     a switch for the music, a volume slider. What is unlocked, the mode and the volume are kept per browser (ashvale3d.music.v1).
   - Browsers only start audio after a tap or a key: the synth wakes on the first one.
   install(K) -> { frame(x, y, zone), panel(el, redraw), state() } */
(function (G) {
  'use strict';
  const KEY = 'ashvale3d.music.v1';
  const VOICE = {   /* wave, attack, decay, sustain, release (s), low-pass cutoff (Hz), resonance, vibrato (Hz, depth), gain, pluck, detune (cents) */
    flute: { w: 'triangle', a: 0.04, d: 0.1, s: 0.8, r: 0.14, f: 3600, q: 0.7, vf: 5, vd: 0.004, g: 0.22 },
    recorder: { w: 'sine', a: 0.03, d: 0.08, s: 0.85, r: 0.1, f: 4000, q: 0.7, vf: 4.5, vd: 0.003, g: 0.26 },
    harp: { w: 'triangle', a: 0.004, d: 1.1, s: 0, r: 0.5, f: 5200, q: 0.5, g: 0.32, pluck: true },
    lute: { w: 'square', a: 0.003, d: 0.55, s: 0, r: 0.25, f: 1900, q: 1.2, g: 0.13, pluck: true },
    oboe: { w: 'sawtooth', a: 0.05, d: 0.1, s: 0.75, r: 0.1, f: 1700, q: 4, vf: 5.5, vd: 0.004, g: 0.11 },
    horn: { w: 'sawtooth', a: 0.08, d: 0.15, s: 0.8, r: 0.2, f: 1150, q: 1, vf: 4, vd: 0.002, g: 0.14 },
    strings: { w: 'sawtooth', a: 0.22, d: 0.2, s: 0.85, r: 0.45, f: 2100, q: 0.8, vf: 5, vd: 0.003, g: 0.1, det: 8 },
    pipe: { w: 'square', a: 0.02, d: 0.1, s: 0.7, r: 0.08, f: 2500, q: 1, vf: 6, vd: 0.005, g: 0.1 },
    bass: { w: 'triangle', a: 0.01, d: 0.3, s: 0.6, r: 0.15, f: 900, q: 0.7, g: 0.34 },
    pad: { w: 'sawtooth', a: 0.6, d: 0.3, s: 0.8, r: 0.9, f: 950, q: 0.6, g: 0.05, det: 10 },
  };
  function install(K) {
    const D = (K.DATA && K.DATA.music) || null;
    if (!D || !D.tracks) return { frame() {}, panel(el) { el.innerHTML = '<h4>Music</h4><div class="info">No music in this build.</div>'; }, state: () => ({}) };
    const store = K.store, hud = () => (typeof K.hud === 'function' ? K.hud() : K.hud);
    let S = { unlocked: (D.start || []).slice(), mode: 'auto', loop: null, on: true, vol: 0.6 };
    try { const s = JSON.parse(store.get(KEY) || 'null'); if (s && typeof s === 'object') S = Object.assign(S, s, { unlocked: Array.from(new Set((D.start || []).concat(s.unlocked || []))) }); } catch (e) { /* defaults */ }
    const save = () => { try { store.set(KEY, JSON.stringify(S)); } catch (e) { /* private window: kept for this visit */ } };
    let ctx = null, master = null, noise = null, cur = null, areaTrack = null, frames = 0, timer = null;
    const ORDER = (D.order || Object.keys(D.tracks)).filter(id => D.tracks[id]);
    /* each track's events, bar by bar, so the scheduler lays one bar at a time */
    const BARS = {};
    function barsOf(id) {
      if (BARS[id]) return BARS[id];
      const T = D.tracks[id], bar = T.meter * 4, by = Array.from({ length: T.bars }, () => []);
      for (const part of ['lead', 'bass', 'pad']) for (const [st, ln, m, v] of (T.parts[part] || [])) { const b = Math.floor(st / bar); if (by[b]) by[b].push([part, st - b * bar, ln, m, v]); }
      return (BARS[id] = by);
    }
    function wake() {
      if (ctx || !S.on) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
      const AC = G.AudioContext || G.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const ch = noise.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      timer = setInterval(pump, 120);
      const want = S.mode === 'loop' && S.loop ? S.loop : areaTrack; if (want) play(want);
    }
    if (G.addEventListener) for (const ev of ['pointerdown', 'keydown', 'touchstart']) G.addEventListener(ev, wake, { passive: true });
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    function tone(out, vname, midi, t, dur, vel) {
      const V = VOICE[vname] || VOICE.flute, f0 = hz(midi), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = V.f; lp.Q.value = V.q; lp.connect(g); g.connect(out);
      const oscs = [ctx.createOscillator()]; if (V.det) oscs.push(ctx.createOscillator());
      oscs.forEach((o, i) => { o.type = V.w; o.frequency.value = f0; if (i) o.detune.value = V.det; o.connect(lp); });
      if (V.vf) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = V.vf; lg.gain.value = f0 * V.vd; l.connect(lg); oscs.forEach(o => lg.connect(o.frequency)); l.start(t + 0.15); l.stop(t + dur + V.r + 0.1); }
      const pk = V.g * vel, end = t + dur;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + V.a);
      if (V.pluck) { g.gain.setTargetAtTime(0, t + V.a, V.d / 4); }
      else { g.gain.linearRampToValueAtTime(pk * V.s, t + V.a + V.d); g.gain.setValueAtTime(pk * V.s, Math.max(t + V.a + V.d, end)); g.gain.linearRampToValueAtTime(0, end + V.r); }
      oscs.forEach(o => { o.start(t); o.stop(end + V.r + (V.pluck ? V.d : 0) + 0.05); });
    }
    function drum(out, v, t, vel) {
      const g = ctx.createGain(); g.connect(out);
      const thump = (f1, f2, dk, amp) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dk * 0.6); const og = ctx.createGain(); og.gain.setValueAtTime(amp * vel, t); og.gain.exponentialRampToValueAtTime(0.001, t + dk); o.connect(og); og.connect(g); o.start(t); o.stop(t + dk + 0.02); };
      const hiss = (type, f, q, dk, amp) => { const s = ctx.createBufferSource(); s.buffer = noise; const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q; const ng = ctx.createGain(); ng.gain.setValueAtTime(amp * vel, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dk); s.connect(bf); bf.connect(ng); ng.connect(g); s.start(t); s.stop(t + dk + 0.02); };
      if (v === 'k') thump(120, 45, 0.28, 0.55);
      else if (v === 'd') { thump(95, 60, 0.32, 0.45); hiss('bandpass', 420, 1, 0.12, 0.15); }
      else if (v === 's') { hiss('bandpass', 1800, 0.7, 0.16, 0.35); thump(190, 150, 0.08, 0.15); }
      else if (v === 'h') hiss('highpass', 7000, 0.7, 0.045, 0.18);
      else if (v === 't') thump(110, 75, 0.45, 0.5);
      else if (v === 'b') hiss('bandpass', 6200, 2, 0.13, 0.25);
    }
    function play(id) {
      if (!D.tracks[id]) return;
      if (cur && cur.id === id && !cur.pending) return;
      if (!ctx) { cur = { id, pending: true }; return; }
      const now = ctx.currentTime;
      if (cur && cur.out) { const o = cur.out; o.gain.cancelScheduledValues(now); o.gain.setValueAtTime(o.gain.value, now); o.gain.linearRampToValueAtTime(0, now + 1.5); setTimeout(() => o.disconnect(), 2200); }
      const T = D.tracks[id], out = ctx.createGain(); out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 1.2); out.connect(master);
      cur = { id, out, bar: 0, nextT: now + 0.35, step: 60 / T.bpm / 4, barDur: 60 / T.bpm / 4 * T.meter * 4 };
      const h = hud(); if (h && h.tab === 'music' && h.refresh) h.refresh('music');
    }
    function pump() {
      if (!ctx || !cur || !cur.out || !S.on) return;
      const T = D.tracks[cur.id], by = barsOf(cur.id);
      while (cur.nextT < ctx.currentTime + 0.7) {
        const t0 = cur.nextT;
        for (const [part, off, ln, m, v] of by[cur.bar]) tone(cur.out, part === 'lead' ? T.lead : part, m, t0 + off * cur.step, ln * cur.step * (part === 'lead' ? 0.92 : 0.98), v);
        for (const [off, v, vel] of (T.perc || [])) drum(cur.out, v, t0 + off * cur.step, vel);
        cur.bar = (cur.bar + 1) % T.bars; cur.nextT += cur.barDur;
      }
    }
    function trackFor(x, y, zone) {
      if (zone && D.areas && D.areas[zone]) return D.areas[zone];
      for (const r of (D.regions || [])) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r.track;
      return D.wild;
    }
    function frame(x, y, zoneFn) {
      if (++frames % 20) return;
      const zone = typeof zoneFn === 'function' ? zoneFn() : zoneFn;
      const t = trackFor(x, y, zone); if (!t || t === areaTrack) return;
      areaTrack = t;
      if (S.unlocked.indexOf(t) < 0) {
        S.unlocked.push(t); save();
        const h = hud(); if (h && h.chat) h.chat('You have unlocked a new music track: ' + D.tracks[t].name + '.', 'sys');
        if (h && h.tab === 'music' && h.refresh) h.refresh('music');
      }
      if (S.mode === 'auto' && S.on) play(t);
    }
    function panel(el, redraw) {
      const T = cur && D.tracks[cur.id], got = ORDER.filter(id => S.unlocked.indexOf(id) >= 0).length;
      const btn = (a, label, on) => '<button class="btn' + (on ? ' on' : '') + '" data-ma="' + a + '">' + label + '</button>';
      el.innerHTML = '<h4>Music</h4>' +
        '<div class="info">' + (T && S.on ? 'Now playing: <b>' + T.name + '</b>' : S.on ? 'Tap anywhere to start the music.' : 'The music is off.') + '</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">' + btn('auto', 'Auto', S.mode === 'auto') + btn('onoff', S.on ? 'Music: On' : 'Music: Off', S.on) + '</div>' +
        '<div class="info" style="display:flex;align-items:center;gap:6px">Volume <input type="range" min="0" max="100" value="' + Math.round(S.vol * 100) + '" data-ma="vol" style="flex:1"></div>' +
        '<div class="info">Unlocked ' + got + ' of ' + ORDER.length + '</div>' +
        '<div style="max-height:260px;overflow:auto;line-height:1.55">' + ORDER.map(id => {
          const ok = S.unlocked.indexOf(id) >= 0, playing = cur && cur.id === id;
          return '<div data-mt="' + id + '" title="' + (ok ? D.tracks[id].mood.replace(/"/g, '&quot;') : 'Not yet unlocked: find where it plays.') + '" style="cursor:' + (ok ? 'pointer' : 'default') + ';color:' + (ok ? '#3fd34f' : '#e03a32') + (playing ? ';font-weight:bold;text-decoration:underline' : '') + '">' + D.tracks[id].name + '</div>';
        }).join('') + '</div>';
      el.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.ma, t = e.target.dataset && e.target.dataset.mt;
        wake();
        if (a === 'auto') { S.mode = 'auto'; S.loop = null; if (areaTrack) play(areaTrack); }
        else if (a === 'onoff') { S.on = !S.on; if (!S.on && cur && cur.out && ctx) { cur.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3); cur = null; } else if (S.on) { wake(); play(S.mode === 'loop' && S.loop ? S.loop : areaTrack); } }
        else if (t && S.unlocked.indexOf(t) >= 0) { S.mode = 'loop'; S.loop = t; play(t); }
        else return;
        save(); redraw();
      };
      el.oninput = (e) => { if (e.target.dataset && e.target.dataset.ma === 'vol') { S.vol = (+e.target.value || 0) / 100; if (master) master.gain.value = S.vol; save(); } };
    }
    return { frame, panel, state: () => ({ playing: cur && cur.id, area: areaTrack, unlocked: S.unlocked.slice(), mode: S.mode, on: S.on, ctx: ctx ? ctx.state : null }), _play: play };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engmusic', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
