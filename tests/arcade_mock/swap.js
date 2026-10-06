/* MOCK of arcade.swap for local tests (presence only; the trade flow itself is tested by tests/trade/run.py).
   ?noswap leaves it out, as on a viewer where swaps are not live yet. */
(function () {
  if (/noswap/.test(location.search)) return;
  var A = window.arcade = window.arcade || {}, fns = [];
  A.swap = { trade: function () { return Promise.reject(new Error('mock')); }, onTrade: function (f) { fns.push(f); }, answer: function () { return Promise.resolve(); },
    mine: function () { return Promise.resolve([]); } };
})();
