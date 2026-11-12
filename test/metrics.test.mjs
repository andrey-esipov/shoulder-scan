import assert from 'node:assert/strict';
import { armKinematics } from '../js/metrics.js';

const frameR = { up: [0, 1, 0], fwd: [0, 0, 1], lat: [1, 0, 0] };
const frameL = { up: [0, 1, 0], fwd: [0, 0, 1], lat: [-1, 0, 0] };
const near = (a, b, tol = 1, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a.toFixed(1)}, want ${b}`);

const cases = [
  ['side, forearm fwd', frameR, [0, -1, 0], [0, 0, 1], { elevation: 0, rotation: 0, elbowFlex: 90 }],
  ['side, ER 90', frameR, [0, -1, 0], [1, 0, 0], { elevation: 0, rotation: 90 }],
  ['side, IR across belly', frameR, [0, -1, 0], [-0.7, 0, 0.7], { rotation: -45 }],
  ['90/90 ER', frameR, [1, 0, 0], [0, 1, 0], { elevation: 90, plane: 0, rotation: 90 }],
  ['90/90 IR', frameR, [1, 0, 0], [0, -1, 0], { rotation: -90 }],
  ['90/90 neutral', frameR, [1, 0, 0], [0, 0, 1], { rotation: 0 }],
  ['flexion 90 forearm up', frameR, [0, 0, 1], [0, 1, 0], { elevation: 90, plane: 90, rotation: 0 }],
  ['Hawkins IR', frameR, [0, 0, 1], [-1, 0, 0], { rotation: -90 }],
  ['LEFT 90/90 ER', frameL, [-1, 0, 0], [0, 1, 0], { elevation: 90, plane: 0, rotation: 90 }],
  ['LEFT side ER', frameL, [0, -1, 0], [-1, 0, 0], { rotation: 90 }],
  ['overhead', frameR, [0, 1, 0], [0, 1, 0], { elevation: 180, elbowFlex: 0 }],
  ['cross-body', frameR, [-0.5, 0, 0.866], [0, 1, 0], { plane: 120 }],
];
for (const [name, fr, u, f, want] of cases) {
  const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const k = armKinematics(n(u), n(f), fr);
  for (const [key, val] of Object.entries(want)) near(k[key], val, 1.5, `${name}.${key}`);
}
console.log(`metrics: ${cases.length} cases passed`);

import { armFromAngles } from '../js/metrics.js';
const F = { up: [0, 1, 0], fwd: [0, 0, 1], lat: [1, 0, 0] };
for (const [e, p, r, fl] of [[90, 0, 80, 90], [150, 40, -30, 70], [30, 90, 45, 100], [100, 120, -60, 90]]) {
  const { u, f } = armFromAngles(e, p, r, fl);
  const k = armKinematics(u, f, F);
  near(k.elevation, e, 0.5, 'inv.elev'); near(k.plane, p, 0.5, 'inv.plane'); near(k.rotation, r, 0.5, 'inv.rot'); near(k.elbowFlex, fl, 0.5, 'inv.flex');
}
console.log('armFromAngles inverse ok');

// Straight arm: rotation is read from the knuckle line (pinky->index).
const straight = [
  ['side neutral, palm to thigh', frameR, [0, -1, 0], [0, 0, 1], 0],
  ['side ER, palm forward', frameR, [0, -1, 0], [1, 0, 0], 90],
  ['side IR, palm back', frameR, [0, -1, 0], [-0.7, 0, 0.7], -45],
  ['abducted 90, palm down->up', frameR, [1, 0, 0], [0, 1, 0], 90],
  ['LEFT side ER', frameL, [0, -1, 0], [-1, 0, 0], 90],
];
for (const [name, fr, u, axis, rot] of straight) {
  const k = armKinematics(u, u, fr, { axis, conf: 1 });
  assert.ok(k.rotationValid && k.rotationSource === 'hand', `${name}: hand rotation should be valid`);
  near(k.rotation, rot, 1.5, `${name}.rotation`);
}
assert.equal(armKinematics([0, -1, 0], [0, -1, 0], frameR).rotationValid, false, 'straight arm without hand is invalid');
console.log(`hand rotation: ${straight.length} cases passed`);
