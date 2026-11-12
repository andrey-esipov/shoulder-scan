// Procedural human body geometry for the shoulder viewer (units ≈ cm, adult male).
// Frame conventions: x = subject's right, y = up, z = anterior. The arm frames (H, F) have
// their origin at the humeral head / elbow and run along -y; at rest they match the world axes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const v3 = (p) => (p.isVector3 ? p.clone() : V(p[0], p[1], p[2]));
const fnOf = (f) => (typeof f === 'function' ? f : () => f);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));
export const merge = (list) => mergeGeometries(list.filter(Boolean), false);

/** Monotone cubic interpolation (Fritsch–Carlson) — no overshoot between keys. */
export function mono(xsIn, ysIn) {
  const o = xsIn.map((x, i) => [x, ysIn[i]]).sort((a, b) => a[0] - b[0]);
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), n = xs.length;
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function finish(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Swept tube with per-t radius and elliptical section; rounded (closed) ends when cap. */
export function tube(points, o = {}) {
  const { segs = 24, radial = 12, cap = true, up = [0, 1, 0] } = o;
  const r = fnOf(o.r ?? 1), sx = fnOf(o.sx ?? 1), sy = fnOf(o.sy ?? 1);
  const curve = new THREE.CatmullRomCurve3(points.map(v3), false, 'centripetal');
  const L = curve.getLength();
  const upv = v3(up).normalize();
  const pos = [], uv = [], idx = [];
  const side = V(0, 0, 0), u = V(0, 0, 0);
  for (let i = 0; i <= segs; i++) {
    const t = cap ? (1 - Math.cos((Math.PI * i) / segs)) / 2 : i / segs;
    const p = curve.getPointAt(t), T = curve.getTangentAt(t);
    side.crossVectors(T, upv);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(T);
    side.normalize();
    u.crossVectors(side, T).normalize();
    let R = r(t);
    if (cap) { const d = Math.min(t, 1 - t) * L; if (d < R) R *= Math.sqrt(Math.max(0, 1 - ((R - d) / R) ** 2)); }
    const a = sx(t) * R, b = sy(t) * R;
    for (let j = 0; j < radial; j++) {
      const ph = (2 * Math.PI * j) / radial, cs = Math.cos(ph) * a, sn = Math.sin(ph) * b;
      pos.push(p.x + side.x * cs + u.x * sn, p.y + side.y * cs + u.y * sn, p.z + side.z * cs + u.z * sn);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, c, d, b);
  }
  return finish(pos, uv, idx);
}

/**
 * Lofted body segment along y. keys: [y, W, zFront, zBack, zMid?, cx?, p?]
 * Section = superellipse of half-width W (x) with separate front/back depth.
 * mod(x, y, z, W, sz) returns an outward push (cm) for surface detail.
 */
export function loft(keys, o = {}) {
  const { rows = 60, cols = 40, mod, p: p0 = 2 } = o;
  const ks = keys.map((k) => { const [y, W, zf, zb, zm = (zf + zb) / 2, cx = 0, p = p0] = k; return [y, W, zf, zb, zm, cx, p]; });
  const ys = ks.map((k) => k[0]);
  const F = [1, 2, 3, 4, 5, 6].map((c) => mono(ys, ks.map((k) => k[c])));
  const yTop = Math.max(...ys), yBot = Math.min(...ys);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rows; i++) {
    const y = lerp(yTop, yBot, i / (rows - 1));
    const W = Math.max(0, F[0](y)), zf = F[1](y), zb = F[2](y), zm = F[3](y), cx = F[4](y), p = F[5](y);
    for (let j = 0; j < cols; j++) {
      const th = (2 * Math.PI * j) / cols, c = Math.cos(th), s = Math.sin(th);
      const sx = Math.sign(c) * Math.abs(c) ** (2 / p), sz = Math.sign(s) * Math.abs(s) ** (2 / p);
      let x = cx + W * sx;
      let z = sz >= 0 ? zm + (zf - zm) * sz : zm + (zm - zb) * sz;
      if (mod && W > 0.05) {
        const push = mod(x, y, z, W, sz);
        if (push) { const dx = x - cx, dz = z - zm, l = Math.hypot(dx, dz) || 1; x += (dx / l) * push; z += (dz / l) * push; }
      }
      pos.push(x, y, z);
      uv.push(j / cols, i / (rows - 1));
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = a + cols, d = b + cols;
    idx.push(a, b, c, b, d, c);
  }
  return finish(pos, uv, idx);
}

export function ell(c, s, seg = 16, m) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.65)));
  g.scale(s[0], s[1], s[2]);
  if (m) g.applyMatrix4(m);
  g.translate(c[0], c[1], c[2]);
  return g;
}
function cyl(c, r0, r1, h, seg = 14, sxz = [1, 1], m) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  g.scale(sxz[0], 1, sxz[1]);
  if (m) g.applyMatrix4(m);
  g.translate(c[0], c[1], c[2]);
  return g;
}
const mirrorX = (g) => { const m = g.clone(); m.scale(-1, 1, 1); flipWinding(m); return m; };
function flipWinding(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
}
const both = (fn) => { const g = fn(); return [g, mirrorX(g)]; };

// ---------------------------------------------------------------- Axial skeleton
export const SPINE_Z = mono([16.8, 11.4, 6, 3.5, -4, -11.5, -19, -24, -30.8, -37.4, -40.7],
  [-2.6, -1.8, -2.9, -3.4, -5.0, -5.6, -5.3, -4.6, -3.2, -2.6, -3.0]);
const STERN_Z = mono([0.5, -4, -10, -16.5, -21], [4.3, 5.3, 6.8, 7.7, 8.1]);
export const VERT = [];
for (let i = 0; i < 7; i++) VERT.push({ kind: 'C', k: i, y: 16.8 - i * 1.75 });
for (let i = 0; i < 12; i++) VERT.push({ kind: 'T', k: i, y: 3.5 - i * 2.5 });
for (let i = 0; i < 5; i++) VERT.push({ kind: 'L', k: i, y: -27.4 - i * 3.3 });

function vertebra({ kind, k, y }) {
  const z = SPINE_Z(y), parts = [];
  const r = kind === 'C' ? 0.85 + k * 0.05 : kind === 'T' ? 1.2 + (0.6 * k) / 11 : 2.0 + k * 0.1;
  const h = kind === 'C' ? 1.0 : kind === 'T' ? 1.55 + (0.5 * k) / 11 : 2.35;
  parts.push(cyl([0, y, z], r, r * 1.05, h, 16, [1.18, 0.95]));
  const ar = kind === 'C' ? 0.24 : kind === 'T' ? 0.3 : 0.42;
  const back = z - r * 0.9;
  parts.push(tube([[-r * 0.6, y, z - r * 0.7], [-1.15, y, back - 0.9], [0, y - 0.1, back - 1.4], [1.15, y, back - 0.9], [r * 0.6, y, z - r * 0.7]], { r: ar, segs: 14, radial: 7 }));
  // spinous process
  const sp0 = [0, y - 0.1, back - 1.3];
  let drop, len, sy;
  if (kind === 'C') { drop = 0.6 + (k === 6 ? 0.5 : 0); len = k === 6 ? 3.4 : k === 0 ? 0.6 : 1.6 + k * 0.15; sy = 1.2; }
  else if (kind === 'T') { drop = 1.0 + 1.6 * Math.sin((Math.PI * (k + 1)) / 13); len = 3.2; sy = 1.5; }
  else { drop = 0.4; len = 2.9; sy = 2.6; }
  parts.push(tube([sp0, [0, y - drop * 0.55, back - 1.3 - len * 0.55], [0, y - drop, back - 1.3 - len]], { r: (t) => lerp(ar * 1.1, ar * 0.9, t), sy, segs: 12, radial: 8 }));
  // transverse processes
  const tp = kind === 'C' ? [r + (k === 0 ? 2.4 : 1.3), y, z - 0.4] : kind === 'T' ? [r + 2.3 - k * 0.08, y + 0.2, back - 0.7] : [r + 3.0, y, z - r * 0.7];
  for (const s of [1, -1]) {
    parts.push(tube([[s * r * 0.55, y, z - r * 0.8], [s * tp[0], tp[1], tp[2]]], { r: ar * (kind === 'L' ? 0.95 : 1), sy: kind === 'L' ? 0.7 : 1, segs: 8, radial: 7 }));
  }
  return parts;
}

const RIBS = [
  // W, lateral drop, cc y, sternal y, cc x, cc z
  [6.4, 1.4, -0.4, -0.8, 4.3, 4.6],
  [9.2, 2.8, -4.2, -4.4, 6.0, 5.5],
  [11.2, 3.8, -7.6, -7.0, 7.0, 6.1],
  [12.6, 4.4, -10.8, -9.5, 7.6, 6.5],
  [13.6, 4.9, -13.9, -12.0, 8.2, 6.7],
  [14.2, 5.2, -16.9, -14.5, 8.8, 6.6],
  [14.6, 5.4, -19.8, -16.6, 9.4, 6.3],
  [14.8, 5.4, -22.4, null, 10.2, 5.5],
  [14.6, 5.2, -24.8, null, 10.8, 4.4],
  [14.1, 5.0, -26.8, null, 11.2, 3.2],
  [13.0, 4.4, null, null],
  [9.8, 3.2, null, null],
];

export function buildThorax() {
  const bone = [], cart = [];
  for (const vt of VERT) bone.push(...vertebra(vt));
  const ccPts = [], joins = [];
  RIBS.forEach(([W, dl, yc, ys, xcc, zcc], i) => {
    const yh = 3.5 - i * 2.5, zh = SPINE_Z(yh);
    const zang = i === 0 ? -7.6 : i === 1 ? -9.2 : i === 11 ? -9.6 : -10.2;
    const pts = [[1.7, yh, zh - 0.5], [3.3, yh - 0.1, zh - 2.7], [Math.max(4.6, 0.45 * W), yh - 0.25 * dl, zang], [0.83 * W, yh - 0.6 * dl, zang * 0.62], [W, yh - dl, -1.6]];
    let end;
    if (yc != null) {
      pts.push([0.9 * W, (yh - dl + yc) / 2 - 0.4, 3.6], [xcc, yc, zcc]);
      end = V(xcc, yc, zcc);
    } else if (i === 10) pts.push([0.9 * W, yh - dl - 1.3, 2.0]);
    else pts[4] = [W, yh - dl, -3.4];
    const flatR = i === 0 ? 0.5 : 0.42;
    const rib = tube(pts, { r: flatR, sx: 0.42, sy: i === 0 ? 1.6 : 1.4, segs: 40, radial: 8 });
    bone.push(rib, mirrorX(rib));
    ccPts.push(end);
    if (ys != null) {
      const zs = STERN_Z(ys), j = V(1.9, ys, zs + 0.2);
      joins.push(j);
      const c = tube([end, V(lerp(xcc, 1.9, 0.55), (yc + ys) / 2 + (ys > yc ? 0.4 : 0), lerp(zcc, zs, 0.55) + 0.5), j], { r: 0.45, sx: 0.55, sy: 1.25, segs: 14, radial: 8 });
      cart.push(c, mirrorX(c));
    } else if (end) {
      const prevC = ccPts[i - 1], prevJ = joins[i - 1] || ccPts[i - 1];
      const tgt = prevC.clone().lerp(prevJ, i === 7 ? 0.5 : 0.35);
      joins.push(tgt);
      const mid = end.clone().lerp(tgt, 0.5).add(V(0, -0.4, 0.5));
      const c = tube([end, mid, tgt], { r: 0.4, sx: 0.55, sy: 1.2, segs: 12, radial: 8 });
      cart.push(c, mirrorX(c));
    }
  });
  // Sternum: manubrium, body, xiphoid
  bone.push(tube([[0, 0.3, 4.2], [0, -1.8, 4.7], [0, -4.1, 5.3]], { r: (t) => lerp(2.5, 1.5, t), sy: 0.42, up: [0, 0, 1], segs: 12, radial: 12 }));
  bone.push(tube([[0, -4.2, 5.35], [0, -10, 6.8], [0, -16.6, 7.7]], { r: (t) => 1.45 + 0.35 * Math.sin(Math.PI * t * 0.8), sy: 0.38, up: [0, 0, 1], segs: 18, radial: 12 }));
  bone.push(tube([[0, -16.6, 7.75], [0, -18.8, 8.0], [0, -20.9, 8.1]], { r: (t) => lerp(0.85, 0.35, t), sy: 0.4, up: [0, 0, 1], segs: 10, radial: 10 }));
  return { bone: merge(bone), cartilage: merge(cart) };
}

export function buildSkull() {
  const p = [];
  // Cranial vault: long front-to-back, flattened at the sides, slightly fuller at the back.
  const vault = new THREE.SphereGeometry(1, 40, 28);
  const P = vault.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const back = z < 0 ? 1.08 : 1;
    x *= 7.0 * (1 - 0.08 * Math.max(0, -y)); y *= y > 0 ? 7.4 : 5.2; z *= 9.2 * back;
    P.setXYZ(i, x, y + 24.8, z - 2.4);
  }
  vault.computeVertexNormals();
  p.push(vault);
  // Facial mass with recessed orbits so the rims sit in bone rather than floating like goggles
  const face = new THREE.SphereGeometry(1, 36, 26);
  const F = face.attributes.position;
  for (let i = 0; i < F.count; i++) {
    let x = F.getX(i) * 5.9, y = F.getY(i) * 4.6 + 18.6, z = F.getZ(i) * 4.4 + 1.6;
    if (z > 2.5) {
      for (const s of [1, -1]) {
        const d = Math.hypot((x - s * 3.0) / 1.9, (y - 20.0) / 1.7);
        if (d < 1.15) z -= 2.6 * Math.cos(Math.min(d, 1) * Math.PI / 2) ** 0.7;
      }
      const dn = Math.hypot(x / 1.1, (y - 17.4) / 1.3);
      if (dn < 1) z -= 1.2 * (1 - dn); // nasal aperture
    }
    F.setXYZ(i, x, y, z);
  }
  face.computeVertexNormals();
  p.push(face);
  // Brow ridge, orbital rims, nasal bridge
  p.push(tube([[-5.6, 21.6, 3.2], [-3.2, 22.2, 5.9], [0, 22.0, 6.5], [3.2, 22.2, 5.9], [5.6, 21.6, 3.2]], { r: 0.75, sy: 1.1, segs: 26, radial: 8 }));
  for (const s of [1, -1]) {
    const ring = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * Math.PI * 2;
      ring.push([s * (3.0 + 1.9 * Math.cos(t)), 20.0 + 1.7 * Math.sin(t), 5.5 - 0.9 * Math.abs(Math.cos(t)) * (s * Math.cos(t) > 0 ? 1.4 : 0.3)]);
    }
    p.push(tube(ring, { r: 0.34, segs: 30, radial: 7, cap: false }));
    p.push(ell([s * 4.9, 18.5, 3.4], [1.5, 1.4, 1.7], 12)); // cheekbone
    p.push(tube([[s * 5.6, 18.6, 2.6], [s * 6.5, 18.4, -0.6], [s * 6.2, 18.0, -3.6]], { r: 0.4, sy: 1.6, segs: 10, radial: 7 })); // zygomatic arch
    p.push(ell([s * 6.4, 16.6, -4.6], [0.9, 1.6, 1.1], 10)); // mastoid
  }
  p.push(tube([[0, 21.2, 6.3], [0, 18.6, 7.2]], { r: 0.55, sx: 0.8, segs: 6, radial: 8 }));
  // Maxilla with the upper tooth row
  p.push(ell([0, 16.6, 3.2], [3.9, 2.6, 3.4], 22));
  const arcade = (y, w, f) => [[w, y, -0.6], [w * 0.92, y, 2.4], [w * 0.62, y, 4.8], [0, y, f], [-w * 0.62, y, 4.8], [-w * 0.92, y, 2.4], [-w, y, -0.6]];
  p.push(tube(arcade(14.5, 3.2, 5.9), { r: 0.5, sy: 2.0, segs: 30, radial: 8 }));
  // Mandible: tall body around the chin, rami rising to the jaw joint
  p.push(tube([[5.0, 13.6, -2.0], [4.6, 12.0, 0.6], [3.2, 10.6, 3.6], [0, 9.8, 5.6], [-3.2, 10.6, 3.6], [-4.6, 12.0, 0.6], [-5.0, 13.6, -2.0]],
    { r: 1.0, sx: 0.7, sy: 1.7, up: [0, 1, 0], segs: 40, radial: 10 }));
  for (const s of [1, -1]) p.push(tube([[s * 5.0, 12.8, -2.2], [s * 5.4, 15.8, -2.8], [s * 5.7, 18.2, -3.4]], { r: 0.9, sx: 0.55, sy: 1.0, up: [0, 0, 1], segs: 10, radial: 8 }));
  p.push(ell([0, 10.1, 5.3], [1.8, 1.2, 1.0], 12)); // chin
  return merge(p);
}

/** Static pelvis + proximal femurs in world coordinates (does not rotate with the trunk). */
export function buildPelvis() {
  const p = [];
  for (const s of [1, -1]) {
    // iliac wing as a thin curved shell between crest and acetabulum
    const crest = new THREE.CatmullRomCurve3([V(s * 3.4, -43.2, -9.0), V(s * 9.5, -37.6, -7.2), V(s * 13.4, -37.2, -2.4), V(s * 12.8, -40.6, 3.6), V(s * 11.4, -43.8, 5.4)]);
    const pos = [], uv = [], idx = [], N = 22, M = 8;
    const acet = V(s * 9.0, -51.8, 0.4);
    for (let i = 0; i <= N; i++) {
      const c = crest.getPointAt(i / N);
      const base = V(s * lerp(4.6, 9.6, sstep(i / N, 0, 0.7)), lerp(-46.5, -49.5, i / N), lerp(-6.4, 2.6, i / N)).lerp(acet, 0.35);
      for (let j = 0; j <= M; j++) {
        const t = j / M, q = c.clone().lerp(base, t);
        q.x += s * 1.2 * Math.sin(Math.PI * t) * 0.6;
        pos.push(q.x, q.y, q.z); uv.push(i / N, t);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    p.push(finish(pos, uv, idx));
    p.push(tube(crest.getSpacedPoints(12), { r: 0.6, sx: 0.6, sy: 1, segs: 30, radial: 8 }));
    // acetabulum rim, pubis, ischium
    p.push(ell([s * 9.0, -51.6, 0.4], [2.6, 2.6, 2.6], 16));
    p.push(tube([[s * 8.6, -51.2, 2.8], [s * 5.0, -53.2, 5.2], [s * 0.7, -54.2, 5.4]], { r: 0.8, sy: 1.4, segs: 12, radial: 8 }));
    p.push(tube([[s * 8.0, -53.0, -1.4], [s * 6.6, -56.2, -2.6], [s * 4.4, -57.0, 0.0], [s * 1.6, -55.6, 4.2]], { r: 0.75, segs: 16, radial: 8 }));
    // femur head, neck, greater trochanter, shaft (cropped)
    p.push(ell([s * 10.0, -51.8, 0.4], [2.35, 2.35, 2.35], 18));
    p.push(tube([[s * 10.6, -52.2, 0.3], [s * 14.0, -54.6, 0.0]], { r: 1.45, sy: 1.2, cap: false, segs: 6, radial: 10 }));
    p.push(ell([s * 15.0, -53.6, -0.6], [1.9, 2.6, 2.1], 14));
    p.push(tube([[s * 14.6, -54.5, 0], [s * 13.6, -62, 0.4], [s * 12.4, -72, 0.6]], { r: 1.45, segs: 14, radial: 10 }));
  }
  // sacrum + coccyx
  p.push(tube([[0, -42.6, -4.2], [0, -46.5, -6.6], [0, -50.5, -7.4], [0, -53.8, -6.4]], { r: (t) => lerp(5.0, 0.9, t ** 0.8), sx: 1, sy: 0.32, up: [0, 0, 1], segs: 18, radial: 12 }));
  return merge(p);
}

// ---------------------------------------------------------------- Shoulder girdle
export function buildClavicle(SC, AC0) {
  const pts = [SC, V(5.5, 1.0, 4.0), V(10, 1.25, 2.7), V(14, 1.5, -0.4), V(16.3, 1.45, -2.7), AC0];
  return tube(pts, { r: (t) => (t < 0.2 ? lerp(0.95, 0.62, t / 0.2) : t > 0.75 ? lerp(0.6, 0.85, (t - 0.75) / 0.25) : 0.6), sy: (t) => lerp(1, 0.5, sstep(t, 0.55, 0.95)), segs: 40, radial: 12 });
}

export function buildScapula(sp, D, Y, N) {
  const parts = [];
  // Blade: thin lens surface over a quad (u lateral→medial, v superior→inferior), wrapped around the ribs.
  const P00 = [-1.4, 2.4], P10 = [-11.2, 4.3], P01 = [-1.4, -2.8], P11 = [-9.4, -13.8];
  const NU = 22, NV = 26;
  const pos = [], uv = [], idx = [];
  const P = (u, v) => {
    let a = lerp(lerp(P00[0], P10[0], u), lerp(P01[0], P11[0], u), v);
    let b = lerp(lerp(P00[1], P10[1], u), lerp(P01[1], P11[1], u), v);
    a -= 0.7 * Math.sin(Math.PI * v) * u ** 3; // convex medial border
    b -= 0.9 * gauss(u, 0.38, 0.1) * (1 - v) ** 8; // suprascapular notch
    const c = -0.9 + 0.013 * (a + 1) ** 2 - 0.45 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    return [a, b, c];
  };
  for (const s of [1, -1]) {
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const u = i / NU, v = j / NV;
      const [a, b, c] = P(u, v);
      const e = Math.min(u, 1 - u, v, 1 - v) * 4;
      const h = (0.08 + 0.22 * Math.sqrt(Math.min(1, e))) * s;
      const q = sp(a, b, c + h);
      pos.push(q.x, q.y, q.z); uv.push(u, v);
    }
  }
  const off = (NU + 1) * (NV + 1), row = NV + 1;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
    idx.push(off + a, off + b, off + c, off + b, off + d, off + c);
  }
  // stitch the two sheets at the boundary
  const ring = [];
  for (let i = 0; i <= NU; i++) ring.push(i * row);
  for (let j = 1; j <= NV; j++) ring.push(NU * row + j);
  for (let i = NU - 1; i >= 0; i--) ring.push(i * row + NV);
  for (let j = NV - 1; j > 0; j--) ring.push(j);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    idx.push(a, b, off + a, b, off + b, off + a);
  }
  const blade = finish(pos, uv, idx);
  parts.push(blade);
  // borders, neck, spine
  parts.push(tube([sp(-1.6, -2.4, -0.7), sp(-4.8, -7.4, -0.7), sp(-8.0, -12.0, -0.5), sp(-9.4, -13.8, -0.4)], { r: (t) => lerp(0.62, 0.32, t), segs: 20, radial: 8 }));
  parts.push(tube([sp(-11.2, 4.3, 0.1), sp(-11.9, -2, 0.2), sp(-11.2, -8.5, 0.0), sp(-9.4, -13.8, -0.4)], { r: 0.28, segs: 20, radial: 7 }));
  parts.push(ell([0, 0, 0], [1.1, 2.7, 1.2], 16, new THREE.Matrix4().makeBasis(D, Y, N)).translate(...sp(-0.9, -0.1, -0.4).toArray()));
  parts.push(tube([sp(-11.2, 1.9, -1.0), sp(-7, 2.6, -1.9), sp(-3.4, 3.4, -2.5), sp(-0.6, 4.4, -2.3)],
    { r: (t) => lerp(0.75, 1.25, t), sx: 0.3, sy: 1, up: N, segs: 22, radial: 10 }));
  return merge(parts);
}

export function buildAcromion(sp) {
  return tube([sp(-1.0, 4.5, -2.4), sp(1.4, 5.0, -1.3), sp(2.8, 4.95, 0.1), sp(3.4, 4.7, 1.5)], { r: 1.25, sy: 0.32, segs: 20, radial: 14 });
}
export function buildCoracoid(sp, D) {
  return tube([sp(-1.6, 2.2, -0.3), sp(-1.3, 3.6, 1.4), sp(-0.2, 3.5, 3.0), sp(0.6, 3.0, 3.7)], { r: (t) => lerp(0.7, 0.45, t), sy: 0.8, up: D, segs: 18, radial: 10 });
}

// ---------------------------------------------------------------- Arm bones (H / F frames)
export function buildHumerus() {
  const p = [];
  p.push(ell([0.75, -1.25, 0.1], [1.9, 1.9, 1.9], 20)); // anatomical neck / metaphysis
  p.push(ell([2.05, -0.75, 0.2], [1.2, 1.5, 1.35], 16)); // greater tubercle
  p.push(ell([0.75, -1.4, 1.7], [0.75, 1.0, 0.7], 12)); // lesser tubercle
  p.push(tube([[1.05, -1.6, 0.15], [1.15, -6, 0.2], [1.0, -15, 0.3], [0.7, -24, 0.2], [0.4, -27.4, 0.0]],
    { r: (t) => (t < 0.12 ? lerp(1.6, 1.2, t / 0.12) : t > 0.82 ? lerp(1.0, 1.5, (t - 0.82) / 0.18) : lerp(1.2, 0.98, (t - 0.12) / 0.7)),
      sx: (t) => lerp(1, 1.7, sstep(t, 0.75, 1)), sy: (t) => lerp(1, 0.7, sstep(t, 0.75, 1)), up: [0, 0, 1], cap: false, segs: 32, radial: 14 }));
  p.push(ell([1.95, -12.5, 0.45], [0.55, 2.2, 0.75], 10)); // deltoid tuberosity
  p.push(ell([0.3, -27.9, 0.0], [2.9, 1.3, 1.2], 16)); // distal flare
  p.push(ell([3.0, -28.4, -0.1], [0.6, 0.9, 0.7], 10)); // lateral epicondyle
  p.push(ell([-2.9, -28.5, -0.2], [1.0, 0.9, 0.8], 10)); // medial epicondyle
  p.push(ell([1.35, -29.5, 0.75], [0.95, 0.95, 0.95], 14)); // capitulum
  p.push(cyl([-0.65, -29.6, 0.3], 1.0, 1.0, 2.3, 14, [1, 1], new THREE.Matrix4().makeRotationZ(Math.PI / 2))); // trochlea
  return merge(p);
}

const FINGERS = [
  // z at knuckle, length, metacarpal base z
  [2.4, 7.4, 1.6], [0.8, 8.2, 0.55], [-0.85, 7.7, -0.5], [-2.4, 6.3, -1.4],
];
const fingerPts = (z, L) => [[-0.15, -35.0, z], [-0.5, -35 - L * 0.45, z * 1.04], [-1.3, -35 - L * 0.95, z * 1.07]];
const THUMB = [[-0.1, -27.3, 2.4], [-0.6, -30.4, 4.1], [-1.3, -33.2, 4.8], [-1.9, -35.2, 4.8]];

export function buildForearm() {
  const p = [];
  // Ulna: olecranon behind the elbow, shaft to a small distal head (little-finger side, posterior in mid-prone)
  p.push(tube([[-0.9, 2.4, -1.5], [-0.9, 0.2, -0.6], [-1.0, -6, -0.6], [-0.8, -16, -1.0], [-0.5, -24.6, -1.5]],
    { r: (t) => (t < 0.12 ? lerp(1.15, 0.8, t / 0.12) : lerp(0.8, 0.55, (t - 0.12) / 0.88)), up: [0, 0, 1], segs: 30, radial: 12 }));
  p.push(ell([-0.85, 0.4, 0.2], [0.9, 1.4, 0.9], 12)); // trochlear notch
  p.push(ell([-0.5, -24.9, -1.5], [0.75, 0.7, 0.75], 10));
  // Radius: head at the capitulum, crossing to the thumb side (anterior in mid-prone)
  p.push(cyl([1.25, -0.5, 0.6], 1.0, 1.0, 0.9, 16));
  p.push(tube([[1.25, -0.9, 0.6], [1.35, -3, 0.6], [1.4, -10, 0.9], [1.0, -18, 1.3], [0.55, -24.4, 1.6]],
    { r: (t) => (t < 0.1 ? 0.65 : t > 0.7 ? lerp(0.75, 1.35, (t - 0.7) / 0.3) : lerp(0.65, 0.75, (t - 0.1) / 0.6)), sx: (t) => lerp(1, 0.65, sstep(t, 0.7, 1)), up: [0, 0, 1], segs: 30, radial: 12 }));
  return merge(p);
}

export function buildHandBones() {
  const p = [];
  p.push(ell([-0.1, -26.9, 0.1], [1.15, 1.35, 2.6], 16)); // carpus
  FINGERS.forEach(([z, L, zb]) => {
    p.push(tube([[-0.05, -28.1, zb], [-0.1, -31.5, (zb + z) / 2], [-0.15, -34.6, z]], { r: (t) => lerp(0.45, 0.4, t), segs: 10, radial: 7 }));
    const c = new THREE.CatmullRomCurve3(fingerPts(z, L).map(v3));
    [[0.05, 0.43], [0.47, 0.73], [0.76, 0.97]].forEach(([a, b], k) => {
      p.push(tube([c.getPointAt(a), c.getPointAt((a + b) / 2), c.getPointAt(b)], { r: 0.36 - k * 0.05, segs: 8, radial: 7 }));
    });
  });
  const tc = new THREE.CatmullRomCurve3(THUMB.map(v3));
  [[0.0, 0.4], [0.44, 0.7], [0.74, 0.97]].forEach(([a, b], k) => {
    p.push(tube([tc.getPointAt(a), tc.getPointAt((a + b) / 2), tc.getPointAt(b)], { r: 0.42 - k * 0.04, segs: 8, radial: 7 }));
  });
  return merge(p);
}

// ---------------------------------------------------------------- Skin
export function buildHeadNeckTorsoSkin() {
  const headMod = (x, y, z, W, sz) => {
    const ax = Math.abs(x);
    let d = 0;
    if (sz > 0) {
      d += 1.9 * gauss(ax, 0, 0.9) * gauss(y, 18.6, 1.4) + 0.8 * gauss(ax, 0, 1.0) * sstep(y, 18, 21) * (1 - sstep(y, 22, 24)); // nose
      d -= 0.7 * gauss(ax, 3.1, 1.3) * gauss(y, 21.8, 1.2); // eye sockets
      d += 0.4 * gauss(ax, 3.3, 1.8) * gauss(y, 23.6, 0.8); // brow
      d += 0.5 * gauss(ax, 0, 1.6) * gauss(y, 10.8, 0.9); // chin
      d += 0.35 * gauss(ax, 0, 2.0) * gauss(y, 15.2, 0.7); // lips
    }
    d += 1.0 * gauss(sz, -0.25, 0.25) * gauss(y, 21, 1.8) * sstep(ax / W, 0.8, 1); // ears
    return d;
  };
  const head = loft([
    [33.0, 0.4, -2.2, -3.6, -2.9], [32.6, 3.0, 0.2, -6.0, -2.9], [31.6, 4.9, 2.8, -8.6, -2.9], [30.0, 6.3, 4.9, -10.6, -2.9],
    [28.0, 7.3, 6.4, -11.9, -2.8], [26.0, 7.75, 7.2, -12.5, -2.6], [24.0, 7.8, 7.6, -12.6, -2.5], [22.0, 7.6, 7.2, -12.2, -2.4],
    [20.0, 7.3, 7.3, -11.4, -2.2], [18.0, 6.8, 7.3, -10.0, -1.6], [16.0, 6.2, 7.2, -8.4, -1.0], [14.0, 5.5, 7.0, -5.8, 0.0],
    [12.0, 4.5, 6.9, -2.8, 1.4], [10.6, 3.2, 6.6, 0.2, 3.0], [9.7, 1.4, 6.0, 2.8, 4.6], [9.4, 0.2, 5.5, 4.0, 4.8],
  ], { rows: 72, cols: 56, mod: headMod, p: 2.1 });

  const torsoMod = (x, y, z, W, sz) => {
    const ax = Math.abs(x), xn = ax / W;
    let d = 0;
    if (sz > 0) {
      d += 1.5 * gauss(xn, 0.42, 0.2) * gauss(y, -8, 4.5) * (y < -12 ? gauss(y, -12, 1.6) : 1); // pectorals
      d -= 0.6 * gauss(ax, 0, 1.2) * sstep(y, -20, -16) * (1 - sstep(y, -2, 1)); // sternal groove
      d -= 0.9 * gauss(ax, 0, 1.8) * gauss(y, 3.5, 1.6); // jugular notch
      d += 0.35 * gauss(xn, 0.24, 0.12) * gauss(y, -27, 6) * sstep(-y, 20, 23); // rectus
      d -= 0.4 * gauss(ax, 0, 0.9) * gauss(y, -36, 1); // navel
      d += 0.45 * gauss(xn, 0.4, 0.22) * gauss(y, 3.3, 1.2) * sstep(xn, 0.1, 0.25); // clavicles
    } else {
      d -= 0.9 * gauss(ax, 0, 1.3) * sstep(y, -42, -36) * (1 - sstep(y, 4, 8)); // spinal furrow
      d += 0.9 * gauss(xn, 0.52, 0.17) * gauss(y, -8, 5.5); // scapulae
      d += 0.7 * gauss(ax, 3.2, 1.6) * gauss(y, -30, 6); // erector spinae
      d += 0.5 * gauss(xn, 0.4, 0.3) * gauss(y, 6, 2.2); // trapezius
    }
    d += 0.6 * gauss(xn, 0.98, 0.06) * gauss(y, -14, 5) * (sz < 0.2 ? 1 : 0.4); // lat edge
    return d;
  };
  // [y, W, zFront, zBack, zMid]
  const torso = loft([
    [18.0, 5.2, 0.6, -7.4, -3.2], [14.0, 5.6, 2.2, -8.0, -3.0], [11.0, 6.0, 2.9, -8.8, -3.0], [9.0, 7.0, 3.3, -9.6, -3.1],
    [7.2, 9.4, 3.9, -10.4, -3.3], [5.6, 12.6, 4.6, -10.9, -3.4], [4.2, 15.4, 5.4, -11.2, -3.5], [2.9, 17.6, 6.0, -11.4, -3.6],
    [1.6, 18.8, 6.7, -11.8, -3.6], [-1.0, 18.4, 7.6, -12.4, -3.3], [-5.0, 17.4, 8.4, -13.0, -3.0], [-9.0, 16.8, 8.8, -13.4, -2.8],
    [-14.0, 16.4, 8.8, -13.4, -2.6], [-19.0, 16.0, 8.5, -13.0, -2.4], [-24.0, 15.6, 8.1, -12.4, -2.3], [-30.0, 15.0, 7.7, -11.6, -2.1],
    [-35.0, 14.8, 7.7, -11.4, -2.0], [-39.0, 15.4, 7.7, -11.8, -2.2], [-44.0, 16.2, 7.4, -12.8, -2.6],
  ], { rows: 130, cols: 64, mod: torsoMod, p: 2.25 });
  return { head, torso };
}

/** Static hips + upper thighs (world coordinates), faded out by the material below ~-56. */
export function buildHipSkin() {
  const hips = loft([
    [-33.0, 14.8, 7.7, -11.4, -2.0], [-38.0, 15.4, 7.7, -11.9, -2.2], [-42.0, 16.4, 7.4, -12.8, -2.6], [-47.0, 17.2, 7.0, -14.2, -3.0],
    [-52.0, 17.6, 6.6, -14.2, -3.0], [-56.0, 17.2, 6.4, -13.0, -3.0], [-58.5, 16.6, 6.2, -11.6, -2.8],
  ], { rows: 50, cols: 64, p: 2.3, mod: (x, y, z, W, sz) => (sz < 0 ? -0.8 * gauss(Math.abs(x), 0, 1.4) * sstep(-y, 44, 50) : 0) });
  const thigh = (s) => loft([[-53, 8.4, 6.6, -9.2, -1.4, s * 8.6], [-60, 8.0, 6.4, -8.4, -1.2, s * 8.8], [-68, 7.4, 6.0, -7.6, -1.0, s * 9.0]], { rows: 22, cols: 36 });
  return merge([hips, thigh(1), thigh(-1)]);
}

export function buildUpperArmSkin() {
  // H frame: origin = humeral head centre, arm along -y; [y, W, zf, zb, zm, cx]
  return loft([
    [6.2, 1.2, 1.0, -1.6, -0.3, 0.4], [5.6, 3.0, 2.6, -3.4, -0.4, 0.5], [4.4, 4.3, 3.8, -4.4, -0.3, 0.5], [2.0, 5.0, 4.6, -4.9, -0.2, 0.3],
    [-1.0, 5.1, 4.8, -5.0, -0.1, 0.0], [-5.0, 4.9, 4.7, -4.8, -0.1, -0.2], [-9.0, 4.6, 4.5, -4.6, 0.0, -0.3], [-13.0, 4.45, 4.8, -4.6, 0.1, -0.3],
    [-18.0, 4.5, 5.0, -4.6, 0.2, -0.2], [-23.0, 4.4, 4.4, -4.3, 0.1, 0.0], [-27.5, 4.2, 3.5, -3.7, -0.1, 0.2], [-31.5, 3.6, 3.0, -3.3, -0.1, 0.3],
  ], { rows: 70, cols: 44, p: 2.1, mod: (x, y, z, W, sz) => (sz > 0.3 ? 0.3 * gauss(y, -18, 4) : 0) });
}

export function buildForearmSkin() {
  // F frame: origin = elbow, forearm along -y, mid-prone (thumb anterior, palm medial)
  const fore = loft([
    [3.4, 2.4, 1.6, -3.2, -0.8, -0.4], [2.2, 3.7, 2.7, -3.4, -0.4, -0.2], [0.0, 4.3, 3.4, -3.3, 0.0, 0.0], [-3.0, 4.5, 3.7, -3.2, 0.2, 0.1],
    [-7.0, 4.2, 3.6, -3.1, 0.2, 0.1], [-12.0, 3.5, 3.3, -2.9, 0.2, 0.0], [-18.0, 2.75, 3.0, -2.8, 0.1, -0.1], [-24.0, 2.05, 2.9, -2.8, 0.0, -0.1],
    [-26.6, 1.95, 3.0, -2.9, 0.0, -0.1],
  ], { rows: 56, cols: 40, p: 2.15 });
  const palm = loft([
    [-25.4, 1.95, 2.9, -2.8, 0, -0.1], [-28.0, 1.8, 3.7, -3.4, 0, -0.2], [-31.0, 1.65, 4.1, -3.8, 0, -0.25], [-34.0, 1.5, 4.1, -3.9, 0, -0.25],
    [-35.8, 1.25, 3.8, -3.6, 0, -0.25, 3.2], [-36.6, 0.35, 2.4, -2.4, 0, -0.3],
  ], { rows: 26, cols: 40, p: 2.6 });
  const parts = [fore, palm];
  for (const [z, L] of FINGERS) parts.push(tube(fingerPts(z, L), { r: (t) => lerp(0.88, 0.7, t), segs: 18, radial: 10, up: [0, 0, 1] }));
  parts.push(tube(THUMB, { r: (t) => lerp(1.25, 0.82, t), segs: 18, radial: 10, up: [0, 0, 1] }));
  parts.push(ell([-0.6, -29.6, 3.0], [1.4, 2.4, 1.5], 14)); // thenar eminence
  return merge(parts);
}
