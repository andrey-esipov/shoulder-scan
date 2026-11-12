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

// Straight-arm roll from the 21-point hand model: arm out to the side at 90°,
// palm down -> thumb up -> palm up -> past it. Reading must stay continuous past 180°.
{
  const { computeMetrics } = await import('../js/metrics.js');
  const P = ([X, Y, Z]) => ({ x: X, y: -Y, z: -Z, visibility: 1 });
  const world = Array.from({ length: 33 }, () => P([0, 0, 0]));
  Object.assign(world, {
    0: P([0, 0.25, 0.1]), 11: P([-0.18, 0, 0]), 12: P([0.18, 0, 0]),
    13: P([-0.18, -0.3, 0]), 14: P([0.48, 0, 0]), 15: P([-0.18, -0.55, 0]), 16: P([0.74, 0, 0]),
    23: P([-0.1, -0.5, 0]), 24: P([0.1, -0.5, 0]),
  });
  const image = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  Object.assign(image, { 11: { x: 0.6, y: 0.4, visibility: 1 }, 12: { x: 0.4, y: 0.4, visibility: 1 }, 23: { x: 0.55, y: 0.7, visibility: 1 }, 24: { x: 0.45, y: 0.7, visibility: 1 } });
  const handAt = (deg) => {
    const r = deg * Math.PI / 180, a = [0, Math.sin(r), Math.cos(r)];
    const w = Array.from({ length: 21 }, () => P([0, 0, 0]));
    w[5] = P(a.map((c) => c * 0.035)); w[17] = P(a.map((c) => c * -0.035));
    return { R: { world: w, score: 0.9 } };
  };
  const state = {};
  for (let deg = -120; deg <= 210; deg += 10) {
    let m;
    for (let i = 0; i < 6; i++) m = computeMetrics(world, image, state, handAt(deg)).sides.R;
    assert.ok(m.rotationValid, `valid at ${deg}`);
    near(m.rotation, deg, 2, `roll ${deg}`);
  }
  // Fresh acquisition just past palm-up reads as ER, not -170.
  near(computeMetrics(world, image, {}, handAt(190)).sides.R.rotation, 190, 1, 'acquire 190');
  console.log('hand-model roll sweep ok');
}

{
  const { torsoPose } = await import('../js/metrics.js');
  // Camera-frame point [X,Y,Z] (+Z toward camera) -> MediaPipe world landmark.
  const P = ([X, Y, Z]) => ({ x: X, y: -Y, z: -Z, visibility: 1 });
  const body = (yd, hd) => {
    const w = Array.from({ length: 33 }, () => P([0, 0, 0]));
    const r = (yd * Math.PI) / 180, h = (hd * Math.PI) / 180;
    w[11] = P([0.18 * Math.cos(r), 0.4, -0.18 * Math.sin(r)]);
    w[12] = P([-0.18 * Math.cos(r), 0.4, 0.18 * Math.sin(r)]);
    w[23] = P([0.1 * Math.cos(h), -0.1, -0.1 * Math.sin(h)]);
    w[24] = P([-0.1 * Math.cos(h), -0.1, 0.1 * Math.sin(h)]);
    return w;
  };
  for (const [y, h] of [[0, 0], [35, 10], [-40, -10]]) {
    const t = torsoPose(body(y, h));
    assert.ok(Math.abs(t.yaw - y) < 0.5 && Math.abs(t.hipYaw - h) < 0.5 && Math.abs(t.separation - (y - h)) < 0.5, `torso ${y}/${h}`);
  }
  console.log('torso yaw ok');
}
