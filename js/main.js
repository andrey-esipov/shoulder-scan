// App controller: wires tracking, anatomy, guided exam, reasoning report and rehab coach.
import { createAnatomy, LAYERS } from './anatomy.js';
import { createPoseTracker } from './pose.js';
import { computeMetrics, loadIndices, planeLabel, clamp } from './metrics.js';
import { INTAKE, TESTS, QUICK_TEST_IDS } from './protocol.js';
import { buildReport, redFlags, affectedSide } from './reasoning.js';
import { EXERCISES, COACH, RepCounter, coachTarget } from './rehab.js';
import { voice, parseMarkerCommand } from './voice.js';
import { PopDetector, audioSupported } from './audio.js';
import { renderReport, reportToText, downloadJSON } from './report.js';
import { ArcChart } from './arc-chart.js';
import { demoTestPose, displayReport, formatValue, phaseTitle, intakePlan, pullingQuestion, cameraErrorMessage, collectMarkers, reportHeadline, reconcilePain, reportDate, reportMotion, painArcEvidence, localDate } from './experience.js';
import { markerIcon } from './marker-icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const fmt = formatValue;
const now = () => performance.now() / 1000;
const SIDE_NAME = { L: 'Left', R: 'Right' };
const other = (s) => (s === 'L' ? 'R' : 'L');

/* ---------------- state ---------------- */
const exam = { intake: {}, tests: {}, startedT: performance.now() / 1000 };
const app = {
  side: 'R',               // side shown in the 3D model + coached
  source: 'off',           // off | camera | video | demo
  live: null,              // latest metrics {lean, sides:{L,R}, t}
  baseline: { L: null, R: null }, // neck gap at rest (from calib or auto)
  calibrated: false,
  t0: now(),
};

/* ---------------- toasts ---------------- */
let toastTimer;
function positionToast() {
  const stage = $('#stage').getBoundingClientRect();
  const marker = $('#markerBar').getBoundingClientRect();
  const mobile = matchMedia('(max-width: 700px)').matches;
  $('#toasts').style.left = `${stage.left + stage.width / 2}px`;
  $('#toasts').style.top = 'auto';
  $('#toasts').style.bottom = mobile ? '16px' : `${innerHeight - marker.top + 10}px`;
}
function toast(text, kind = '') {
  clearTimeout(toastTimer);
  const t = el('div', `toast ${kind}`, esc(text));
  $('#toasts').replaceChildren(t);
  positionToast();
  toastTimer = setTimeout(() => t.remove(), 3000);
}

/* ---------------- anatomy + left panel ---------------- */
const tooltip = $('#tooltip');
const anatomy = createAnatomy($('#three'), {
  onHover(h) {
    if (!h) { tooltip.classList.remove('show'); return; }
    const strain = h.strain != null ? `\nLoad now: ${Math.round(h.strain * 100)}%` : '';
    tooltip.textContent = `${h.name}${h.info ? '\n' + h.info : ''}${strain}`;
    const r = $('#three').getBoundingClientRect(), s = $('#stage').getBoundingClientRect();
    tooltip.style.left = `${h.x + r.left - s.left}px`;
    tooltip.style.top = `${h.y + r.top - s.top}px`;
    tooltip.classList.add('show');
  },
});

const layerInputs = {};
function setRangeFill(input) { input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`); }

function buildLeftPanel() {
  const seg = $('#sideToggle');
  for (const s of ['L', 'R']) {
    const b = el('button', 'seg', `${SIDE_NAME[s]}`); b.type = 'button'; b.dataset.side = s;
    b.onclick = () => setSide(s, true);
    seg.append(b);
  }
  const presets = $('#presets');
  const labels = { full: 'Full', muscles: 'Muscles', cuff: 'Rotator cuff', labrum: 'Labrum', bones: 'Bones', biceps: 'Biceps', lat: 'Lat', scapula: 'Scapula', nerves: 'Nerves' };
  for (const name of (anatomy.presets || Object.keys(labels))) {
    const c = el('button', 'chip', labels[name] || name); c.type = 'button'; c.dataset.preset = name;
    c.onclick = () => applyPreset(name);
    presets.append(c);
  }
  const peel = $('#peel');
  peel.oninput = () => { anatomy.setPeel(peel.value / 100); setRangeFill(peel); };
  setRangeFill(peel);
  const layers = $('#layers');
  for (const L of LAYERS) {
    const row = el('label', 'layer-row');
    const sw = el('span', 'sw'); sw.style.color = L.color;
    const lbl = el('span', 'lbl', esc(L.label));
    const r = el('input', 'range'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(L.def * 100);
    r.oninput = () => { anatomy.setLayerOpacity(L.id, r.value / 100); setRangeFill(r); };
    setRangeFill(r);
    layerInputs[L.id] = r;
    row.append(sw, lbl, r); layers.append(row);
  }
}

function applyPreset(name, options) {
  const res = anatomy.applyPreset(name, options);
  if (!res) return;
  for (const [id, v] of Object.entries(res.layers || {})) { const r = layerInputs[id]; if (r) { r.value = Math.round(v * 100); setRangeFill(r); } }
  if (res.peel != null) { $('#peel').value = Math.round(res.peel * 100); setRangeFill($('#peel')); }
  $$('#presets .chip').forEach((c) => { c.classList.toggle('active', c.dataset.preset === name); c.setAttribute('aria-pressed', c.dataset.preset === name); });
  $('#hudSub').textContent = name === 'full' ? 'Showing: all tissue' : `Highlighting: ${$('#presets .active')?.textContent.toLowerCase() || name}`;
}

function setSide(s, user = false) {
  app.side = s;
  arc.side = s;
  $('#timelineSide').textContent = `R / L · Showing ${s}`;
  $('#timelineSide').setAttribute('aria-label', `Showing the ${SIDE_NAME[s].toLowerCase()} shoulder. R means right; L means left.`);
  anatomy.setSide(s);
  $$('#sideToggle .seg').forEach((b) => b.classList.toggle('active', b.dataset.side === s));
  $('#hudTitle').textContent = `${SIDE_NAME[s]} shoulder`;
  if (user) toast(`Showing your ${SIDE_NAME[s].toLowerCase()} shoulder`);
}

/* ---------------- measurement + load panels ---------------- */
const MEAS = [
  { id: 'elev', label: 'Arm elevation', unit: '°', max: 180 },
  { id: 'rot', label: 'Rotation (ER + / IR −)', unit: '°', min: -90, max: 110 },
  { id: 'flex', label: 'Elbow bend', unit: '°', max: 160 },
  { id: 'hike', label: 'Shoulder hike', unit: '%', max: 40, warn: 12, bad: 20 },
  { id: 'lean', label: 'Trunk lean', unit: '°', max: 30, warn: 8, bad: 15 },
  { id: 'torso', label: 'Torso turn', unit: '°', max: 60 },
  { id: 'other', label: 'Other shoulder', unit: '°', max: 180 },
];
const LOADS = [
  ['subacromial', 'Subacromial space'], ['internal', 'Internal impingement'], ['superiorLabrum', 'Superior labrum'],
  ['biceps', 'Biceps tendon'], ['acJoint', 'AC joint'], ['scapulothoracic', 'Shoulder blade'], ['lat', 'Latissimus'],
];
const measRows = {}, loadRows = {};
function measRow(parent, label) {
  const row = el('div', 'meas-row', `<div class="top"><span class="label">${esc(label)}</span><span class="val">–</span></div><div class="bar"><i></i></div><div class="sub"></div>`);
  parent.append(row);
  return { row, val: $('.val', row), bar: $('.bar i', row), sub: $('.sub', row) };
}
function buildMeasure() {
  for (const m of MEAS) measRows[m.id] = measRow($('#measure'), m.label);
  measRows.elev.sub.textContent = 'Plane: –';
  for (const [id, label] of LOADS) loadRows[id] = measRow($('#loadMap'), label);
}
function setMeas(r, val, frac, level = '', sub) {
  r.val.textContent = val;
  r.bar.style.width = `${clamp(frac, 0, 1) * 100}%`;
  r.row.classList.toggle('warn', level === 'warn');
  r.row.classList.toggle('bad', level === 'bad');
  if (sub != null) r.sub.textContent = sub;
}

/* ---------------- tracking pipeline ---------------- */
const pose = createPoseTracker({ video: $('#video'), overlay: $('#overlay') });
const arc = new ArcChart($('#arcChart'));
let lastPanel = 0, lostSince = null;
const rotState = {};
const ROT_HINT = 'Elbow at your side bent 90°, or keep your hand in view, so I can read rotation';

function hikeFor(s, sm) {
  if (!sm || sm.neckGap == null) return null;
  if (!app.calibrated && sm.elevation < 25) {
    const b = app.baseline[s];
    app.baseline[s] = b == null ? sm.neckGap : b * 0.98 + sm.neckGap * 0.02;
  }
  const b = app.baseline[s];
  if (!b) return null;
  return clamp(((b - sm.neckGap) / b) * 100, -15, 60);
}

// The hand reading with a straight arm is shoulder rotation plus forearm twist
// (~80° each way). Give the 3D model a plausible humeral share.
function shoulderShare(sm) {
  if (app.source === 'demo') return sm.rotation;
  if (!sm.rotationValid || sm.rotationSource !== 'hand') return sm.rotation;
  return clamp(sm.rotation * 0.55, -80, 110);
}

// MediaPipe depth is noisy; ease torso angles so the 3D trunk doesn't jitter.
const torsoSm = {};
function smoothTorso(tp) {
  if (!tp) return null;
  for (const k of ['yaw', 'hipYaw', 'separation', 'flex', 'lean']) {
    const v = tp[k];
    torsoSm[k] = v == null ? null : torsoSm[k] == null ? v : torsoSm[k] + (v - torsoSm[k]) * 0.25;
  }
  return { ...torsoSm };
}
const turnLabel = (y) => (Math.abs(y) < 4 ? 'square to camera' : `${fmt(Math.abs(y))}° to your ${y > 0 ? 'left' : 'right'}`);

function handleMetrics(m, t) {
  const live = { lean: m.lean ?? 0, torso: m.torso ? smoothTorso(m.torso) : null, t, sides: {}, hike: {} };
  for (const s of ['L', 'R']) {
    const sm = m.sides?.[s];
    if (!sm || (sm.visibility != null && sm.visibility < 0.45)) { live.sides[s] = null; continue; }
    live.sides[s] = sm;
    live.hike[s] = hikeFor(s, sm) ?? 0;
  }
  app.live = live;
  const sm = live.sides[app.side];
  // Drive the 3D figure from whatever is visible: torso always, each arm when its shoulder+elbow are seen
  // (the wrist often leaves a laptop camera's frame with the arm out to the side).
  const armPose = (x, s) => {
    if (!x || (x.armVis ?? 1) < 0.4) return null;
    const wristOk = (x.wristVis ?? 1) >= 0.35;
    return {
      elevation: x.elevation, plane: x.plane, hike: live.hike[s] ?? 0,
      elbowFlex: wristOk ? x.elbowFlex : undefined,
      rotation: wristOk && x.rotationValid ? app.source === 'demo' ? x.humeralRotation ?? x.rotation : shoulderShare(x) : undefined,
      rotationValid: wristOk && x.rotationValid,
    };
  };
  const tr = live.torso;
  const visualPose = {
    ...(armPose(m.sides?.[app.side], app.side) ?? {}),
    other: armPose(m.sides?.[other(app.side)], other(app.side)),
    torso: tr ? { yaw: clamp(tr.yaw, -60, 60), flex: clamp(tr.flex ?? 0, -30, 60), lean: clamp(tr.lean ?? 0, -30, 30) } : null,
  };
  if (!coach.preview) anatomy.setPose(visualPose);
  const peakSide = affectedSide(exam.intake), peakArm = live.sides[peakSide];
  if (run.active && run.phase === 'measure' && run.test.id === 'flex' && peakArm && app.side === peakSide) {
    const stress = loadIndices(peakArm, { hike: live.hike[peakSide] || 0 });
    const score = peakArm.elevation;
    if (!exam.peakFrame || score > exam.peakFrame.score) {
      const pose = { ...armPose(peakArm, peakSide), other: armPose(live.sides[other(peakSide)], other(peakSide)), torso: visualPose.torso };
      exam.peakFrame = { score, pose: structuredClone(pose), stress, side: peakSide, test: run.test.id };
    }
  }
  if (sm) arc.push(t, sm.elevation, sm.rotationValid ? sm.rotation : null);
  examTick(live);
  coachTick(live);
  if (t - lastPanel > 0.08) { lastPanel = t; updatePanels(live); }
}

function updatePanels(live) {
  $('#stage').classList.add('has-motion');
  for (const s of ['R', 'L']) {
    $(`#read${s} strong`).textContent = live.sides[s] ? `${fmt(live.sides[s].elevation)}°` : '—';
  }
  $('#torsoReadout strong').textContent = live.torso ? `${fmt(live.torso.yaw)}°` : '—';
  $('#rotationReadout strong').textContent = live.sides.R?.rotationValid ? `${fmt(live.sides.R.rotation)}°` : '—';
  $('#rotationReadoutL strong').textContent = live.sides.L?.rotationValid ? `${fmt(live.sides.L.rotation)}°` : '—';
  const sm = live.sides[app.side];
  if (!sm) {
    $('#hudSub').textContent = `Can't see your ${SIDE_NAME[app.side].toLowerCase()} arm. Step back so your hips are in frame`;
    return;
  }
  const hike = live.hike[app.side] ?? 0, lean = Math.abs(live.lean ?? 0);
  const lvl = (v, m) => (m.bad != null && v >= m.bad ? 'bad' : m.warn != null && v >= m.warn ? 'warn' : '');
  setMeas(measRows.elev, `${fmt(sm.elevation)}°`, sm.elevation / 180, '', `Plane: ${planeLabel(sm.elevation, sm.plane)} (${fmt(sm.plane)}°)`);
  setMeas(measRows.rot, sm.rotationValid ? `${fmt(sm.rotation)}°` : 'show hand', sm.rotationValid ? clamp((sm.rotation + 150) / 360, 0, 1) : 0, '', sm.rotationValid ? (sm.rotationSource === 'hand' ? 'Arm roll from hand · includes forearm twist' : 'Shoulder rotation from forearm') : 'Bend elbow 90° or show your open hand');
  setMeas(measRows.flex, `${fmt(sm.elbowFlex)}°`, sm.elbowFlex / 160);
  setMeas(measRows.hike, app.baseline[app.side] ? `${fmt(hike)}%` : 'calibrating', Math.max(0, hike) / 40, lvl(hike, MEAS[3]));
  setMeas(measRows.lean, `${fmt(lean)}°`, lean / 30, lvl(lean, MEAS[4]));
  const tr = live.torso;
  if (tr) setMeas(measRows.torso, turnLabel(tr.yaw), Math.abs(tr.yaw) / 60, '', tr.separation != null ? `Hips ${turnLabel(tr.hipYaw)} · shoulder–hip coil ${fmt(Math.abs(tr.separation))}°${tr.flex != null ? ` · bend ${fmt(tr.flex)}°` : ''}` : 'Step back so your hips are in frame');
  const os = live.sides[other(app.side)];
  if (os) setMeas(measRows.other, `${fmt(os.elevation)}°`, os.elevation / 180, '', `${SIDE_NAME[other(app.side)]} · ${planeLabel(os.elevation, os.plane)}${os.rotationValid ? ` · rotation ${fmt(os.rotation)}°` : ''}`);
  else setMeas(measRows.other, '–', 0, '', `${SIDE_NAME[other(app.side)]} arm out of view`);
  const idx = loadIndices(sm, { hike });
  anatomy.setStress(idx);
  for (const [id] of LOADS) { const v = idx[id] ?? 0; setMeas(loadRows[id], `${Math.round(v * 100)}%`, v, v > 0.7 ? 'bad' : v > 0.45 ? 'warn' : ''); }
  if (!run.active) {
    const top = LOADS.map(([id, l]) => [l, idx[id] ?? 0]).sort((a, b) => b[1] - a[1])[0];
    $('#hudSub').textContent = `${fmt(sm.elevation)}° ${planeLabel(sm.elevation, sm.plane)}${sm.rotationValid ? ` · rotation ${fmt(sm.rotation)}°` : ''}${top[1] > 0.4 ? ` · most loaded: ${top[0].toLowerCase()}` : ''}`;
  }
}

pose.onResults(({ world, image, hands, t }) => {
  if (app.source === 'demo') return;
  const m = computeMetrics(world, image, rotState, hands);
  if (m) handleMetrics(m, t);
});
pose.onStatus((text, kind) => {
  if (app.source === 'demo' || app.cameraError) return;
  const pill = $('#trackPill');
  pill.classList.toggle('on', kind === 'tracking');
  pill.classList.toggle('warn', kind === 'lost' || kind === 'loading');
  $('.txt', pill).textContent = kind === 'tracking' ? 'Measured · Live camera' : kind === 'error' ? 'Camera unavailable' : kind === 'loading' ? 'Starting camera…' : text;
  $('#camEmpty span').textContent = text;
});
pose.onLost(() => {
  $('#stage').classList.remove('has-motion');
  if (run.active) $('#hudSub').textContent = 'Lost you. Step back into frame';
});

/* ---------------- camera / video / demo ---------------- */
let demoRaf = 0;
const setSource = (id) => {
  const selected = id;
  ['btnCamera', 'btnDemo', 'btnUpload'].forEach((b) => {
    $(`#${b}`).classList.toggle('active', b === selected);
    $(`#${b}`).setAttribute('aria-pressed', b === selected);
  });
  document.body.classList.toggle('demo-running', id === 'btnDemo');
  $('.exam-start-quick')?.classList.toggle('primary', !!id);
  $('#three').inert = !id;
  document.body.classList.toggle('source-inactive', app.source === 'off');
  $('#sourceMenuButton').textContent = id === 'btnDemo' ? 'Demo' : id === 'btnUpload' ? 'Video' : id === 'btnCamera' ? 'Camera' : 'Choose source';
  if (!app.safetyPaused) {
    $('#trackPill').classList.remove('paused');
    $('#trackPill').classList.toggle('simulated', id === 'btnDemo');
    $('.txt', $('#trackPill')).textContent = id === 'btnDemo' ? 'DEMO · simulated motion'
      : id === 'btnCamera' ? 'Live camera' : id === 'btnUpload' ? 'Video' : app.cameraError ? 'Camera unavailable' : 'Choose a source';
  }
  $('#sourceMenu').classList.remove('show');
  $('#sourceMenuButton').setAttribute('aria-expanded', 'false');
};
function clearMotion() {
  app.live = null; app.calibrated = false; arc.clear();
  app.baseline = { L: null, R: null };
  for (const key of Object.keys(torsoSm)) delete torsoSm[key];
  for (const key of Object.keys(rotState)) delete rotState[key];
  $$('#readoutStrip strong').forEach(n => n.textContent = '—');
  $('#stage').classList.remove('has-motion');
  anatomy.setStress(Object.fromEntries(LOADS.map(([id]) => [id, 0])));
}
async function startCamera(options = {}) {
  if (options.forCoach) {
    const button = $('#coachCamera');
    button.disabled = true;
    $('#coachError')?.remove();
    try {
      await pose.init();
      await pose.startCamera();
      const report = app.report;
      stopDemo();
      app.report = report;
      app.source = 'camera'; app.cameraError = false;
      anatomy.setIdle(false); anatomy.setDemoMode(false);
      $('#stage').classList.remove('source-off', 'camera-error', 'source-loading');
      $('#camEmpty').classList.add('hide');
      setSource('btnCamera');
      return true;
    } catch (e) {
      const error = el('p', 'coach-error', esc(cameraErrorMessage(e)));
      error.id = 'coachError'; error.setAttribute('role', 'alert');
      $('#rehabCoach').append(error);
      $('#coachTitle').focus({ preventScroll: true });
      return false;
    } finally { button.disabled = false; }
  }
  stopDemo();
  stopCoach();
  app.cameraError = false; $('#cameraRecovery').hidden = true;
  anatomy.setIdle(false);
  anatomy.setDemoMode(false);
  const btn = $('#btnCamera');
  if (pose.running && app.source === 'camera') { pose.stop(); app.source = 'off'; setSource(null); clearMotion(); anatomy.setIdle(true); $('#stage').classList.add('source-off'); $('#camEmpty').classList.remove('hide'); $('.txt', $('#trackPill')).textContent = 'Camera off'; return; }
  setSource(null);
  clearMotion();
  $('#stage').classList.remove('source-off', 'camera-error');
  $('#stage').classList.add('source-loading');
  btn.disabled = true;
  $('#camEmpty span').textContent = 'Starting camera… Allow access when prompted';
  $('#camEmpty').classList.remove('hide');
  try {
    await pose.init();
    await pose.startCamera();
    app.source = 'camera';
    $('#btnMirror').classList.toggle('active', pose.mirrored);
    $('#camEmpty').classList.add('hide');
    setSource('btnCamera');
    toast('Camera on. Stand about 2 m back, hips in frame');
  } catch (e) {
    pose.stop(); app.source = 'off'; app.cameraError = true; setSource(null); clearMotion();
    $('#trackPill').classList.remove('on', 'warn', 'simulated');
    $('.txt', $('#trackPill')).textContent = 'Camera unavailable';
    $('#camEmpty > span').textContent = 'Camera unavailable';
    $('#cameraRecovery').hidden = false;
    $('#cameraRecovery p').textContent = cameraErrorMessage(e);
    $('#stage').classList.add('camera-error');
    anatomy.setIdle(true);
    setSource(null);
  } finally { btn.disabled = false; $('#stage').classList.remove('source-loading'); }
}
async function loadVideo(file) {
  stopDemo();
  anatomy.setIdle(false);
  app.cameraError = false; clearMotion();
  $('#stage').classList.remove('source-off', 'camera-error');
  try {
    await pose.init();
    await pose.loadVideoFile(file);
    app.source = 'video'; setSource('btnUpload');
    $('#camEmpty').classList.add('hide');
    toast(`Analyzing ${file.name}`);
  } catch (e) { toast(`Couldn't load video: ${e.message || e}`, 'warn'); }
}

// Synthetic arm motion so the model can be explored without a camera.
const DEMO = [
  { name: 'Forward raise', dur: 4, f: (u) => ({ elevation: 15 + 150 * Math.sin(Math.PI * u), plane: 85, rotation: 10, elbowFlex: 8, hike: 6 * Math.sin(Math.PI * u) }) },
  { name: 'Side raise', dur: 4.5, f: (u) => ({ elevation: 15 + 155 * Math.sin(Math.PI * u), plane: 15, rotation: 20, elbowFlex: 6, hike: 14 * Math.sin(Math.PI * u) }) },
  { name: '90/90 rotation', dur: 4.5, f: (u) => ({ elevation: 90, plane: 10, rotation: 30 + 70 * Math.sin(2 * Math.PI * u), elbowFlex: 90, hike: 4 }) },
  { name: 'Serve motion', dur: 3.5, f: (u) => {
    const k = u < 0.55 ? u / 0.55 : 1, p = u < 0.55 ? 0 : (u - 0.55) / 0.45;
    return u < 0.55
      ? { elevation: 30 + 65 * k, plane: 5, rotation: 20 + 85 * k, elbowFlex: 40 + 60 * k, hike: 5 }
      : { elevation: 95 + 70 * Math.sin(Math.PI * Math.min(p * 1.4, 1)) - 60 * Math.max(0, p - 0.7) / 0.3, plane: 5 + 110 * p, rotation: 105 - 165 * Math.min(p * 1.5, 1), elbowFlex: 100 - 90 * Math.min(p * 2, 1), hike: 10 };
  } },
];
function startDemo() {
  stopCoach();
  if (app.source === 'demo') { stopDemo(); return; }
  if (pose.running) pose.stop();
  anatomy.setIdle(false);
  app.source = 'demo';
  app.cameraError = false; clearMotion();
  app.baseline = { L: 0.2, R: 0.2 };
  setSource('btnDemo');
  $('#stage').classList.remove('source-off', 'camera-error');
  $('#stage').classList.add('demo');
  anatomy.setDemoMode(true);
  applyPreset('full');
  $('#readoutCaption span:last-child').textContent = 'Simulated values';
  $('#camEmpty').classList.add('hide');
  const pill = $('#trackPill');
  if (app.safetyPaused) pausedStatus();
  else { pill.classList.add('simulated'); pill.classList.remove('on', 'warn'); $('.txt', pill).textContent = 'DEMO · simulated motion'; }
  const total = DEMO.reduce((a, d) => a + d.dur, 0);
  const t0 = now();
  let lastName = '', lastLoop = '';
  const loop = () => {
    if (app.source !== 'demo') return;
    if ($('.modal.show') || app.safetyPaused || coach.preview || run.phase === 'safety') {
      demoRaf = requestAnimationFrame(loop);
      return;
    }
    const t = now(), c = (t - t0) % total;
    let acc = 0, seg = DEMO[0];
    for (const d of DEMO) { if (c < acc + d.dur) { seg = d; break; } acc += d.dur; }
    const activeTest = run.active && run.test;
    const a = activeTest ? demoTestPose(run.test, t - run.measureStart) || { elevation: 12, plane: 20, rotation: 0, elbowFlex: 6, hike: 0 } : seg.f((c - acc) / seg.dur);
    const loopId = activeTest ? `${run.test.id}-${Math.floor((t - run.measureStart) / 3.6)}` : `${seg.name}-${Math.floor((t - t0) / total)}`;
    if (loopId !== lastLoop) { arc.breakLine(t); lastLoop = loopId; }
    if (seg.name !== lastName) { lastName = seg.name; if (!run.active) $('#stageHud .hud-kicker').textContent = `Demo · ${seg.name}`; }
    const mk = (x) => ({ ...x, rotationValid: true, rotationSource: x.elbowFlex > 35 ? 'forearm' : 'hand', visibility: 1, neckGap: 0.2 * (1 - x.hike / 100) });
    const rest = { elevation: 3, plane: 0, rotation: 0, elbowFlex: 5, hike: 0 };
    const yaw = activeTest ? 0 : (seg.name !== 'Serve motion' ? 4 : 12) * Math.sin(t * .6);
    handleMetrics({ lean: 0, torso: { yaw, hipYaw: 0, separation: yaw, flex: 0, lean: 0 }, sides: { [app.side]: mk(a), [other(app.side)]: mk(rest) } }, t);
    demoRaf = requestAnimationFrame(loop);
  };
  loop();
  toast('Demo: watch which structures light up as the arm moves');
}
function stopDemo() {
  if (app.source !== 'demo') return;
  cancelAnimationFrame(demoRaf);
  app.source = 'off'; app.baseline = { L: null, R: null };
  clearMotion();
  setSource(null);
  $('#stage').classList.remove('demo', 'has-motion');
  $('#stage').classList.add('source-off');
  anatomy.setDemoMode(false);
  anatomy.setIdle(true);
  $('#readoutCaption span:last-child').textContent = 'Measured values';
  $('#camEmpty').classList.remove('hide');
  $('#stageHud .hud-kicker').textContent = 'Live anatomy';
  $('#camEmpty span').textContent = 'Camera off';
  const pill = $('#trackPill'); pill.classList.remove('on', 'simulated'); $('.txt', pill).textContent = 'Camera off';
}

/* ---------------- chat ---------------- */
const AV_DOC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/></svg>';
const AV_USER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const AV_SYS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
const chatLog = $('#chatLog');
const scrollChat = () => {
  chatLog.scrollTop = chatLog.scrollHeight;
  requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; });
};

function addMsg(who, html) {
  const m = el('div', `msg ${who}`);
  m.append(el('div', 'avatar', who === 'doctor' ? AV_DOC : who === 'user' ? AV_USER : AV_SYS), el('div', 'bubble', html));
  chatLog.append(m); scrollChat();
  return m;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chatSeq = 0;
async function doctor(text, { speak = true, delay = 450 } = {}) {
  const my = ++chatSeq;
  const typing = addMsg('doctor', '<span class="typing"><span></span><span></span><span></span></span>');
  await sleep(delay);
  if (!typing.isConnected) return typing;
  typing.remove();
  const m = addMsg('doctor', md(text));
  if (speak && voice.enabled && voice.ttsSupported && my === chatSeq) voice.speak(text.replace(/\*\*/g, ''));
  return m;
}
const userSay = (text) => addMsg('user', esc(text));
const system = (text) => addMsg('system', md(text));

/** Ask a question with option buttons. Resolves to value (or array for multi). */
let pending = null;
async function ask(q, opts, { multi = false, speak = true, inCard = false } = {}) {
  let host;
  if (inCard) {
    host = $('#testQuestions');
    $('#testCard').classList.add('answering');
    host.replaceChildren(el('h4', '', q));
    addMsg('doctor', md(q));
    $$('.tc-actions button', $('#testCard')).forEach(b => b.disabled = b.textContent !== 'Skip');
    $('.tc-target', $('#testCard')).textContent = 'Answer above to continue.';
  } else host = $('.bubble', await doctor(q, { speak }));
  return new Promise((resolve) => {
    const box = el('div', `opts${multi ? ' multi' : ''}`);
    const sel = new Set();
    let finished = false;
    const finish = (vals) => {
      if (finished) return;
      finished = true;
      box.classList.add('done');
      done.hidden = true;
      $$('button', box).forEach((b) => (b.disabled = true));
      pending = null;
      const labels = opts.filter((o) => (multi ? vals.includes(o.v) : o.v === vals)).map((o) => o.label);
      userSay(labels.join(', ') || 'None');
      if (inCard) {
        host.replaceChildren();
        $('#testCard').classList.remove('answering');
      }
      resolve(vals);
    };
    const toggle = (o, b) => {
      if (!multi) { b.classList.add('selected'); finish(o.v); return; }
      const exclusive = o.v === 'none' || o.v === 'no';
      if (exclusive) { finish([o.v]); return; }
      else for (const x of opts) if ((x.v === 'none' || x.v === 'no') && sel.has(x.v)) { sel.delete(x.v); $$('button.opt', box).find((y) => y.dataset.v === String(x.v))?.classList.remove('selected'); }
      if (sel.has(o.v)) { sel.delete(o.v); b.classList.remove('selected'); } else { sel.add(o.v); b.classList.add('selected'); }
      done.disabled = sel.size === 0;
      done.textContent = 'Done';
      btns.forEach(button => button.setAttribute('aria-pressed', sel.has(opts[btns.indexOf(button)].v)));
    };
    const btns = opts.map((o) => {
      const b = el('button', 'opt', esc(o.label)); b.type = 'button'; b.dataset.v = String(o.v);
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => toggle(o, b);
      box.append(b); return b;
    });
    const done = el('button', 'opt primary multi-done', 'Done');
    if (multi) { done.type = 'button'; done.disabled = true; done.onclick = () => finish([...sel]); box.append(done); }
    host.append(box);
    if (inCard) {
      host.closest('.tc-body').scrollTop = 0;
      if (matchMedia('(max-width: 700px)').matches) requestAnimationFrame(() => $('#testCard').scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
    else scrollChat();
    pending = {
      cancel() { finished = true; pending = null; box.classList.add('done'); resolve(null); },
      answer(text) {
        const vopts = opts.map((o) => ({ label: o.label, kw: Array.isArray(o.kw) ? o.kw.join('|') : o.kw }));
        if (!multi) {
          const i = voice.matchOption(text, vopts);
          if (i >= 0) { btns[i].classList.add('selected'); finish(opts[i].v); return true; }
          if (opts.length === 2 || opts.some((o) => o.v === 'yes')) {
            const yn = voice.matchYesNo(text);
            const j = yn ? opts.findIndex((o) => o.v === yn) : -1;
            if (j >= 0) { finish(opts[j].v); return true; }
          }
          return false;
        }
        if (/^(done|that'?s it|finished|next)$/i.test(text.trim()) && sel.size) { finish([...sel]); return true; }
        const parts = text.split(/,|\band\b|\balso\b|\bplus\b/i).map((s) => s.trim()).filter(Boolean);
        let hit = false;
        for (const p of parts) { const i = voice.matchOption(p, vopts); if (i >= 0 && !sel.has(opts[i].v)) { toggle(opts[i], btns[i]); hit = true; } }
        if (hit && !finished) system('Got it. Add more or press **Done**.');
        return hit;
      },
    };
  });
}

function handleText(text) {
  text = text.trim();
  if (!text) return;
  const cmd = run.active && !pending ? parseMarkerCommand(text) : null;
  if (cmd) { userSay(text); runCommand(cmd); return; }
  if (pending) { if (!pending.answer(text)) { userSay(text); doctor("Sorry, I didn't catch which option you meant. Tap one of the buttons, or say it a different way.", { speak: false, delay: 250 }); } return; }
  userSay(text);
  const c = run.active ? parseMarkerCommand(text) : null;
  if (c) { runCommand(c); return; }
  if (/start|exam|begin|quick/i.test(text)) { startExam(/full/i.test(text) ? 'full' : 'quick'); return; }
  if (/report/i.test(text)) { openReport(); return; }
  doctor(Object.keys(exam.tests).length ? 'Your screening is saved. View the report, start a new exam, or go to Rehab using the buttons above.' : 'Choose **Start quick exam** to begin, or **Try demo** to explore the anatomy.', { speak: false, delay: 250 });
}
$('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); handleText($('#chatText').value); $('#chatText').value = ''; });

/* ---------------- voice input ---------------- */
let stopListen = null;
function setMicUI(on) { $('#btnMic').classList.toggle('active', on); $('#btnMic').classList.toggle('on', on); $('#micStatus').textContent = on ? 'Listening…' : ''; }
function startListening() {
  if (!voice.sttSupported) { $('#micStatus').textContent = 'Voice input unavailable. Type your answers instead.'; return; }
  if (stopListen) return;
  setMicUI(true);
  stopListen = voice.listen({
    continuous: true,
    onPartial: (t) => { $('#chatText').placeholder = `…${t}`; },
    onFinal: (t) => {
      $('#chatText').placeholder = 'Type an answer…';
      if (voice.speaking) { const c = parseMarkerCommand(t); if (c === 'stop' || c === 'pain') runCommand(c); return; }
      handleText(t);
    },
    onEnd: ({ error } = {}) => {
      stopListen = null; setMicUI(false);
      if (error && error !== 'no-speech' && error !== 'aborted') $('#micStatus').textContent = `Mic unavailable: ${error}. Type your answers instead.`;
    },
  });
}
function stopListening() { stopListen?.(); stopListen = null; setMicUI(false); }
$('#btnMic').onclick = () => (stopListen ? stopListening() : startListening());

function setVoice(on) {
  voice.setEnabled(on);
  $('#btnVoiceToggle').setAttribute('aria-pressed', on);
  $('#btnVoiceToggle').title = `Doctor voice: ${on ? 'on' : 'off'}`;
  if (!on) voice.cancel();
}
$('#btnVoiceToggle').onclick = () => { setVoice(!voice.enabled); toast(voice.enabled ? 'Doctor voice on' : 'Doctor voice off'); };

/* ---------------- red flags ---------------- */
function checkRedFlags() {
  const f = redFlags(exam);
  const b = $('#redFlagBanner');
  b.classList.toggle('show', f.length > 0);
  if (f.length) {
    const order = { emergency: 0, urgent: 1, soon: 2 };
    f.sort((a, c) => order[a.level] - order[c.level]);
    $('.rf-txt', b).innerHTML = f[0].level === 'emergency'
      ? `<strong>Call emergency services now</strong><a href="tel:911">Call 911 / your local emergency number</a><span>${esc(f[0].text)}</span>`
      : esc(f[0].text);
    b.dataset.level = f[0].level;
    renderRehab();
  }
  return f;
}

/* ---------------- intake ---------------- */
function intakeProgress(step, total) {
  $('#examProgress').hidden = false;
  $('#progressIntake').style.width = `${step / total * 100}%`;
  $('#progressTests').style.width = '0%';
  $('#progressIntakeLabel').textContent = `Intake ${step}/${total}`;
  $('#progressTestsLabel').textContent = 'Movement tests';
  $('#testCard').classList.add('show', 'intake');
  $('#testCard').innerHTML = `<div class="tc-head"><div class="tc-step">${run.mode === 'quick' ? 'Quick' : 'Full'} exam · Question ${step} of ${total}</div><div class="tc-title">${step === 1 ? 'Safety first' : 'Getting to know your shoulder'}</div></div>`;
}
async function blockForFlags(flags) {
  run.phase = 'safety';
  app.safetyPaused = true;
  pausedStatus();
  document.body.classList.add('safety-stopped');
  $('#progressIntakeLabel').textContent = 'Stopped';
  $('#progressTestsLabel').textContent = '';
  const c = $('#testCard');
  c.classList.remove('intake');
  c.classList.add('show', 'safety-card');
  c.setAttribute('role', 'alert');
  $('#redFlagBanner').classList.remove('show');
  const emergency = flags.some(f => f.level === 'emergency');
  const nextStep = emergency
    ? 'Call emergency services now'
    : 'Contact a clinician or urgent-care service before doing movement tests.';
  c.classList.toggle('emergency', emergency);
  c.innerHTML = `<div class="tc-head"><h2 class="tc-title">${emergency ? nextStep : 'Get checked before testing.'}</h2>${emergency ? '<a class="emergency-call" href="tel:911">Call 911 / your local emergency number</a>' : ''}</div><div class="tc-body">${flags.map(f => `<p>${esc(f.text)}</p>`).join('')}${emergency ? '' : `<p>${nextStep}</p>`}</div><div class="tc-actions"><button class="btn primary" id="endUnsafeExam" type="button">End exam</button><button class="btn ghost" id="continueUnsafeExam" type="button">Continue anyway (not advised)</button></div>`;
  const heading = $('.tc-title', c); heading.tabIndex = -1;
  requestAnimationFrame(() => {
    heading.focus({ preventScroll: true });
    if (matchMedia('(max-width: 700px)').matches) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  return new Promise(resolve => {
    $('#endUnsafeExam').onclick = () => {
      exam.stoppedForSafety = true;
      run.active = false; run.phase = null;
      document.body.classList.remove('exam-running');
      const report = app.report = currentReport();
      saveHistory(report);
      showSavedSafety(report, true);
      doctor('Screening stopped. Your safety concern has been saved to History. Do not continue movement testing.', { speak: false, delay: 100 });
      resolve(false);
    };
    $('#continueUnsafeExam').onclick = () => {
      app.safetyPaused = false;
      setSource(app.source === 'demo' ? 'btnDemo' : app.source === 'camera' ? 'btnCamera' : null);
      document.body.classList.remove('safety-stopped');
      run.phase = 'intake'; c.classList.remove('safety-card', 'emergency');
      resolve(true);
    };
  });
}
function pausedStatus() {
  $('#trackPill').classList.remove('on', 'warn', 'simulated');
  $('#trackPill').classList.add('paused');
  $('.txt', $('#trackPill')).textContent = 'Paused';
}
function showSavedSafety(report, focus = false) {
  const emergency = report.flags.some(f => f.level === 'emergency');
  const c = $('#testCard');
  c.className = `show saved-notice safety-card${emergency ? ' emergency' : ''}`;
  c.setAttribute('role', 'alert');
  c.innerHTML = `<h2 tabindex="-1">${emergency ? 'Call emergency services now' : 'Get checked before testing'}</h2>${emergency ? '<a href="tel:911">Call 911 / your local emergency number</a>' : ''}<p>Safety concern saved to History.</p><div class="tc-actions"><button class="btn primary" id="viewSafetyReport" type="button">View safety report</button><button class="btn ghost" id="safetyStartOver" type="button">Start over</button></div>`;
  $('#viewSafetyReport').onclick = () => openReport(report);
  $('#safetyStartOver').onclick = chooseExam;
  $('#progressIntakeLabel').textContent = 'Stopped';
  $('#progressTestsLabel').textContent = '';
  pausedStatus();
  if (focus) requestAnimationFrame(() => {
    $('h2', c).focus({ preventScroll: true });
    if (matchMedia('(max-width: 700px)').matches) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}
async function runIntake() {
  const questions = intakePlan(run.mode);
  run.intakeTotal = questions.length;
  $('#progressIntakeTrack').style.flex = questions.length;
  $('#progressTestsTrack').style.flex = buildList(run.mode).length;
  let clearedFlags = '';
  for (let i = 0; i < questions.length; i++) {
    let q = questions[i];
    const symptoms = exam.intake.symptoms || [], sports = exam.intake.overheadSport === 'yes';
    if (q.id === 'servePhase' && !sports || ['pull', 'pullDetail'].includes(q.id) && !symptoms.includes('pull')
      || ['clickWhere', 'clickPainful'].includes(q.id) && !symptoms.includes('click') && !symptoms.includes('unsure')) continue;
    if (q.id === 'details') q = symptoms.includes('pull') ? pullingQuestion() : symptoms.includes('click')
      ? INTAKE.find(x => x.id === 'clickPainful') : { ...q, id: 'catching' };
    const text = q.id === 'dominant' ? sports ? 'Which arm do you use for your overhead sport?' : 'Which is your dominant arm?' : q.q;
    const opts = !sports && q.id === 'onset' ? q.opts.map(o => o.v === 'event' ? { ...o, label: 'One specific movement' } : o)
      : !sports && q.id === 'load' ? q.opts.filter(o => !['gear', 'technique'].includes(o.v)).map(o => o.v === 'volume' ? { ...o, label: 'More activity than usual' } : o) : q.opts;
    intakeProgress(i + 1, questions.length);
    const v = await ask(text, opts, { multi: !!q.multi });
    exam.intake[q.id] = v;
    if (q.id === 'symptoms') {
      if (v.includes('unstable')) exam.intake.instability = 'yes';
      if (v.includes('weak')) exam.intake.weakness = 'yes';
    }
    if (q.id === 'pullDetail') {
      exam.intake.lab = v;
      if (v === 'lat') exam.intake.pull = ['lat'];
    }
    if (q.id === 'deadArm' && v === 'yes') exam.intake.catching = 'yes';
    if (q.id === 'side') setSide(v === 'L' ? 'L' : 'R');
    if (q.id === 'dominant' && exam.intake.side === 'B') setSide(v);
    const flags = checkRedFlags();
    const signature = flags.map(f => f.text).join('|');
    if (flags.length && signature !== clearedFlags) {
      if (!await blockForFlags(flags)) return false;
      clearedFlags = signature;
    }
  }
  $('#progressIntake').style.width = '100%';
  saveDraft();
  return true;
}

/* ---------------- exam engine ---------------- */
const run = { active: false, mode: 'quick', test: null, idx: 0, list: [], phase: null, resolve: null, counter: null, hold: null, passSide: null, samples: [], lastPopT: 0 };
const metricOf = (sm, metric) => (metric === 'rotation' ? (sm.rotationValid ? sm.rotation : null) : sm[metric]);
const inRange = (v, r) => v != null && v >= r[0] && v <= r[1];

function gateOK(sm, g) {
  if (!sm || !g) return false;
  if (g.plane && sm.elevation > 35 && !inRange(sm.plane, g.plane)) return 'plane';
  if (g.elevMax != null && sm.elevation > g.elevMax) return 'elevHigh';
  if (g.elevRange && !inRange(sm.elevation, g.elevRange)) return sm.elevation < g.elevRange[0] ? 'elevLow' : 'elevHigh';
  return true;
}
const GATE_MSG = {
  plane: (g) => `Move in the right direction: ${planeLabel(90, (g.plane[0] + g.plane[1]) / 2)}`,
  elevHigh: () => 'Keep your elbow lower',
  elevLow: () => 'Lift your elbow up to shoulder height',
};

const alternating = t => t.sides === 'affectedFirst' || app.source === 'demo' && t.sides === 'both' && t.mode === 'reps';
function readSides(t) { return app.source === 'demo' ? [app.side] : t.sides === 'both' || t.sides === 'affectedFirst' ? ['L', 'R'] : [app.side]; }
function blankStats() { return { maxElev: null, minElev: null, maxRot: null, minRot: null, maxHike: null, maxLean: null }; }
function accStats(rec, live, sides, gate) {
  for (const s of sides) {
    const sm = live.sides[s];
    if (!sm) continue;
    if (gate && gateOK(sm, gate) !== true) continue;
    const st = (rec.sides[s] ||= blankStats());
    const mx = (k, v) => { if (v != null && !Number.isNaN(v)) st[k] = st[k] == null ? v : Math.max(st[k], v); };
    const mn = (k, v) => { if (v != null && !Number.isNaN(v)) st[k] = st[k] == null ? v : Math.min(st[k], v); };
    mx('maxElev', sm.elevation); mn('minElev', sm.elevation);
    if (sm.rotationValid) { mx('maxRot', sm.rotation); mn('minRot', sm.rotation); }
    mx('maxHike', live.hike[s]); mx('maxLean', Math.abs(live.lean ?? 0));
  }
}

function renderCard(t, i, n) {
  const c = $('#testCard');
  document.body.classList.add('exam-testing');
  layoutMobileStage();
  $('#progressTestsLabel').textContent = `Tests ${i + 1}/${n}`;
  $('#progressTestsTrack').style.flex = n;
  $('#progressTests').style.width = `${i / n * 100}%`;
  c.innerHTML = '';
  const head = el('div', 'tc-head');
  head.append(el('div', 'tc-step', `Test ${i + 1} of ${n}`), el('div', 'tc-title', esc(t.title)));
  c.classList.remove('intake', 'safety-card', 'answering', 'emergency');
  head.firstElementChild.textContent = `${run.mode === 'quick' ? 'Quick' : 'Full'} exam · Test ${i + 1} of ${n}`;
  if (t.id === 'rot90') head.lastElementChild.innerHTML = 'Rotation range <span class="help" tabindex="0" title="GIRD means less inward rotation on one side compared with the other." aria-label="GIRD means less inward rotation on one side compared with the other.">ⓘ</span>';
  c.append(head);
  const body = el('div', 'tc-body');
  const focusLabel = $(`#presets [data-preset="${t.focus}"]`)?.textContent.toLowerCase() || t.focus;
  body.append(el('div', 'tc-focus', t.focus === 'full' ? 'Showing: all tissue' : `Highlighting: ${esc(focusLabel)}`));
  if (t.tip && app.source !== 'demo') body.append(el('p', 'tc-desc', md(t.tip)));
  const ol = el('ol', 'tc-steps');
  const steps = app.source === 'demo' && t.id === 'calib'
    ? ['Watch the shoulders rest at their sides', 'Simulated calibration runs automatically', 'No camera is being used']
    : t.steps.filter(s => app.source !== 'demo' || !/press next/i.test(s));
  steps.forEach((s, k) => ol.append(el('li', k === 0 ? 'current' : '', md(s))));
  body.append(ol);
  const questions = el('div'); questions.id = 'testQuestions'; body.append(questions);
  c.append(body);
  c.append(el('div', 'tc-target', ''));
  const acts = el('div', 'tc-actions');
  const b = (label, cls, fn) => { const x = el('button', `btn ${cls}`, label); x.type = 'button'; x.onclick = fn; acts.append(x); return x; };
  b('Skip', 'ghost', () => runCommand('skip'));
  b('Repeat', 'ghost', () => runCommand('repeat'));
  const next = b('Next', 'primary', () => runCommand('next'));
  next.id = 'testNext';
  if (app.source === 'demo' && !demoTestPose(t, 0)) {
    body.append(el('p', 'demo-unavailable', 'This requires hands-on contact. Demo will skip it automatically.'));
  }
  c.append(acts);
  c.classList.add('show');
}
function cardProgress(frac, html) {
  const c = $('#testCard');
  $('#progressTests').style.width = `${(run.idx + clamp(frac, 0, 1)) / Math.max(1, run.list.length) * 100}%`;
  const tg = $('.tc-target', c); if (tg && html != null && tg.innerHTML !== html) tg.innerHTML = html;
  const lis = $$('ol.tc-steps li', c);
  const cur = Math.min(lis.length - 1, Math.floor(clamp(frac, 0, 0.999) * lis.length));
  lis.forEach((li, k) => { li.classList.toggle('done', k < cur); li.classList.toggle('current', k === cur); });
}
function setHold(p, text, show = true) {
  const r = $('#holdRing');
  r.style.setProperty('--p', clamp(p, 0, 1));
  r.textContent = text ?? '';
  r.classList.toggle('show', show);
}

function examTick(live) {
  if ($('.modal.show') || !run.active || !run.test || run.phase !== 'measure') return;
  const t = run.test, rec = run.rec, sides = readSides(t);
  if (t.mode === 'manual') {
    accStats(rec, live, sides);
    if (app.source === 'demo') {
      const duration = { obrien: 10, scapClick: 16 }[t.id] || 6;
      cardProgress((live.t - run.measureStart) / duration, 'Illustrated demo · watch the movement');
      if (live.t - run.measureStart >= duration) {
        if (demoTestPose(t, 0)) advance();
        else { system(`Demo skipped ${t.title}: this needs hands-on assessment.`); runCommand('skip'); }
      }
    }
    return;
  }
  if (t.mode === 'hold') return holdTick(t, rec, live, sides);
  return repTick(t, rec, live, sides);
}

function holdTick(t, rec, live, sides) {
  const g = t.target;
  const okSide = (s) => {
    const sm = live.sides[s]; if (!sm) return false;
    const v = metricOf(sm, g.metric); if (v == null) return false;
    if (g.min != null && v < g.min) return false;
    if (g.max != null && v > g.max) return false;
    return gateOK(sm, g) === true;
  };
  const need = t.sides === 'both' ? sides.filter((s) => live.sides[s]) : [app.side];
  const ok = need.length > 0 && need.every(okSide) && okSide(app.side);
  const h = run.hold;
  if (ok) {
    if (h.start == null) { h.start = live.t; h.samples = { L: [], R: [] }; }
    for (const s of sides) { const sm = live.sides[s]; if (sm) h.samples[s].push({ v: metricOf(sm, g.metric), gap: sm.neckGap, t: live.t }); }
    accStats(rec, live, sides);
    const p = (live.t - h.start) / t.holdSec;
    setHold(p, `${Math.max(0, Math.ceil(t.holdSec - (live.t - h.start)))}`);
    cardProgress(0.34 + 0.66 * p, `<b>Hold</b> ${Math.ceil(t.holdSec - (live.t - h.start))}s`);
    if (p >= 1) finishHold(t, rec);
  } else {
    if (h.start != null && live.t - h.start > 0.6) toast('Position lost. Get back into position', 'warn');
    h.start = null;
    const sm = live.sides[app.side];
    let hint = 'Get into position';
    if (!sm) hint = `Step back so I can see your ${SIDE_NAME[app.side].toLowerCase()} arm`;
    else {
      const v = metricOf(sm, g.metric), gate = gateOK(sm, g);
      if (gate !== true) hint = GATE_MSG[gate](g);
      else if (v == null) hint = ROT_HINT;
      else if (g.min != null && v < g.min) hint = `${g.metric === 'rotation' ? 'Rotate out' : 'Raise'} to <b>${g.min}°</b> (now ${fmt(v)}°)`;
      else if (g.max != null && v > g.max) hint = `${g.metric === 'elevation' ? 'Lower' : 'Ease back'} to under <b>${g.max}°</b> (now ${fmt(v)}°)`;
    }
    setHold(0, '', false);
    cardProgress(0.15, hint);
  }
}

function finishHold(t, rec) {
  const S = run.hold.samples;
  for (const s of Object.keys(S)) {
    const arr = S[s].filter((x) => x.v != null);
    if (arr.length < 4) continue;
    const st = (rec.sides[s] ||= blankStats());
    const k = Math.max(2, Math.floor(arr.length / 5));
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    st.drift = avg(arr.slice(0, k).map((x) => x.v)) - avg(arr.slice(-k).map((x) => x.v));
    const d = arr.slice(1).map((x, i) => x.v - arr[i].v);
    const md0 = avg(d);
    st.tremor = Math.sqrt(avg(d.map((x) => (x - md0) ** 2))) / 100;
    if (t.id === 'calib') {
      const gaps = S[s].map((x) => x.gap).filter((x) => x != null);
      if (gaps.length) app.baseline[s] = avg(gaps);
    }
  }
  if (t.id === 'calib') { app.calibrated = true; toast('Calibrated. Shrug baseline saved', 'good'); }
  setHold(1, '✓');
  setTimeout(() => setHold(0, '', false), 700);
  advance();
}

function repTick(t, rec, live, sides) {
  const g = t.rep, s = run.passSide || app.side, sm = live.sides[s];
  accStats(rec, live, sides, { plane: g.plane, elevMax: g.elevMax, elevRange: g.elevRange });
  const target = t.reps || 3;
  if (!sm) { cardProgress(run.counter.count / target, `Step back so I can see your ${SIDE_NAME[s].toLowerCase()} arm`); return; }
  const gate = gateOK(sm, g);
  const v = metricOf(sm, g.metric);
  if (gate !== true) { cardProgress(run.counter.count / target, GATE_MSG[gate](g)); return; }
  if (v == null) { cardProgress(run.counter.count / target, ROT_HINT); return; }
  const rep = run.counter.push(v, live.t);
  const label = alternating(t) ? `${SIDE_NAME[s]} arm · ` : '';
  const html = `${label}Rep <b>${Math.min(run.counter.count + 1, target)}/${target}</b> · ${g.metric} <b>${fmt(v)}°</b> → ${run.counter.state === 'down' ? `reach ${g.up}°` : `return below ${g.down}°`}`;
  cardProgress((run.counter.count + (run.counter.state === 'up' ? 0.5 : 0)) / target, html);
  if (rep) {
    toast(`Rep ${run.counter.count}: peak ${fmt(rep.peak)}°`, 'good');
    if (run.counter.count >= target) {
      if (alternating(t) && s === run.affectedSide) {
        run.passSide = other(run.affectedSide);
        run.counter = new RepCounter({ up: g.up, down: g.down });
        setSide(run.passSide); doctor(`Good. Now the same with your **${SIDE_NAME[run.passSide].toLowerCase()}** arm.`, { delay: 150 });
        return;
      }
      if (alternating(t)) setSide(run.affectedSide);
      advance();
    }
  }
}

function advance() {
  if (run.phase !== 'measure') return;
  run.phase = 'follow';
  const r = run.resolve; run.resolve = null; r?.('done');
}

function buildList(mode) {
  const ids = mode === 'full' ? TESTS.map((t) => t.id) : QUICK_TEST_IDS;
  const list = ids.map((id) => TESTS.find((t) => t.id === id)).filter(Boolean);
  // Add the biceps/labrum test to a quick run when the user points to the labrum.
  if (mode === 'quick' && exam.intake.lab === 'labrum' && !ids.includes('speeds')) list.splice(list.findIndex((t) => t.id === 'obrien') + 1, 0, TESTS.find((t) => t.id === 'speeds'));
  return list;
}

async function runTest(t, i, n) {
  run.test = t;
  run.rec = exam.tests[t.id] = { follow: {}, markers: [], sides: {}, simulated: app.source === 'demo', complete: false };
  run.affectedSide = affectedSide(exam.intake);
  run.counter = t.rep ? new RepCounter({ up: t.rep.up, down: t.rep.down }) : null;
  run.hold = { start: null, samples: { L: [], R: [] } };
  run.passSide = alternating(t) ? app.side : null;
  applyPreset(t.focus, { frame: false });
  renderCard(t, i, n);
  $('#hudTitle').textContent = t.title;
  $('#hudSub').textContent = t.steps[0].replace(/\*\*/g, '');
  arc.clear();
  if (app.source === 'off') system('Camera is off. Press **Camera** (or **Demo**) at the top so I can measure. You can still press Done / Skip.');
  voice.speak(app.source === 'demo' && t.id === 'calib' ? 'Watch the shoulders resting at their sides. Simulated calibration runs automatically.'
    : exam.intake.overheadSport === 'yes' ? t.say : t.say.replace('This one matters for your serve. ', ''));
  run.phase = 'measure';
  run.measureStart = now();
  const res = await new Promise((r) => (run.resolve = r));
  setHold(0, '', false);
  if (res === 'repeat') return runTest(t, i, n);
  if (res === 'skip') { run.rec.skipped = true; return; }
  if (res === 'abort') return 'abort';
  cardProgress(1, 'Done ✓');
  for (const f of t.follow || []) {
    const answer = await ask(f.q, f.opts, { multi: !!f.multi, inCard: true });
    if (answer == null) { run.rec.skipped = true; return; }
    run.rec.follow[f.id] = answer;
    const painMarker = run.rec.markers.find(m => m.type === 'pain');
    const deniesPain = (Array.isArray(answer) ? answer.includes('none') : ['none', 'na'].includes(answer))
      && ['pain', 'arc', 'thumbDown', 'palmUp', 'cock', 'feel'].includes(f.id);
    if (painMarker && deniesPain) {
      const confirm = await ask(`You marked pain at ${fmt(painMarker.elevation)}°. Was that painful?`, [
        { v: 'keep', label: 'Yes, that was painful' }, { v: 'remove', label: 'No — remove the pain marker' },
      ], { inCard: true });
      if (confirm == null) { run.rec.skipped = true; return; }
      reconcilePain(run.rec, f.id, confirm === 'keep', f);
    }
  }
  run.rec.complete = true;
  saveDraft();
}

async function startExam(mode = run.mode) {
  if (run.active) { toast('Exam already running. Say "skip" or press Next.'); return; }
  run.mode = mode;
  stopCoach();
  exam.intake = {}; exam.tests = {}; exam.stoppedForSafety = false; app.report = null;
  exam.peakFrame = null; exam.anatomySnapshot = null; app.safetyPaused = false;
  document.body.classList.remove('safety-stopped');
  run.test = null; run.rec = null; run.phase = 'intake';
  run.list = [];
  exam.startedT = now(); exam.freeMarkers = [];
  $('#btnReport').disabled = true;
  $('#reportHint').textContent = 'Exam in progress — report appears when finished';
  $('#btnReport').removeAttribute('title');
  document.body.classList.remove('exam-testing');
  layoutMobileStage();
  chatSeq++; chatLog.replaceChildren();
  $('#progressIntake').style.width = $('#progressTests').style.width = '0%';
  $('#progressIntakeLabel').textContent = 'Intake 0/8';
  $('#progressTestsLabel').textContent = 'Movement tests';
  arc.clear(); anatomy.setStress({}); applyPreset('full', { frame: false });
  userSay(mode === 'quick' ? 'Quick exam (4–6 min)' : 'Full exam (12–15 min)');
  $('#btnQuick').classList.toggle('active', mode === 'quick');
  $('#btnFull').classList.toggle('active', mode === 'full');
  switchTab('exam');
  run.active = true;
  document.body.classList.add('exam-running');
  $('#redFlagBanner').classList.remove('show');
  $('#testCard').classList.remove('safety-card', 'emergency', 'saved-notice', 'answering');
  $('#testCard').removeAttribute('role');
  $('#trackPill').classList.remove('paused');
  setSource(app.source === 'demo' ? 'btnDemo' : app.source === 'camera' ? 'btnCamera' : app.source === 'video' ? 'btnUpload' : null);
  renderRehab();
  const ok = await runIntake();
  if (!ok) { run.active = false; return; }
  const list = buildList(mode);
  run.list = list;
  await doctor(`${list.length} movement tests next. Move gently and stop if symptoms worsen. Use the marker buttons to note what you feel.`, { delay: 150 });
  system('Tip: press P to mark pain, C for a click, L for pulling, or U for instability.').classList.add('keyboard-tip');
  for (let i = 0; i < list.length; i++) {
    if (!run.active) return;
    run.idx = i;
    const r = await runTest(list[i], i, list.length);
    if (r === 'abort') break;
  }
  finishExam();
}

function finishExam() {
  run.active = false; run.test = null; run.phase = null;
  document.body.classList.remove('exam-running', 'exam-testing');
  layoutMobileStage();
  $('#progressTests').style.width = '100%';
  $('#progressTestsLabel').textContent = `${run.list.length} tests finished`;
  $('#testCard').classList.remove('show');
  $('#hudTitle').textContent = `${SIDE_NAME[app.side]} shoulder`;
  setHold(0, '', false);
  if (exam.peakFrame) {
    try { exam.anatomySnapshot = anatomy.snapshot({ crop: true, frame: exam.peakFrame }); } catch (e) { console.warn('Anatomy snapshot unavailable', e); }
  }
  const report = currentReport();
  app.report = report;
  saveHistory(report);
  renderRehab(report);
  const top = report.conditions?.[0];
  const conclusion = report.flags?.length ? report.summary : top?.p >= .35 ? `Leading finding: **${top.name}**.` : 'No strong screening pattern was found.';
  doctor(`Screening saved. ${conclusion}`, { delay: 100 }).then(m => completionActions($('.bubble', m)));
}
function completionActions(host, stopped = false) {
  const actions = el('div', 'opts completion-actions');
  const choices = stopped ? [['Start over', chooseExam], ['View report', () => openReport()]]
    : [['View report', () => openReport()], ['Start new exam', chooseExam], ['Go to Rehab', () => switchTab('rehab')]];
  for (const [label, action] of choices) {
    const b = el('button', 'opt', label); b.type = 'button'; b.onclick = () => action(); actions.append(b);
  }
  host.append(actions); scrollChat();
}
function chooseExam() {
    chatSeq++; chatLog.replaceChildren(el('hr', 'exam-divider'));
    $('#testCard').classList.remove('show');
    $('#examProgress').hidden = true;
    $('#progressIntake').style.width = $('#progressTests').style.width = '0%';
    anatomy.setStress({}); applyPreset('full', { frame: false });
    addMsg('doctor', 'Which exam would you like to run?');
    const box = el('div', 'opts');
    for (const [label, mode] of [['Quick exam · 4–6 min', 'quick'], ['Full exam · 12–15 min', 'full']]) {
      const b = el('button', 'opt', label); b.type = 'button';
      b.onclick = () => { box.classList.add('done'); startExam(mode); }; box.append(b);
    }
    $('.bubble', chatLog.lastElementChild).append(box); scrollChat();
}

function runCommand(cmd) {
  if (['pain', 'click', 'pull', 'unstable'].includes(cmd)) { addMarker(cmd); return; }
  if (cmd === 'stop') {
    voice.cancel();
    if (run.active) { addMarker('pain'); doctor('Stopping that test. Rest your arm. Press **Next** when ready or **Skip**.', { speak: false, delay: 100 }); run.phase === 'measure' && (run.phase = 'paused'); }
    return;
  }
  if (!run.active) return;
  if (cmd === 'next' || cmd === 'skip' || cmd === 'repeat') {
    if (pending) { if (cmd === 'skip') pending.cancel(); return; }
    if (run.phase === 'measure' || run.phase === 'paused') { run.phase = 'follow'; const r = run.resolve; run.resolve = null; r?.(cmd === 'next' ? 'done' : cmd); }
    else if (cmd === 'repeat' && run.test) voice.speak(run.test.say, { interrupt: true });
  }
}

/* ---------------- markers ---------------- */
const MARK_LABEL = { pain: 'Pain', click: 'Click / pop', pull: 'Pulling', unstable: 'Unstable' };
function addMarker(type, src = 'you') {
  const sm = app.live?.sides?.[app.side];
  const displayedAngle = $(`#read${app.side} strong`).textContent;
  const time = now();
  const m = { type, side: app.side, elevation: sm?.elevation ?? null, rotation: sm?.rotationValid ? sm.rotation : null, plane: sm?.plane ?? null, src, t: time, elapsed: Math.max(0, time - exam.startedT), recordedAt: new Date().toISOString() };
  if (run.rec && run.active) run.rec.markers.push(m);
  else (exam.freeMarkers ||= []).push(m);
  arc.mark(type, app.live?.t ?? now());
  const btn = $(`#markerBar button[data-marker="${type}"]`);
  if (btn) { btn.classList.add('active'); setTimeout(() => btn.classList.remove('active'), 600); }
  toast(`${SIDE_NAME[app.side]} shoulder: ${MARK_LABEL[type].toLowerCase()} recorded${sm ? ` at ${displayedAngle}` : ''}${src === 'mic' ? ' (heard by mic)' : ''}`, type === 'pain' || type === 'unstable' ? 'warn' : '');
}
$$('#markerBar button[data-marker]').forEach((b) => (b.onclick = () => addMarker(b.dataset.marker)));
document.addEventListener('keydown', (e) => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if ((k === ' ' || k === 'enter') && e.target.closest('button, summary')) return;
  if ($('.modal.show') && k !== 'escape') return;
  const map = { ' ': 'pain', p: 'pain', c: 'click', u: 'unstable', l: 'pull' };
  if (map[k]) { e.preventDefault(); addMarker(map[k]); }
  else if (k === 'n' || k === 'enter') runCommand('next');
  else if (k === 'escape') {
    if ($('#anatomyControls').open) { $('#anatomyControls').open = false; $('#anatomyControls > summary').focus(); }
    $('#reportModal').classList.remove('show'); $('#historyModal').classList.remove('show');
  }
});

/* ---------------- mic pop detector ---------------- */
let pop = null;
$('#btnPopMic').onclick = async () => {
  const b = $('#btnPopMic');
  if (pop) { pop.stop(); pop = null; b.classList.remove('on'); b.setAttribute('aria-pressed', false); $('#popLevel').style.width = '0%'; $('#popStatus').textContent = 'Click detector off'; return; }
  $('#popStatus').textContent = '';
  if (!audioSupported) { $('#popStatus').textContent = 'Mic unavailable'; return; }
  b.disabled = true;
  $('#popStatus').textContent = 'Allow microphone access in your browser…';
  try {
    pop = new PopDetector({ sensitivity: 0.6 });
    pop.onLevel((lv) => { $('#popLevel').style.width = `${Math.round(clamp(lv, 0, 1) * 100)}%`; pop?.setSuppressed(voice.speaking); });
    pop.onPop(() => { if (now() - run.lastPopT > 0.6) { run.lastPopT = now(); addMarker('click', 'mic'); } });
    await pop.start();
    b.classList.add('on');
    b.setAttribute('aria-pressed', true);
    $('#popStatus').textContent = 'Click detector on';
  } catch (e) { pop?.stop(); pop = null; b.classList.remove('on'); b.setAttribute('aria-pressed', false); $('#popStatus').textContent = 'Mic unavailable'; }
  finally { b.disabled = false; }
};

/* ---------------- report ---------------- */
function currentReport() {
  const total = (run.list.length ? run.list : buildList(run.mode)).length;
  const completed = Object.values(exam.tests).filter(t => t.complete && !t.skipped).length;
  const report = displayReport({ ...buildReport(exam), stoppedForSafety: !!exam.stoppedForSafety, nerveReferral: exam.intake.nerve === 'yes' }, { completed, total, simulated: app.source === 'demo' || Object.values(exam.tests).some(t => t.simulated) });
  report.markers = collectMarkers(exam);
  report.motion = reportMotion(exam);
  report.anatomySnapshot = exam.anatomySnapshot || null;
  report.anatomyCapture = exam.anatomySnapshot && exam.peakFrame
    ? { kind: 'forward-raise-peak', side: exam.peakFrame.side, test: exam.peakFrame.test, elevation: exam.peakFrame.score, width: 900, height: 1170 } : null;
  report.painReconciliation = painArcEvidence(exam.tests.abd, affectedSide(exam.intake)).explanation;
  if (!exam.intake.side && report.flags?.length) report.side = null;
  if (exam.intake.overheadSport !== 'yes') report.serve = [];
  return report;
}
let reportReturnFocus = null, reportReturnHistory = false;
function openReport(report) {
  if (run.active) { toast('Exam in progress. Your report appears when the exam is finished.'); return; }
  reportReturnFocus = document.activeElement;
  $('#reportExportStatus').textContent = '';
  reportReturnHistory = !!reportReturnFocus?.closest('#historyModal');
  $('#reportSafety').replaceChildren();
  const card = $('#reportModal .modal-card');
  card.scrollTop = 0;
  $('#reportBody').scrollTop = 0;
  report ||= app.report || loadHistory()[0]?.report;
  if (!report) {
    $('#reportBody').innerHTML = '<div class="report"><h3>Your report starts with an exam</h3><p>Complete a guided screening to see your movement findings, the evidence for possible causes, and a personalized rehab plan.</p><p class="rp-muted">No findings yet. Demo motion is simulated, not a clinical measurement.</p><button class="btn primary" id="reportStartExam" type="button">Start quick exam</button><p class="rp-foot">Screening aid, not a diagnosis. Seek care promptly for sudden weakness, numbness, deformity after injury, or persistent night pain.</p></div>';
    $('#reportMeta').textContent = 'No exam completed · Screening aid, not a diagnosis';
    $('#btnPrint').disabled = true; $('#btnExport').disabled = true;
    $('#reportModal').classList.add('show');
    $('#reportStartExam').onclick = () => { $('#reportModal').classList.remove('show'); startExam('quick'); };
    return;
  }
  renderReport($('#reportBody'), report);
  if (report.flags?.length) $('#reportSafety').append($('#reportBody .rp-flags'));
  $('#reportModal').classList.toggle('safety-report', !!report.flags?.length);
  $('#reportTitle').textContent = report.flags?.length ? 'Safety report' : 'Your screening';
  app.report = report;
  $$('#reportBody .coach-btn').forEach(b => {
    b.disabled = run.active;
    b.title = run.active ? 'Finish or pause the exam first.' : 'Start the live rep coach';
  });
  $('#btnPrint').disabled = false; $('#btnExport').disabled = false;
  $('#reportMeta').textContent = report.flags?.length
    ? `Shoulder Scan · ${reportDate(report.generatedAt)} · Screening aid, not a diagnosis`
    : `${new Date(report.generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${report.side ? ` · ${SIDE_NAME[report.side]} shoulder` : ''}`;
  $('#reportModal').classList.add('show');
  requestAnimationFrame(() => { card.scrollTop = 0; $('#reportTitle').focus(); });
}
$('#btnReport').onclick = () => openReport();
$('#btnCloseReport').onclick = () => $('#reportModal').classList.remove('show');
$('#btnPrint').onclick = () => window.print();
$('#btnExport').onclick = () => {
  if (!app.report) return;
  const filename = `shoulder-scan-${localDate()}.json`;
  downloadJSON({ report: app.report, exam, text: reportToText(app.report) }, filename);
  $('#reportExportStatus').textContent = `Download started: ${filename}`;
};
$('#reportBody').addEventListener('click', (e) => {
  const b = e.target.closest('.coach-btn');
  if (!b) return;
  const ex = EXERCISES[b.dataset.ex];
  if (!ex?.coach) return;
  $('#reportModal').classList.remove('show');
  switchTab('rehab');
  startCoach(ex.coach, b.dataset.ex);
});
for (const id of ['reportModal', 'historyModal']) $(`#${id}`).addEventListener('click', (e) => { if (e.target.id === id) e.target.classList.remove('show'); });
let modalPauseStart = null;
function updateModalPause() {
  const open = !!$('.modal.show');
  if (open) modalPauseStart ??= now();
  else if (modalPauseStart != null) {
    const elapsed = now() - modalPauseStart;
    if (run.measureStart != null) run.measureStart += elapsed;
    if (run.hold?.start != null) run.hold.start += elapsed;
    if (coach.holdStart != null) coach.holdStart += elapsed;
    modalPauseStart = null;
  }
}
for (const modal of $$('.modal')) {
  let returnFocus = null, wasOpen = modal.classList.contains('show');
  new MutationObserver(() => {
    const open = modal.classList.contains('show');
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      modal.inert = false; modal.setAttribute('aria-hidden', 'false');
      returnFocus = modal.id === 'reportModal' ? reportReturnFocus || $('#btnReport') : $('#btnHistory');
      modal.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    } else {
      modal.inert = true; modal.setAttribute('aria-hidden', 'true');
      if (modal.id === 'reportModal' && reportReturnHistory) $('#historyModal').classList.add('show');
      requestAnimationFrame(() => { (returnFocus?.getClientRects().length ? returnFocus : modal.id === 'reportModal' ? $('#btnReport') : $('#btnHistory'))?.focus({ preventScroll: true }); });
    }
    updateModalPause();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const nodes = [...modal.querySelectorAll('button:not(:disabled), a[href], summary, input')].filter((n) => n.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (e.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement))) { e.preventDefault(); last?.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
}

/* ---------------- rehab ---------------- */
const coach = { key: null, cfg: null, counter: null, holdStart: null, best: 0, lastWarn: 0, lastSpoken: 0, preview: false };
function renderRehab(report = app.rehabReport) {
  const list = $('#rehabList');
  list.innerHTML = '';
  const activeFlags = run.active ? redFlags(exam) : [];
  if (activeFlags.length) report = currentReport();
  if (report?.flags?.length) {
    $('#rehabCoach').replaceChildren();
    const reason = report.flags[0].text.replace(/^./, c => c.toLowerCase());
    list.append(el('p', 'rehab-paused', `Exercises are paused because ${esc(reason)} A clinician must clear you before movement testing or exercise.`));
    const link = el('button', 'btn', 'View safety report'); link.type = 'button'; link.onclick = () => openReport(report); list.append(link);
    return;
  }
  const plan = report?.plan?.length ? report.plan : [1, 2, 3].map((p) => ({
    phase: p, title: ['Calm it down (weeks 0–2)', 'Build capacity (weeks 2–6)', 'Return to activity (week 6+)'][p - 1],
    items: Object.entries(EXERCISES).filter(([, e]) => e.phase === p).map(([id, e]) => ({ id, ...e })),
  }));
  if (!report) list.append(el('p', 'tc-desc', 'Default plan. Run the exam to personalize it.'));
  else if ((report.conditions?.[0]?.p || 0) < .35) list.append(el('p', 'general-plan', 'General movement plan · no strong screening pattern. This is not a personalized treatment plan.'));
  if (app.source === 'demo' || report?.completion?.simulated) list.append(el('p', 'tc-desc', 'Demo plan preview. Simulated results are not treatment advice.'));
  for (const ph of plan) {
    list.append(el('div', 'phase-h', esc(phaseTitle(ph))));
    if (ph.rule) list.append(el('p', 'tc-desc', md(ph.rule)));
    for (const it of ph.items || []) {
      const row = el('div', 'ex', `<div class="name">${esc(it.name)}</div><div class="dose">${esc(it.dose || '')}</div>${it.why ? `<div class="dose">${esc(it.why)}</div>` : ''}`);
      if (it.coach && COACH[it.coach]) {
        const b = el('button', 'btn sm coach-start', 'Coach me'); b.type = 'button';
        b.disabled = run.active;
        b.title = run.active ? 'Finish or pause the exam first.' : 'Live camera movement coach';
        b.onclick = () => startCoach(it.coach, it.id);
        row.append(b);
      }
      list.append(row);
    }
  }
}
function startCoach(key, exId) {
  if (run.active) { toast('Finish or pause the exam first.'); return; }
  if (app.rehabReport?.flags?.length) { renderRehab(); return; }
  const cfg = COACH[key];
  if (!cfg) return;
  switchTab('rehab');
  const box = $('#rehabCoach');
  $('#rehabView').scrollTop = 0;
  if (app.source !== 'camera') {
    coach.preview = true;
    anatomy.setIdle(false);
    applyPreset(key === 'latHold' ? 'lat' : key === 'wallSlide' ? 'scapula' : 'cuff', { frame: false });
    anatomy.resetView();
    const target = coachTarget(key);
    if (key === 'standingER') anatomy.setFocus(['infraspinatus', 'teresMinor']);
    const rest = { elevation: 3, plane: 0, rotation: 0, elbowFlex: 5, hike: 0 };
    anatomy.setPose({ ...target, other: rest, torso: { yaw: 0, flex: 0, lean: 0 } });
    anatomy.setStress({});
    $('#stage').classList.add('coach-preview');
    $('#readoutCaption span:last-child').textContent = 'Illustrated target · not a measurement';
    for (const side of ['R', 'L']) {
      const p = side === app.side ? target : rest;
      $(`#read${side} strong`).textContent = `${p.elevation}°`;
      $(side === 'R' ? '#rotationReadout strong' : '#rotationReadoutL strong').textContent = `${p.rotation}°`;
    }
    $('#torsoReadout strong').textContent = '0°';
    box.innerHTML = `<h4 id="coachTitle" tabindex="-1">${esc(EXERCISES[exId]?.name || cfg.name)}</h4><p class="cue">Still target pose. ${esc(cfg.cue)} Start the camera for live rep counting; your motion source has not changed.</p><div class="tc-actions"><button class="btn primary" id="coachCamera" type="button">Start camera</button><button class="btn ghost" id="coachBack" type="button">Back</button></div>`;
    $('#coachCamera').onclick = async () => { if (await startCamera({ forCoach: true })) startCoach(key, exId); };
    $('#coachBack').onclick = () => { stopCoach(); $('.coach-start')?.focus(); };
    box.scrollIntoView({ block: matchMedia('(max-width: 700px)').matches ? 'start' : 'nearest', behavior: 'smooth' });
    $('#coachTitle').focus({ preventScroll: true });
    return;
  }
  coach.preview = false;
  $('#stage').classList.remove('coach-preview');
  Object.assign(coach, { key, cfg, counter: cfg.hold ? null : new RepCounter({ up: cfg.up, down: cfg.down }), holdStart: null, best: 0, lastWarn: 0 });
  applyPreset(key === 'latHold' ? 'lat' : key === 'wallSlide' ? 'scapula' : 'cuff', { frame: false });
  anatomy.resetView();
  box.innerHTML = `<h4>${esc(cfg.name)}</h4><div class="count">${cfg.hold ? '0s' : '0'}</div><div class="cue">${esc(cfg.cue)}</div><div class="tc-actions"><button type="button" class="btn ghost" id="btnCoachStop">Stop</button></div>`;
  $('#btnCoachStop').onclick = stopCoach;
  box.scrollIntoView({ block: matchMedia('(max-width: 700px)').matches ? 'start' : 'nearest', behavior: 'smooth' });
  $('#hudTitle').textContent = `Coach · ${cfg.name}`;
  voice.speak(`${cfg.name}. ${cfg.cue}`, { interrupt: true });
}
function stopCoach() {
  if (coach.key && coach.counter) toast(`${coach.cfg.name}: ${coach.counter.count} reps`, 'good');
  coach.key = null; coach.cfg = null;
  coach.preview = false;
  $('#stage').classList.remove('coach-preview');
  $('#readoutCaption span:last-child').textContent = app.source === 'demo' ? 'Simulated values' : 'Measured values';
  if (app.source === 'off') anatomy.setIdle(true);
  $('#rehabCoach').innerHTML = '';
  $('#hudTitle').textContent = `${SIDE_NAME[app.side]} shoulder`;
}
function coachTick(live) {
  if ($('.modal.show') || !coach.key || run.active) return;
  const cfg = coach.cfg, sm = live.sides[app.side];
  const box = $('#rehabCoach'); if (!box.firstChild) return;
  const cue = $('.cue', box), count = $('.count', box);
  const setCue = (text, cls) => { if (cue.textContent !== text) cue.textContent = text; cue.className = `cue ${cls || ''}`; };
  if (!sm) { setCue(`Step back so I can see your ${SIDE_NAME[app.side].toLowerCase()} arm`, 'warn'); return; }
  const hike = live.hike[app.side] ?? 0, lean = Math.abs(live.lean ?? 0);
  const warns = [];
  if (cfg.warnHike && hike > cfg.warnHike) warns.push('Shoulder is shrugging. Keep it down and back');
  if (cfg.warnLean && lean > cfg.warnLean) warns.push("Trunk is leaning. Stand tall and don't cheat");
  const gate = gateOK(sm, cfg);
  if (gate !== true) warns.push(GATE_MSG[gate](cfg));
  if (cfg.hold) {
    if (sm.elevation >= cfg.holdMin && gate === true) {
      coach.holdStart ??= live.t;
      const s = live.t - coach.holdStart;
      count.textContent = `${Math.floor(s)}s`;
      if (s >= cfg.hold && coach.best < cfg.hold) { voice.speak('Good hold. Rest.'); toast('Hold complete', 'good'); }
      coach.best = Math.max(coach.best, s);
      if (!warns.length) setCue(s >= cfg.hold ? 'Done. Relax and repeat when ready' : 'Good. Breathe and keep your ribs down', 'good');
    } else {
      coach.holdStart = null;
      if (!warns.length) setCue(`Raise to at least ${cfg.holdMin}° (now ${fmt(sm.elevation)}°)`, '');
    }
  } else {
    const v = metricOf(sm, cfg.metric);
    if (v == null) { setCue(ROT_HINT, 'warn'); return; }
    if (gate === true && coach.counter.push(v, live.t)) {
      count.textContent = String(coach.counter.count);
      if (coach.counter.count % 5 === 0) voice.speak(`${coach.counter.count}`);
    }
    if (!warns.length) setCue(coach.counter.state === 'down' ? `Up to ${cfg.up}° (now ${fmt(v)}°)` : `Slowly back to ${cfg.down}°`, coach.counter.state === 'up' ? 'good' : '');
  }
  if (warns.length) {
    setCue(warns[0], 'warn');
    if (live.t - coach.lastWarn > 4) { coach.lastWarn = live.t; voice.speak(warns[0]); }
  }
}

/* ---------------- tabs / modes ---------------- */
function switchTab(tab) {
  $('#tabExam').classList.toggle('active', tab === 'exam');
  $('#tabRehab').classList.toggle('active', tab === 'rehab');
  $('#tabExam').setAttribute('aria-selected', tab === 'exam');
  $('#tabRehab').setAttribute('aria-selected', tab === 'rehab');
  $('#tabExam').tabIndex = tab === 'exam' ? 0 : -1;
  $('#tabRehab').tabIndex = tab === 'rehab' ? 0 : -1;
  $('#examView').hidden = $('#examView').inert = tab !== 'exam';
  $('#rehabView').hidden = $('#rehabView').inert = tab !== 'rehab';
  if (tab === 'rehab') renderRehab();
}
$('#tabExam').onclick = () => switchTab('exam');
$('#tabRehab').onclick = () => switchTab('rehab');
$('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tab = e.key === 'Home' ? 'exam' : e.key === 'End' ? 'rehab' : $('#tabExam').tabIndex === 0 ? 'rehab' : 'exam';
  switchTab(tab); $(tab === 'exam' ? '#tabExam' : '#tabRehab').focus();
});
$('#btnQuick').onclick = () => startExam('quick');
$('#btnFull').onclick = () => startExam('full');

/* ---------------- history / persistence ---------------- */
const HKEY = 'shoulderScan.history', DKEY = 'shoulderScan.draft';
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; } };
function saveHistory(report) {
  const h = loadHistory();
  h.unshift({ at: report.generatedAt, side: report.side, top: report.conditions?.slice(0, 3).map((c) => ({ name: c.name, p: c.p })), report, exam: JSON.parse(JSON.stringify(exam)) });
  try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 20))); localStorage.removeItem(DKEY); } catch (e) { console.warn(e); }
  syncHistoryState();
}
function syncHistoryState() {
  if (coach.key || coach.preview) stopCoach();
  const latest = loadHistory()[0]?.report || null;
  app.rehabReport = latest;
  if (!run.active) app.report = latest;
  $('#btnReport').disabled = run.active || !latest;
  $('#btnReport').removeAttribute('title');
  $('#reportHint').textContent = run.active ? 'Exam in progress — report appears when finished' : latest ? 'Open your saved screening report' : 'Report appears after an exam';
  if (!run.active) {
    const wasSafetyPaused = app.safetyPaused;
    app.safetyPaused = !!latest?.flags?.length;
    document.body.classList.toggle('safety-stopped', app.safetyPaused);
    document.body.classList.remove('exam-running', 'exam-testing');
    $('#testCard').removeAttribute('role');
    if (app.safetyPaused) showSavedSafety(latest);
    else {
      $('#testCard').className = '';
      $('#examProgress').hidden = true;
      $('#trackPill').classList.remove('paused');
      setSource(app.source === 'demo' ? 'btnDemo' : app.source === 'camera' ? 'btnCamera' : app.source === 'video' ? 'btnUpload' : null);
      if (wasSafetyPaused) {
        const note = el('p', 'tc-desc', latest ? `Latest saved screening: ${esc(reportHeadline(latest))}.` : 'No saved screenings.');
        const start = el('button', 'btn', 'Start new exam');
        start.type = 'button'; start.onclick = chooseExam;
        $('#chatLog').replaceChildren(note, start);
      }
    }
  }
  renderRehab();
}
addEventListener('storage', e => { if (!e.key || e.key === HKEY) syncHistoryState(); });
function saveDraft() { try { localStorage.setItem(DKEY, JSON.stringify(exam)); } catch {} }
function showHistory() {
  const body = $('#historyBody'); body.innerHTML = '';
  const history = loadHistory();
  for (const [index, h] of history.entries()) {
    const row = el('div', 'hist-row');
    const b = el('button', 'hist-item', `<div><b>${esc(reportHeadline(h.report))}</b></div><div class="date">${reportDate(h.at)}${h.side ? ` · ${SIDE_NAME[h.side]} shoulder` : ''}</div>`);
    b.type = 'button';
    b.onclick = () => { $('#historyModal').classList.remove('show'); h.report.motion ||= reportMotion(h.exam || {}); openReport(h.report); };
    const remove = el('button', 'btn ghost', 'Delete'); remove.type = 'button';
    remove.onclick = () => confirmHistoryDelete(() => {
      history.splice(index, 1); localStorage.setItem(HKEY, JSON.stringify(history)); syncHistoryState(); showHistory();
      const target = $$('.hist-row > .btn', body)[Math.min(index, history.length - 1)] || $('#historyTitle');
      target.focus();
    }, `Delete “${reportHeadline(h.report)}” from ${reportDate(h.at)}?`, row, remove);
    row.append(b, remove); body.append(row);
  }
  if (!body.firstChild) {
    body.append(el('p', 'tc-desc', run.active ? 'Your exam is in progress. Resume it to complete a report.' : 'No saved sessions yet. Start an exam to keep a report here.'));
    const start = el('button', 'btn primary', run.active ? 'Resume exam' : 'Start quick exam');
    start.type = 'button';
    start.onclick = () => { $('#historyModal').classList.remove('show'); if (run.active) switchTab('exam'); else startExam('quick'); };
    body.append(start);
  }
  if (history.length) {
    const clear = el('button', 'btn ghost', 'Clear all sessions'); clear.type = 'button';
    clear.onclick = () => confirmHistoryDelete(() => { localStorage.removeItem(HKEY); syncHistoryState(); showHistory(); $('#historyTitle').focus(); }, 'Delete all saved sessions? This cannot be undone.', body, clear);
    body.append(clear);
  }
  $('#historyModal').classList.add('show');
}
function confirmHistoryDelete(remove, message, host, opener) {
  $('#historyConfirm')?.remove();
  const box = el('div', 'history-confirm', `<p>${esc(message)}</p>`); box.id = 'historyConfirm'; box.setAttribute('role', 'alert');
  const yes = el('button', 'btn primary', 'Delete'), no = el('button', 'btn', 'Cancel');
  yes.type = no.type = 'button'; yes.onclick = remove; no.onclick = () => { box.remove(); opener.focus(); };
  box.append(yes, no); host.append(box); no.focus();
}
$('#btnHistory').onclick = showHistory;
$('#btnCloseHistory').onclick = () => $('#historyModal').classList.remove('show');

/* ---------------- toolbar ---------------- */
$('#btnCamera').onclick = startCamera;
$('#btnDemo').onclick = startDemo;
$('#btnUpload').onclick = () => $('#fileVideo').click();
$('#welcomeCamera').onclick = $('#retryCamera').onclick = startCamera;
$('#welcomeDemo').onclick = $('#recoverDemo').onclick = startDemo;
$('#welcomeVideo').onclick = () => $('#fileVideo').click();
$('#mobileQuick').onclick = () => startExam('quick');
$('#sourceMenuButton').onclick = () => {
  const open = $('#sourceMenu').classList.toggle('show');
  $('#sourceMenuButton').setAttribute('aria-expanded', open);
};
$('.source').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const buttons = $$('.source button');
  const current = buttons.indexOf(document.activeElement);
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  e.preventDefault(); buttons[index].focus();
});
document.addEventListener('pointerdown', e => {
  if (!$('#anatomyControls').contains(e.target)) $('#anatomyControls').open = false;
  if (!e.target.closest('#sourceMenu, #sourceMenuButton')) { $('#sourceMenu').classList.remove('show'); $('#sourceMenuButton').setAttribute('aria-expanded', 'false'); }
});
$('#fileVideo').onchange = (e) => { const f = e.target.files?.[0]; if (f) loadVideo(f); e.target.value = ''; };
$('#btnMirror').onclick = () => { pose.setMirror(!pose.mirrored); $('#btnMirror').classList.toggle('active', pose.mirrored); };
$('#btnCapture').onclick = () => {
  const dl = (url, name) => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = name; a.click(); };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  dl(anatomy.snapshot(), `shoulder-anatomy-${stamp}.png`);
  if (pose.running) dl(pose.capture(), `shoulder-camera-${stamp}.png`);
  toast('Snapshot saved', 'good');
};
function boundAnatomyPanel() {
  if (!$('#anatomyControls').open) return;
  const stage = $('#stage').getBoundingClientRect();
  $('#leftPanel').style.setProperty('--panel-top', `${Math.max(12, stage.top + 60)}px`);
  const trigger = $('#anatomyControls').getBoundingClientRect();
  $('#leftPanel').style.setProperty('--panel-left', `${Math.max(12, trigger.left)}px`);
}
$('#anatomyControls').addEventListener('toggle', () => { boundAnatomyPanel(); anatomy.setPanelOpen($('#anatomyControls').open); });
function layoutMobileStage() {
  const mobile = matchMedia('(max-width: 700px)').matches;
  const target = mobile ? $('#mobileReadouts') : $('#stage');
  if ($('#readoutStrip').parentElement !== target) target.append($('#readoutStrip'));
  const dockTarget = mobile ? $('#mobileControls') : $('#stage');
  if ($('#dock').parentElement !== dockTarget) dockTarget.append($('#dock'));
  const chartTarget = mobile ? $('#mobileReadouts') : $('#dock');
  if ($('#arcWrap').parentElement !== chartTarget) chartTarget.append($('#arcWrap'));
}
addEventListener('resize', () => { layoutMobileStage(); anatomy.resize(); positionToast(); boundAnatomyPanel(); });
addEventListener('scroll', positionToast, { passive: true });
addEventListener('beforeunload', () => { pop?.stop(); pose.stop(); });

/* ---------------- init ---------------- */
buildLeftPanel();
buildMeasure();
$$('#markerBar button').forEach(b => b.insertAdjacentHTML('afterbegin', markerIcon(b.dataset.marker)));
$('#btnReport').disabled = loadHistory().length === 0;
$('#btnReport').removeAttribute('title');
syncHistoryState();
layoutMobileStage();
setSide('R');
applyPreset('full');
switchTab('exam');
$('#btnMirror').classList.toggle('active', pose.mirrored);
setVoice(false);
setSource(null);
anatomy.setIdle(true);
(async () => {
  await doctor("Hi, I'm your shoulder screening assistant. I'll ask about your symptoms, then guide you through movement tests while the 3D model shows what's loading inside your shoulder. **This is a screening aid, not a diagnosis.**", { speak: false, delay: 200 });
  const box = el('div', 'opts');
  const go = (label, mode, primary) => { const b = el('button', `opt exam-start-${mode}${primary ? ' primary' : ''}`, label); b.type = 'button'; b.onclick = () => { box.classList.add('done'); $$('button', box).forEach((x) => (x.disabled = true)); startExam(mode); }; box.append(b); };
  go('Quick exam (4–6 min)', 'quick', app.source !== 'off');
  go('Full exam (12–15 min)', 'full');
  $('.bubble', chatLog.lastElementChild).append(box);
  scrollChat();
  if (new URLSearchParams(location.search).get('exam') === 'quick') startExam('quick');
})();
window.__shoulder = { app, exam, run, anatomy, pose, handleMetrics, startDemo, openReport, buildReport };
const params = new URLSearchParams(location.search);
if (params.get('demo') === '1') startDemo();
