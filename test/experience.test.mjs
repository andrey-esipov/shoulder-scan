import assert from 'node:assert/strict';
import { TESTS } from '../js/protocol.js';
import { RepCounter } from '../js/rehab.js';
import { demoTestPose, displayReport, formatValue, phaseTitle, intakePlan, cameraErrorMessage, collectMarkers, reportHeadline } from '../js/experience.js';
import { renderReport, reportToText } from '../js/report.js';

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
assert.equal(demoTestPose(TESTS.find(t => t.id === 'obrien'), 0), null);
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
console.log('experience: test-specific demo, report provenance and readable values pass');
