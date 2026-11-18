import assert from 'node:assert/strict';
import { ArcChart } from '../js/arc-chart.js';

globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
globalThis.requestAnimationFrame = () => 1;
const chart = new ArcChart({ getContext: () => null, getBoundingClientRect: () => ({ width: 300, height: 80 }) });
chart.push(1, 150, 100);
chart.push(1.05, 12, -30);
assert.equal(chart.data.at(-2).e, null, 'a loop jump starts a new trace segment');
assert.equal(chart.data.at(-1).r, -30, 'rotation smoothing must not bridge a restart');
chart.breakLine(2);
chart.push(2.05, 20, 40);
assert.equal(chart.data.at(-2).r, null);
assert.equal(chart.data.at(-1).r, 40);
console.log('timeline: loop restarts break both traces and reset smoothing');
