import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
import { LM, SIDE_IDX, LandmarkSmoother } from './metrics.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const TEAL = '#2fd3c4';
const MIN_VIS = 0.4;
const LOST_AFTER = 0.5;

const BASE_EDGES = [
  [LM.L_SH, LM.R_SH], [LM.L_SH, LM.L_HIP], [LM.R_SH, LM.R_HIP], [LM.L_HIP, LM.R_HIP],
  [LM.L_SH, LM.L_EL], [LM.L_EL, LM.L_WR], [LM.R_SH, LM.R_EL], [LM.R_EL, LM.R_WR],
  [LM.L_EAR, LM.NOSE], [LM.NOSE, LM.R_EAR],
];
const BASE_JOINTS = [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SH, LM.R_SH, LM.L_EL, LM.R_EL, LM.L_WR, LM.R_WR, LM.L_HIP, LM.R_HIP];

let landmarkerPromise = null;

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
  return `Could not start the camera: ${e?.message || e}`;
}

const visible = (p) => p && (p.visibility ?? 1) >= MIN_VIS;

/** Draws the skeleton. `map(p)` converts a normalized landmark to canvas px; `s` scales stroke widths. */
function drawSkeleton(ctx, lms, map, s, side) {
  const hi = side && SIDE_IDX[side];
  const pt = (i) => (visible(lms[i]) ? map(lms[i]) : null);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  for (const [a, b] of BASE_EDGES) {
    if (hi && ((a === hi.sh && b === hi.el) || (a === hi.el && b === hi.wr))) continue;
    const A = pt(a), B = pt(b);
    if (!A || !B) continue;
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
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
  if (hi) {
    const S = pt(hi.sh), E = pt(hi.el), W = pt(hi.wr), H = pt(hi.hip);
    if (S && E && H) {
      const a0 = Math.atan2(H[1] - S[1], H[0] - S[0]);
      const a1 = Math.atan2(E[1] - S[1], E[0] - S[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      ctx.strokeStyle = 'rgba(47,211,196,0.55)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(S[0], S[1], 26 * s, a0, a0 + d, d < 0);
      ctx.stroke();
    }
    ctx.shadowColor = TEAL;
    ctx.shadowBlur = 14 * s;
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    if (S && E) { ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]); }
    if (E && W) { ctx.moveTo(E[0], E[1]); ctx.lineTo(W[0], W[1]); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const P of [S, E, W]) {
      if (!P) continue;
      ctx.beginPath();
      ctx.arc(P[0], P[1], 5.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function createPoseTracker({ video, overlay }) {
  const ctx = overlay.getContext('2d');
  const cbs = { results: [], lost: [], status: [] };
  const emit = (k, ...a) => { for (const f of cbs[k]) { try { f(...a); } catch (e) { console.error(e); } } };
  const status = (text, kind) => emit('status', text, kind);

  let landmarker = null;
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

  function drawOverlay(lms) {
    const m = displayMapping();
    if (!m) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(m.w * dpr), ch = Math.round(m.h * dpr);
    if (overlay.width !== cw || overlay.height !== ch) { overlay.width = cw; overlay.height = ch; }
    clearOverlay();
    if (!lms) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSkeleton(ctx, lms, m.map, 1, highlight);
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
      drawOverlay(image);
      emit('results', { world, image, t, fps });
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
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' }, audio: false,
        });
        video.muted = true;
        video.playsInline = true;
        video.loop = false;
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        releaseSource();
        const msg = cameraError(e);
        status(msg, 'error');
        throw new Error(msg);
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

    capture() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return null;
      const c = document.createElement('canvas');
      c.width = vw;
      c.height = vh;
      const g = c.getContext('2d');
      if (mirrored) { g.translate(vw, 0); g.scale(-1, 1); }
      g.drawImage(video, 0, 0, vw, vh);
      if (lastImage) drawSkeleton(g, lastImage, (p) => [p.x * vw, p.y * vh], Math.max(1, vh / 540), highlight);
      return c.toDataURL('image/png');
    },
  };
  return api;
}
