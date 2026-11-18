// Rolling strip chart of arm elevation + rotation with event markers.

const MARK_COLORS = { pain: '#ff4f1f', click: '#665f52', pull: '#626970', unstable: '#343439' };
const ELEV = { color: '#26262a', min: 0, max: 180, label: 'Elevation' };
const ROT = { color: '#707078', min: -90, max: 120, label: 'Rotation' };
const GRID = [90, 180];
const PAD = { l: 30, r: 8, t: 24, b: 7 };
const MARK_GLYPHS = { pain: 'ϟ', click: '◖', pull: '↗', unstable: '△' };
const angle = value => value == null ? '—' : `${Math.round(value)}°`.replace('-', '−');

export class ArcChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.win = 20;
    this.data = [];
    this.marks = [];
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this._raf = 0;
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(canvas);
    } else {
      window.addEventListener('resize', () => this._resize());
    }
  }

  push(t, elev, rot) {
    if (!Number.isFinite(t)) return;
    const last = this.data[this.data.length - 1];
    if (last && t < last.t) this.clear(); // time went backwards (new video / restart)
    this.data.push({
      t,
      e: Number.isFinite(elev) ? elev : null,
      r: Number.isFinite(rot) ? last?.r == null ? rot : last.r + (rot - last.r) * .16 : null,
    });
    this._trim();
    this._schedule();
  }

  mark(type, t) {
    if (!Number.isFinite(t)) t = this.data.length ? this.data[this.data.length - 1].t : 0;
    this.marks.push({ type, t });
    this._trim();
    this._schedule();
  }

  clear() {
    this.data = [];
    this.marks = [];
    this._schedule();
  }

  setWindow(seconds) {
    if (Number.isFinite(seconds) && seconds > 0) {
      this.win = seconds;
      this._schedule();
    }
  }

  _now() {
    const a = this.data.length ? this.data[this.data.length - 1].t : -Infinity;
    const b = this.marks.length ? this.marks[this.marks.length - 1].t : -Infinity;
    const n = Math.max(a, b);
    return Number.isFinite(n) ? n : 0;
  }

  _trim() {
    const cut = this._now() - this.win * 1.5;
    let i = 0;
    while (i < this.data.length && this.data[i].t < cut) i++;
    if (i > 0) this.data.splice(0, i);
    this.marks = this.marks.filter((m) => m.t >= cut);
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this._draw();
  }

  _schedule() {
    if (this._raf) return;
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f) => setTimeout(f, 16);
    this._raf = raf(() => { this._raf = 0; this._draw(); });
  }

  _draw() {
    const { ctx, w, h, dpr } = this;
    if (!ctx || w < 2 || h < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const x0 = PAD.l, x1 = w - PAD.r, y0 = PAD.t, y1 = h - PAD.b;
    const pw = Math.max(1, x1 - x0), ph = Math.max(1, y1 - y0);
    const now = this._now();
    const tStart = now - this.win;
    const X = (t) => x0 + ((t - tStart) / this.win) * pw;
    const Y = (v, s) => y1 - ((v - s.min) / (s.max - s.min)) * ph;

    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // gridlines (elevation scale)
    ctx.lineWidth = 1;
    for (const g of GRID) {
      const y = Math.round(Y(g, ELEV)) + 0.5;
      ctx.strokeStyle = '#e6e5e1';
      ctx.setLineDash(g === 90 ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = '#5e5e63';
      ctx.textAlign = 'right';
      ctx.fillText(`${g}°`, x0 - 6, y);
    }
    ctx.setLineDash([]);
    // baseline
    ctx.strokeStyle = '#d1d1cc';
    ctx.beginPath(); ctx.moveTo(x0, y1 + 0.5); ctx.lineTo(x1, y1 + 0.5); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, pw, h); ctx.clip();

    // markers (behind lines)
    for (const m of this.marks) {
      if (m.t < tStart) continue;
      const x = Math.round(X(m.t)) + 0.5;
      const c = MARK_COLORS[m.type] || '#343439';
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, c); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = grad; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c;
      const age = Math.max(0, now - m.t);
      const drop = age < .5 ? 7 * (1 - age / .5) ** 3 : 0;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(MARK_GLYPHS[m.type] || '•', x, y0 + 4 - drop);
      ctx.shadowBlur = 0;
    }

    this._line('r', ROT, X, Y, tStart, y1, false);
    this._line('e', ELEV, X, Y, tStart, y1, true);
    ctx.restore();

    // legend top-left
    ctx.textAlign = 'left';
    ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    const lastE = this._last('e'), lastR = this._last('r');
    ctx.fillStyle = ELEV.color;
    ctx.fillText(`${this.side || 'R'} elev ${angle(lastE)} · Rot ${angle(lastR)}`, x0 + 2, 10);

    if (!this.data.length && !this.marks.length) {
      ctx.textAlign = 'center';
      ctx.font = '500 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#5e5e63';
      const text = 'Waiting for motion', cx = x0 + pw / 2, cy = y0 + ph / 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 65, cy - 9, 130, 18);
      ctx.fillStyle = '#5e5e63';
      ctx.fillText(text, cx, cy);
    }
  }

  _last(k) {
    for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i][k] != null) return this.data[i][k];
    return null;
  }

  _line(k, s, X, Y, tStart, yBase, fill) {
    const { ctx } = this;
    const segs = [];
    let cur = null;
    for (const d of this.data) {
      if (d.t < tStart - 1) continue;
      const v = d[k];
      if (v == null) { cur = null; continue; }
      const cl = Math.max(s.min, Math.min(s.max, v));
      if (!cur) { cur = []; segs.push(cur); }
      cur.push([X(d.t), Y(cl, s)]);
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const seg of segs) {
      if (fill && seg.length > 1) {
        const g = ctx.createLinearGradient(0, Y(s.max, s), 0, yBase);
        g.addColorStop(0, 'rgba(60,60,55,.10)'); g.addColorStop(1, 'rgba(60,60,55,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(seg[0][0], yBase);
        for (const [x, y] of seg) ctx.lineTo(x, y);
        ctx.lineTo(seg[seg.length - 1][0], yBase); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = fill ? 2 : 1.6;
      ctx.globalAlpha = fill ? 1 : 0.85;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (seg.length === 1) ctx.arc(seg[0][0], seg[0][1], 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }
}
