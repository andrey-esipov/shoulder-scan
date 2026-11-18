import { FilesetResolver, PoseLandmarker, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
import { SIDE_IDX, LandmarkSmoother } from './metrics.js';
import { cameraErrorMessage as cameraError } from './experience.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const LOST_AFTER = 0.5;

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
      lastHands = detectHands(ts, image);
      clearOverlay();
      emit('results', { world, image, hands: lastHands, t, fps });
    } else if (!lostFired && t - lastSeen > LOST_AFTER) {
      lostFired = true;
      tracking = false;
      resetSmoothing();
      clearOverlay();
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
        throw Object.assign(new Error(msg, { cause: e }), { name: e.name || 'Error' });
      }
      status('Pose model ready', 'ready');
      // Hand model is optional: load in the background, pose tracking works without it.
      handPromise ||= loadHandLandmarker().catch((e) => { console.warn('[hand] model unavailable', e); handPromise = null; return null; });
      handPromise.then((h) => { handLm = h; });
      return landmarker;
    },

    async startCamera({ signal } = {}) {
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = 'Camera access is not available in this browser (a secure context such as localhost is required).';
        status(msg, 'error');
        throw new Error(msg);
      }
      signal?.throwIfAborted();
      releaseSource();
      status('Starting camera…', 'loading');
      const hint = setTimeout(() => status('Waiting for camera… allow access in the browser prompt, or close apps using it (Teams, Zoom)', 'loading'), 3000);
      const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => {
        const e = new Error(what); e.name = 'TimeoutError'; rej(e);
      }, ms))]);
      try {
        const ask = (v) => {
          const p = navigator.mediaDevices.getUserMedia({ video: v, audio: false }).then(s => {
            if (signal?.aborted) { s.getTracks().forEach(t => t.stop()); signal.throwIfAborted(); }
            return s;
          });
          return withTimeout(p, 5000, 'camera did not respond').catch((e) => {
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
        await api.init();
        signal?.throwIfAborted();
      } catch (e) {
        if (signal?.aborted) throw e;
        releaseSource();
        const msg = cameraError(e);
        status(msg, 'error');
        throw Object.assign(new Error(msg, { cause: e }), { name: e.name || 'Error' });
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
      return c.toDataURL('image/png');
    },
  };
  return api;
}
