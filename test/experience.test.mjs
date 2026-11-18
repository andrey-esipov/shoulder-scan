import assert from 'node:assert/strict';
import { TESTS } from '../js/protocol.js';
import { RepCounter } from '../js/rehab.js';
import { demoTestPose, displayReport, formatValue, phaseTitle, intakePlan, cameraErrorMessage, collectMarkers, reportHeadline, reconcilePain, reportMotion, painArcEvidence } from '../js/experience.js';
import { renderReport, reportToText } from '../js/report.js';
import { armFromAngles } from '../js/metrics.js';

for (const test of TESTS.filter(t => t.mode !== 'manual')) {
  const pose = demoTestPose(test, 1);
  const gate = test.target || test.rep;
  assert.ok(pose && pose.elbowFlex >= 0, `${test.id} has a pose`);
  if (gate.plane) assert.ok(pose.plane >= gate.plane[0] && pose.plane <= gate.plane[1]);
  if (gate.elevMax != null) assert.ok(pose.elevation <= gate.elevMax);
  if (gate.elevRange) assert.ok(pose.elevation >= gate.elevRange[0] && pose.elevation <= gate.elevRange[1]);
  if (test.mode === 'hold') {
    const value = pose[gate.metric];
    if (gate.min != null) assert.ok(value >= gate.min);
    if (gate.max != null) assert.ok(value <= gate.max);
  } else {
    const counter = new RepCounter({ up: gate.up, down: gate.down });
    for (let time = 0; time < 18; time += .05) counter.push(demoTestPose(test, time)[gate.metric], time);
    assert.ok(counter.count >= 3, `${test.id} finishes reps without intervention`);
  }
}
assert.ok(demoTestPose(TESTS.find(t => t.id === 'obrien'), 0));
for (const time of [0, 1, 2, 4]) {
  const hawkins = demoTestPose(TESTS.find(t => t.id === 'hawkins'), time);
  const obrien = demoTestPose(TESTS.find(t => t.id === 'obrien'), time);
  const hawkinsArm = armFromAngles(hawkins.elevation, hawkins.plane, hawkins.rotation, hawkins.elbowFlex);
  const obrienArm = armFromAngles(obrien.elevation, obrien.plane, obrien.rotation, obrien.elbowFlex);
  assert.ok(hawkinsArm.u[2] > .99 && hawkinsArm.f[1] <= .001, 'Hawkins stays forward with the forearm across/down, not into the skull');
  assert.ok(obrienArm.u[0] < 0 && obrienArm.u[2] > .95 && obrien.elbowFlex < 5, 'O’Brien reaches slightly across the body with a straight elbow');
}
assert.notEqual(demoTestPose(TESTS.find(t => t.id === 'flex'), 1).plane, demoTestPose(TESTS.find(t => t.id === 'abd'), 1).plane);
assert.equal(demoTestPose(TESTS.find(t => t.id === 'palpate'), 0), null);
const report = displayReport({ conditions: [{ name: 'Labral irritation', p: .7 }], summary: 'calm the tendon', plan: [], flags: [] }, { completed: 2, total: 8, simulated: true });
assert.match(report.summary, /Labral irritation/);
assert.doesNotMatch(report.summary, /calm the tendon/);
assert.deepEqual(report.completion, { completed: 2, total: 8, simulated: true });
const inconclusive = displayReport({ conditions: [{ name: 'Cuff irritation', p: .14 }] }, { completed: 8, total: 8 });
assert.match(inconclusive.summary, /No strong screening pattern/);
assert.doesNotMatch(inconclusive.summary, /leading|Cuff irritation/);
const flagged = { conditions: [], flags: [{ text: 'Get checked' }] };
assert.match(displayReport({ ...flagged, stoppedForSafety: true }, { completed: 0, total: 8 }).summary, /Exam stopped/);
assert.doesNotMatch(displayReport(flagged, { completed: 8, total: 8 }).summary, /Exam stopped/);
assert.equal(formatValue(-17), '−17');
assert.equal(formatValue(-.2), '0');
assert.equal(formatValue(-.02, 1), '0.0');
assert.equal(formatValue(null), '—');
assert.equal(phaseTitle({ phase: 1, title: 'Calm it down (weeks 0–2)' }), 'Phase 1 · Calm it down (weeks 0–2)');
const container = { innerHTML: '' };
report.conditions.push({ name: 'Lower likelihood', p: .34 });
renderReport(container, report);
assert.match(container.innerHTML, /Partial exam: 2 of 8 tests/);
assert.match(container.innerHTML, /Simulated demo/);
assert.doesNotMatch(container.innerHTML, /34%/);
assert.doesNotMatch(reportToText(report), /34%/);
const quick = intakePlan('quick');
assert.equal(quick.length, 8);
assert.equal(quick[0].id, 'redFlags');
assert.ok(intakePlan('full').some(q => q.id === 'deadArm'));
assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /permission/i);
assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /No camera/);
assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /Teams or Zoom/);
report.markers = collectMarkers({ startedT: 10, tests: { abd: { markers: [{ type: 'pain', side: 'R', elevation: 85, t: 15 }] } } });
assert.equal(report.markers[0].elapsed, 5);
assert.match(report.markers[0].test, /Side raise/);
assert.equal(reportHeadline(inconclusive), inconclusive.summary.split('. ')[0]);
renderReport(container, report);
assert.match(container.innerHTML, /Your markers/);
assert.match(container.innerHTML, /85°/);
assert.match(reportToText(report), /YOUR MARKERS/);
const emergency = displayReport({ conditions: [{ name: 'Cuff condition', p: .8 }], flags: [{ level: 'emergency', text: 'Chest pain' }], plan: [{ items: [{ name: 'Unsafe drill' }] }], stoppedForSafety: true }, { completed: 0, total: 8 });
assert.match(emergency.summary, /Do not continue movement testing/);
renderReport(container, emergency);
assert.match(container.innerHTML, /tel:911/);
assert.doesNotMatch(container.innerHTML, /Cuff condition|Rehab plan|What it could be/);
assert.doesNotMatch(reportToText(emergency), /Cuff condition|Unsafe drill/);
assert.doesNotMatch(reportToText({ ...emergency, serve: ['Serve drills'], next: ['Start exercises'] }), /Serve drills|Start exercises/);
assert.match(reportToText(emergency), /Call emergency services now/);
renderReport(container, { ...report, completion: { simulated: false } });
assert.doesNotMatch(container.innerHTML, /±10|accuracy/i);
const nerve = displayReport({ conditions: [], nerveReferral: true }, { completed: 8, total: 8 });
assert.doesNotMatch(nerve.summary, /Ask a clinician about your neck \/ nerves/);
renderReport(container, nerve);
assert.match(container.innerHTML, /Referral:.*neck and nerves/);
assert.match(reportToText(nerve), /Referral:.*neck and nerves/);
const noPain = { markers: [{ type: 'pain', elevation: 71 }, { type: 'click' }], follow: { arc: 'none' } };
reconcilePain(noPain, 'arc', false);
assert.deepEqual(noPain.markers, [{ type: 'click' }]);
assert.equal(noPain.follow.arc, 'none');
noPain.markers.push({ type: 'pain', elevation: 71 });
reconcilePain(noPain, 'arc', true);
assert.equal(noPain.follow.arc, 'middle');
const scalarPain = { markers: [{ type: 'pain', elevation: 90 }], follow: { pain: 'none' } };
reconcilePain(scalarPain, 'pain', true, { multi: false });
assert.equal(scalarPain.follow.pain, 'other');
const cuffPain = { markers: [{ type: 'pain' }], follow: { feel: ['none'] } };
reconcilePain(cuffPain, 'feel', true, { multi: true, opts: [{ v: 'pain' }] });
assert.deepEqual(cuffPain.follow.feel, ['pain']);
const unknownLocation = { markers: [{ type: 'pain' }], follow: { pain: ['none'] } };
reconcilePain(unknownLocation, 'pain', true, { multi: true, opts: [{ v: 'none' }, { v: 'front' }, { v: 'deep' }] });
assert.equal(unknownLocation.follow.pain, undefined, 'confirming pain must not invent its location');
renderReport(container, { ...report, conditions: [{ name: 'Cuff', label: 'Fits well', p: .72 }] });
assert.match(container.innerHTML, /Strong/);
assert.doesNotMatch(container.innerHTML.replace(/<[^>]*>/g, ''), /72%|Fits well/);
const portrait = {
  ...report,
  motion: { forward: { R: 153, L: 170 }, side: { R: 145, L: null } },
  anatomySnapshot: 'data:image/png;base64,iVBORw0KGgo=',
};
renderReport(container, portrait);
assert.match(container.innerHTML, /class="rp-hero"/);
assert.match(container.innerHTML, /153°.*170°/s, 'both shoulders retain their own measured values');
assert.match(container.innerHTML, /role="img".*Range of motion/s);
assert.match(container.innerHTML, /class="rp-anatomy-image".*data:image\/png;base64/);
renderReport(container, { ...portrait, motion: undefined, anatomySnapshot: 'https://example.invalid/track.png' });
assert.match(container.innerHTML, /No movement measurements recorded/);
assert.doesNotMatch(container.innerHTML, /src="https:/);
renderReport(container, { ...emergency, motion: portrait.motion, anatomySnapshot: portrait.anatomySnapshot });
assert.doesNotMatch(container.innerHTML, /class="rp-hero"|class="rp-anatomy-image"|Range of motion/);
assert.deepEqual(reportMotion({ tests: {
  flex: { complete: true, sides: { R: { maxElev: 153.4 }, L: { maxElev: 0 } } },
  abd: { complete: true, skipped: true, sides: { R: { maxElev: 170 } } },
} }), { forward: { R: 153, L: 0 }, side: { R: null, L: null } });
assert.deepEqual(reportMotion({ tests: { flex: { complete: false, sides: { R: { maxElev: 100 } } } } }).forward, { R: null, L: null });
renderReport(container, { ...portrait, motion: { forward: {}, side: { R: 145, L: 160 } } });
assert.match(container.innerHTML, /Range of motion, side raise: right 145°, left 160°/);
renderReport(container, portrait);
assert.match(container.innerHTML, /Peak elevation during forward raises/);
assert.doesNotMatch(container.innerHTML, /Side raise · R/);
const arcEvidence = painArcEvidence({ follow: { arc: 'top' }, markers: [
  { type: 'pain', side: 'R', elevation: 111 }, { type: 'pain', side: 'R', elevation: 69 },
  { type: 'pain', side: 'L', elevation: 170 },
] }, 'R');
assert.equal(arcEvidence.arc, 'middle');
assert.match(arcEvidence.explanation, /near the top.*69–111°.*weighted the markers/);
assert.equal(painArcEvidence({ follow: { arc: 'none' }, markers: [] }, 'R').arc, 'none');
assert.equal(painArcEvidence({ follow: {}, markers: [{ type: 'pain', elevation: 153 }] }, 'R').arc, 'top');
renderReport(container, emergency);
assert.equal((container.innerHTML.match(/Call emergency services now/g) || []).length, 1, 'emergency heading is not repeated in summary');
renderReport(container, nerve);
assert.equal((container.innerHTML.match(/Ask a clinician about your neck/g) || []).length, 1);
renderReport(container, { ...emergency, summary: 'Call emergency services now. Do not continue movement testing.',
  flags: [{ level: 'emergency', text: 'Chest pain. Call emergency services now.' }] });
assert.equal((container.innerHTML.match(/Call emergency services now/g) || []).length, 1, 'older saved safety reports also deduplicate emergency copy');
renderReport(container, { ...nerve, summary: 'Ask a clinician about your neck / nerves. Arrange an assessment for numbness, tingling or pain past the elbow. No strong screening pattern was found.' });
assert.equal((container.innerHTML.match(/Ask a clinician about your neck/g) || []).length, 1, 'older saved nerve reports also keep referral copy in the hero only');
console.log('experience: test-specific demo, report provenance and readable values pass');
