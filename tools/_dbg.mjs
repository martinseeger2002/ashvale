import * as THREE from '../vendor/three.module.min.js';
import { createModels } from '../src/models.js';
const M = createModels(THREE); const W = M.monster('wolf'); W.update(0.1); W.object.updateMatrixWorld(true);
W.object.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); const c = b.getCenter(new THREE.Vector3()); console.log(o.geometry.type, o.geometry.parameters && JSON.stringify([o.geometry.parameters.width, o.geometry.parameters.height, o.geometry.parameters.depth].map(v => v && +v.toFixed(2))), 'ctr', c.toArray().map(v => +v.toFixed(2)).join(',')); } });
