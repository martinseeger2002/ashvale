/* ASHVALE 3D wallet module (api 1): what a player's arcade wallet holds, as game items (2026-10-04: "tradable NFTs
   as your inventory and tradable tokens as your Gold"). Read-only and public: it reads the arcade's indexed views of an
   address, never signs, never moves anything.
     const W = ASH3D.get('wallet').create({ assets })      assets = data/assets.json's data
     await W.load(address) -> { address, gear: {itemId: [inscription ids]}, tokens: {itemId: units}, gold: units, at }
     W.owns(itemId, n)     true when the last load saw at least n of that item (gear NFTs or token units)
   HARD RULE (2026-10-01): only NFTs created by @ashvale and tokens issued by @ashvale count; anything else in a
   wallet is ignored here, before it reaches the game. */
(function (G) {
  'use strict';
  const API = 1;
  function create(opts) {
    const A = (opts && opts.assets) || { items: {}, issuer: '', gold: 26 };
    const extra = new Set(A.also || ['ns3A7VS6DDaCoBvNFnayHeS9pysgi7Ukrf']);
    /* @ashvale's own pieces need no extra mark. An inscription from an added maker
       loads only when it carries the Ashvale flag: "game": "ashvale", or a Flag/Game trait. */
    function ashvaleFlag(j) {
      if (!j || typeof j !== 'object') return false;
      if (j.game === 'ashvale' || j.ashvale === true) return true;
      for (const t of (j.attributes || [])) {
        if (!t) continue;
        const k = String(t.trait_type || '').toLowerCase();
        if ((k === 'flag' || k === 'game') && String(t.value).toLowerCase() === 'ashvale') return true;
      }
      return false;
    }
    function accepted(p) {
      if (!p || p.held === false) return false;
      if (p.creator === A.issuer) return true;
      if (!extra.has(p.creator) || !ashvaleFlag(p.json)) return false;
      const ct = String(p.contenttype || p.content_type || '');
      return !ct || ct === 'application/json';
    }
    const base = (opts && opts.base) || '';
    const byKey = {}, byToken = {};
    for (const id in A.items) {
      const a = A.items[id];
      if (a.kind === 'nft') { byKey[a.collection + '|' + a.key] = id; byKey['|' + a.key] = id; }   /* the key alone too: a copy the Bank minted under another @ashvale collection is still that item */
      else if (a.kind === 'token' && a.propertyid) byToken[a.propertyid] = id;
    }
    let last = null;
    const keyOf = (p) => {   /* the item key an NFT carries: the Armoury's attribute "Key", or a plain json.key */
      const j = p && p.json; if (!j) return null;
      if (j.key) return String(j.key);
      for (const t of (j.attributes || [])) if (t && (t.trait_type === 'Key' || t.trait_type === 'key')) return String(t.value);
      return null;
    };
    async function getJSON(path) { const r = await fetch(base + path); if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); }
    async function load(address) {
      if (!address) throw new Error('no wallet address');
      const out = { address, gear: {}, tokens: {}, pids: { coins: A.gold }, gold: 0, at: Date.now(), raw: {}, pieces: [], makers: {}, issuers: {} };   /* makers/issuers: who automated returns go back to */
      const L = await getJSON('/r/inscriptions/' + address + '?limit=500');
      for (const p of (Array.isArray(L) ? L : [])) {
        if (!accepted(p) || (p.owner && p.owner !== address)) continue;
        const coll = (p.json && p.json.collection) || p.collection || '', k = keyOf(p);
        const id = k && (byKey[coll + '|' + k] || byKey['|' + k]);
        if (id) { (out.gear[id] = out.gear[id] || []).push(p.id); out.makers[p.id] = p.creator; }
        if (k) out.pieces.push({ id: p.id, collection: coll, json: p.json });
      }
      const B = await getJSON('/r/balances/' + address);
      const tokenIssuers = new Set([A.issuer].concat(Array.from(extra)));
      const mine = (Array.isArray(B) ? B : []).filter(b => b && tokenIssuers.has(b.issuer));
      /* a token names its item itself: category/subcategory plus details.ashvale.id (the schema the engine's
         classifyToken reads); ids listed in assets.json are the fallback for tokens issued before it */
      const meta = {};
      const ids = mine.map(b => b.propertyid).filter(id => !byToken[id] && +id !== +A.gold);
      if (ids.length) { try { for (const t of await getJSON('/r/tokens?ids=' + ids.slice(0, 100).join(','))) if (t && tokenIssuers.has(t.issuer)) meta[t.propertyid] = t; } catch (e) { /* metadata is optional */ } }
      for (const b of mine) {
        const units = +b.units || 0; out.raw[String(b.propertyid)] = String(b.units); out.issuers[String(b.propertyid)] = b.issuer;
        if (+b.propertyid === +A.gold) { out.gold = units; continue; }
        let id = byToken[b.propertyid];
        if (!id && meta[b.propertyid]) {
          const t = meta[b.propertyid], det = t.details && typeof t.details === 'object' ? t.details : null, k = det && det.ashvale && det.ashvale.id;
          if (k && A.items[k] && A.items[k].kind === 'token') id = k;
        }
        if (id) { out.tokens[id] = units; out.pids[id] = b.propertyid; }   /* pids: which token to send back (the chest's returns) */
      }
      last = out;
      return out;
    }
    function owns(itemId, n) {
      if (!last) return false;
      const need = n == null ? 1 : n;
      if (last.gear[itemId]) return last.gear[itemId].length >= need;
      if (last.tokens[itemId] != null) return last.tokens[itemId] >= need;
      return false;
    }
    return { api: API, load, owns, last: () => last, assetOf: (id) => A.items[id] || null };
  }
  const Wallet = { api: API, create };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('wallet', { api: API, v: 1 }, () => Wallet);
  if (typeof module !== 'undefined' && module.exports) module.exports = Wallet;
})(typeof globalThis !== 'undefined' ? globalThis : this);
