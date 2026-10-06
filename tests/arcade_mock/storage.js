/* MOCK of the arcade storage SDK (local tests only): arcade.storage.ready -> {getItem, setItem} (async). */
(function () {
  var A = window.arcade = window.arcade || {}, mem = {};
  window.__mockStore = mem;
  A.storage = { ready: /nostorage/.test(location.search) ? Promise.reject(new Error('not inside an arcade viewer')) :
    Promise.resolve({ getItem: function (k) { return Promise.resolve(k in mem ? mem[k] : null); }, setItem: function (k, v) { mem[k] = String(v); window.__mockWrites = (window.__mockWrites || 0) + 1; return Promise.resolve(); } }) };
  A.storage.ready.catch(function () {});
})();
