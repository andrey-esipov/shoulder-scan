// Rolling strip chart of arm elevation + rotation with event markers.

const MARK_COLORS = { pain: '#ff4b4b', click: '#ffb547', pull: '#b48cff', unstable: '#4bb8ff' };
const ELEV = { color: '#2fd3c4', min: 0, max: 180, label: 'Elevation' };
const ROT = { color: '#9a8cff', min: -90, max: 120, label: 'Rotation' };
const GRID = [60, 90, 120, 150];
const PAD = { l: 38, r: 74, t: 28, b: 12 };

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
      r: Number.isFinite(rot) ? rot : null,
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
      ctx.strokeStyle = g === 90 ? 'rgba(138,160,184,.20)' : 'rgba(138,160,184,.09)';
      ctx.setLineDash(g === 90 ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = 'rgba(138,160,184,.6)';
      ctx.textAlign = 'right';
      ctx.fillText(`${g}°`, x0 - 6, y);
    }
    ctx.setLineDash([]);
    // baseline
    ctx.strokeStyle = 'rgba(138,160,184,.14)';
    ctx.beginPath(); ctx.moveTo(x0, y1 + 0.5); ctx.lineTo(x1, y1 + 0.5); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, pw, h); ctx.clip();

    // markers (behind lines)
    for (const m of this.marks) {
      if (m.t < tStart) continue;
      const x = Math.round(X(m.t)) + 0.5;
      const c = MARK_COLORS[m.type] || '#e6eef8';
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, c); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = grad; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y0 + 1, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    this._line('r', ROT, X, Y, tStart, y1, false);
    this._line('e', ELEV, X, Y, tStart, y1, true);
    ctx.restore();

    // legend top-left
    ctx.textAlign = 'left';
    ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    let lx = x0 + 2;
    for (const s of [ELEV, ROT]) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 9, 12, 2.5);
      ctx.fillStyle = 'rgba(230,238,248,.82)';
      ctx.fillText(s.label, lx + 17, 10);
      lx += 17 + ctx.measureText(s.label).width + 16;
    }

    // latest values at right
    const lastE = this._last('e'), lastR = this._last('r');
    ctx.textAlign = 'left';
    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = ELEV.color;
    ctx.fillText(lastE == null ? '—' : `${Math.round(lastE)}°`, x1 + 12, y0 + ph * 0.3);
    ctx.font = '700 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = ROT.color;
    ctx.fillText(lastR == null ? '—' : `${Math.round(lastR)}°`, x1 + 12, y0 + ph * 0.72);
    ctx.font = '500 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(138,160,184,.7)';
    ctx.fillText('ELEV', x1 + 12, y0 + ph * 0.3 - 13);
    ctx.fillText('ROT', x1 + 12, y0 + ph * 0.72 - 12);

    if (!this.data.length && !this.marks.length) {
      ctx.textAlign = 'center';
      ctx.font = '500 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(138,160,184,.55)';
      ctx.fillText('Arm motion will draw here once tracking starts', x0 + pw / 2, y0 + ph / 2);
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
        g.addColorStop(0, 'rgba(47,211,196,.22)'); g.addColorStop(1, 'rgba(47,211,196,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(seg[0][0], yBase);
        for (const [x, y] of seg) ctx.lineTo(x, y);
        ctx.lineTo(seg[seg.length - 1][0], yBase); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = fill ? 2 : 1.6;
      ctx.globalAlpha = fill ? 1 : 0.85;
      ctx.shadowColor = s.color; ctx.shadowBlur = fill ? 6 : 0;
      ctx.beginPath();
      seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (seg.length === 1) ctx.arc(seg[0][0], seg[0][1], 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }
}
