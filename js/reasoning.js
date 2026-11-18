// Evidence-weighted clinical reasoning. Each condition starts with a prior
// probability for a recreational overhead (tennis) athlete with shoulder pain.
// Each finding multiplies the odds by a likelihood ratio (LR+ when present,
// LR− when explicitly absent). The LRs are rounded from the diagnostic-accuracy
// literature (e.g. Hegedus 2012, Michener 2009, Park 2005), and some are
// clinical-judgement weights for self-performed tests. This is decision support
// for education. It is not a diagnosis.

import { EXERCISES } from './rehab.js';
import { painArcEvidence } from './experience.js';

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const has = (v, ...xs) => arr(v).some((a) => xs.includes(a));
const answered = (v) => arr(v).length > 0;
const notNone = (v) => answered(v) && arr(v).some((a) => a !== 'none' && a !== 'na');
const lc = (s) => (s[1] && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
const tri = (known, cond) => (known ? !!cond : undefined);

export function affectedSide(intake) {
  if (intake.side === 'L' || intake.side === 'R') return intake.side;
  return intake.dominant || 'R';
}

/** Derive boolean/unknown clinical features plus measured numbers from exam state. */
export function extractFeatures(state) {
  const I = state.intake || {};
  const T = state.tests || {};
  const A = affectedSide(I);
  const O = A === 'R' ? 'L' : 'R';
  const fu = (id, k) => T[id]?.follow?.[k];
  const sm = (id, s) => T[id]?.sides?.[s];
  const markers = (id, type) => arr(T[id]?.markers).filter((m) => m.type === type && (!m.side || m.side === A));
  const done = (id) => !!T[id] && !T[id].skipped;

  const f = {};
  const num = {};

  // Painful arc: answer or pain markers during side raise
  const { arc, angles: abdPain } = painArcEvidence(T.abd, A);
  f.painfulArc = arc === 'middle' ? true : tri(answered(arc) || done('abd'), false);
  f.highArc = arc === 'top' ? true : tri(answered(arc), false);
  if (abdPain.length) num.arcPainAt = abdPain.map((e) => Math.round(e));

  f.hawkins = tri(answered(fu('hawkins', 'pain')), notNone(fu('hawkins', 'pain')));
  f.lateralPain = tri(answered(I.location), has(I.location, 'lateral'));
  f.frontPain = tri(answered(I.location), has(I.location, 'front'));
  f.posteriorPain = tri(answered(I.location), has(I.location, 'back'));
  f.deepPain = tri(answered(I.location), has(I.location, 'deep'));
  f.acLoc = tri(answered(I.location), has(I.location, 'acPoint'));
  f.bladeLoc = tri(answered(I.location), has(I.location, 'blade'));
  f.latLoc = tri(answered(I.location), has(I.location, 'lat'));
  f.neckLoc = tri(answered(I.location), has(I.location, 'neck'));

  const ecFeel = fu('emptyCan', 'feel');
  const ecA = sm('emptyCan', A), ecO = sm('emptyCan', O);
  const driftWorse = ecA && ecO && ecA.drift != null && ecO.drift != null && ecA.drift - ecO.drift > 10;
  const tremorWorse = ecA && ecO && ecA.tremor != null && ecO.tremor != null && ecA.tremor > 1.8 * Math.max(ecO.tremor, 0.002);
  f.emptyCanPain = tri(answered(ecFeel), has(ecFeel, 'pain'));
  f.emptyCanWeak = has(ecFeel, 'weak') || driftWorse || tremorWorse ? true : tri(answered(ecFeel), false);
  if (ecA?.drift != null) num.emptyCanDrift = { A: ecA.drift, O: ecO?.drift };

  const erFeel = fu('erHold', 'feel');
  const erA = sm('erHold', A);
  f.erLag = has(erFeel, 'weak') || (erA?.drift ?? 0) > 15 ? true : tri(answered(erFeel), false);

  f.weakness = tri(answered(I.weakness), I.weakness === 'yes');
  f.night = tri(answered(I.night), I.night === 'yes');
  f.age55 = I.age === '55+';
  f.age40 = I.age === '40-54' || I.age === '55+';
  f.young = I.age === 'u25' || I.age === '25-39';
  f.trauma = tri(answered(I.onset), has(I.onset, 'trauma', 'event'));
  f.gradual = tri(answered(I.onset), I.onset === 'gradual');

  f.servePain = tri(answered(I.servePhase), notNone(I.servePhase));
  f.lateCocking = tri(answered(I.servePhase), has(I.servePhase, 'trophy'));
  f.contactPhase = tri(answered(I.servePhase), has(I.servePhase, 'contact'));
  f.followPhase = tri(answered(I.servePhase), has(I.servePhase, 'follow'));

  const cock = fu('rot90', 'cock');
  f.rot90Post = tri(answered(cock), has(cock, 'backPain', 'deepPain'));
  f.rot90Deep = tri(answered(cock), has(cock, 'deepPain'));
  f.apprehension = tri(answered(cock), has(cock, 'apprehension'));
  f.rot90Front = tri(answered(cock), has(cock, 'frontPain'));

  // GIRD: internal-rotation deficit of the affected (serving) arm vs the other
  const rA = sm('rot90', A), rO = sm('rot90', O);
  if (rA?.minRot != null && rO?.minRot != null && rA.maxRot != null && rO.maxRot != null) {
    const irA = -rA.minRot, irO = -rO.minRot, erA2 = rA.maxRot, erO2 = rO.maxRot;
    num.rot90 = { irA, irO, erA: erA2, erO: erO2, gird: irO - irA, tamd: (irO + erO2) - (irA + erA2) };
    f.gird = irO - irA >= 18 ? true : irO - irA < 10 ? false : undefined;
    f.erGain = erA2 - erO2 >= 10;
    f.tamdLoss = (irO + erO2) - (irA + erA2) >= 8;
  }

  const td = fu('obrien', 'thumbDown'), pu = fu('obrien', 'palmUp');
  f.obrienRelief = has(td, 'deep', 'front') && pu === 'better' ? true : tri(answered(td), false);
  f.obrienAC = tri(answered(td), has(td, 'acPoint'));
  f.obrienFront = tri(answered(td), has(td, 'front'));

  const cw = I.clickWhere, cp = I.clickPainful, sc = fu('scapClick', 'where');
  const anyClick = notNone(cw) || notNone(sc);
  const deepClick = has(cw, 'deepRot') || has(sc, 'deep');
  const clickHurts = has(cp, 'painful', 'sometimes') || has(sc, 'painful');
  f.deepPainfulClick = tri(answered(cw) || answered(sc), deepClick && clickHurts);
  f.painlessClickOnly = anyClick && (cp === 'painless') && !has(sc, 'painful');
  f.bladeClick = tri(answered(cw) || answered(sc), has(cw, 'blade') || has(sc, 'blade'));
  f.frontClick = has(cw, 'front') || has(sc, 'front');
  f.topClick = has(cw, 'top');
  num.micPops = arr(T.scapClick?.markers).filter((m) => m.type === 'click').length || undefined;

  f.catching = tri(answered(I.catching), I.catching === 'yes');
  f.instability = tri(answered(I.instability), I.instability === 'yes');

  f.speeds = tri(answered(fu('speeds', 'pain')), fu('speeds', 'pain') === 'front');
  f.groove = tri(answered(fu('palpate', 'groove')), fu('palpate', 'groove') === 'yes');
  f.acTender = tri(answered(fu('palpate', 'ac')), fu('palpate', 'ac') === 'yes');
  const cb = fu('crossBody', 'feel');
  f.crossBodyAC = tri(answered(cb), has(cb, 'acPoint'));
  f.crossBackTight = tri(answered(cb), has(cb, 'backTight'));
  f.pullArm = has(I.pull, 'arm');

  // Scapular control: shoulder hike asymmetry during repeated raises
  let hikeA = null, hikeO = null, leanMax = null;
  for (const id of ['scapReps', 'flex', 'abd']) {
    const a = sm(id, A), o = sm(id, O);
    if (a?.maxHike != null && o?.maxHike != null) { hikeA = Math.max(hikeA ?? -1e9, a.maxHike); hikeO = Math.max(hikeO ?? -1e9, o.maxHike); }
    if (a?.maxLean != null) leanMax = Math.max(leanMax ?? 0, Math.abs(a.maxLean));
  }
  if (hikeA != null) {
    num.hike = { A: hikeA, O: hikeO };
    f.hikeAsym = hikeA - hikeO >= 10 ? true : hikeA - hikeO < 5 ? false : undefined;
  }
  if (leanMax != null) { num.leanMax = leanMax; f.leanComp = leanMax > 10; }
  f.scapFeel = tri(answered(fu('scapReps', 'feel')), fu('scapReps', 'feel') === 'yes');

  f.latPull = tri(answered(I.pull), has(I.pull, 'lat'));
  const lt = sm('latTest', A), ltF = fu('latTest', 'pull');
  if (lt?.maxElev != null) num.latElev = { A: lt.maxElev, O: sm('latTest', O)?.maxElev };
  f.latLimited = has(ltF, 'arch') || (lt?.maxElev != null && lt.maxElev < 155) ? true : lt?.maxElev > 168 ? false : undefined;
  f.latReproduced = has(ltF, 'lat') || markers('latTest', 'pull').length > 0 ? true : tri(answered(ltF), false);

  f.nerve = tri(answered(I.nerve), I.nerve === 'yes');
  f.neckRepro = tri(answered(fu('neck', 'arm')), fu('neck', 'arm') === 'yes');

  const es = (s) => sm('erSide', s)?.maxRot;
  if (es(A) != null && es(O) != null && es(O) > 30) {
    num.erSide = { A: es(A), O: es(O) };
    f.erSideLoss = es(A) < 0.5 * es(O) ? true : es(A) > 0.75 * es(O) ? false : undefined;
  }
  const fl = (s) => sm('flex', s)?.maxElev;
  if (fl(A) != null && fl(O) != null) {
    num.flex = { A: fl(A), O: fl(O) };
    num.abd = { A: sm('abd', A)?.maxElev, O: sm('abd', O)?.maxElev };
    f.flexLoss = fl(O) - fl(A) > 25 ? true : fl(O) - fl(A) < 10 ? false : undefined;
  }

  f.gym = has(I.load, 'gym');
  f.loadSpike = has(I.load, 'volume', 'gear', 'technique', 'gym');
  f.redFlag = notNone(I.redFlags);
  return { f, num, A, O };
}

// [feature, LR+, LR−, text when present, text when absent]
const C = (id, name, kind, prior, ev, blurb, extra = {}) => ({ id, name, kind, prior, ev, blurb, ...extra });

export const CONDITIONS = [
  C('saps', 'Rotator cuff tendinopathy (subacromial pain)', 'dx', 0.35, [
    ['painfulArc', 3.7, 0.5, 'Painful arc in the middle of the side raise', 'No painful arc on the side raise'],
    ['hawkins', 1.6, 0.5, 'Hawkins test reproduced pain', 'Hawkins test was pain-free'],
    ['emptyCanPain', 1.8, 0.8, 'Empty-can hold was painful'],
    ['emptyCanWeak', 1.5, 0.9, 'Sore arm drifted or shook on the empty-can hold'],
    ['lateralPain', 1.8, 0.7, 'Pain over the outside of the upper arm (classic cuff referral)'],
    ['night', 1.4, 0.9, 'Night pain or pain lying on it'],
    ['contactPhase', 1.4, null, 'Pain reaching up to contact'],
    ['gradual', 1.3, null, 'Gradual overuse onset'],
    ['hikeAsym', 1.3, null, 'Shoulder hikes on the sore side'],
    ['age40', 1.3, null, 'Age over 40'],
  ], 'Irritated rotator cuff tendons, usually supraspinatus, that get loaded or squeezed under the acromion when the arm is raised. This is the most common cause of shoulder pain in recreational tennis players and responds very well to progressive loading.'),
  C('internal', 'Internal (posterosuperior) impingement', 'dx', 0.15, [
    ['posteriorPain', 2.5, 0.6, 'Pain at the back of the shoulder'],
    ['lateCocking', 2.5, 0.6, 'Pain when the racquet drops behind the back (late cocking)', 'No pain in the racquet-drop phase'],
    ['rot90Post', 3.0, 0.4, 'Pain at the back or deep in the 90/90 cocked position', 'No pain in the 90/90 cocked position'],
    ['gird', 1.8, 0.8, 'Serving arm has lost internal rotation (GIRD)'],
    ['erGain', 1.4, null, 'Extra external rotation on the serving arm'],
    ['deepPainfulClick', 1.3, null, 'Deep, painful clicking'],
    ['servePain', 1.5, 0.3, 'Pain with serving', 'Serving does not hurt'],
    ['young', 1.3, null, 'Younger overhead athlete'],
  ], 'In the fully cocked serve position, the underside of the cuff gets pinched between the humeral head and the back-top rim of the socket (labrum). Tight posterior structures (GIRD) and a sagging shoulder blade make it worse. This is very common in servers and throwers.'),
  C('slap', 'Labral (SLAP) irritation or tear', 'dx', 0.10, [
    ['obrienRelief', 2.0, 0.6, "O'Brien: deep pain thumb-down, relieved palm-up", "O'Brien test negative"],
    ['deepPainfulClick', 2.0, 0.8, 'Deep, painful clicking in the joint', 'No deep painful clicking'],
    ['catching', 2.0, 0.75, 'Catching, locking or dead-arm episodes', 'No catching or dead-arm episodes'],
    ['trauma', 2.0, 0.9, 'Started with one specific event'],
    ['rot90Deep', 1.8, null, 'Deep pain or click in the 90/90 cocked position'],
    ['deepPain', 1.4, null, 'Pain feels deep inside the joint'],
    ['lateCocking', 1.4, null, 'Pain in late cocking (peel-back position)'],
    ['gird', 1.3, null, 'Internal-rotation deficit (peel-back risk)'],
    ['painlessClickOnly', 0.7, null, 'Clicks are painless, which points away from a labral tear'],
  ], 'The labrum is the cartilage rim of the socket. The top part, where the biceps anchors, can be peeled back by the twisting load of the serve. It typically causes deep pain plus painful clicking or catching. Many overhead athletes have labral fraying on MRI with no symptoms, so the clinical picture matters more than the scan.'),
  C('biceps', 'Long head of biceps tendinopathy', 'dx', 0.12, [
    ['frontPain', 2.5, 0.5, 'Pain at the front of the shoulder', 'No pain at the front of the shoulder'],
    ['speeds', 1.9, 0.6, "Speed's test reproduced front pain", "Speed's test negative"],
    ['groove', 2.0, 0.7, 'Bicipital groove tender compared with the other side'],
    ['obrienFront', 1.5, null, "O'Brien thumb-down painful at the front"],
    ['pullArm', 1.5, null, 'Pulling down the front of the arm'],
    ['rot90Front', 1.4, null, 'Front pain in the 90/90 position'],
  ], 'The long head of the biceps tendon runs through a groove at the front of the shoulder into the top of the labrum. Serving and follow-through can irritate it. It often travels together with labral or cuff problems.'),
  C('ac', 'AC joint irritation', 'dx', 0.07, [
    ['acLoc', 3.0, 0.5, 'Pain on the bony point on top of the shoulder'],
    ['crossBodyAC', 3.0, 0.6, 'Cross-body reach hurt on top', 'Cross-body reach did not hurt on top'],
    ['acTender', 3.0, 0.4, 'AC joint tender to press', 'AC joint not tender'],
    ['highArc', 2.0, 0.8, 'Pain only near the top of the arc (above ~150°)'],
    ['obrienAC', 2.5, null, "O'Brien painful on top (AC pattern)"],
    ['gym', 1.4, null, 'Overhead/bench pressing in the gym'],
  ], 'The joint where the collarbone meets the acromion. Heavy pressing and high overhead reach load it. It causes pinpoint pain on top.'),
  C('microinstab', 'Anterior microinstability', 'dx', 0.08, [
    ['instability', 3.0, 0.5, 'Shoulder sometimes feels like it slips', 'No feeling of slipping'],
    ['apprehension', 4.0, 0.7, 'Apprehension in the 90/90 cocked position'],
    ['catching', 1.4, null, 'Catching or dead-arm episodes'],
    ['erGain', 1.3, null, 'Extra external rotation'],
    ['young', 1.2, null, 'Younger athlete'],
  ], 'Repeated serving stretches the front capsule, so the ball of the joint shifts a little too much in the cocked position. It often coexists with internal impingement.'),
  C('tear', 'Rotator cuff tear (partial or full)', 'dx', 0.04, [
    ['weakness', 3.0, 0.6, 'Real weakness lifting the arm', 'No real weakness'],
    ['erLag', 4.0, 0.8, 'Could not hold external rotation at end range (lag)'],
    ['age55', 3.0, null, 'Age over 55'],
    ['young', 0.3, null, 'Under 40, where full tears are uncommon without trauma'],
    ['trauma', 2.0, null, 'Started with a specific event'],
    ['emptyCanWeak', 2.0, 0.8, 'Weak or shaky on the empty-can hold'],
    ['night', 1.5, 0.8, 'Night pain'],
    ['flexLoss', 2.0, null, 'Sore arm cannot raise as high'],
  ], 'A partial or full-thickness tear in a cuff tendon. It is more likely with age, trauma, real weakness, or an inability to hold the arm rotated out.'),
  C('cervical', 'Neck-referred pain', 'dx', 0.04, [
    ['nerve', 4.0, 0.6, 'Numbness, tingling or pain past the elbow', 'No pins-and-needles or pain past the elbow'],
    ['neckRepro', 4.0, 0.5, 'Neck movement reproduced arm symptoms', 'Neck screen negative'],
    ['neckLoc', 2.5, null, 'Pain runs from the neck into the shoulder'],
    ['painfulArc', 0.6, null, 'Painful arc points to the shoulder itself'],
    ['hawkins', 0.7, null, 'Shoulder provocation test positive'],
  ], 'A pinched nerve in the neck can refer pain to the shoulder blade and arm.'),
  C('frozen', 'Frozen shoulder (adhesive capsulitis)', 'dx', 0.02, [
    ['erSideLoss', 6.0, 0.15, 'Rotation at the side is markedly reduced', 'Rotation at the side is preserved'],
    ['flexLoss', 2.5, 0.6, 'Overhead reach is markedly reduced'],
    ['night', 1.5, null, 'Night pain'],
    ['age40', 1.8, null, 'Age over 40'],
    ['young', 0.3, null, 'Uncommon under 40'],
  ], 'The joint capsule becomes inflamed and then stiff, with a big loss of rotation in all directions.'),
  C('snapping', 'Snapping scapula / scapulothoracic bursitis', 'dx', 0.06, [
    ['bladeClick', 8.0, 0.3, 'Clicking comes from under the shoulder blade or lat', 'Clicks do not come from under the shoulder blade'],
    ['bladeLoc', 2.0, null, 'Pain around the shoulder blade'],
    ['painlessClickOnly', 1.5, null, 'Clicks are mostly painless'],
    ['hikeAsym', 1.3, null, 'Shoulder-blade control asymmetry'],
  ], 'The shoulder blade grinds or clunks over the ribs, often because of weak serratus or lower-trap muscles or an irritated bursa. It is usually painless and responds to scapular retraining.'),
  // Drivers: these are not exclusive diagnoses. They explain why the tissue got overloaded.
  C('gird', 'Posterior shoulder tightness (GIRD)', 'driver', 0.30, [
    ['gird', 4.0, 0.4, 'Measured internal-rotation deficit on the serving arm', 'Internal rotation is symmetrical'],
    ['tamdLoss', 2.0, null, 'Total rotation arc reduced on the serving arm'],
    ['crossBackTight', 2.0, 0.7, 'Tight posterior stretch on the cross-body reach'],
    ['servePain', 1.3, null, 'Serving load'],
  ], 'Years of serving tighten the back of the shoulder, so internal rotation drops. That shifts the ball of the joint up and back in the cocked position and loads the labrum and cuff.'),
  C('dyskinesis', 'Scapular dyskinesis', 'driver', 0.30, [
    ['hikeAsym', 2.5, 0.6, 'Sore-side shoulder hiked during raises', 'Shoulder blades moved symmetrically'],
    ['scapFeel', 1.8, 0.8, 'Shoulder blade felt like it hitched or tired'],
    ['leanComp', 1.4, null, 'Leaned the trunk to get the arm up'],
    ['bladeClick', 1.5, null, 'Clicking under the shoulder blade'],
    ['painfulArc', 1.2, null, 'Painful arc (often linked to poor upward rotation)'],
  ], 'The shoulder blade is the platform for the arm. If serratus and lower trapezius do not rotate and tilt it properly, the cuff and labrum take extra load.'),
  C('lat', 'Lat / teres major tightness or overload', 'driver', 0.15, [
    ['latPull', 3.5, 0.4, 'Pulling in the lat or side of the back when reaching overhead', 'No pulling in the lat when reaching overhead'],
    ['latLimited', 2.5, 0.6, 'Could not get the arms fully overhead against the wall without arching'],
    ['latReproduced', 3.0, 0.6, 'Lat length test reproduced the pulling'],
    ['latLoc', 2.0, null, 'Pain at the side of the back or armpit'],
    ['gym', 1.3, null, 'Gym pulling work'],
  ], 'The lat and teres major accelerate the serve and resist the full overhead reach. When tight or overloaded, they pull on the arm at full elevation, and the shoulder or low back compensates.'),
  C('load', 'Training-load spike', 'driver', 0.25, [
    ['loadSpike', 4.0, 0.5, 'More play, new gear, serve changes or new overhead gym work before it started', 'No recent change in load'],
    ['gradual', 1.3, null, 'Gradual onset'],
  ], 'Most tennis shoulder problems follow a jump in serve volume or a change in racquet, strings or technique.'),
];

const odds = (p) => p / (1 - p);
const prob = (o) => o / (1 + o);

export function scoreConditions(state) {
  const { f, num, A, O } = extractFeatures(state);
  const results = CONDITIONS.map((c) => {
    let o = odds(c.prior);
    const forR = [], againstR = [];
    let known = 0;
    for (const [feat, lrp, lrn, tPos, tNeg] of c.ev) {
      const v = f[feat];
      if (v === true) {
        known++;
        o *= lrp;
        (lrp >= 1 ? forR : againstR).push({ text: tPos, lr: lrp });
      } else if (v === false && lrn != null) {
        known++;
        o *= lrn;
        if (tNeg) againstR.push({ text: tNeg, lr: lrn });
      }
    }
    const p = Math.min(0.97, Math.max(0.01, prob(o)));
    const label = p >= 0.6 ? 'Fits well' : p >= 0.35 ? 'Possible' : 'Less likely';
    forR.sort((a, b) => b.lr - a.lr);
    againstR.sort((a, b) => a.lr - b.lr);
    return { id: c.id, name: c.name, kind: c.kind, blurb: c.blurb, p, label, for: forR, against: againstR, coverage: known / c.ev.length };
  });
  results.sort((a, b) => b.p - a.p);
  return { results, f, num, A, O };
}

export function redFlags(state) {
  const I = state.intake || {};
  const out = [];
  const rf = arr(I.redFlags);
  if (rf.includes('chest')) out.push({ level: 'emergency', text: 'Chest pain or shortness of breath with shoulder pain can be cardiac or lung related.' });
  if (rf.includes('fever')) out.push({ level: 'urgent', text: 'Fever with a painful joint can mean infection. Get seen today.' });
  if (rf.includes('deformity')) out.push({ level: 'urgent', text: 'Deformity after an injury suggests a dislocation or fracture. Get seen urgently.' });
  if (rf.includes('cantLift')) out.push({ level: 'urgent', text: 'Sudden inability to lift the arm can be an acute cuff tear. These are best repaired early, so see a doctor within 1–2 weeks.' });
  if (rf.includes('weightLoss')) out.push({ level: 'soon', text: 'Unexplained weight loss or night sweats need a medical review.' });
  if (I.nerve === 'yes' && I.weakness === 'yes') out.push({ level: 'soon', text: 'Numbness together with weakness needs a doctor to check the nerves.' });
  return out;
}

/** Build the full report: summary, ranked conditions, drivers, plan, next steps. */
export function buildReport(state) {
  const { results, f, num, A, O } = scoreConditions(state);
  const dx = results.filter((r) => r.kind === 'dx');
  const drivers = results.filter((r) => r.kind === 'driver' && r.p >= 0.35);
  const flags = redFlags(state);
  const P = Object.fromEntries(results.map((r) => [r.id, r.p]));
  const sideName = A === 'R' ? 'right' : 'left';

  const top = dx.filter((d) => d.p >= 0.35).slice(0, 3);
  const lead = top[0] || dx[0];
  let summary = `Your ${sideName}-shoulder picture fits best with **${lc(lead.name)}**`;
  if (top[1]) summary += `, with **${lc(top[1].name)}** also possible`;
  summary += '.';
  if (drivers.length) summary += ` The main drivers look like ${drivers.map((d) => lc(d.name)).join(', ')}.`;
  summary += ' These problems usually overlap in tennis players and are treated with the same core plan: calm the tendon, restore internal rotation and shoulder-blade control, then rebuild serve load gradually.';

  const pick = new Set(['isoER', 'isoAbd', 'openBook', 'sideER', 'proneYTW', 'wallSlide', 'row', 'plyoDrops', 'plyoER', 'intervalServe']);
  if (P.internal > 0.3 || P.slap > 0.3 || P.gird > 0.35) { pick.add('sleeper'); pick.add('crossBodyStretch'); pick.add('er9090'); }
  if (P.lat > 0.3) pick.add('latStretch');
  if (P.saps > 0.3 || P.dyskinesis > 0.35) { pick.add('pecMinor'); pick.add('scaption'); }
  if (P.dyskinesis > 0.35 || P.snapping > 0.3) { pick.add('pushupPlus'); pick.add('shrugCircles'); }
  if (P.biceps > 0.3) pick.add('bicepsEcc');
  if (P.microinstab > 0.35) pick.add('er9090');
  const phases = [1, 2, 3].map((ph) => ({
    phase: ph,
    title: ['Calm it down (weeks 0–2)', 'Build capacity (weeks 2–6)', 'Return to serving (week 6+)'][ph - 1],
    rule: [
      'Keep playing groundstrokes if pain is ≤ 3/10. Pause or cut serves and overheads to 50% pace. Ice or heat as you like. Avoid sleeping on that side.',
      'Strength 3×/week. Slow lowering phases. Rehab pain ≤ 3/10 and settled by the next morning.',
      'Start only when 90/90 rotation is pain-free and side-to-side strength feels equal. Add serves 10 at a time.',
    ][ph - 1],
    items: [...pick].filter((k) => EXERCISES[k].phase === ph).map((k) => ({ id: k, ...EXERCISES[k] })),
  }));

  const serve = [
    'Drive up from the legs and hips. Most serve power should come from the ground, not the shoulder.',
    "Keep the elbow at or slightly below shoulder line in the trophy position. Don't let the arm drift behind the body (hyperangulation).",
    'Cut kick and twist serves for now. They demand the most external rotation and labral peel-back load.',
    'Warm up properly: bands for ER/IR and scapular activation, then 10–15 easy serves before hitting hard.',
    'Check gear: lower string tension by 2–3 lb, use softer or poly-hybrid strings, and avoid a sudden switch to a heavier or head-heavy racquet.',
  ];
  if (f.lateCocking || P.internal > 0.35) serve.unshift('Focus on a late racquet drop with the chest staying "closed" longer. Opening the chest early levers the arm back into internal impingement.');
  if (P.lat > 0.35) serve.push('Before you serve, do 2 × 30 s of lat stretching. A stiff lat makes you arch the low back and reach with the shoulder.');

  const next = [];
  if (flags.length) next.push(...flags.map((x) => x.text));
  next.push('Follow the plan for 6–8 weeks. Most overuse tennis shoulders improve clearly within 6 weeks.');
  next.push('See a sports-medicine doctor or physio sooner if you have locking or catching that stops play, real weakness, instability, numbness, or no progress by week 6–8.');
  const imaging = [];
  if (P.slap > 0.35 || P.microinstab > 0.35) imaging.push('If mechanical symptoms persist, an MR arthrogram is the best test for the labrum.');
  if (P.tear > 0.35 || P.saps > 0.6) imaging.push('An ultrasound or MRI can check the cuff if strength is not recovering.');
  if (P.ac > 0.35) imaging.push('An X-ray can confirm AC joint arthritis or osteolysis.');
  if (P.cervical > 0.35) imaging.push('Have the neck examined. An MRI is only needed if there are nerve signs.');
  next.push(...imaging);

  const found = [];
  if (num.flex) found.push(`Forward raise: ${Math.round(num.flex.A)}° on the sore side vs ${Math.round(num.flex.O)}° on the other`);
  if (num.abd?.A != null) found.push(`Side raise: ${Math.round(num.abd.A)}° vs ${Math.round(num.abd.O ?? 0)}°`);
  if (num.arcPainAt) found.push(`Pain marked on the side raise at ${num.arcPainAt.join('°, ')}°`);
  if (num.rot90) found.push(`90/90 rotation, sore arm: outward ${Math.round(num.rot90.erA)}° / inward ${Math.round(num.rot90.irA)}°. Other arm: outward ${Math.round(num.rot90.erO)}° / inward ${Math.round(num.rot90.irO)}°. Inward-rotation difference ${Math.round(num.rot90.gird)}° (IR deficit / GIRD: less inward rotation on the sore side; camera estimate, not a clinical measurement)`);
  if (num.erSide) found.push(`Rotation at side: ${Math.round(num.erSide.A)}° vs ${Math.round(num.erSide.O)}°`);
  if (num.hike) found.push(`Peak shoulder hike: ${Math.round(num.hike.A)}% on the sore side vs ${Math.round(num.hike.O)}%`);
  if (num.leanMax != null) found.push(`Max trunk lean during raises: ${Math.round(num.leanMax)}°`);
  if (num.latElev) found.push(`Wall lat test overhead reach: ${Math.round(num.latElev.A)}° vs ${Math.round(num.latElev.O ?? 0)}°`);
  if (num.emptyCanDrift) found.push(`Empty-can arm drift: ${Math.round(num.emptyCanDrift.A)}° vs ${Math.round(num.emptyCanDrift.O ?? 0)}°`);
  if (num.micPops) found.push(`${num.micPops} click(s) marked during the shoulder-blade check`);

  return { summary, conditions: dx, drivers, plan: phases, serve, next, found, flags, side: A, generatedAt: new Date().toISOString() };
}
