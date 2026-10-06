/* ASHVALE 3D fog shape: the fog is measured from the line between the camera and the player, not from the camera alone
   (2026-10-02: "The fog radius should be around the player to the camera like an ellipse where both the player
   and the camera are within that ellipse").

   Every point P gets fog depth e = (|P - camera| + |P - player| - |camera - player|) / 2: zero anywhere on the segment
   between the two, growing outward, and constant on ellipsoids whose foci are the camera and the player. scene.fog's
   near/far keep their meaning (metres where fog starts and where it is full), so the weather module and the engine's
   fallback need no change; only WHAT the distance is measured from changes. Dense weather fog can therefore never
   swallow your own character, however far out the camera is zoomed.

   Module contract (one export, no imports, no top-level side effects; three.js is passed in):
     const F = createFogShape(THREE)   patches three's fog shader chunks; call once, BEFORE the first render
     F.focus(vector3)                  the player's position, every frame
   Works for every built-in material with fog (Lambert, Basic, Points, Lines); custom ShaderMaterials without fog are
   untouched. */
(function (root) {
  'use strict';
  function createFogShape(THREE) {
    const C = THREE.ShaderChunk, focus = { value: new THREE.Vector3() };
    if (!C.__ashFog) {
      C.__ashFog = true;
      C.fog_pars_vertex = '#ifdef USE_FOG\n  varying vec3 vFogWorld;\n#endif';
      /* world position from the view-space position: the view matrix is rigid, so its inverse is a transpose */
      C.fog_vertex = '#ifdef USE_FOG\n  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
      C.fog_pars_fragment = '#ifdef USE_FOG\n  uniform vec3 fogColor;\n  uniform vec3 fogFocus;\n  varying vec3 vFogWorld;\n' +
        '  #ifdef FOG_EXP2\n    uniform float fogDensity;\n  #else\n    uniform float fogNear;\n    uniform float fogFar;\n  #endif\n#endif';
      C.fog_fragment = '#ifdef USE_FOG\n' +
        '  float vFogDepth = 0.5 * (distance(vFogWorld, cameraPosition) + distance(vFogWorld, fogFocus) - distance(cameraPosition, fogFocus));\n' +
        '  #ifdef FOG_EXP2\n    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);\n' +
        '  #else\n    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);\n  #endif\n' +
        '  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif';
      /* the focus uniform reaches every material through one shared object (three clones a material's own uniforms) */
      const prev = THREE.Material.prototype.onBeforeCompile;
      THREE.Material.prototype.onBeforeCompile = function (shader, renderer) {
        if (shader.fragmentShader.indexOf('fogFocus') >= 0 || /#include <fog_fragment>/.test(shader.fragmentShader)) shader.uniforms.fogFocus = focus;
        if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, shader, renderer);
      };
    }
    return { api: 1, focus(v) { if (v) focus.value.copy(v); }, uniform: focus };
  }
  const api = { createFogShape };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('fog', { api: 1, v: 1, needs: { three: 160 } }, function () { return { api: 1, createFogShape }; });
})(typeof window !== 'undefined' ? window : globalThis);
