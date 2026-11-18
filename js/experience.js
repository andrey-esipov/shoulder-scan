// Presentation and simulated movement; clinical protocol and scoring stay separate.
import { INTAKE, TESTS } from './protocol.js';

const yesNo = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];
const symptoms = { id: 'symptoms', q: 'What brings you here? Pick any that apply', multi: true, opts: [
  { v: 'pain', label: 'Pain overhead' }, { v: 'click', label: 'Clicking/popping' },
  { v: 'pull', label: 'Pulling or tightness' }, { v: 'unstable', label: 'Feels unstable' },
  { v: 'weak', label: 'Weakness' }, { v: 'unsure', label: 'Not sure' },
] };
const sport = { id: 'overheadSport', q: 'Do you play an overhead sport?', opts: yesNo };
const pullDetail = { id: 'pullDetail', q: 'Does the pulling feel like your lat (side of your back / armpit), or deep inside the joint near the labrum?', opts: [
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
  return records.map(m => ({ ...m, elapsed: Math.max(0, m.t - (exam.startedT || 0)) })).sort((a, b) => a.t - b.t);
}
export function reportHeadline(report) {
  return String(report?.summary || 'Shoulder screening').replace(/\*\*/g, '').split('. ')[0].replace(/\.$/, '');
}
export const formatValue = (value, digits = 0) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const rounded = Number(value).toFixed(digits);
  return Number(rounded) === 0 ? (0).toFixed(digits) : rounded.replace('-', '−');
};

export function demoTestPose(test, elapsed) {
  if (!test || test.mode === 'manual') return null;
  const gate = test.target || test.rep;
  const midpoint = range => (range[0] + range[1]) / 2;
  const pose = {
    elevation: gate.elevRange ? midpoint(gate.elevRange) : gate.elevMax != null ? 12 : 90,
    plane: gate.plane ? midpoint(gate.plane) : 20,
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
    summary: report.stoppedForSafety ? 'Exam stopped. Please contact a clinician before testing.' : `${lead?.p >= .35 ? `The leading screening finding is **${lead.name}**.` : 'No strong screening pattern was found.'} ${completion.completed < completion.total ? 'Finish the remaining tests before drawing conclusions. ' : ''}The findings below show the supporting and conflicting evidence. A clinician can assess the cause and help choose a safe, gradual return to activity.`,
  };
}
