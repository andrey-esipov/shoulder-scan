import assert from 'node:assert/strict';
import { buildReport, scoreConditions } from '../js/reasoning.js';
import { RepCounter } from '../js/rehab.js';

const show = (label, st) => {
  const { results } = scoreConditions(st);
  console.log(`\n${label}`);
  for (const r of results) console.log(`  ${r.kind.padEnd(6)} ${(r.p * 100).toFixed(0).padStart(3)}%  ${r.label.padEnd(11)} ${r.name}`);
  return Object.fromEntries(results.map((r) => [r.id, r.p]));
};

// Andrey's reported symptoms (intake only, no tests yet)
const andrey = { intake: { side: 'R', dominant: 'R', age: '25-39', onset: 'gradual', location: ['deep', 'lateral'], servePhase: ['trophy', 'contact'], clickWhere: ['deepRot'], clickPainful: 'sometimes', catching: 'no', instability: 'no', pull: ['lat'], night: 'no', weakness: 'no', nerve: 'no', load: ['volume'], redFlags: ['none'] }, tests: {} };
const pA = show('Intake only (Andrey-like)', andrey);
assert.ok(pA.lat > 0.35, 'lat driver should surface');
assert.ok(pA.frozen < 0.05 && pA.cervical < 0.05);

// Classic cuff tendinopathy
const cuff = { intake: { side: 'R', dominant: 'R', age: '40-54', onset: 'gradual', location: ['lateral'], servePhase: ['contact'], clickWhere: ['none'], catching: 'no', instability: 'no', pull: ['none'], night: 'yes', weakness: 'no', nerve: 'no', redFlags: ['none'] },
  tests: { abd: { follow: { arc: 'middle' }, markers: [{ type: 'pain', elevation: 85 }] }, hawkins: { follow: { pain: ['lateral'] } }, emptyCan: { follow: { feel: ['pain'] } } } };
const pC = show('Classic cuff', cuff);
assert.ok(pC.saps > 0.8);
const conflicted = structuredClone(cuff);
conflicted.tests.abd.follow.arc = 'top';
conflicted.tests.abd.markers = [{ type: 'pain', side: 'R', elevation: 69 }, { type: 'pain', side: 'R', elevation: 111 }];
const reconciled = scoreConditions(conflicted);
assert.equal(reconciled.f.painfulArc, true);
assert.equal(reconciled.f.highArc, false, 'the answer must not add contradictory AC evidence after weighting midrange markers');

// Snapping scapula
const snap = { intake: { side: 'R', dominant: 'R', age: 'u25', onset: 'gradual', location: ['blade'], servePhase: ['none'], clickWhere: ['blade'], clickPainful: 'painless', redFlags: ['none'] }, tests: { scapClick: { follow: { where: ['blade'] } } } };
const pS = show('Snapping scapula', snap);
assert.ok(pS.snapping > 0.5);

// GIRD from measurements
const gird = { intake: { side: 'R', dominant: 'R' }, tests: { rot90: { sides: { R: { minRot: -35, maxRot: 115 }, L: { minRot: -60, maxRot: 100 } }, follow: { cock: 'backPain' } } } };
const pG = show('Measured GIRD + posterior pain', gird);
assert.ok(pG.gird > 0.6 && pG.internal > 0.4);

const rep = buildReport(andrey);
assert.ok(rep.plan[0].items.some((i) => i.id === 'latStretch'));
console.log('\nSUMMARY:', rep.summary);

const rc = new RepCounter({ up: 120, down: 40 });
[10, 60, 130, 150, 90, 30, 20, 125, 35].forEach((v, i) => rc.push(v, i));
assert.equal(rc.count, 2);
console.log('\nreasoning + rep counter: ok');
