// Presentation and simulated movement; clinical protocol and scoring stay separate.
import { INTAKE, TESTS } from './protocol.js';

const yesNo = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];
const symptoms = { id: 'symptoms', q: 'What brings you here? Pick any that apply', multi: true, opts: [
  { v: 'pain', label: 'Pain overhead' }, { v: 'click', label: 'Clicking/popping' },
  { v: 'pull', label: 'Pulling or tightness' }, { v: 'unstable', label: 'Feels unstable' },
  { v: 'weak', label: 'Weakness' }, { v: 'unsure', label: 'Not sure' },
] };
const sport = { id: 'overheadSport', q: 'Do you play an overhead sport?', opts: yesNo };
const pullDetail = { id: 'pullDetail', q: 'Does the pulling feel like your lat (side of your back / armpit), or deep in the front/top of the joint?', opts: [
  { v: 'lat', label: 'Lat: side of back / armpit' }, { v: 'labrum', label: 'Labrum: deep inside the joint' }, { v: 'unsure', label: 'Not sure' },
] };
export function intakePlan(mode) {
  const byId = Object.fromEntries(INTAKE.map(q => [q.id, q]));
  const safety = { ...byId.redFlags, q: 'Before we begin, do any of these apply?' };
  const catching = { ...byId.catching, q: 'Does the shoulder ever catch or lock during movement?' };
  if (mode === 'quick') return [safety, symptoms, byId.side, sport, byId.location, byId.night, { ...catching, id: 'details' }, byId.nerve];
  return [safety, symptoms, sport, ...INTAKE.filter(q => q.id !== 'redFlags').flatMap(q =>
    q.id === 'catching' ? [catching, { id: 'deadArm', q: 'Does the arm suddenly feel weak or numb during movement?', opts: yesNo }]
      : q.id === 'pull' ? [pullDetail, q] : [q])];
}
export const pullingQuestion = () => pullDetail;
export function cameraErrorMessage(error) {
  const name = error?.name || error?.cause?.name;
  if (['NotAllowedError', 'SecurityError'].includes(name)) return 'Camera permission is blocked. Allow camera access in your browser settings, then try again.';
  if (['NotFoundError', 'OverconstrainedError'].includes(name)) return 'No camera was found. Connect a camera, then try again, or use Demo.';
  if (['NotReadableError', 'AbortError'].includes(name)) return "Couldn't start the camera. It may be in use by Teams or Zoom.";
  return error?.message || "Couldn't start the camera. Check its connection and browser permissions, or use Demo.";
}
export function collectMarkers(exam) {
  const records = (exam.freeMarkers || []).map(m => ({ ...m, test: 'Free movement' }));
  for (const [id, test] of Object.entries(exam.tests || {})) {
    records.push(...(test.markers || []).map(m => ({ ...m, test: TESTS.find(t => t.id === id)?.title || id })));
  }
  return records.map(m => ({ ...m, elapsed: m.elapsed ?? Math.max(0, m.t - (exam.startedT || 0)) })).sort((a, b) => a.elapsed - b.elapsed);
}
export function reportHeadline(report) {
  return String(report?.summary || 'Shoulder screening').replace(/\*\*/g, '').split('. ')[0].replace(/\.$/, '');
}
export const formatValue = (value, digits = 0) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const rounded = Number(value).toFixed(digits);
  return Number(rounded) === 0 ? (0).toFixed(digits) : rounded.replace('-', '−');
};
export const reportDate = value => new Date(value || Date.now()).toLocaleString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function reportMotion(exam) {
  const range = id => Object.fromEntries(['R', 'L'].map(side => {
    const record = exam.tests?.[id];
    const value = record?.complete && !record.skipped ? record.sides?.[side]?.maxElev : null;
    return [side, Number.isFinite(value) && value >= 0 && value <= 180 ? Math.round(value) : null];
  }));
  return { forward: range('flex'), side: range('abd') };
}

export function painArcEvidence(record = {}, side = 'R') {
  const answer = record.follow?.arc;
  const angles = (record.markers || []).filter(m => m.type === 'pain' && (!m.side || m.side === side))
    .map(m => m.elevation).filter(Number.isFinite).sort((a, b) => a - b);
  const arc = !angles.length ? answer : angles.every(a => a >= 145) ? 'top'
    : angles.every(a => a >= 55 && a <= 135) ? 'middle' : 'whole';
  const labels = { top: 'near the top', middle: 'in the middle', whole: 'throughout the movement', none: 'no pain' };
  const range = angles.length ? `${Math.round(angles[0])}${angles.at(-1) !== angles[0] ? `–${Math.round(angles.at(-1))}` : ''}°` : '';
  return { arc, angles, explanation: angles.length && answer && answer !== arc
    ? `You said ${labels[answer] || answer}; your markers were at ${range}. We weighted the markers.` : '' };
}

export function reconcilePain(record, field, painful, question = {}) {
  if (!painful) record.markers = record.markers.filter(m => m.type !== 'pain');
  else if (field === 'arc') {
    const angle = record.markers.find(m => m.type === 'pain')?.elevation;
    record.follow.arc = angle >= 145 ? 'top' : angle >= 55 ? 'middle' : 'whole';
  } else {
    const choices = question.opts?.map(o => o.v) || ['other'];
    const value = ['pain', 'other'].find(v => choices.includes(v));
    if (value) record.follow[field] = question.multi ? [value] : value;
    else delete record.follow[field];
  }
}

export function demoTestPose(test, elapsed) {
  if (!test) return null;
  if (test.mode === 'manual') {
    const wave = (1 - Math.cos(elapsed * Math.PI / 2)) / 2;
    const clips = {
      hawkins: { elevation: 90, plane: 90, rotation: -90 - 50 * wave, elbowFlex: 90, hike: 0 },
      obrien: { elevation: 90, plane: 103, rotation: elapsed % 10 < 5 ? -80 : 80, elbowFlex: 3, hike: 0 },
      crossBody: { elevation: 90, plane: 105 + 15 * wave, rotation: 0, elbowFlex: 30, hike: 0 },
      scapClick: { elevation: elapsed < 5 ? 12 : 12 + 158 * wave, plane: 30, rotation: 15, elbowFlex: 8, hike: elapsed < 5 ? 12 * wave : 2 },
    };
    return clips[test.id] || null;
  }
  const gate = test.target || test.rep;
  const midpoint = range => (range[0] + range[1]) / 2;
  const pose = {
    elevation: gate.elevRange ? midpoint(gate.elevRange) : gate.elevMax != null ? 12 : 90,
    plane: gate.plane ? midpoint(gate.plane) : 15,
    rotation: 0, elbowFlex: gate.metric === 'rotation' ? 90 : 6, hike: 0,
  };
  if (test.mode === 'hold') {
    pose[gate.metric] = gate.min != null && gate.max != null ? (gate.min + gate.max) / 2
      : gate.min != null ? gate.min + 8 : Math.max(6, gate.max - 10);
  } else {
    const low = Math.max(gate.metric === 'rotation' ? -80 : 6, gate.down - 15);
    const high = Math.min(175, gate.up + 25);
    pose[gate.metric] = low + (high - low) * (1 - Math.cos(elapsed * Math.PI / 1.8)) / 2;
  }
  return pose;
}

export const phaseTitle = phase => `Phase ${phase.phase} · ${String(phase.title || '').replace(/^Phase \d+\s*[·:]\s*/i, '')}`;

export function displayReport(report, completion) {
  const lead = report.conditions?.[0];
  return {
    ...report, completion,
    summary: report.flags?.some(f => f.level === 'emergency') ? 'Do not continue movement testing. Exercises are paused until a clinician clears you.'
      : `${report.stoppedForSafety ? 'Exam stopped. Please contact a clinician before testing.' : report.flags?.length ? 'Get checked before testing. A safety concern needs clinical assessment.' : `${lead?.p >= .35 ? `The leading screening finding is **${lead.name}**.` : 'No strong screening pattern was found.'} ${completion.completed < completion.total ? 'Finish the remaining tests before drawing conclusions. ' : ''}The findings below show the supporting and conflicting evidence. A clinician can assess the cause and help choose a safe, gradual return to activity.`}`,
  };
}
