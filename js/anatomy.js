// Procedural, pose-driven 3D shoulder anatomy (Three.js). Educational model:
// proportions are approximate. Units are centimetres. The canonical model is a
// RIGHT shoulder (x = lateral, y = up, z = anterior); the left side is mirrored.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { armFromAngles, clamp, smoothstep } from './metrics.js';
import { fitAnatomyBounds } from './framing.js';
import {
  buildThorax, buildSkull, buildPelvis, buildClavicle, buildScapula, buildAcromion, buildCoracoid,
  buildHumerus, buildForearm, buildHandBones, buildHeadNeckTorsoSkin, buildHipSkin, buildUpperArmSkin, buildForearmSkin,
} from './body-mesh.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

// Scapular plane: 35° anterior to the frontal plane.
const SPA = 35 * RAD;
const D = V(Math.cos(SPA), 0, Math.sin(SPA)); // in-plane lateral
const Y = V(0, 1, 0);
const N = V(-Math.sin(SPA), 0, Math.cos(SPA)); // plane normal, anteromedial
const DEG2RAD = Math.PI / 180;
const G = V(17, -3.5, -6); // glenoid centre (biacromial width ≈ 39 cm)
const SC = V(1.8, 0.5, 3);
const AC = V(18.5, 2.8, -4.5);
const HEAD = G.clone().addScaledVector(D, 2.4);
/** Scapula coordinates: a = along the blade laterally, b = up, c = + anterior (rib side). */
const sp = (a, b, c = 0) => G.clone().addScaledVector(D, a).addScaledVector(Y, b).addScaledVector(N, c);
const v = (a) => (a.isVector3 ? a : V(a[0], a[1], a[2]));

// ---------- Tube with a variable (and optionally flattened) cross-section ----------
function makeTube(segs = 36, radial = 14) {
  const g = new THREE.BufferGeometry();
  const n = (segs + 1) * (radial + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      uv[k * 2] = i / segs; uv[k * 2 + 1] = j / radial;
      if (i < segs && j < radial) { const a = k, b = k + radial + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData = { segs, radial };
  return g;
}

const _P = V(0, 0, 0), _T = V(0, 0, 0), _N = V(0, 0, 0), _B = V(0, 0, 0), _t = V(0, 0, 0);
function updateTube(g, curve, radiusAt, flat = 1) {
  const { segs, radial } = g.userData;
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  curve.getTangentAt(0, _T);
  _N.set(0, 0, 1);
  if (Math.abs(_T.z) > 0.9) _N.set(1, 0, 0);
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    curve.getPointAt(s, _P); curve.getTangentAt(s, _T);
    // Parallel transport keeps the cross-section from twisting.
    _N.sub(_t.copy(_T).multiplyScalar(_T.dot(_N))).normalize();
    _B.crossVectors(_T, _N);
    const r = radiusAt(s);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const k = (i * (radial + 1) + j) * 3;
      const ox = c * _N.x + sn * flat * _B.x, oy = c * _N.y + sn * flat * _B.y, oz = c * _N.z + sn * flat * _B.z;
      let nx = flat * c * _N.x + sn * _B.x, ny = flat * c * _N.y + sn * _B.y, nz = flat * c * _N.z + sn * _B.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      pos[k] = _P.x + ox * r; pos[k + 1] = _P.y + oy * r; pos[k + 2] = _P.z + oz * r;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
}

/** Muscle-belly profile: thin tendon at both ends, fullest at `peak`. */
const spindle = (r, min = 0.22, peak = 0.5, pow = 0.75) => (s) => {
  const u = s < peak ? 0.5 * (s / peak) : 0.5 + 0.5 * ((s - peak) / (1 - peak));
  return r * (min + (1 - min) * Math.pow(Math.sin(Math.PI * u), pow));
};
const taper = (r0, r1) => (s) => r0 + (r1 - r0) * s;
const constant = (r) => () => r;
const bone = (r, ends = 1.35) => (s) => r * (1 + (ends - 1) * (Math.pow(1 - s, 6) + Math.pow(s, 6)));

// ---------- Procedural textures ----------
function fiberTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 16, 256);
  for (let y = 0; y < 256; y += 2) {
    const k = 170 + Math.floor(Math.random() * 85);
    x.fillStyle = `rgb(${k},${k},${k})`;
    x.fillRect(0, y, 16, 1 + (Math.random() < 0.3 ? 1 : 0));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,1)';
  x.lineWidth = 7;
  x.shadowColor = 'white'; x.shadowBlur = 14;
  x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  return new THREE.CanvasTexture(c);
}

export const LAYERS = [
  { id: 'skin', label: 'Skin', color: '#cecec8', def: 0.04 },
  { id: 'muscles', label: 'Muscles', color: '#aaa9a1', def: 0.12 },
  { id: 'cuff', label: 'Rotator cuff', color: '#aaa9a1', def: 0.5 },
  { id: 'tendons', label: 'Tendons', color: '#c6c6bf', def: 0.65 },
  { id: 'nerves', label: 'Nerves', color: '#8f8b80', def: 0.35 },
  { id: 'bones', label: 'Skeleton', color: '#d8d8d2', def: 1 },
  { id: 'labrum', label: 'Labrum & bursa', color: '#b7b7af', def: 0.5 },
];

// ---------- Fixed landmarks (scapula coords unless noted) ----------
const AC0 = sp(1.6, 4.6, 1.2);
const ELBOW_H = V(0.3, -29.5, 0.2); // elbow centre in the humerus frame
const STRUCT = {}; // id -> { id, name, layer, depth, info, meshes: [] }

export function createAnatomy(container, { onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0xededeb, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 1200);
  const HOME = { pos: V(10, -4, 290), target: V(0, -28, 0) };
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 22;
  controls.maxDistance = 800;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8e8e87, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(50, 60, 70); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfafaf9, 0.7); rim.position.set(-40, 25, -70); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-50, -20, 40); scene.add(fill);

  // Floor halo for grounding
  const halo = new THREE.Mesh(new THREE.CircleGeometry(46, 64), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: 0x85857e, transparent: true, opacity: 0.04, depthWrite: false,
  }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(0, -73, 0);
  scene.add(halo);

  // Trunk pivot at the pelvis: torso yaw / bend / side-bend rotate everything above it.
  // Kept outside `root` so the left/right mirror (root.scale.x) doesn't flip the turn.
  const PELVIS = V(0, -42, -1.5);
  const trunk = new THREE.Group();
  trunk.position.copy(PELVIS);
  scene.add(trunk);
  const root = new THREE.Group();
  root.position.copy(PELVIS).negate();
  trunk.add(root);
  const torsoT = { yaw: 0, flex: 0, lean: 0 }, torsoC = { yaw: 0, flex: 0, lean: 0 };
  const fibers = fiberTexture();
  const glowTex = glowTexture();
  const ringTex = ringTexture();
  const tmpC = new THREE.Color();

  // ---------- Materials ----------
  const mats = [];
  function mat(kind, color, extra = {}) {
    let m;
    if (kind === 'skin') {
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, transmission: 0, clearcoat: 0.3, transparent: true, depthWrite: false, ...extra });
    } else {
      m = new THREE.MeshStandardMaterial({ color, roughness: kind === 'bone' ? 0.62 : 0.5, metalness: 0, ...extra });
    }
    m.color.setHex(({ bone: 0xd8d8d2, muscle: 0xaaa9a1, tendon: 0xc6c6bf, nerve: 0x8f8b80, labrum: 0xb7b7af, skin: 0xcecec8 })[kind] ?? 0xb7b7af);
    m.emissive.setHex(0x000000);
    m.emissiveIntensity = 0;
    m.userData.baseColor = m.color.clone();
    m.side = THREE.DoubleSide;
    m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0;
    m.userData.baseIntensity = m.emissiveIntensity ?? 1;
    m.userData.layer = kind;
    mats.push(m);
    return m;
  }
  const boneMat = () => mat('bone', 0xece3cf, { emissive: 0x1a1408, emissiveIntensity: 0.4 });
  const muscleMat = (color = 0xc4454f) => mat('muscle', color, { map: fibers, roughness: 0.48, emissive: 0x200406, emissiveIntensity: 0.6 });
  const tendonMat = () => mat('tendon', 0xf1e7d2, { roughness: 0.32, emissive: 0x221a10, emissiveIntensity: 0.5 });
  const nerveMat = () => mat('nerve', 0xf6d35a, { emissive: 0x6a4a00, emissiveIntensity: 0.9, roughness: 0.35 });

  // ---------- Pose frames ----------
  const frames = { T: new THREE.Matrix4(), C: new THREE.Matrix4(), S: new THREE.Matrix4(), H: new THREE.Matrix4(), F: new THREE.Matrix4() };
  const groups = {};
  for (const k of ['C', 'S', 'H', 'F']) {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    root.add(g);
    groups[k] = g;
  }
  groups.T = root;
  const anchor = (frame, p) => ({ frame, p: v(p) });
  const resolve = (a, out = new THREE.Vector3()) => out.copy(a.p).applyMatrix4(frames[a.frame]);

  function register(id, name, layer, depth, info, meshes) {
    const s = STRUCT[id] || (STRUCT[id] = { id, name, layer, depth, info, meshes: [], hot: 0, strain: 0 });
    for (const m of meshes) {
      // Each structure owns its material so tint/opacity never bleed between structures.
      if (m.material.userData.owner && m.material.userData.owner !== id) {
        const baseColor = m.material.userData.baseColor;
        m.material = m.material.clone();
        // Three.js serializes userData colors to hex numbers when cloning.
        m.material.userData.baseColor = baseColor.clone();
        mats.push(m.material);
      }
      m.material.userData.owner = id;
      m.userData.struct = s;
      s.meshes.push(m);
    }
    return s;
  }

  function addMesh(frame, geo, material, id, name, layer, depth, info) {
    const m = new THREE.Mesh(geo, material);
    groups[frame].add(m);
    register(id, name, layer, depth, info, [m]);
    return m;
  }

  // ---------- Static geometry helpers ----------
  function staticTube(points, radiusFn, flat = 1, segs = 28, radial = 12) {
    const g = makeTube(segs, radial);
    updateTube(g, new THREE.CatmullRomCurve3(points.map(v)), radiusFn, flat);
    return g;
  }
  function ellipsoid(c, s, seg = 28) {
    const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
    g.scale(s[0], s[1], s[2]);
    g.translate(c[0], c[1], c[2]);
    return g;
  }
  const basisMatrix = (x, y, z, o) => new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);

  // ---------- Axial skeleton: vertebral column, ribs, costal cartilage, sternum, skull, pelvis ----------
  const thoraxMat = boneMat();
  const thx = buildThorax();
  addMesh('T', thx.bone, thoraxMat, 'thorax', 'Spine & rib cage', 'bones', 3, 'Thoracic spine and ribs — the scapula glides over this surface.');
  const cartMat = mat('bone', 0xcfdde0, { roughness: 0.4, emissive: 0x0c1a20, emissiveIntensity: 0.4 });
  addMesh('T', thx.cartilage, cartMat, 'thorax');
  addMesh('T', buildSkull(), thoraxMat, 'thorax');
  // Pelvis and hips stay put while the trunk above them turns/bends.
  const fixed = new THREE.Group();
  scene.add(fixed);
  groups.P = fixed;
  addMesh('P', buildPelvis(), thoraxMat, 'thorax');

  // ---------- Clavicle ----------
  addMesh('C', buildClavicle(SC, AC0), boneMat(),
    'clavicle', 'Clavicle', 'bones', 3, 'Collarbone. Its strut keeps the shoulder out to the side; the AC joint is at its outer end.');

  // ---------- Scapula ----------
  const scapMat = boneMat();
  addMesh('S', buildScapula(sp, D, Y, N), scapMat, 'scapula', 'Scapula (shoulder blade)', 'bones', 3,
    'The shoulder blade. It must rotate upward and tilt back as you raise the arm; poor control here (dyskinesis) narrows the space for the cuff.');
  addMesh('S', buildAcromion(sp), scapMat,
    'acromion', 'Acromion', 'bones', 3, 'Roof of the shoulder. The supraspinatus tendon and bursa sit just beneath it — the classic impingement spot.');
  addMesh('S', buildCoracoid(sp, D), scapMat,
    'coracoid', 'Coracoid process', 'bones', 3, 'Hook of bone at the front; anchors the short head of biceps, pec minor and coracobrachialis.');

  // Glenoid socket + labrum (local frame: +Y -> medial(-D), +X -> up, +Z -> N; centred on the head)
  const glenoidM = basisMatrix(Y, D.clone().negate(), N, HEAD).multiply(new THREE.Matrix4().makeScale(1.25, 1, 0.86));
  const cup = new THREE.SphereGeometry(2.72, 40, 10, 0, Math.PI * 2, 0, 0.78);
  cup.applyMatrix4(glenoidM);
  addMesh('S', cup, mat('bone', 0xd9e6f0, { roughness: 0.25, emissive: 0x0a2030, emissiveIntensity: 0.6 }),
    'glenoid', 'Glenoid (socket)', 'bones', 3, 'The shallow socket. Only ~25–30% of the ball contacts it at once — the labrum and cuff keep the ball centred.');
  const rimR = 2.72 * Math.sin(0.78), rimY = 2.72 * Math.cos(0.78);
  const labMat = mat('labrum', 0x6fd9ea, { emissive: 0x0f5260, emissiveIntensity: 0.8, roughness: 0.3, transparent: true });
  const slapMat = mat('labrum', 0x8ee8f5, { emissive: 0x166a78, emissiveIntensity: 0.9, roughness: 0.3, transparent: true });
  const ring = (arc, start, m, id, name, info) => {
    const g = new THREE.TorusGeometry(rimR, 0.34, 10, 40, arc);
    g.rotateZ(start); g.rotateX(Math.PI / 2); g.translate(0, rimY, 0);
    g.applyMatrix4(glenoidM);
    return addMesh('S', g, m, id, name, 'labrum', 3, info);
  };
  ring(Math.PI * 1.45, Math.PI * 0.275, labMat, 'labrum', 'Glenoid labrum',
    'Fibrocartilage rim that deepens the socket. Tears cause deep clicking, catching and a sense of instability.');
  ring(Math.PI * 0.55, -Math.PI * 0.275, slapMat, 'slap', 'Superior labrum / biceps anchor (SLAP zone)',
    'Where the long head of biceps anchors. Repeated serve/throw “peel-back” in the cocked position can tear it — painful deep clicks overhead.');

  // Subacromial bursa (between acromion and the supraspinatus tendon)
  const bursaGeo = ellipsoid([0, 0, 0], [2.6, 0.42, 2.0], 24);
  bursaGeo.applyMatrix4(basisMatrix(D, Y, N, sp(2.4, 3.55, 0.5)));
  addMesh('S', bursaGeo, mat('labrum', 0x7cc8ff, { transparent: true, opacity: 0.55, emissive: 0x123a66, emissiveIntensity: 0.7, roughness: 0.2 }),
    'bursa', 'Subacromial bursa', 'labrum', 3, 'Fluid sac that lets the cuff glide under the acromion. Inflamed bursa = painful arc between ~60° and 120°.');

  // ---------- Humerus ----------
  const humMat = boneMat();
  const hInfo = 'Upper-arm bone. The ball (head) should stay centred on the socket as you move.';
  addMesh('H', new THREE.SphereGeometry(2.45, 36, 24), mat('bone', 0xf2ead8, { roughness: 0.3, emissive: 0x1a1408, emissiveIntensity: 0.35 }),
    'humerus', 'Humerus (head)', 'bones', 3, hInfo);
  addMesh('H', buildHumerus(), humMat, 'humerus');

  // ---------- Forearm & hand ----------
  const faMat = boneMat();
  addMesh('F', buildForearm(), faMat,
    'forearm', 'Radius & ulna', 'bones', 3, 'Forearm bones — the forearm direction tells the camera how far your arm is rotated.');
  addMesh('F', buildHandBones(), faMat, 'forearm');

  // ---------- Skin: translucent with a fresnel rim so the silhouette reads clearly ----------
  function skinMaterial(fade) {
    const m = mat('skin', 0xe6b298, { opacity: 0.14, roughness: 0.5 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vSkinY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSkinY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSkinY;')
        .replace('#include <opaque_fragment>', `
          float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
          float fres = pow(1.0 - nv, 2.6);
          float a = diffuseColor.a, a5 = min(1.0, a * 5.0);
          float alpha = mix(a * (0.5 + 0.5 * (1.0 - nv)), a, a * a) + a5 * fres * 0.6;
          vec3 col = outgoingLight + vec3(0.42, 0.82, 1.0) * fres * 0.55 * a5;
          ${fade ? 'alpha *= smoothstep(-67.0, -55.0, vSkinY);' : ''}
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));`);
    };
    m.customProgramCacheKey = () => (fade ? 'skin-fade' : 'skin');
    return m;
  }
  const skinMat = skinMaterial(false), hipSkinMat = skinMaterial(true);
  // Depth-only prepass: the translucent skin then shows a single clean outer surface.
  const prepassMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  mats.push(prepassMat);
  function addSkin(frame, geo, m = skinMat) {
    const mesh = addMesh(frame, geo, m, 'skin', 'Skin', 'skin', 0, 'Skin surface.');
    const pre = new THREE.Mesh(geo, prepassMat);
    pre.renderOrder = 4;
    mesh.add(pre);
    mesh.userData.prepass = pre;
  }
  const headTorso = buildHeadNeckTorsoSkin();
  addSkin('T', headTorso.head);
  addSkin('T', headTorso.torso);
  addSkin('P', buildHipSkin(), hipSkinMat);
  addSkin('H', buildUpperArmSkin());
  addSkin('F', buildForearmSkin());

  // ---------- Muscles, tendons & nerves (live tubes through moving anchors) ----------
  const T_ = (p) => anchor('T', p), C_ = (p) => anchor('C', p), S_ = (p) => anchor('S', p), H_ = (p) => anchor('H', p), F_ = (p) => anchor('F', p);
  const sa = (a, b, c) => S_(sp(a, b, c));
  const dyn = [];
  function cord(id, name, layer, depth, kind, color, radiusFn, flat, anchors, info, segs = 30, radial = 14) {
    const m = kind === 'muscle' ? muscleMat(color) : kind === 'nerve' ? nerveMat() : tendonMat();
    const geo = makeTube(segs, radial);
    const pts = anchors.map(() => new THREE.Vector3());
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    root.add(mesh);
    const s = register(id, name, layer, depth, info, [mesh]);
    const d = { s, geo, pts, curve, anchors, radiusFn, flat, L0: 0, L: 0 };
    dyn.push(d);
    return d;
  }
  const red = 0xc4454f, cuffC = 0xd8665c, deep = 0xb23a49;
  const bicepsTendonR = constant(0.34);

  // Deltoid
  cord('deltAnt', 'Anterior deltoid', 'muscles', 1, 'muscle', red, spindle(1.7, 0.3, 0.42), 0.6,
    [C_([12, 1.3, 1.0]), H_([2.2, 0.6, 2.8]), H_([2.0, -6, 1.6]), H_([1.6, -13, 0.8])],
    'Front of the shoulder cap. Raises the arm forward; works hard at the start of the serve swing.');
  cord('deltMid', 'Middle deltoid', 'muscles', 1, 'muscle', red, spindle(1.8, 0.3, 0.4), 0.6,
    [sa(3.4, 5.0, 0.4), H_([3.7, -1, 0.2]), H_([2.6, -7, 0.3]), H_([1.7, -13, 0.4])],
    'Side of the shoulder. Lifts the arm out to the side — it relies on the cuff to keep the ball pressed into the socket.');
  cord('deltPost', 'Posterior deltoid', 'muscles', 1, 'muscle', red, spindle(1.6, 0.3, 0.42), 0.6,
    [sa(-2.4, 3.8, -2.7), H_([1.9, -0.6, -2.9]), H_([1.8, -7, -1.2]), H_([1.5, -13, 0])],
    'Back of the shoulder. Decelerates the arm after contact in the follow-through.');
  // Rotator cuff
  cord('supraspinatus', 'Supraspinatus', 'cuff', 2, 'muscle', cuffC, spindle(1.25, 0.32, 0.35), 0.75,
    [sa(-8.6, 3.2, -1.1), sa(-3.4, 3.4, -0.7), sa(0.8, 3.2, -0.1), H_([1.3, 1.9, 0.3]), H_([2.0, 0.3, 0.4])],
    'Top cuff tendon — runs under the acromion. The most common source of serve pain (tendinopathy / impingement).');
  cord('infraspinatus', 'Infraspinatus', 'cuff', 2, 'muscle', cuffC, spindle(1.7, 0.3, 0.38), 0.5,
    [sa(-7.5, -4, -1.5), sa(-2.5, -1, -2.1), H_([-0.2, 0.4, -2.7]), H_([1.9, -0.5, -1.4])],
    'Back cuff. Rotates the arm out and brakes the arm after ball contact; tight posterior cuff → loss of internal rotation (GIRD).');
  cord('teresMinor', 'Teres minor', 'cuff', 2, 'muscle', cuffC, spindle(0.95, 0.3, 0.4), 0.7,
    [sa(-6.4, -8, -1.3), H_([-0.7, -1.9, -2.4]), H_([1.4, -2.3, -1.4])],
    'Small external rotator below infraspinatus; helps decelerate the serve.');
  cord('subscapularis', 'Subscapularis', 'cuff', 2, 'muscle', cuffC, spindle(1.7, 0.3, 0.38), 0.45,
    [sa(-7.5, -3, 0.9), sa(-1.6, -0.6, 1.8), H_([-0.6, -0.5, 2.5]), H_([0.5, -1.4, 1.9])],
    'Front cuff (under the blade). Internal rotator; also stabilises the biceps tendon in its groove.');
  cord('teresMajor', 'Teres major', 'muscles', 2, 'muscle', deep, spindle(1.1, 0.35, 0.4), 0.7,
    [sa(-8.1, -11.6, -0.6), sa(-4.5, -8, -0.4), H_([-0.6, -5.6, 1.1])],
    '“Lat’s little helper” — runs from the lower blade to the front of the humerus.');
  // Lat (two bands)
  const latInfo = 'Latissimus dorsi — huge back muscle into the front of the humerus. When tight it pulls in overhead reach and serve trophy position; can snap over the lower blade.';
  cord('lat', 'Latissimus dorsi', 'muscles', 1, 'muscle', red, spindle(2.7, 0.25, 0.45), 0.32,
    [T_([2, -36, -8.4]), T_([10, -25, -9.6]), sa(-8.4, -12.6, -1.4), H_([-1.2, -6.2, 0.4]), H_([0.2, -4.1, 1.6])], latInfo);
  const latB = cord('lat', 'Latissimus dorsi', 'muscles', 1, 'muscle', red, spindle(2.2, 0.25, 0.45), 0.3,
    [T_([1.5, -16, -9.8]), sa(-9.2, -10.5, -1.6), H_([-0.9, -5.5, 0.8]), H_([0.2, -4.0, 1.6])], latInfo);
  latB.s.meshes.at(-1).material.color.setHex(0xb94350);
  // Pec major
  const pecInfo = 'Pectoralis major — chest muscle into the front of the humerus. Powers the serve’s acceleration; tightness pulls the shoulder forward.';
  cord('pecMajor', 'Pectoralis major', 'muscles', 1, 'muscle', red, spindle(2.3, 0.28, 0.45), 0.35,
    [C_([5, 0.6, 3.9]), C_([9.5, 0.4, 2.4]), H_([1.4, -5.2, 2.3])], pecInfo);
  cord('pecMajor', 'Pectoralis major', 'muscles', 1, 'muscle', red, spindle(2.6, 0.28, 0.45), 0.32,
    [T_([1.3, -10, 7.6]), T_([8, -9, 6.8]), H_([1.1, -6.6, 2.0])], pecInfo);
  // Biceps
  const bicepsInfo = 'Long head of biceps — its tendon runs through the groove at the front and anchors on the superior labrum. Irritated by the serve’s cocking and deceleration.';
  cord('bicepsLH', 'Biceps long-head tendon', 'tendons', 2, 'tendon', 0, bicepsTendonR, 1,
    [sa(0.3, 2.4, 0), H_([0.8, 2.0, 1.1]), H_([0.6, -0.6, 2.2]), H_([0.5, -2.2, 1.95]), H_([0.4, -7.5, 2.5])], bicepsInfo, 26, 8);
  cord('bicepsLH', 'Biceps long-head tendon', 'muscles', 1, 'muscle', red, spindle(1.55, 0.3, 0.6), 0.85,
    [H_([0.4, -7, 2.5]), H_([0.3, -18, 3.4]), H_([0.3, -26, 2.6]), F_([1.0, -3, 0.9])], bicepsInfo);
  cord('bicepsSH', 'Biceps short head', 'muscles', 1, 'muscle', red, spindle(1.3, 0.25, 0.6), 0.85,
    [sa(0.3, 3.2, 3.6), H_([-0.6, -6, 2.6]), H_([-0.2, -19, 3.2]), F_([1.0, -3, 0.9])],
    'Short head of biceps from the coracoid.');
  // Scapular stabilisers
  cord('trapUpper', 'Upper trapezius', 'muscles', 1, 'muscle', red, spindle(2.0, 0.35, 0.4), 0.35,
    [T_([0.6, 18, -8.5]), T_([4.5, 11, -8.5]), C_([15.5, 1.9, -1.8])],
    'Shrugs the shoulder. Overactive upper trap (shoulder hiking) is a classic compensation for a weak cuff/lower trap.');
  cord('trapMid', 'Middle trapezius', 'muscles', 1, 'muscle', red, spindle(2.0, 0.4, 0.4), 0.28,
    [T_([0.5, -3, -10.6]), sa(-6.5, 2.4, -2.7), sa(-1, 3.9, -2.9)], 'Pulls the blades together; resists the arm dragging the blade forward.');
  cord('trapLower', 'Lower trapezius', 'muscles', 1, 'muscle', red, spindle(1.7, 0.35, 0.45), 0.28,
    [T_([0.5, -19, -10.3]), T_([4, -9, -10.4]), sa(-9.4, 1.8, -1.9)],
    'Key upward rotator & posterior tilter of the blade. Weakness → dyskinesis and less room under the acromion.');
  cord('rhomboids', 'Rhomboids', 'muscles', 2, 'muscle', deep, spindle(1.5, 0.45, 0.5), 0.3,
    [T_([0.8, 5, -10.2]), T_([5, -2, -10.4]), sa(-10.8, -4, -0.9)], 'Hold the blade to the spine. Clicking under the blade can come from here (snapping scapula).');
  const serratusInfo = 'Serratus anterior — wraps the ribs and holds the blade flat. Weak serratus → winging, scapular clicking and impingement.';
  for (const [a, b, rib] of [[-10.6, -1.5, [13.5, -10, 1.5]], [-10.2, -6.5, [14.6, -15, 2.5]], [-8.8, -11.5, [14, -21, 4]]]) {
    cord('serratus', 'Serratus anterior', 'muscles', 2, 'muscle', deep, spindle(1.3, 0.35, 0.4), 0.35,
      [sa(a, b, 1.0), T_([rib[0] - 2, rib[1] + 1, rib[2] - 6]), T_(rib)], serratusInfo, 24, 10);
  }
  // Nerves
  cord('plexus', 'Brachial plexus', 'nerves', 3, 'nerve', 0, constant(0.42), 1,
    [T_([3.5, 12, -1]), T_([8, 5, 1]), sa(-1.8, 1.4, 4.4), H_([-1.4, -4, 1.4]), H_([-1, -15, 1.7]), H_([-0.5, -28, 1.9])],
    'Nerve bundle to the arm. Neck-referred or thoracic-outlet symptoms give tingling, not clicking.', 36, 8);
  cord('suprascapularN', 'Suprascapular nerve', 'nerves', 3, 'nerve', 0, constant(0.3), 1,
    [T_([7, 6, -1.5]), sa(-3.2, 4.1, -0.6), sa(-1.2, 1.4, -1.9), sa(-4.2, -3.5, -2.0)],
    'Supplies supraspinatus & infraspinatus. Can be compressed at the notch in overhead athletes — painless infraspinatus weakness.', 26, 8);
  cord('axillaryN', 'Axillary nerve', 'nerves', 3, 'nerve', 0, constant(0.3), 1,
    [sa(-1.8, -3.6, 0.8), H_([-1.3, -3.6, 0]), H_([0, -4.6, -2.1]), H_([2.4, -5.2, -0.6])],
    'Wraps the neck of the humerus to the deltoid and teres minor.', 24, 8);
  cord('longThoracicN', 'Long thoracic nerve', 'nerves', 3, 'nerve', 0, constant(0.28), 1,
    [T_([5, 8, -2.5]), T_([12, -4, -2]), T_([14.5, -18, 0.5])], 'Supplies serratus anterior; injury → winging.', 24, 8);

  // ---------- Stress glows ----------
  const GLOWS = {
    subacromial: [sa(2.2, 3.6, 0.6)],
    internal: [sa(0.6, 1.5, -1.6)],
    superiorLabrum: [sa(0.4, 2.2, 0)],
    biceps: [H_([0.5, -2, 1.9])],
    acJoint: [C_(AC0)],
    scapulothoracic: [sa(-10, 3.5, 0.6), sa(-8.2, -12.6, 0.6)],
    lat: [sa(-7.4, -14.2, -1.8)],
  };
  const STRESS_STRUCTS = {
    subacromial: ['supraspinatus', 'bursa', 'acromion'], internal: ['infraspinatus', 'slap', 'supraspinatus'],
    superiorLabrum: ['slap'], biceps: ['bicepsLH'], acJoint: ['clavicle', 'acromion'],
    scapulothoracic: ['scapula', 'serratus', 'rhomboids'], lat: ['lat', 'teresMajor'],
  };
  const glows = [];
  for (const [key, list] of Object.entries(GLOWS)) {
    for (const a of list) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4f1f, toneMapped: false, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      const ringS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      glow.renderOrder = ringS.renderOrder = 10;
      root.add(glow, ringS);
      glows.push({ key, a, glow, ring: ringS, v: 0, target: 0 });
    }
  }

  // ---------- Visibility: layers × peel × focus ----------
  const layerVal = Object.fromEntries(LAYERS.map((l) => [l.id, l.def]));
  let peel = 0;
  let focus = null; // Set of struct ids
  let ghost = {}; // id -> opacity multiplier
  const SOFT = new Set(['muscles', 'cuff', 'tendons', 'nerves', 'labrum']);
  const peelFactor = (depth) => depth === 0 ? 1 - smoothstep(peel, 0, 0.25)
    : depth === 1 ? 1 - smoothstep(peel, 0.25, 0.55)
    : depth === 2 ? 1 - smoothstep(peel, 0.55, 0.85) : 1;
  function applyVisibility() {
    for (const s of Object.values(STRUCT)) {
      let o = (layerVal[s.layer] ?? 1) * peelFactor(s.depth);
      if (focus && !focus.has(s.id) && SOFT.has(s.layer)) o *= 0.12;
      if (ghost[s.id] != null) o *= ghost[s.id];
      s.opacity = o;
      for (const m of s.meshes) {
        const mt = m.material;
        m.visible = o > 0.02;
        mt.opacity = o;
        const tr = o < 0.995 || s.layer === 'skin';
        if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; }
        mt.depthWrite = s.layer !== 'skin' && o > 0.6;
        m.renderOrder = s.layer === 'skin' ? 5 : tr ? 2 : 0;
        if (m.userData.prepass) m.userData.prepass.visible = m.visible;
      }
    }
  }

  // ---------- Presets & camera ----------
  const PRESETS = {
    full: { layers: {}, cam: HOME },
    muscles: { layers: { skin: 0.06, nerves: 0.2, bones: 0.75, labrum: 0.3 }, cam: HOME },
    cuff: { layers: { skin: 0, muscles: 0.1, cuff: 1, tendons: 1, nerves: 0.15, labrum: 0.7 }, focus: ['supraspinatus', 'infraspinatus', 'teresMinor', 'subscapularis', 'bursa', 'bicepsLH'],
      cam: { pos: V(46, 24, 42), target: V(16, -3, -4) } },
    labrum: { layers: { skin: 0, muscles: 0, cuff: 0.12, tendons: 1, nerves: 0, labrum: 1 }, focus: ['labrum', 'slap', 'bicepsLH', 'bursa'], ghost: { humerus: 0.14 },
      cam: { pos: V(54, 6, 20), target: V(17, -2, -5) } },
    bones: { layers: { skin: 0, muscles: 0, cuff: 0, tendons: 0.25, nerves: 0, labrum: 0.9 }, cam: HOME },
    biceps: { layers: { skin: 0, muscles: 0.9, cuff: 0.3, tendons: 1, nerves: 0, labrum: 0.8 }, focus: ['bicepsLH', 'bicepsSH', 'slap', 'subscapularis'],
      cam: { pos: V(32, 2, 72), target: V(16, -10, -1) } },
    lat: { layers: { skin: 0, muscles: 1, cuff: 0.6, nerves: 0 }, focus: ['lat', 'teresMajor', 'serratus', 'infraspinatus', 'teresMinor'],
      cam: { pos: V(44, -6, -72), target: V(10, -14, -6) } },
    scapula: { layers: { skin: 0, muscles: 0.95, cuff: 0.4, nerves: 0 }, focus: ['serratus', 'trapUpper', 'trapMid', 'trapLower', 'rhomboids'],
      cam: { pos: V(24, 30, -72), target: V(8, -6, -6) } },
    nerves: { layers: { skin: 0, muscles: 0.12, cuff: 0.15, nerves: 1, labrum: 0.4 }, focus: ['plexus', 'suprascapularN', 'axillaryN', 'longThoracicN'],
      cam: { pos: V(42, 10, 60), target: V(12, -6, -2) } },
  };
  let side = 'R';
  let sideSign = 1;
  let tween = null;
  let demoMode = false, activePreset = 'full', regionView = false;
  function flyTo(cam, dur = 0.8) {
    if (demoMode && ['full', 'muscles', 'bones'].includes(activePreset)) { tween = null; return; }
    const pos = cam.pos.clone(); pos.x *= sideSign;
    const target = cam.target.clone(); target.x *= sideSign;
    tween = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target };
  }
  function applyPreset(name, { frame = true } = {}) {
    activePreset = name;
    regionView = frame && !['full', 'muscles', 'bones'].includes(name);
    const p = PRESETS[name] || PRESETS.full;
    for (const l of LAYERS) layerVal[l.id] = p.layers[l.id] ?? l.def;
    focus = p.focus ? new Set(p.focus) : null;
    ghost = p.ghost || {};
    peel = 0;
    applyVisibility();
    if (frame) flyTo(p.cam);
    else tween = null;
    return { layers: { ...layerVal }, peel };
  }

  // ---------- Pose solve ----------
  const target = { elevation: 8, plane: 30, rotation: 0, elbowFlex: 10, hike: 0 };
  const cur = { ...target };
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _a = V(0, 0, 0), _b = V(0, 0, 0);
  const clavAxis = new THREE.Vector3().subVectors(AC0, SC).normalize().cross(Y).normalize();
  function armFrames(st, out) {
    st._lastZ ||= V(0, 0, 1);
    const elev = clamp(st.elevation, 0, 180);
    const upRot = clamp((elev - 25) * 0.38, 0, 55) * RAD;
    const tilt = -clamp((elev - 30) * 0.2, 0, 20) * RAD;
    const clavEl = (upRot / RAD * 0.3 + clamp(st.hike, 0, 40) * 0.35) * RAD;
    // Clavicle about SC
    out.C.makeTranslation(SC.x, SC.y, SC.z).multiply(_r.makeRotationAxis(clavAxis, clavEl)).multiply(_m.makeTranslation(-SC.x, -SC.y, -SC.z));
    const acW = AC0.clone().applyMatrix4(out.C);
    // Scapula pivots at the AC joint
    out.S.makeTranslation(acW.x, acW.y, acW.z)
      .multiply(_r.makeRotationAxis(N, upRot))
      .multiply(_m.makeRotationAxis(D, tilt))
      .multiply(new THREE.Matrix4().makeTranslation(-AC0.x, -AC0.y, -AC0.z));
    const headW = HEAD.clone().applyMatrix4(out.S);
    // Humerus orientation from the arm angles
    const { u, f } = armFromAngles(elev, st.plane, st.rotation, st.elbowFlex);
    const y = V(-u[0], -u[1], -u[2]).normalize();
    const f90 = armFromAngles(elev, st.plane, st.rotation, 90).f;
    const z = V(f90[0], f90[1], f90[2]);
    z.addScaledVector(y, -z.dot(y));
    if (z.length() > 0.25) st._lastZ.copy(z.normalize()); else z.copy(st._lastZ).addScaledVector(y, -st._lastZ.dot(y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    out.H.makeBasis(x, y, z).setPosition(headW);
    // Forearm
    const elbowW = ELBOW_H.clone().applyMatrix4(out.H);
    const fy = V(-f[0], -f[1], -f[2]).normalize();
    const fx = x.clone().addScaledVector(fy, -x.dot(fy));
    if (fx.length() < 0.2) fx.copy(z).addScaledVector(fy, -z.dot(fy));
    fx.normalize();
    const fz = new THREE.Vector3().crossVectors(fx, fy);
    out.F.makeBasis(fx, fy, fz).setPosition(elbowW);
  }
  function solve() {
    armFrames(cur, frames);
    for (const k of ['C', 'S', 'H', 'F']) { groups[k].matrix.copy(frames[k]); groups[k].matrixWorldNeedsUpdate = true; }
    // Soft tissue
    for (const d of dyn) {
      d.anchors.forEach((a, i) => resolve(a, d.pts[i]));
      d.curve.updateArcLengths();
      d.L = d.curve.getLength();
      updateTube(d.geo, d.curve, d.radiusFn, d.flat);
    }
  }
  // Opposite arm: mirrored clones of the bone/skin meshes, driven by its own angles.
  const otherT = { elevation: 8, plane: 30, rotation: 0, elbowFlex: 10, hike: 0 }, otherC = { ...otherT };
  const frames2 = { C: new THREE.Matrix4(), S: new THREE.Matrix4(), H: new THREE.Matrix4(), F: new THREE.Matrix4() };
  const mirror = new THREE.Group();
  mirror.scale.x = -1;
  root.add(mirror);
  const groups2 = {}, clones = [];
  for (const k of ['C', 'S', 'H', 'F']) {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    mirror.add(g);
    groups2[k] = g;
    groups[k].traverse((o) => {
      if (!o.isMesh || o.material?.userData?.layer === 'muscle' || o.material?.userData?.layer === 'tendon' || o.material?.userData?.layer === 'nerve') return;
      const c = new THREE.Mesh(o.geometry, o.material);
      c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale);
      c.matrixAutoUpdate = o.matrixAutoUpdate; c.matrix.copy(o.matrix);
      c.renderOrder = o.renderOrder;
      c.raycast = () => {};
      g.add(c);
      clones.push([c, o]);
    });
  }
  function solveOther() {
    armFrames(otherC, frames2);
    for (const k of ['C', 'S', 'H', 'F']) { groups2[k].matrix.copy(frames2[k]); groups2[k].matrixWorldNeedsUpdate = true; }
    for (const [c, o] of clones) { c.visible = o.visible; c.renderOrder = o.renderOrder; }
  }
  solve();
  solveOther();
  for (const d of dyn) d.L0 = d.L;

  // ---------- Real bones: CT-derived BodyParts3D meshes (DBCLS, CC BY-SA 2.1 JP), pre-rigged to the pose frames ----------
  // The procedural bones above stay as the fallback until the GLB arrives.
  const BONE_IDS = ['thorax', 'clavicle', 'scapula', 'acromion', 'coracoid', 'humerus', 'forearm'];
  const boneMatFor = { cartilage: cartMat };
  for (const id of BONE_IDS) boneMatFor[id] = STRUCT[id].meshes.at(-1).material;
  new GLTFLoader().load(new URL('../assets/skeleton.glb', import.meta.url).href, (gltf) => {
    if (disposed) return;
    const proc = new Set(BONE_IDS.flatMap((id) => STRUCT[id].meshes));
    gltf.scene.updateMatrixWorld(true);
    const loaded = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const ex = Object.keys(o.userData).length ? o.userData : o.parent?.userData || {};
      if (!groups[ex.frame] || !ex.struct) return;
      const src = o.geometry.attributes.position, p = new THREE.Vector3();
      const arr = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) p.fromBufferAttribute(src, i).applyMatrix4(o.matrixWorld).toArray(arr, i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      geo.setIndex(o.geometry.index.clone());
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const id = ex.struct === 'cartilage' ? 'thorax' : ex.struct;
      loaded.push(addMesh(ex.frame, geo, boneMatFor[ex.struct] || boneMatFor[id], id));
    });
    if (!loaded.length) return;
    for (const m of proc) { m.parent?.remove(m); m.geometry.dispose(); }
    for (const id of BONE_IDS) STRUCT[id].meshes = STRUCT[id].meshes.filter((m) => !proc.has(m));
    for (let i = clones.length - 1; i >= 0; i--) if (proc.has(clones[i][1])) { clones[i][0].parent?.remove(clones[i][0]); clones.splice(i, 1); }
    for (const m of loaded) {
      const k = Object.keys(groups).find((g) => groups[g] === m.parent);
      if (!groups2[k]) continue;
      const c = new THREE.Mesh(m.geometry, m.material);
      c.raycast = () => {};
      groups2[k].add(c);
      clones.push([c, m]);
    }
    applyVisibility();
    solveOther();
  }, undefined, (err) => console.warn('skeleton.glb failed; keeping procedural bones', err));

  // ---------- Stress / strain tint ----------
  const stress = {};
  function setStress(indices = {}) { Object.assign(stress, indices); }
  function tint(now) {
    const strainById = {};
    for (const d of dyn) strainById[d.s.id] = Math.max(strainById[d.s.id] ?? -1, (d.L - d.L0) / d.L0);
    for (const s of Object.values(STRUCT)) s.hot = 0;
    for (const [k, ids] of Object.entries(STRESS_STRUCTS)) for (const id of ids) if (STRUCT[id]) STRUCT[id].hot = Math.max(STRUCT[id].hot, stress[k] || 0);
    for (const s of Object.values(STRUCT)) {
      s.strain = strainById[s.id] ?? 0;
      const stretchHeat = clamp((s.strain - 0.06) / 0.3, 0, 1) * 0.7;
      const heat = Math.max(s.hot, stretchHeat);
      const hov = hovered === s ? 0.55 : 0;
      for (const m of s.meshes) {
        const mt = m.material;
        if (!mt.emissive) continue;
        mt.color.copy(mt.userData.baseColor);
        if (heat > 0.05) mt.color.lerp(tmpC.setHex(0xff4f1f), Math.min(1, heat * 1.2));
        mt.opacity = Math.min(1, s.opacity * (1 + heat * .6));
        if (hov) mt.color.lerp(tmpC.setHex(0x777770), .25);
      }
    }
    for (const g of glows) {
      g.target = stress[g.key] || 0;
      g.v += (g.target - g.v) * 0.15;
      resolve(g.a, g.glow.position);
      g.ring.position.copy(g.glow.position);
      const o = smoothstep(g.v, 0.2, 0.7);
      g.glow.material.opacity = o * 0.42;
      g.glow.scale.setScalar(12 + 8 * g.v);
      const ph = (now * 0.9) % 1;
      g.ring.material.opacity = 0;
      g.ring.material.color.copy(g.glow.material.color);
      g.ring.scale.setScalar((3 + 9 * ph) * (0.6 + g.v * 0.6));
    }
  }

  // ---------- Hover ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  function onMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const cands = [];
    root.traverse((o) => { if (o.isMesh && o.visible && o.userData.struct && o.userData.struct.layer !== 'skin' && o.material.opacity > 0.25) cands.push(o); });
    const hit = ray.intersectObjects(cands, false)[0];
    const s = hit ? hit.object.userData.struct : null;
    hovered = s;
    renderer.domElement.style.cursor = s ? 'help' : '';
    if (onHover) {
      if (!s) onHover(null);
      else {
        const st = s.strain > 0.03 ? ` Stretch now: +${Math.round(s.strain * 100)}%.` : '';
        onHover({ id: s.id, name: s.name, info: s.info + st, hot: s.hot, strain: s.strain, x: e.clientX - r.left, y: e.clientY - r.top });
      }
    }
  }
  const onLeave = () => { hovered = null; onHover && onHover(null); };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  // ---------- Loop ----------
  let raf = 0, last = performance.now(), disposed = false;
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stageBounds = new THREE.Box3(), viewBounds = new THREE.Box3();
  const fitTarget = V(0, -20, 0), corner = V(0, 0, 0), viewDirection = V(0, 0, 1);
  const inverseView = new THREE.Quaternion();
  function fitDemo() {
    scene.updateMatrixWorld(true);
    stageBounds.makeEmpty();
    scene.traverse((mesh) => {
      if (mesh.isMesh && mesh.material?.userData?.layer === 'bone'
        && mesh.material.userData.owner !== 'forearm') stageBounds.expandByObject(mesh);
    });
    // Reserve the maximum overhead fingertip reach, independent of today's pose.
    stageBounds.max.y = Math.max(78, stageBounds.max.y);
    stageBounds.min.y = Math.min(-66, stageBounds.min.y);
    const halfWidth = Math.max(Math.abs(stageBounds.min.x), Math.abs(stageBounds.max.x));
    stageBounds.min.x = -halfWidth;
    stageBounds.max.x = halfWidth;
    inverseView.copy(camera.quaternion).invert();
    viewBounds.makeEmpty();
    for (const x of [stageBounds.min.x, stageBounds.max.x])
      for (const y of [stageBounds.min.y, stageBounds.max.y])
        for (const z of [stageBounds.min.z, stageBounds.max.z]) {
          corner.set(x, y, z).sub(fitTarget).applyQuaternion(inverseView);
          viewBounds.expandByPoint(corner);
        }
    const { distance, target: center } = fitAnatomyBounds(viewBounds, camera.aspect, camera.fov);
    corner.fromArray(center).applyQuaternion(camera.quaternion).add(fitTarget);
    fitTarget.copy(corner);
    viewDirection.set(0, 0, 1).applyQuaternion(camera.quaternion);
    controls.target.copy(fitTarget);
    camera.position.copy(fitTarget).addScaledVector(viewDirection, distance);
    camera.lookAt(fitTarget);
  }
  function frame(nowMs) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
    const k = 1 - Math.exp(-dt * 12);
    let rotT = target.rotation;
    // Unwrap rotation so the arm never spins the long way round
    while (rotT - cur.rotation > 180) rotT -= 360;
    while (rotT - cur.rotation < -180) rotT += 360;
    cur.elevation += (target.elevation - cur.elevation) * k;
    cur.plane += (target.plane - cur.plane) * k;
    cur.rotation += (rotT - cur.rotation) * k;
    cur.elbowFlex += (target.elbowFlex - cur.elbowFlex) * k;
    cur.hike += (target.hike - cur.hike) * k;
    for (const q of ['yaw', 'flex', 'lean']) torsoC[q] += (torsoT[q] - torsoC[q]) * k * 0.6;
    for (const q of ['elevation', 'plane', 'rotation', 'elbowFlex', 'hike']) otherC[q] += (otherT[q] - otherC[q]) * k;
    solveOther();
    // Subject's right is +x and the chest faces +z (camera side).
    trunk.rotation.set(torsoC.flex * DEG2RAD, -torsoC.yaw * DEG2RAD, -torsoC.lean * DEG2RAD, 'YXZ');
    solve();
    if (tween) {
      tween.t += dt / tween.dur;
      const e = ease(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    if (demoMode && !regionView) fitDemo();
    tint(nowMs / 1000);
    halo.material.opacity = 0.06 + 0.03 * Math.sin(nowMs / 1400);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  applyVisibility();

  return {
    setDemoMode(on) {
      demoMode = on;
      if (on) {
        tween = null;
        activePreset = 'full';
        regionView = false;
        controls.target.copy(fitTarget);
        camera.position.set(0, -20, 300);
        controls.update();
      } else flyTo((PRESETS[activePreset] || PRESETS.full).cam);
    },
    setPose(p = {}) {
      for (const k of ['elevation', 'plane', 'elbowFlex', 'hike']) if (Number.isFinite(p[k])) target[k] = p[k];
      if (Number.isFinite(p.rotation) && p.rotationValid !== false) target.rotation = p.rotation;
      if (p.other) {
        for (const q of ['elevation', 'plane', 'elbowFlex', 'hike']) if (Number.isFinite(p.other[q])) otherT[q] = p.other[q];
        if (Number.isFinite(p.other.rotation) && p.other.rotationValid !== false) otherT.rotation = p.other.rotation;
      }
      if (p.torso) for (const q of ['yaw', 'flex', 'lean']) if (Number.isFinite(p.torso[q])) torsoT[q] = p.torso[q];
    },
    setSide(s) {
      const sign = s === 'L' ? -1 : 1;
      if (sign === sideSign) return;
      side = s; sideSign = sign;
      root.scale.x = sign;
      camera.position.x *= -1; controls.target.x *= -1;
      if (tween) { tween.p1.x *= -1; tween.t1.x *= -1; }
      controls.update();
    },
    get side() { return side; },
    applyPreset,
    presets: Object.keys(PRESETS),
    setLayerOpacity(id, val) { layerVal[id] = clamp(val, 0, 1); applyVisibility(); },
    setPeel(val) { peel = clamp(val, 0, 1); applyVisibility(); },
    setStress,
    getStrain() { return Object.fromEntries(Object.values(STRUCT).map((s) => [s.id, s.strain])); },
    resetView() { flyTo(HOME); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    structures: STRUCT,
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      for (const k of Object.keys(STRUCT)) delete STRUCT[k];
    },
  };
}
