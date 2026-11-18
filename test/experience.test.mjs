import assert from 'node:assert/strict';
import { TESTS } from '../js/protocol.js';
import { RepCounter } from '../js/rehab.js';
import { demoTestPose, displayReport, formatValue, phaseTitle } from '../js/experience.js';
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
console.log('experience: test-specific demo, report provenance and readable values pass');
