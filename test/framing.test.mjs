import assert from 'node:assert/strict';
import { fitAnatomyBounds } from '../js/framing.js';

for (const aspect of [1.9, 1, .7]) {
  for (const bounds of [
    { min: { x: -45, y: -66, z: -15 }, max: { x: 45, y: 32, z: 20 } },
    { min: { x: -48, y: -66, z: -25 }, max: { x: 48, y: 42, z: 30 } },
  ]) {
    const { distance, target } = fitAnatomyBounds(bounds, aspect);
    const tan = Math.tan(36 * Math.PI / 360);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const depth = distance - (z - target[2]);
          assert.ok(Math.abs(x - target[0]) < depth * tan * aspect, 'both arms fit horizontally');
          assert.ok(Math.abs(y - target[1]) < depth * tan, 'head and torso fit vertically');
        }
  }
}
const core = { min: { x: -35, y: -66, z: 0 }, max: { x: 35, y: 32, z: 0 } };
for (const aspect of [1.9, .83]) {
  const { distance, target } = fitAnatomyBounds(core, aspect);
  assert.deepEqual(target, [0, -17, 0], 'target centers skull-to-pelvis core rather than empty space');
  const occupancy = 98 / (2 * distance * Math.tan(36 * Math.PI / 360));
  assert.ok(occupancy >= .78 && occupancy <= .86, `torso fills stage at ${aspect}: ${occupancy}`);
}
console.log('framing: core fills stage; shoulders/upper arms fit desktop and narrow views');
