import assert from 'node:assert/strict';
import { TESTS } from '../js/protocol.js';
import { RepCounter, coachTarget } from '../js/rehab.js';
import { constrainForearmDirection, insideBody } from '../js/anatomy-pose.js';
import { demoTestPose, demoPeakPose, displayReport, formatValue, phaseTitle, intakePlan, cameraErrorMessage, collectMarkers, reportHeadline, reconcilePain, reportMotion, painArcEvidence, localDate } from '../js/experience.js';
import { renderReport, reportToText } from '../js/report.js';
import { armFromAngles } from '../js/metrics.js';
import { activityCopy, sessionSummary } from '../js/experience.js';

const scoped = sessionSummary({
  side: 'R', motion: { forward: { R: 77, L: null } },
  markers: [
    { type: 'pain', side: 'R', elevation: 165, phase: 'pre-exam', context: 'Demo motion · Forward raise' },
    { type: 'pain', side: 'R', elevation: 12, test: 'Calibration', calibration: true },
    { type: 'click', side: 'R', elevation: 74, test: 'Forward raise', t: 3 },
    { type: 'pain', side: 'R', elevation: 144, test: 'Forward raise', t: 4 },
    { type: 'pull', side: 'R', elevation: 170, test: 'Side raise', t: 5 },
  ],
});
assert.equal(scoped.peak, 144, 'marked frames belong to the recorded peak of their exam movement');
assert.equal(scoped.beforeExam[0].elevation, 165, 'pre-exam evidence stays separate and unmodified');
assert.equal(scoped.firstSymptom.elevation, 74);
assert(scoped.gaugeMarkers.every(m => m.elevation <= scoped.peak), 'no plotted gauge marker can exceed its reported peak');
assert.equal(scoped.otherMovements[0].elevation, 170, 'a different movement cannot inflate a forward-raise result');
assert.equal(sessionSummary({ motion: { forward: { R: 77 } }, markers: [scoped.beforeExam[0]] }).firstSymptom, null);
const fractional = sessionSummary({ side: 'L', motion: { forward: { L: 77 } }, markers: [
  { type: 'pain', side: 'L', elevation: 77.3, testId: 'flex' },
  { type: 'pain', side: 'L', elevation: 170, testId: 'calib' },
] });
assert.equal(fractional.peak, 77);
assert(fractional.gaugeMarkers.every(m => m.elevation <= fractional.peak), 'fractional samples use the same whole-degree scale as the gauge');
assert.equal(fractional.references.length, 1, 'calibration cannot inflate range');

const sportPlan = { plan: [{ rule: 'Keep playing groundstrokes if pain is ≤ 3/10. Add serves 10 at a time.', items: [
  { id: 'intervalServe', name: 'Interval serve program' },
  { id: 'sideER', why: 'Builds the cuff that decelerates the serve.' },
] }], next: ['Most overuse tennis shoulders improve clearly within 6 weeks.'] };
assert.doesNotMatch(JSON.stringify(activityCopy(sportPlan)), /tennis|groundstroke|serves?/i, 'non-sport answers receive generic next steps and rehab');
assert.equal(activityCopy(sportPlan).plan[0].items.length, 1, 'serve-specific exercise is gated');
assert.deepEqual(activityCopy(sportPlan, true), sportPlan, 'overhead athletes retain sport guidance');
assert.equal(sportPlan.plan[0].items.length, 2, 'personalizing copy does not mutate saved reports');

assert.equal(demoPeakPose(TESTS.find(t => t.id === 'flex')).elevation, 145);
assert.equal(demoPeakPose(TESTS.find(t => t.id === 'abd')).elevation, 145);
assert.equal(demoPeakPose(TESTS.find(t => t.id === 'obrien'), 'thumbDown').rotation, -90);
assert.equal(demoPeakPose(TESTS.find(t => t.id === 'obrien'), 'palmUp').rotation, 90);

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
  const hawkinsArm = armFromAngles(hawkins.elevation, hawkins.plane, hawkins.humeralRotation, hawkins.elbowFlex);
  const obrienArm = armFromAngles(obrien.elevation, obrien.plane, obrien.rotation, obrien.elbowFlex);
  assert.ok(hawkinsArm.u[2] > .99 && hawkinsArm.f[1] <= .001, 'Hawkins stays forward with the forearm across/down, not into the skull');
  assert.ok(obrienArm.u[0] < 0 && obrienArm.u[2] > .95 && obrien.elbowFlex < 5, 'O’Brien reaches slightly across the body with a straight elbow');
}
const erTarget = coachTarget('standingER');
assert.equal(erTarget.elevation, 0);
assert.equal(erTarget.elbowFlex, 90);
assert.equal(erTarget.rotation, 40);
const originalTZ = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
assert.equal(localDate(new Date('2026-01-02T00:30:00Z')), '2026-01-01', 'export date follows the local day, not UTC');
if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
for (const [elbow, direction] of [[[2, 0, 20], [0, 1, -.4]], [[20, -20, 0], [-1, 0, 0]]]) {
  const safe = constrainForearmDirection(elbow, direction);
  for (let d = 6; d <= 46; d += 2) assert.equal(insideBody(elbow.map((v, i) => v + safe[i] * d)), false, 'hand/forearm remains outside head and ribs');
}
assert.notEqual(demoTestPose(TESTS.find(t => t.id === 'flex'), 1).plane, demoTestPose(TESTS.find(t => t.id === 'abd'), 1).plane);
assert.equal(demoTestPose(TESTS.find(t => t.id === 'palpate'), 0), null);
const report = displayReport({ conditions: [{ name: 'Labral irritation', p: .7 }], summary: 'calm the tendon', plan: [], flags: [] }, { completed: 2, total: 8, simulated: true });
assert.equal(reportHeadline(report), 'Incomplete screening', 'few tests must not produce a diagnosis headline');
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
renderReport(container, {
  ...inconclusive, completion: { completed: 8, total: 8, simulated: false },
  motion: { forward: { R: 120, L: null } },
  markers: [{ type: 'pain', side: 'R', elevation: 88, elapsed: 3, test: 'Forward raise' }],
});
assert.match(container.innerHTML, /Worth ruling out/);
assert.match(container.innerHTML, /Weak evidence/);
assert.match(container.innerHTML, /Left not tested/);
assert.ok(container.innerHTML.indexOf('What we found') < container.innerHTML.indexOf('Worth ruling out'), 'findings tiles precede hypotheses');
assert.doesNotMatch(container.innerHTML, /Symptoms by arm angle/, 'one marker belongs on the gauge, not an empty timeline');
assert.match(container.innerHTML, /rom-marker/, 'symptoms are overlaid on the gauge');
assert.match(container.innerHTML, /Pain-free range/);
assert.match(container.innerHTML, /First symptom angle/);
assert.match(container.innerHTML, /Recorded range/);
assert.doesNotMatch(container.innerHTML, /Top consideration/);
assert.match(container.innerHTML, /R Pain · 88°/, 'report retains the press-time angle');
assert.doesNotMatch(container.innerHTML, /rp-summary/, 'inconclusive reports do not repeat the hero summary');
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
assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /^Allow camera access/);
assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /^Connect a camera/);
assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /Teams or Zoom/);
report.markers = collectMarkers({ startedT: 10, tests: { abd: { markers: [{ type: 'pain', side: 'R', elevation: 85, t: 15 }] } } });
assert.equal(report.markers[0].elapsed, 5);
assert.match(report.markers[0].test, /Side raise/);
const sessionMarks = [
  { type: 'pain', side: 'R', elevation: 119, elapsed: 9, t: 9, context: 'Demo motion · Forward raise', phase: 'pre-exam' },
  { type: 'pain', side: 'R', elevation: 12, elapsed: 15, t: 15, test: 'Calibration', calibration: true },
  { type: 'pain', side: 'R', elevation: 157, elapsed: 22, t: 22, test: 'Forward raise' },
];
const retained = collectMarkers({ startedT: 12, sessionMarkers: sessionMarks, tests: { flex: { markers: [] } } });
assert.deepEqual(retained.map(m => m.elevation), [119, 12, 157], 'session evidence survives exam reset and follow-up reconciliation');
assert.equal(retained[0].context, 'Demo motion · Forward raise');
assert.equal(collectMarkers({ sessionMarkers: sessionMarks, freeMarkers: [sessionMarks[0]], tests: { flex: { markers: [sessionMarks[2]] } } }).length, 3, 'canonical and per-test references do not duplicate presses');
renderReport(container, { ...inconclusive, markers: retained, motion: { forward: { R: 160 } } });
assert.match(container.innerHTML, /Demo motion · Forward raise/);
assert.match(container.innerHTML, /Calibration · reference only/);
assert.doesNotMatch(container.innerHTML, /Symptoms by arm angle/, 'calibration is not a symptom');
assert.match(container.innerHTML, /Session marks/);
assert.match(container.innerHTML, /Before exam/);
assert.match(container.innerHTML, /Reference only/);
assert.equal((container.innerHTML.match(/class="rom-marker"/g) || []).length, 1, 'one primary symptom anchors the gauge');
assert.match(container.innerHTML, /First symptom angle<\/span><strong>157°/, 'pre-exam and calibration cannot become headline symptom evidence');
assert.equal((container.innerHTML.match(/class="rp-stat"/g) || []).length, 3);
assert.doesNotMatch(container.innerHTML, /<details[^>]*><summary><span>(Your markers|Reference marks)/);
assert.match(container.innerHTML, /Not established/, 'symptom marks alone cannot prove a pain-free range');
renderReport(container, { ...inconclusive, testResults: [{ id: 'flex', title: 'Forward raise', symptoms: ['Shoulder blade/lat'] }, { id: 'hawkins', title: 'Hawkins test', result: 'Pain reproduced' }], plan: [{ phase: 1, items: [{ name: 'Comfortable movement' }] }] });
assert.match(container.innerHTML, /Pain reproduced/);
assert.match(container.innerHTML, /Hawkins test/);
assert.doesNotMatch(container.innerHTML, /<strong>Forward raise<\/strong>/);
assert.match(container.innerHTML, /<details class="rp-sec"><summary><span>Movement plan/);
renderReport(container, { ...inconclusive, conditions: [], drivers: [{ name: 'Training-load spike', p: .5 }] });
assert.match(container.innerHTML, /Possible contributors.*Training-load spike/s, 'contributors are retained even without a condition lead');
const withdrawn = { ...sessionMarks[2] }, rec = { markers: [withdrawn], follow: {} };
reconcilePain(rec, 'pain', false);
assert.equal(withdrawn.retracted, true);
renderReport(container, { ...inconclusive, markers: [withdrawn] });
assert.match(container.innerHTML, /withdrawn during follow-up/);
assert.match(container.innerHTML, /First symptom angle<\/span><strong>None marked/, 'withdrawn markers cannot re-enter headline evidence');
assert.equal(reportHeadline(inconclusive), 'No strong screening pattern');
assert.equal(reportHeadline({ flags: [{ level: 'emergency', text: 'Chest pain or shortness of breath.' }] }), 'Chest pain / shortness of breath');
assert.equal(reportHeadline({ conditions: [{ name: 'Cuff finding', p: .8 }], summary: 'The leading finding is cuff.' }), 'Cuff finding');
renderReport(container, report);
assert.match(container.innerHTML, /Session marks/);
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
assert.match(nerve.summary, /^Ask a clinician about your neck \/ nerves/);
assert.equal(reportHeadline({ ...nerve, conditions: [{ name: 'Cuff finding', p: .8 }] }), 'Neck/nerve referral');
renderReport(container, nerve);
assert.match(container.innerHTML, /Referral:.*neck and nerves/);
renderReport(container, { ...nerve, conditions: [{ name: 'Cuff finding', p: .8 }], summary: 'The leading screening finding is Cuff finding.' });
assert.match(container.innerHTML, /rp-summary">Ask a clinician about your neck \/ nerves/);
assert.match(container.innerHTML, /secondary shoulder finding to discuss/);
renderReport(container, { ...report, summary: 'The leading screening finding is Labral irritation.' });
assert.match(container.innerHTML, /rp-summary">Incomplete screening\. Possible:/);
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
assert.match(container.innerHTML, /class="rp-hero rp-poster"/);
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
renderReport(container, { ...portrait, motion: { forward: {}, side: { R: 145 } } });
assert.match(container.innerHTML, /Recorded range<\/span><strong>145° side raise/);
renderReport(container, portrait);
assert.match(container.innerHTML, /Right forward raise/);
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
assert.equal((container.innerHTML.match(/Ask a clinician about your neck/g) || []).length, 2, 'hero and summary both open with the referral');
renderReport(container, { ...emergency, summary: 'Call emergency services now. Do not continue movement testing.',
  flags: [{ level: 'emergency', text: 'Chest pain. Call emergency services now.' }] });
assert.equal((container.innerHTML.match(/Call emergency services now/g) || []).length, 1, 'older saved safety reports also deduplicate emergency copy');
renderReport(container, { ...nerve, summary: 'Ask a clinician about your neck / nerves. Arrange an assessment for numbness, tingling or pain past the elbow. No strong screening pattern was found.' });
assert.equal((container.innerHTML.match(/Ask a clinician about your neck/g) || []).length, 2, 'older saved nerve reports retain referral-first summaries');
console.log('experience: test-specific demo, report provenance and readable values pass');
