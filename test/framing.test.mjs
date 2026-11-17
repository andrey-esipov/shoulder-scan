import assert from 'node:assert/strict';
import { fitAnatomyBounds } from '../js/framing.js';

for (const aspect of [1.9, 1, .7]) {
  for (const bounds of [
    { min: { x: -90, y: -75, z: -25 }, max: { x: 90, y: 45, z: 30 } },
    { min: { x: -55, y: -75, z: -60 }, max: { x: 60, y: 100, z: 70 } },
  ]) {
    const { distance, target } = fitAnatomyBounds(bounds, aspect);
    const tan = Math.tan(36 * Math.PI / 360);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const depth = distance - z;
          assert.ok(Math.abs(x - target[0]) < depth * tan * aspect, 'both arms fit horizontally');
          assert.ok(Math.abs(y - target[1]) < depth * tan, 'head and torso fit vertically');
        }
  }
}
console.log('framing: raised arms, torso rotation and desktop/narrow aspects pass');
