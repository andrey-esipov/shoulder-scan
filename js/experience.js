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
  if (['NotAllowedError', 'SecurityError'].includes(name)) return 'Allow camera access in the address bar or browser site settings, then try again.';
  if (['NotFoundError', 'OverconstrainedError'].includes(name)) return 'Connect a camera, then try again. You can also try Demo or upload a video.';
  if (['NotReadableError', 'AbortError'].includes(name)) return "Couldn't start the camera. It may be in use by Teams or Zoom.";
  if (name === 'TimeoutError') return 'The camera did not respond. Check the browser permission prompt and close other apps using your camera, then try again.';
  return error?.message || "Couldn't start the camera. Check its connection and browser permissions, or use Demo.";
}
export function activityCopy(value, overheadSport = false) {
  if (overheadSport || value == null) return value;
  if (Array.isArray(value)) return value.filter(v => v?.id !== 'intervalServe').map(v => activityCopy(v));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, activityCopy(v)]));
  if (typeof value !== 'string') return value;
  return value.replace(/Keep playing groundstrokes[^.]*\./g, 'Keep comfortable daily activities; reduce painful overhead activity.')
    .replace(/Pause or cut serves and overheads to 50% pace\./g, 'Reduce overhead activity to a comfortable range.')
    .replace(/Add serves 10 at a time\./g, 'Increase activity gradually, only if symptoms settle by the next morning.')
    .replace(/Most overuse tennis shoulders improve clearly within 6 weeks\./g, 'Arrange a clinical review if symptoms persist or worsen.')
    .replace(/\btennis players\b/gi, 'people with shoulder symptoms')
    .replace(/\bserving arm\b/gi, 'affected arm')
    .replace(/\bserve cocking\b/gi, 'overhead rotation')
    .replace(/\bfull serve extension\b/gi, 'full overhead reach')
    .replace(/\bserving\b/gi, 'overhead activity')
    .replace(/\bserves?\b/gi, 'overhead movement')
    .replace(/\bgroundstrokes\b/gi, 'daily activities')
    .replace(/\btennis\b/gi, 'overuse')
    .replace(/reduce painful overhead activity\.\s*Reduce overhead activity to a comfortable range\./gi, 'reduce painful overhead activity to a comfortable range.');
}
export function collectMarkers(exam) {
  const records = [...(exam.sessionMarkers || []), ...(exam.freeMarkers || []).map(m => ({ ...m, test: m.test || 'Free movement' }))];
  for (const [id, test] of Object.entries(exam.tests || {})) {
    records.push(...(test.markers || []).map(m => ({ ...m, test: m.test || TESTS.find(t => t.id === id)?.title || id, calibration: id === 'calib' })));
  }
  const unique = new Map();
  for (const m of records) {
    const key = m.id || (Number.isFinite(m.t) ? `${m.t}:${m.type}:${m.side}` : m.recordedAt ? `${m.recordedAt}:${m.type}:${m.side}` : Symbol());
    if (!unique.has(key)) unique.set(key, { ...m, elapsed: m.elapsed ?? Math.max(0, m.t - (exam.startedT || 0)) });
  }
  return [...unique.values()].sort((a, b) => a.t - b.t);
}
export function reportHeadline(report) {
  const flag = report?.flags?.[0];
  if (flag && /chest pain|shortness of breath/i.test(flag.text)) return 'Chest pain / shortness of breath';
  if (flag) return String(flag.text || 'Safety concern').split('. ')[0].replace(/\.$/, '');
  if (report?.nerveReferral) return 'Neck/nerve referral';
  if (report?.completion?.completed < report?.completion?.total / 2) return 'Incomplete screening';
  const lead = report?.conditions?.slice().sort((a, b) => b.p - a.p)[0];
  return lead?.p >= .35 ? lead.name : 'No strong screening pattern';
}
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  if (!painful) record.markers = record.markers.filter(m => {
    if (m.type !== 'pain') return true;
    m.retracted = true;
    return false;
  });
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
      // Hawkins starts across the body; its forearm turn is relative to that start.
      hawkins: { elevation: 90, plane: 90, rotation: -60 - 10 * wave, humeralRotation: -100 - 10 * wave, elbowFlex: 90, hike: 0 },
      obrien: { elevation: 90, plane: 103, rotation: elapsed % 10 < 5 ? -90 : 90, elbowFlex: 0, hike: 0 },
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

export function demoPeakPose(test, followField) {
  const pose = demoTestPose(test, test.id === 'scapClick' ? 7 : 1.8);
  if (!pose) return null;
  const gate = test.target || test.rep;
  if (test.mode === 'reps' && gate) pose[gate.metric] = Math.min(175, gate.up + 25);
  if (test.id === 'obrien' && followField === 'palmUp') pose.rotation = 90;
  return pose;
}

export const phaseTitle = phase => `Phase ${phase.phase} · ${String(phase.title || '').replace(/^Phase \d+\s*[·:]\s*/i, '')}`;

export function displayReport(report, completion) {
  const lead = report.conditions?.slice().sort((a, b) => (b.p || 0) - (a.p || 0))[0];
  let summary;
  if (report.flags?.some(f => f.level === 'emergency'))
    summary = 'Do not continue movement testing. Exercises are paused until a clinician clears you.';
  else if (report.stoppedForSafety)
    summary = 'Exam stopped. Please contact a clinician before testing.';
  else if (report.flags?.length)
    summary = 'Get checked before testing. A safety concern needs clinical assessment.';
  else if (report.nerveReferral)
    summary = `Ask a clinician about your neck / nerves. Arrange an assessment for symptoms past the elbow.${lead?.p >= .35 ? ` A secondary shoulder finding to discuss is **${lead.name}**.` : ''}`;
  else if (completion.completed < completion.total / 2)
    summary = `Incomplete screening.${lead?.p >= .35 ? ` Possible: **${lead.name}**.` : ''} Finish the remaining tests before drawing conclusions.`;
  else
    summary = `${lead?.p >= .35 ? `The leading screening finding is **${lead.name}**.` : 'No strong screening pattern was found.'} ${completion.completed < completion.total ? 'Finish the remaining tests before drawing conclusions. ' : ''}The findings below show the supporting and conflicting evidence. A clinician can assess the cause and help choose a safe, gradual return to activity.`;
  return { ...report, completion, summary };
}
