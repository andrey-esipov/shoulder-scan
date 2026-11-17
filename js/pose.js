import { FilesetResolver, PoseLandmarker, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
import { LM, SIDE_IDX, LandmarkSmoother } from './metrics.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const FOCUS_INK = '#fafaf9';
const OTHER_INK = '#d1d1cb';
const MIN_VIS = 0.4;
const LOST_AFTER = 0.5;

const BASE_EDGES = [
  [LM.L_SH, LM.R_SH], [LM.L_SH, LM.L_HIP], [LM.R_SH, LM.R_HIP], [LM.L_HIP, LM.R_HIP],
  [LM.L_SH, LM.L_EL], [LM.L_EL, LM.L_WR], [LM.R_SH, LM.R_EL], [LM.R_EL, LM.R_WR],
  [LM.L_EAR, LM.NOSE], [LM.NOSE, LM.R_EAR],
];
const BASE_JOINTS = [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SH, LM.R_SH, LM.L_EL, LM.R_EL, LM.L_WR, LM.R_WR, LM.L_HIP, LM.R_HIP];

let landmarkerPromise = null;
let handPromise = null;

// Dedicated hand model: 21 3D points per hand. The pose model's 3 hand points are
// too coarse to tell palm-up from palm-back, which is what straight-arm rotation needs.
async function loadHandLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  try { return await make('GPU'); } catch (e) {
    console.warn('[hand] GPU delegate failed, falling back to CPU', e);
    return make('CPU');
  }
}

// Assign detected hands to the pose's left/right wrist by image distance
// (MediaPipe's own handedness label is unreliable with mirrored webcams).
function matchHands(res, image) {
  const out = {};
  const hands = res?.landmarks || [];
  if (!hands.length || !image) return out;
  const cand = [];
  for (let h = 0; h < hands.length; h++) {
    const w = hands[h][0], m = hands[h][9];
    const size = Math.hypot(m.x - w.x, m.y - w.y) || 0.02;
    for (const side of ['L', 'R']) {
      const pw = image[SIDE_IDX[side].wr];
      if (!pw) continue;
      const d = Math.hypot(pw.x - w.x, pw.y - w.y);
      if (d < Math.max(0.08, 2.5 * size)) cand.push({ h, side, d });
    }
  }
  cand.sort((a, b) => a.d - b.d);
  const used = new Set();
  for (const c of cand) {
    if (used.has(c.h) || out[c.side]) continue;
    used.add(c.h);
    out[c.side] = { image: hands[c.h], world: res.worldLandmarks?.[c.h], score: res.handedness?.[c.h]?.[0]?.score ?? 0.8 };
  }
  return out;
}

async function loadLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  try { return await make('GPU'); } catch (e) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', e);
    return make('CPU');
  }
}

function cameraError(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found. Connect a webcam or load a video file instead.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'The camera is in use by another application. Close it and try again.';
  if (n === 'TimeoutError') return 'The camera did not respond. Answer the browser permission prompt, check System Settings → Privacy & Security → Camera for your browser, and close apps using the camera (Teams, Zoom).';
  return `Could not start the camera: ${e?.message || e}`;
}

const visible = (p) => p && (p.visibility ?? 1) >= MIN_VIS;

/** Draws the skeleton. `map(p)` converts a normalized landmark to canvas px; `s` scales stroke widths. */
function drawSkeleton(ctx, lms, map, s, side, hands) {
  const hi = side && SIDE_IDX[side];
  const pt = (i) => (visible(lms[i]) ? map(lms[i]) : null);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  for (const [a, b] of BASE_EDGES) {
    if (hi && [SIDE_IDX.L, SIDE_IDX.R].some((q) => (a === q.sh && b === q.el) || (a === q.el && b === q.wr))) continue;
    const A = pt(a), B = pt(b);
    if (!A || !B) continue;
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
  }
  ctx.stroke();
  // Shoulder and hip lines carry the torso turn; draw them heavier.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3.5 * s;
  ctx.beginPath();
  for (const [a, b] of [[LM.L_SH, LM.R_SH], [LM.L_HIP, LM.R_HIP]]) {
    const A = pt(a), B = pt(b);
    if (A && B) { ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (const i of BASE_JOINTS) {
    const P = pt(i);
    if (!P) continue;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Both arms stay neutral; the slightly heavier line identifies the focus side.
  for (const sd of side ? [side === 'L' ? 'R' : 'L', side] : []) {
    const hi = SIDE_IDX[sd], primary = sd === side, C = primary ? FOCUS_INK : OTHER_INK;
    ctx.globalAlpha = primary ? 1 : 0.85;
    const S = pt(hi.sh), E = pt(hi.el), W = pt(hi.wr), H = pt(hi.hip);
    if (S && E && H) {
      const a0 = Math.atan2(H[1] - S[1], H[0] - S[0]);
      const a1 = Math.atan2(E[1] - S[1], E[0] - S[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      ctx.strokeStyle = primary ? 'rgba(255,255,255,0.8)' : 'rgba(209,209,203,0.7)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(S[0], S[1], 26 * s, a0, a0 + d, d < 0);
      ctx.stroke();
    }
    ctx.shadowColor = '#0b0b0c';
    ctx.shadowBlur = 2 * s;
    ctx.strokeStyle = C;
    ctx.lineWidth = (primary ? 6 : 4.5) * s;
    ctx.beginPath();
    if (S && E) { ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]); }
    if (E && W) { ctx.moveTo(E[0], E[1]); ctx.lineTo(W[0], W[1]); }
    ctx.stroke();
    // Hand fan (wrist -> pinky / index / thumb) and knuckle line: the rotation cue
    // used when the elbow is straight.
    const Pk = pt(hi.pinky), Ix = pt(hi.index), Th = pt(hi.thumb);
    const hand = hands?.[sd]?.image;
    if (hand) {
      const H = hand.map(map);
      ctx.shadowBlur = 6 * s;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      for (const [a, b] of HAND_EDGES) { ctx.moveTo(H[a][0], H[a][1]); ctx.lineTo(H[b][0], H[b][1]); }
      ctx.stroke();
      // Knuckle line (index -> pinky): the rotation cue.
      ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(H[5][0], H[5][1]); ctx.lineTo(H[17][0], H[17][1]); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = C;
      for (const P of H) { ctx.beginPath(); ctx.arc(P[0], P[1], 2.2 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 2 * s;
    } else if (W && (Pk || Ix)) {
      ctx.shadowBlur = 6 * s;
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      for (const P of [Pk, Ix, Th]) if (P) { ctx.moveTo(W[0], W[1]); ctx.lineTo(P[0], P[1]); }
      if (Pk && Ix) { ctx.moveTo(Pk[0], Pk[1]); ctx.lineTo(Ix[0], Ix[1]); }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = C;
      for (const P of [Pk, Ix, Th]) if (P) { ctx.beginPath(); ctx.arc(P[0], P[1], 3 * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 14 * s;
    }
    ctx.fillStyle = '#ffffff';
    for (const P of [S, E, W]) {
      if (!P) continue;
      ctx.beginPath();
      ctx.arc(P[0], P[1], (primary ? 5.5 : 4.5) * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function createPoseTracker({ video, overlay }) {
  const ctx = overlay.getContext('2d');
  const cbs = { results: [], lost: [], status: [] };
  const emit = (k, ...a) => { for (const f of cbs[k]) { try { f(...a); } catch (e) { console.error(e); } } };
  const status = (text, kind) => emit('status', text, kind);

  let landmarker = null;
  let handLm = null;
  let lastHands = {};
  let handSmooth = { L: new LandmarkSmoother(21), R: new LandmarkSmoother(21) };
  let stream = null;
  let objectUrl = null;
  let running = false;
  let loopId = 0;
  let loopKind = null;
  let lastMediaTime = -1;
  let lastTs = 0;
  let lastSeen = 0;
  let lostFired = false;
  let tracking = false;
  let fps = 0;
  let lastFrameT = 0;
  let mirrored = false;
  let highlight = null;
  let lastImage = null;
  let smoothWorld = new LandmarkSmoother(33);
  let smoothImage = new LandmarkSmoother(33);

  function resetSmoothing() {
    smoothWorld = new LandmarkSmoother(33);
    smoothImage = new LandmarkSmoother(33);
    handSmooth = { L: new LandmarkSmoother(21), R: new LandmarkSmoother(21) };
    lastHands = {};
  }

  function applyMirror() {
    const tf = mirrored ? 'scaleX(-1)' : '';
    video.style.transform = tf;
    overlay.style.transform = tf;
  }

  function clearOverlay() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function displayMapping() {
    const w = video.clientWidth, h = video.clientHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!w || !h || !vw || !vh) return null;
    const fit = getComputedStyle(video).objectFit;
    let sx = w / vw, sy = h / vh;
    if (fit === 'cover') sx = sy = Math.max(sx, sy);
    else if (fit === 'contain' || fit === 'scale-down') sx = sy = Math.min(sx, sy);
    else if (fit === 'none') sx = sy = 1;
    const dw = vw * sx, dh = vh * sy;
    const ox = (w - dw) / 2, oy = (h - dh) / 2;
    return { w, h, map: (p) => [ox + p.x * dw, oy + p.y * dh] };
  }

  function detectHands(ts, image) {
    if (!handLm) return {};
    let res;
    try { res = handLm.detectForVideo(video, ts); } catch (e) { console.warn('[hand] detect failed', e); return {}; }
    const m = matchHands(res, image);
    for (const side of ['L', 'R']) {
      if (!m[side]?.world) { handSmooth[side] = new LandmarkSmoother(21); delete m[side]; continue; }
      m[side].world = handSmooth[side].apply(m[side].world, ts);
    }
    return m;
  }

  function drawOverlay(lms) {
    const m = displayMapping();
    if (!m) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(m.w * dpr), ch = Math.round(m.h * dpr);
    if (overlay.width !== cw || overlay.height !== ch) { overlay.width = cw; overlay.height = ch; }
    clearOverlay();
    if (!lms) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSkeleton(ctx, lms, m.map, 1, highlight, lastHands);
  }

  function process(now) {
    if (!running || !landmarker || video.readyState < 2 || !video.videoWidth) return;
    let ts = Math.max(now, performance.now());
    if (ts <= lastTs) ts = lastTs + 0.001;
    lastTs = ts;
    let res;
    try { res = landmarker.detectForVideo(video, ts); } catch (e) { console.warn('[pose] detect failed', e); return; }
    const t = ts / 1000;
    if (lastFrameT) {
      const inst = 1 / Math.max(1e-3, t - lastFrameT);
      fps = fps ? fps + 0.1 * (inst - fps) : inst;
    }
    lastFrameT = t;
    const img = res?.landmarks?.[0];
    const wld = res?.worldLandmarks?.[0];
    if (img && wld) {
      if (!tracking) status('Tracking', 'tracking');
      tracking = true;
      lostFired = false;
      lastSeen = t;
      const image = smoothImage.apply(img, ts);
      const world = smoothWorld.apply(wld, ts);
      lastImage = image;
      lastHands = detectHands(ts, image);
      drawOverlay(image);
      emit('results', { world, image, hands: lastHands, t, fps });
    } else if (!lostFired && t - lastSeen > LOST_AFTER) {
      lostFired = true;
      tracking = false;
      lastImage = null;
      resetSmoothing();
      drawOverlay(null);
      status('No person detected — step into view', 'lost');
      emit('lost');
    } else if (!tracking && overlay.width) {
      clearOverlay();
    }
  }

  function scheduleLoop() {
    cancelLoop();
    if (typeof video.requestVideoFrameCallback === 'function') {
      loopKind = 'rvfc';
      const tick = (now) => {
        if (!running) return;
        process(now);
        loopId = video.requestVideoFrameCallback(tick);
      };
      loopId = video.requestVideoFrameCallback(tick);
    } else {
      loopKind = 'raf';
      const tick = (now) => {
        if (!running) return;
        if (video.currentTime !== lastMediaTime) { lastMediaTime = video.currentTime; process(now); }
        loopId = requestAnimationFrame(tick);
      };
      loopId = requestAnimationFrame(tick);
    }
  }

  function cancelLoop() {
    if (!loopId) return;
    if (loopKind === 'rvfc') video.cancelVideoFrameCallback?.(loopId);
    else cancelAnimationFrame(loopId);
    loopId = 0;
  }

  function releaseSource() {
    cancelLoop();
    running = false;
    if (stream) { for (const tr of stream.getTracks()) tr.stop(); stream = null; }
    try { video.pause(); } catch {}
    video.srcObject = null;
    if (objectUrl) { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(objectUrl); objectUrl = null; }
    lastImage = null;
    lastMediaTime = -1;
    lastFrameT = 0;
    fps = 0;
    tracking = false;
    lostFired = false;
    resetSmoothing();
  }

  async function begin() {
    running = true;
    lastSeen = performance.now() / 1000;
    tracking = false;
    lostFired = false;
    status('Looking for you…', 'ready');
    scheduleLoop();
  }

  const api = {
    async init() {
      if (landmarker) return landmarker;
      status('Loading pose model…', 'loading');
      landmarkerPromise ||= loadLandmarker();
      try {
        landmarker = await landmarkerPromise;
      } catch (e) {
        landmarkerPromise = null;
        const msg = `Could not load the pose model: ${e?.message || e}`;
        status(msg, 'error');
        throw new Error(msg);
      }
      status('Pose model ready', 'ready');
      // Hand model is optional: load in the background, pose tracking works without it.
      handPromise ||= loadHandLandmarker().catch((e) => { console.warn('[hand] model unavailable', e); handPromise = null; return null; });
      handPromise.then((h) => { handLm = h; });
      return landmarker;
    },

    async startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = 'Camera access is not available in this browser (a secure context such as localhost is required).';
        status(msg, 'error');
        throw new Error(msg);
      }
      await api.init();
      releaseSource();
      status('Starting camera…', 'loading');
      const hint = setTimeout(() => status('Waiting for camera… allow access in the browser prompt, or close apps using it (Teams, Zoom)', 'loading'), 3000);
      const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => {
        const e = new Error(what); e.name = 'TimeoutError'; rej(e);
      }, ms))]);
      try {
        const ask = (v) => {
          const p = navigator.mediaDevices.getUserMedia({ video: v, audio: false });
          return withTimeout(p, 20000, 'camera did not respond').catch((e) => {
            // If the browser grants access after we gave up, release the camera instead of leaking it.
            if (e.name === 'TimeoutError') p.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
            throw e;
          });
        };
        try {
          stream = await ask({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' });
        } catch (e) {
          if (!['OverconstrainedError', 'NotReadableError', 'AbortError'].includes(e?.name)) throw e;
          stream = await ask(true);
        }
        video.muted = true;
        video.playsInline = true;
        video.loop = false;
        video.srcObject = stream;
        await withTimeout(video.play(), 10000, 'camera stream did not start');
      } catch (e) {
        releaseSource();
        const msg = cameraError(e);
        status(msg, 'error');
        throw new Error(msg);
      } finally {
        clearTimeout(hint);
      }
      api.setMirror(true);
      await begin();
    },

    async loadVideoFile(file) {
      await api.init();
      releaseSource();
      status('Loading video…', 'loading');
      try {
        objectUrl = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.src = objectUrl;
        await new Promise((resolve, reject) => {
          if (video.readyState >= 2) return resolve();
          const ok = () => { off(); resolve(); };
          const bad = () => { off(); reject(video.error || new Error('unsupported format')); };
          const off = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('error', bad); };
          video.addEventListener('loadeddata', ok);
          video.addEventListener('error', bad);
        });
        await video.play();
      } catch (e) {
        releaseSource();
        const msg = `Could not play this video file: ${e?.message || e}`;
        status(msg, 'error');
        throw new Error(msg);
      }
      api.setMirror(false);
      await begin();
    },

    stop() {
      releaseSource();
      clearOverlay();
      status('Camera off', 'off');
    },

    setMirror(b) { mirrored = !!b; applyMirror(); },
    get mirrored() { return mirrored; },

    setHighlight(side) {
      highlight = side === 'L' || side === 'R' ? side : null;
      if (lastImage) drawOverlay(lastImage);
    },

    onResults(cb) { cbs.results.push(cb); return () => { cbs.results = cbs.results.filter((f) => f !== cb); }; },
    onLost(cb) { cbs.lost.push(cb); return () => { cbs.lost = cbs.lost.filter((f) => f !== cb); }; },
    onStatus(cb) { cbs.status.push(cb); return () => { cbs.status = cbs.status.filter((f) => f !== cb); }; },

    get running() { return running; },
    get handTracking() { return !!handLm; },

    capture() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return null;
      const c = document.createElement('canvas');
      c.width = vw;
      c.height = vh;
      const g = c.getContext('2d');
      if (mirrored) { g.translate(vw, 0); g.scale(-1, 1); }
      g.drawImage(video, 0, 0, vw, vh);
      if (lastImage) drawSkeleton(g, lastImage, (p) => [p.x * vw, p.y * vh], Math.max(1, vh / 540), highlight, lastHands);
      return c.toDataURL('image/png');
    },
  };
  return api;
}
