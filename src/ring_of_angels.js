/* ASHVALE three.js item: the Ring of Angels.
   The same shape language the other rings use (a torus band the scene renderer
   already knows), drawn here with THREE so the piece is a real mesh, plus the
   one rule this ring exists for.

   Worn on the ring slot, it watches hitpoints. The moment a hit leaves the
   wearer strictly below one fifth of their total, it spends itself once and
   carries them to the Ashvale town portal. A later hit does not fire it again
   until the ring is put back on. */
(function (G) {
  'use strict';

  var ID = 'ring_angels';
  var GOLD = 0xf4e4a8;
  var WING = 0xf7f4ee;
  var STONE = 0x9ec8e8;

  function ringFactory(deps) {
    var THREE = deps.three;

    function mesh() {
      var group = new THREE.Group();
      group.name = 'ring_of_angels';
      var gold = new THREE.MeshStandardMaterial({color: GOLD, metalness: 0.55, roughness: 0.35});
      var wing = new THREE.MeshStandardMaterial({color: WING, metalness: 0.15, roughness: 0.45});
      var stone = new THREE.MeshStandardMaterial({color: STONE, metalness: 0.2, roughness: 0.25});
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), gold);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.012;
      group.add(band);
      [-1, 1].forEach(function (side) {
        var feather = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.02), wing);
        feather.position.set(side * 0.07, 0.05, 0);
        feather.rotation.z = side * -0.5;
        group.add(feather);
      });
      var gem = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), stone);
      gem.position.y = 0.055;
      group.add(gem);
      return group;
    }

    /* S is the live player: hp, base.maxhp, eq.ring, dead.
       portalOf('ashvale') and teleport(S, portal, line) are the engine's own. */
    function saveIfHurt(S, portalOf, teleport) {
      if (!S || S.dead) return false;
      var worn = S.eq && S.eq.ring;
      if (!worn || (worn.id !== ID && worn.key !== ID)) return false;
      if (worn.spent) return false;
      var max = (S.base && S.base.maxhp) || S.maxHp || 0;
      if (!(max > 0) || S.hp >= max / 5) return false;
      var portal = portalOf('ashvale');
      if (!portal) return false;
      worn.spent = true;
      teleport(S, portal, 'The Ring of Angels flares, and Ashvale rises around you.');
      return true;
    }

    return {id: 'item.ring_angels', item: ID, mesh: mesh, saveIfHurt: saveIfHurt};
  }

  G.AshRingOfAngels = {create: ringFactory};
})(typeof window !== 'undefined' ? window : globalThis);
