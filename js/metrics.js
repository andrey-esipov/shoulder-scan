// Pure geometry for turning MediaPipe pose landmarks into shoulder kinematics.
// Everything is expressed in a torso frame (lateral-out, up, forward) so the
// numbers do not depend on where the camera is or which way the person faces.

export const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8,
  L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16,
  L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20, L_THUMB: 21, R_THUMB: 22,
  L_HIP: 23, R_HIP: 24,
};

export const SIDE_IDX = {
  L: { sh: LM.L_SH, el: LM.L_EL, wr: LM.L_WR, ear: LM.L_EAR, hip: LM.L_HIP, pinky: LM.L_PINKY, index: LM.L_INDEX, thumb: LM.L_THUMB },
  R: { sh: LM.R_SH, el: LM.R_EL, wr: LM.R_WR, ear: LM.R_EAR, hip: LM.R_HIP, pinky: LM.R_PINKY, index: LM.R_INDEX, thumb: LM.R_THUMB },
};

export const DEG = 180 / Math.PI;
export const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  avg: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
  // Component of a perpendicular to unit vector n.
  perp: (a, n) => { const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2]; return [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d]; },
};

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angleBetween = (a, b) => Math.acos(clamp(v3.dot(v3.norm(a), v3.norm(b)), -1, 1)) * DEG;

// Rodrigues rotation of v about unit axis k by angle th (radians).
export function rotateAbout(v, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const kxv = v3.cross(k, v);
  const kdv = v3.dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

// Minimal rotation that takes unit vector a onto unit vector b, applied to v.
// Used to carry the "neutral rotation" reference along with the arm, so that
// rotation is measured consistently at the side, at 90/90 and in flexion.
export function carry(v, a, b, fallbackAxis) {
  const d = clamp(v3.dot(a, b), -1, 1);
  const th = Math.acos(d);
  if (th < 1e-4) return v;
  let k = v3.cross(a, b);
  if (v3.len(k) < 1e-4) k = fallbackAxis;
  return rotateAbout(v, v3.norm(k), th);
}

/**
 * Arm kinematics in a torso frame given as unit vectors.
 * u: unit upper-arm vector (shoulder->elbow); f: unit forearm vector (elbow->wrist)
 * frame: { up, fwd, lat } where lat is lateral-OUT for this side.
 * hand (optional): { axis, conf } where axis is the unit knuckle line (pinky->index)
 * and conf is 0..1 landmark confidence. It lets us read humeral rotation when the
 * elbow is straight and the forearm itself carries no rotation information.
 */
export function armKinematics(u, f, frame, hand) {
  const { up, fwd, lat } = frame;
  const down = v3.scale(up, -1);
  const elevation = angleBetween(u, down);
  const aLat = v3.dot(u, lat), aFwd = v3.dot(u, fwd), aUp = v3.dot(u, up);
  // 0 = pure abduction (coronal), 90 = flexion (sagittal), >90 = across body, <0 = behind.
  const plane = Math.atan2(aFwd, aLat) * DEG;
  const elbowFlex = 180 - angleBetween(v3.scale(u, -1), f);

  // Neutral forearm direction and external-rotation direction carried with the arm.
  const e0 = v3.norm(v3.perp(carry(fwd, down, u, lat), u));
  const e1 = v3.norm(v3.perp(carry(lat, down, u, fwd), u));

  // Forearm method: the bent forearm swings around the humerus like a clock hand.
  const fp = v3.perp(f, u);
  const wF = smoothstep(elbowFlex, 20, 50) * smoothstep(v3.len(fp), 0.25, 0.5);
  // Hand method: with the arm straight, the knuckle line (index ahead of pinky at
  // neutral, palm to thigh) turns with the humerus. It also includes forearm
  // pronation, so it only takes over when the forearm method has nothing to read.
  let wH = 0, hp = null;
  if (hand?.axis && hand.conf > 0) {
    hp = v3.perp(hand.axis, u);
    wH = hand.conf * (1 - smoothstep(elbowFlex, 30, 60)) * smoothstep(v3.len(hp), 0.35, 0.65);
  }
  let c = 0, s = 0;
  if (wF > 0) { const n = v3.norm(fp); c += wF * v3.dot(n, e0); s += wF * v3.dot(n, e1); }
  if (wH > 0) { const n = v3.norm(hp); c += wH * v3.dot(n, e0); s += wH * v3.dot(n, e1); }
  const rotationConf = clamp(Math.max(wF, wH), 0, 1);
  const rotation = rotationConf > 0 ? Math.atan2(s, c) * DEG : 0; // + = external rotation
  const rotationSource = wF >= wH ? (wF > 0 ? 'forearm' : 'none') : 'hand';
  const rotationValid = rotationConf > 0.35;
  return { elevation, plane, elbowFlex, rotation, rotationValid, rotationConf, rotationSource, comps: { lat: aLat, up: aUp, fwd: aFwd } };
}

/** Classify the movement plane into a human label. */
export function planeLabel(elevation, plane) {
  if (elevation < 20) return 'at side';
  if (plane < -20) return 'extension';
  if (plane < 25) return 'abduction';
  if (plane < 60) return 'scaption';
  if (plane < 105) return 'flexion';
  return 'cross-body';
}

const toV = (p) => [p.x, -p.y, -p.z]; // MediaPipe world: y down, z toward camera negative.

/** Build the torso frame from world landmarks. Returns null if shoulders are not visible. */
/**
 * Whole-trunk pose relative to the camera, in degrees.
 * yaw: + = subject's right shoulder forward (turned to their left). hipYaw: same for the pelvis.
 * separation = shoulder yaw - hip yaw (the tennis "X-factor" coil).
 * flex: + = bending forward. lean: + = side-bend toward subject's right.
 */
export function torsoPose(world, T = torsoFrame(world)) {
  const yawOf = (l, r) => {
    const L = toV(world[l]), R = toV(world[r]);
    return Math.atan2(R[2] - L[2], L[0] - R[0]) * DEG;
  };
  const yaw = yawOf(LM.L_SH, LM.R_SH);
  const hipYaw = T.hipsVisible ? yawOf(LM.L_HIP, LM.R_HIP) : null;
  const flex = T.hipsVisible ? Math.atan2(T.up[2], T.up[1]) * DEG : null;
  // Side-bend measured across the body: project trunk axis on the shoulder line.
  const latR = v3.norm(v3.sub(toV(world[LM.R_SH]), toV(world[LM.L_SH])));
  const lean = T.hipsVisible ? Math.asin(clamp(v3.dot(T.up, latR), -1, 1)) * DEG : null;
  return { yaw, hipYaw, separation: hipYaw == null ? null : yaw - hipYaw, flex, lean };
}

export function torsoFrame(world) {
  const ls = toV(world[LM.L_SH]), rs = toV(world[LM.R_SH]);
  const lh = toV(world[LM.L_HIP]), rh = toV(world[LM.R_HIP]);
  const midSh = v3.avg(ls, rs);
  const hipsVisible = Math.min(world[LM.L_HIP].visibility ?? 1, world[LM.R_HIP].visibility ?? 1) > 0.5;
  let up = hipsVisible ? v3.norm(v3.sub(midSh, v3.avg(lh, rh))) : [0, 1, 0];
  const latR = v3.norm(v3.perp(v3.sub(rs, ls), up));
  let fwd = v3.norm(v3.cross(up, latR));
  const nose = toV(world[LM.NOSE]);
  if (v3.dot(v3.sub(nose, midSh), fwd) < 0) fwd = v3.scale(fwd, -1);
  return { up, latR, fwd, midSh, hipsVisible };
}

/**
 * Full per-frame metrics for both sides.
 * world: 33 world landmarks; image: 33 normalized image landmarks.
 */
export function computeMetrics(world, image, state, hands) {
  const T = torsoFrame(world);
  const shW = Math.hypot(image[LM.L_SH].x - image[LM.R_SH].x, image[LM.L_SH].y - image[LM.R_SH].y) || 1e-3;
  const midShImg = { x: (image[LM.L_SH].x + image[LM.R_SH].x) / 2, y: (image[LM.L_SH].y + image[LM.R_SH].y) / 2 };
  const midHipImg = { x: (image[LM.L_HIP].x + image[LM.R_HIP].x) / 2, y: (image[LM.L_HIP].y + image[LM.R_HIP].y) / 2 };
  // Lateral trunk lean in the image plane; positive = leaning toward subject's right.
  const lean = Math.atan2(midShImg.x - midHipImg.x, midHipImg.y - midShImg.y) * DEG;

  const out = { frame: T, lean: -lean, torso: torsoPose(world, T), shoulderWidthImg: shW, sides: {} };
  for (const s of ['L', 'R']) {
    const I = SIDE_IDX[s];
    const sh = toV(world[I.sh]), el = toV(world[I.el]), wr = toV(world[I.wr]);
    const u = v3.norm(v3.sub(el, sh));
    const f = v3.norm(v3.sub(wr, el));
    const lat = s === 'R' ? T.latR : v3.scale(T.latR, -1);
    const hand = handAxis3D(hands?.[s]) ?? handAxis(world, image, I);
    const k = armKinematics(u, f, { up: T.up, fwd: T.fwd, lat }, hand);
    if (state) applyHysteresis(k, state[s] ??= {});
    const vis = Math.min(image[I.sh].visibility ?? 1, image[I.el].visibility ?? 1, image[I.wr].visibility ?? 1);
    // Neck-to-shoulder vertical gap (image), normalized. Shrinks when the shoulder hikes.
    const neckGap = (image[I.sh].y - image[I.ear].y) / shW;
    const armVis = Math.min(image[I.sh].visibility ?? 1, image[I.el].visibility ?? 1);
    out.sides[s] = { ...k, visibility: vis, armVis, wristVis: image[I.wr].visibility ?? 1, neckGap, wristWorld: wr, u, f, handConf: hand?.conf ?? 0 };
  }
  return out;
}

/**
 * Knuckle line from the 21-point hand model: pinky MCP (17) -> index MCP (5), in
 * metric 3D. Unlike the pose model's 3 hand points it resolves palm up vs palm back.
 */
function handAxis3D(h) {
  const w = h?.world;
  if (!w || w.length < 18) return null;
  const d = v3.sub(toV(w[5]), toV(w[17]));
  const len = v3.len(d);
  const conf = clamp(h.score ?? 0.8, 0, 1) * smoothstep(len, 0.025, 0.045);
  return conf > 0 ? { axis: v3.scale(d, 1 / len), conf } : null;
}

/** Fallback knuckle line (pinky->index) from the pose model's crude hand points. */
function handAxis(world, image, I) {
  const pk = world[I.pinky], ix = world[I.index];
  if (!pk || !ix) return null;
  const d = v3.sub(toV(ix), toV(pk));
  const len = v3.len(d);
  const vis = Math.min(image[I.pinky]?.visibility ?? 1, image[I.index]?.visibility ?? 1);
  const conf = smoothstep(vis, 0.3, 0.7) * smoothstep(len, 0.012, 0.03);
  return conf > 0 ? { axis: v3.scale(d, 1 / len), conf } : null;
}

// Straight-arm roll spans roughly -150° (palm back, pronated) to +210° (palm up and
// past it), so the angle wraps in the physically impossible zone below -150°.
const WRAP_LO = -150;

// Keep the reading on through brief confidence dips and ease source handovers.
function applyHysteresis(k, st) {
  const on = st.valid ? k.rotationConf > 0.2 : k.rotationConf > 0.4;
  if (on && st.valid && st.rot != null) {
    let d = k.rotation - st.rot;
    d -= 360 * Math.round(d / 360);
    // Low-confidence frames move the estimate less. Unwrapped, so rolling past
    // palm-up (~180°) keeps counting instead of jumping to -180°.
    k.rotation = st.rot + d * (0.35 + 0.65 * clamp(k.rotationConf, 0, 1));
  } else if (on && k.rotation < WRAP_LO) {
    k.rotation += 360;
  }
  if (k.rotation > WRAP_LO + 400) k.rotation -= 360;
  else if (k.rotation < WRAP_LO - 40) k.rotation += 360;
  st.valid = on;
  st.rot = on ? k.rotation : null;
  k.rotationValid = on;
}

/** One Euro filter for jitter-free but responsive landmarks. */
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: null });
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000);
    this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

export class LandmarkSmoother {
  constructor(n = 33) { this.filters = Array.from({ length: n }, () => [new OneEuro(), new OneEuro(), new OneEuro()]); }
  apply(lms, t) {
    return lms.map((p, i) => {
      const f = this.filters[i];
      return { x: f[0].filter(p.x, t), y: f[1].filter(p.y, t), z: f[2].filter(p.z, t), visibility: p.visibility };
    });
  }
}

/** Smooth 0..1 bump centred at c with half-width w. */
export const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
export const smoothstep = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Estimated tissue-load indices (0..1) for the stress-zone overlay. These are
 * heuristics based on known provocative positions, not measurements of tissue.
 */
export function loadIndices(side, extra = {}) {
  const { elevation: e, plane: p, rotation: r, rotationValid, elbowFlex } = side;
  const rot = rotationValid ? r : 0;
  const hike = extra.hike ?? 0;
  const ir = smoothstep(-rot, 0, 60);
  const er = smoothstep(rot, 50, 105);
  const abductedNinety = bump(e, 92, 22);
  return {
    subacromial: clamp(bump(e, 95, 28) * (0.55 + 0.45 * ir) * (p < 50 ? 1 : 0.75) + smoothstep(hike, 8, 25) * 0.3, 0, 1),
    internal: clamp(abductedNinety * er * (p < 40 ? 1.1 : 0.7), 0, 1),
    superiorLabrum: clamp(abductedNinety * er * 0.8 + bump(e, 90, 18) * smoothstep(p, 100, 125) * ir, 0, 1),
    biceps: clamp(bump(e, 90, 25) * smoothstep(p, 55, 95) * smoothstep(40 - elbowFlex, 0, 40) + abductedNinety * er * 0.5, 0, 1),
    acJoint: clamp(smoothstep(e, 150, 178) + bump(e, 90, 25) * smoothstep(p, 110, 140), 0, 1),
    scapulothoracic: clamp(smoothstep(hike, 10, 30) * 0.7 + smoothstep(e, 120, 170) * 0.3, 0, 1),
    lat: clamp(smoothstep(e, 130, 175) * (0.6 + 0.4 * smoothstep(rot, 0, 60)), 0, 1),
  };
}

/**
 * Inverse of armKinematics for a canonical right-side model frame
 * (lat = +x, up = +y, fwd = +z). Angles in degrees. Used by demo mode.
 */
export function armFromAngles(elevation, plane, rotation, elbowFlex) {
  const e = elevation / DEG, p = plane / DEG, r = rotation / DEG, fl = elbowFlex / DEG;
  const u = v3.norm([Math.sin(e) * Math.cos(p), -Math.cos(e), Math.sin(e) * Math.sin(p)]);
  const down = [0, -1, 0];
  const e0 = v3.norm(v3.perp(carry([0, 0, 1], down, u, [1, 0, 0]), u));
  const e1 = v3.norm(v3.perp(carry([1, 0, 0], down, u, [0, 0, 1]), u));
  const fp = v3.add(v3.scale(e0, Math.cos(r)), v3.scale(e1, Math.sin(r)));
  const f = v3.norm(v3.add(v3.scale(u, Math.cos(fl)), v3.scale(fp, Math.sin(fl))));
  return { u, f };
}
