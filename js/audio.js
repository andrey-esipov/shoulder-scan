const hasWindow = typeof window !== 'undefined';
const AC = hasWindow ? (window.AudioContext || window.webkitAudioContext) : undefined;

export const audioSupported = !!(AC && hasWindow && navigator.mediaDevices?.getUserMedia);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const MAX_DUR = 0.08;
const REFRACTORY = 0.25;
const FLOOR_MIN = 2e-4;
const UNSUPPRESS_GRACE = 0.35;

export class PopDetector {
  constructor({ sensitivity = 0.6 } = {}) {
    this._cbs = { pop: [], level: [] };
    this._running = false;
    this._suppressed = false;
    this._raf = 0;
    this.setSensitivity(sensitivity);
    this._reset();
  }

  _reset() {
    this._floor = 0;
    this._warm = 0;
    this._cand = null;
    this._inTransient = false;
    this._blockUntil = 0;
  }

  setSensitivity(x) {
    const s = clamp01(Number.isFinite(x) ? x : 0.6);
    this.sensitivity = s;
    this._k = lerp(14, 3.5, s);
    this._crest = lerp(7, 3.2, s);
    this._minPeak = lerp(0.08, 0.012, s);
    this._returnK = lerp(2.2, 3.2, s);
  }

  setSuppressed(b) {
    const was = this._suppressed;
    this._suppressed = !!b;
    if (this._suppressed) this._cand = null;
    else if (was) this._blockUntil = Math.max(this._blockUntil, performance.now() / 1000 + UNSUPPRESS_GRACE);
  }

  get running() { return this._running; }

  onPop(cb) { this._cbs.pop.push(cb); return () => { this._cbs.pop = this._cbs.pop.filter((f) => f !== cb); }; }
  onLevel(cb) { this._cbs.level.push(cb); return () => { this._cbs.level = this._cbs.level.filter((f) => f !== cb); }; }

  _emit(k, ...a) { for (const f of this._cbs[k]) { try { f(...a); } catch (e) { console.error(e); } } }

  async start() {
    if (this._running) return;
    if (!audioSupported) throw new Error('Microphone audio analysis is not supported in this browser.');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (e) {
      const n = e?.name || '';
      if (n === 'NotAllowedError' || n === 'SecurityError') throw new Error('Microphone permission was denied.');
      if (n === 'NotFoundError') throw new Error('No microphone was found.');
      throw new Error(`Could not open the microphone: ${e?.message || e}`);
    }
    const ctx = new AC();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    hp.Q.value = 0.707;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0;
    src.connect(hp);
    hp.connect(an);
    Object.assign(this, { _stream: stream, _ctx: ctx, _src: src, _hp: hp, _an: an, _buf: new Float32Array(an.fftSize) });
    this._reset();
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    try { this._src?.disconnect(); this._hp?.disconnect(); } catch {}
    if (this._stream) for (const tr of this._stream.getTracks()) tr.stop();
    if (this._ctx && this._ctx.state !== 'closed') this._ctx.close().catch(() => {});
    this._stream = this._ctx = this._src = this._hp = this._an = null;
    this._reset();
  }

  _tick() {
    const an = this._an;
    if (!an) return;
    const buf = this._buf;
    an.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / buf.length);
    const t = performance.now() / 1000;
    this._emit('level', clamp01((20 * Math.log10(rms + 1e-9) + 66) / 54), rms);
    this.process(rms, peak, t);
  }

  /** Core detector, exposed for testing: feed per-frame RMS/peak of the high-passed signal. */
  process(rms, peak, t) {
    if (this._warm < 20) {
      this._warm++;
      this._floor += (rms - this._floor) / this._warm;
      return;
    }
    const floor = Math.max(this._floor, FLOOR_MIN);
    const back = rms <= floor * this._returnK;

    if (this._suppressed) return;

    if (this._cand) {
      const c = this._cand;
      if (back) {
        this._cand = null;
        this._blockUntil = c.t + REFRACTORY;
        const strength = clamp01(0.25 + (20 * Math.log10(c.peak / (floor * this._k))) / 30);
        this._emit('pop', { t: c.t, strength });
      } else if (t - c.t > MAX_DUR) {
        this._cand = null;
        this._inTransient = true;
        this._transientT = t;
        this._blockUntil = Math.max(this._blockUntil, c.t + REFRACTORY);
      } else if (peak > c.peak) c.peak = peak;
      return;
    }

    if (this._inTransient) {
      if (back) this._inTransient = false;
      else if (t - this._transientT > 1.5) this._floor += 0.02 * (rms - this._floor);
      return;
    }

    if (t >= this._blockUntil && peak > Math.max(floor * this._k, this._minPeak) && peak > rms * this._crest) {
      this._cand = { t, peak };
      return;
    }

    const alpha = rms > floor ? 0.015 : 0.08;
    this._floor = Math.max(FLOOR_MIN, floor + alpha * (rms - floor));
  }
}
