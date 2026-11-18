// Report rendering: HTML view, plain-text export, JSON download. No external deps.
import { phaseTitle, formatValue, reportDate, reportHeadline, displayReport, activityCopy, sessionSummary, isCalibration } from './experience.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const stripMd = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');
const txt = (x) => (x == null ? '' : typeof x === 'string' ? x : x.text ?? x.label ?? x.name ?? String(x));
const strength = p => p >= .65 ? 'Strong' : p >= .35 ? 'Some' : 'Weak';
const arr = (x) => (Array.isArray(x) ? x : []);
function reportActivity(report) {
  const sports = report.overheadSport === true;
  return { ...report, plan: activityCopy(report.plan, sports), next: activityCopy(report.next, sports), serve: sports ? report.serve : [] };
}
const nerveReferral = 'Referral: arrange a clinical assessment of your neck and nerves for symptoms past the elbow.';
const flagText = f => String(f.text || '').replace(/\s*Call emergency services now\.?/gi, '').trim();
function summaryText(report) {
  if (arr(report.flags).some(f => f.level === 'emergency')) return 'Do not continue movement testing. Exercises are paused until a clinician clears you.';
  if (!arr(report.flags).length && (report.nerveReferral || reportHeadline(report) === 'Incomplete screening'))
    return displayReport(report, report.completion || {}).summary;
  return String(report.summary || '');
}
const plain = text => String(text || '')
  .replace(/\bsubacromial pain\b/gi, 'pain under the bony roof of the shoulder')
  .replace(/\bsubacromial\b/gi, 'subacromial (under the bony roof of the shoulder)')
  .replace(/\bAC(?: joint)?\b/g, 'AC joint (outer collarbone joint)');

function labelClass(label) {
  const l = String(label || '').toLowerCase();
  if (l.startsWith('fits')) return 'fits';
  if (l.startsWith('possible')) return 'possible';
  return 'less';
}

function section(title, body, { open = true, count = null } = {}) {
  const c = count != null ? `<span class="rp-count">${esc(count)}</span>` : '';
  return `<details class="rp-sec"${open ? ' open' : ''}><summary><span>${esc(title)}${c}</span></summary><div class="rp-sec-body">${body}</div></details>`;
}

function evList(items, cls, title, emptyText) {
  const list = arr(items).map(txt).filter(Boolean);
  const lis = list.length ? list.map((t) => `<li>${esc(plain(t))}</li>`).join('') : `<li class="none">${esc(emptyText)}</li>`;
  return `<div class="${cls}"><h5>${esc(title)}</h5><ul>${lis}</ul></div>`;
}

function condCard(c, { top = false, driver = false } = {}) {
  const lc = labelClass(c.label);
  const w = Math.max(2, Math.min(100, Math.round((Number(c.p) || 0) * 100)));
  return `<article class="rp-cond${top ? ' top' : ''}${driver ? ' driver' : ''}" data-id="${esc(c.id)}">
    <div class="rp-cond-head"><span class="rp-cond-name">${esc(plain(c.name))}</span><span class="badge ${lc}">${strength(c.p)} evidence</span></div>
    ${c.p >= .5 ? `<div class="rp-prob ${lc}" aria-hidden="true"><div class="bar"><i style="width:${w}%"></i></div></div>` : ''}
    ${c.blurb ? `<p class="rp-blurb">${esc(plain(c.blurb))}</p>` : ''}
    ${driver ? '' : `<div class="rp-ev">${evList(c.for, 'for', 'Supports', 'Nothing specific yet')}${evList(c.against, 'against', 'Against', 'Nothing against yet')}</div>`}
  </article>`;
}

function exItem(it) {
  const coach = it.coach
    ? `<button type="button" class="coach-btn" data-ex="${esc(it.id)}" title="Start the live camera rep coach">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2.5" y="6" width="14" height="12" rx="3"/><path d="m16.5 10 5-3v10l-5-3"/></svg>Coach me</button>`
    : '';
  const how = it.how ? `<p class="rp-ex-how">${esc(it.how)}</p>` : '';
  return `<div class="rp-ex">
    <div class="rp-ex-head"><span class="rp-ex-name">${esc(it.name)}</span>${coach}</div>
    ${it.dose ? `<div class="rp-ex-dose">${esc(it.dose)}</div>` : ''}
    ${it.why ? `<p class="rp-ex-why">${esc(it.why)}</p>` : ''}
    ${how}
  </div>`;
}

function motionChart(summary) {
  const known = value => Number.isFinite(value) && value >= 0 && value <= 180;
  const { range, name, side, primaryMarker: mark } = summary;
  const other = side === 'R' ? 'L' : 'R';
  const sideName = side === 'R' ? 'Right' : 'Left', otherName = other === 'R' ? 'Right' : 'Left';
  let marker = '';
  if (mark) {
    const a = Math.PI + mark.elevation * Math.PI / 180;
    const x = 180 + 140 * Math.cos(a), y = 190 + 140 * Math.sin(a);
    const lx = Math.max(70, Math.min(290, x)), ly = Math.max(20, y - 25);
    const type = { pain: 'Pain', click: 'Click', pull: 'Pull', unstable: 'Unstable' }[mark.type] || 'Symptom';
    marker = `<g class="rom-marker"><title>${esc(markerText(mark).context)}</title><path d="M${x} ${y}L${lx} ${ly + 8}"/><circle cx="${x}" cy="${y}" r="4"/><rect x="${lx - 51}" y="${ly - 12}" width="102" height="23" rx="11"/><text x="${lx}" y="${ly + 4}" text-anchor="middle">${type} ${Math.round(mark.elevation)}°</text></g>`;
  }
  const value = known(range[side]) ? `${Math.round(range[side])}°` : 'Not tested';
  return `<figure class="rp-motion poster-gauge">
    <figcaption><h4>Peak arm raise</h4><span>${known(range[other]) ? `${otherName} ${Math.round(range[other])}°` : `${otherName} not tested`}</span></figcaption>
    <svg class="rom-chart" viewBox="0 0 360 230" role="img" aria-label="Range of motion, ${name.toLowerCase()}: right ${known(range.R) ? `${Math.round(range.R)}°` : 'not tested'}, left ${known(range.L) ? `${Math.round(range.L)}°` : 'not tested'}${mark ? `; symptom marked at ${Math.round(mark.elevation)} degrees` : ''}">
      <path class="rom-track" d="M40 190a140 140 0 0 1 280 0"/>
      ${known(range[side]) ? `<path class="rom-arc" pathLength="180" stroke-dasharray="${range[side]} 180" d="M40 190a140 140 0 0 1 280 0"/>` : ''}
      <text class="poster-angle" x="180" y="158" text-anchor="middle">${value}</text>
      <text class="poster-side" x="180" y="181" text-anchor="middle">${sideName} ${name.toLowerCase()}</text>
      <text x="40" y="215" text-anchor="middle">0°</text><text x="320" y="215" text-anchor="middle">180°</text>${marker}
    </svg>${known(range[side]) ? '' : '<p class="rom-note">No movement measurements recorded.</p>'}
  </figure>`;
}

function findingsTiles(report, summary) {
  const first = summary.firstSymptom;
  const tests = arr(report.testResults).filter(t => t.result);
  const test = tests.find(t => t.id === 'hawkins') || tests[0];
  const { range, name } = summary;
  const peaks = Object.values(range).filter(Number.isFinite);
  const comparison = Number.isFinite(range.R) && Number.isFinite(range.L);
  const tiles = [
    ['Pain-free range', 'Not established', 'Symptom marks alone cannot establish a pain-free range.'],
    ['First symptom angle', first ? `${Math.round(first.elevation)}°` : 'None marked', first ? `${summary.side === 'R' ? 'Right' : 'Left'} ${name.toLowerCase()}` : 'This movement · pre-exam and calibration excluded'],
    [test ? 'Test response' : comparison ? 'Side-to-side' : 'Recorded range', test ? test.result : comparison ? `${Math.round(Math.abs(range.R - range.L))}° difference` : peaks.length ? `${Math.round(Math.max(...peaks))}° ${name.toLowerCase()}` : 'Not measured', test ? test.title : comparison ? `Right ${Math.round(range.R)}° · Left ${Math.round(range.L)}°` : 'Peak recorded movement, not a diagnostic test'],
  ];
  return `<section class="rp-findings"><h4>What we found</h4><div class="rp-stat-grid">${tiles.map(([label, value, note]) => `<div class="rp-stat"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('')}</div>${report.painReconciliation ? `<p class="rp-reconciliation">${esc(report.painReconciliation)}</p>` : ''}</section>`;
}

function markerStrip(summary) {
  const groups = [[summary.name, summary.movementMarkers], ['Other exam movements', summary.otherMovements], ['Before exam', summary.beforeExam], ['Reference only', summary.references]].filter(([, marks]) => marks.length);
  const glyph = { pain: 'P', click: 'C', pull: 'L', unstable: 'U' };
  return `<section class="rp-marker-strip"><h4>Session marks <span>Elevation at press · P pain / C click / L pull / U unstable</span></h4>${groups.length ? groups.map(([title, marks]) => `<div class="rp-mark-row${title === 'Reference only' ? ' reference' : ''}">
    <h5>${esc(title)}</h5><div class="rp-pin-axis" role="img" aria-label="${esc(title)}: markers from zero to 180 degrees">
      ${marks.filter(m => Number.isFinite(m.elevation)).map((m, i) => `<span class="rp-pin${isCalibration(m) || m.retracted ? ' reference' : ''}" style="left:${Math.max(0, Math.min(180, m.elevation)) / 1.8}%;--tier:${i % 2}" title="${esc(markerText(m).label)} · ${esc(markerText(m).context)}"><b>${esc(glyph[m.type] || '·')}</b><small>${Math.round(m.elevation)}°</small></span>`).join('')}
      <span class="axis-zero">0°</span><span class="axis-middle">90°</span><span class="axis-end">180°</span></div>
    <p>${marks.map(m => { const { label, context } = markerText(m); return `<span title="${esc(context)}">${esc(label)} · ${esc(context)}</span>`; }).join('')}</p></div>`).join('') : '<p class="rp-muted">No symptom markers recorded.</p>'}
    ${summary.beforeExam.length ? '<p class="rp-marker-note">Before-exam marks are kept separately; they do not feed the exam gauge or first symptom angle.</p>' : ''}
  </section>`;
}

function reportHero(report, summary) {
  const lead = arr(report.conditions).slice().sort((a, b) => (b.p || 0) - (a.p || 0))[0];
  const title = report.nerveReferral ? 'Ask a clinician about your neck / nerves'
    : summary.headline.replace(/\s*\([^)]*\)/g, '');
  const incomplete = title === 'Incomplete screening';
  const image = /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(report.anatomySnapshot || '')
    ? `<img class="rp-anatomy-image" src="${esc(report.anatomySnapshot)}" alt="3D anatomy captured from this screening session">`
    : '<div class="rp-anatomy-empty">No anatomy snapshot saved for this session.</div>';
  const completion = report.completion;
  const imageLabel = report.anatomyCapture?.kind === 'exam-movement-peaks' ? `Recorded ${summary.name.toLowerCase()} · frontal angle illustration`
    : report.anatomyCapture?.kind === 'bilateral-forward-peaks' ? 'Saved anatomy · forward raise' : 'Session anatomy';
  return `<section class="rp-hero rp-poster">
    <div class="poster-intro"><p class="poster-eyebrow">SHOULDER SCAN / MOVEMENT STUDY</p>
    <h3 class="rp-hero-title">${esc(title)}</h3>
    <p class="poster-meta"><time>${esc(new Date(report.generatedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</time><span>·</span><span>${summary.side === 'L' ? 'Left' : 'Right'} shoulder</span><span>·</span>${completion?.simulated ? '<span class="rp-simulated">Simulated demo</span>' : '<span>Camera estimate</span>'}</p>
    <p class="rp-hero-context">${report.nerveReferral ? nerveReferral : incomplete ? `Possible: ${esc(lead?.name || 'not enough evidence yet')}. Finish the exam before drawing conclusions.` : lead?.p >= .35 ? 'A screening pattern to explore with a clinician.' : 'No clear pattern emerged. Discuss persistent symptoms with a clinician.'}</p>
    <div class="rp-hero-status">${completion && completion.completed < completion.total ? `<span>Partial exam: ${completion.completed} of ${completion.total} tests. Results are provisional.</span>` : ''}</div>
    </div><div class="rp-hero-visuals">${motionChart(summary)}
      <figure class="rp-anatomy" aria-label="${esc(imageLabel)}"><div class="rp-anatomy-plate">${image}</div></figure>
    </div>
    <p class="rp-visual-caption">${imageLabel} · orange identifies the screened shoulder, not an injury</p>
    ${findingsTiles(report, summary)}
  </section>`;
}

let printHookInstalled = false;
function markerText(m) {
  const type = { pain: 'Pain', click: 'Click', pull: 'Pull', unstable: 'Unstable' }[m.type] || m.type;
  const seconds = Math.max(0, Math.floor(m.elapsed || 0));
  return {
    label: `${m.side || ''} ${type} · ${formatValue(m.elevation)}${m.elevation == null ? '' : '°'}`.trim(),
    context: `${isCalibration(m) ? 'Calibration · reference only' : m.context || m.test || 'Free movement'}${m.retracted ? ' · withdrawn during follow-up, excluded from screening' : ''} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} ${m.phase === 'pre-exam' ? 'into session, before exam' : 'into exam'}`,
  };
}
function installPrintHook() {
  if (printHookInstalled || typeof window === 'undefined') return;
  printHookInstalled = true;
  // Closed <details> do not print their content; open everything for printing.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('#reportBody details:not([open])').forEach((d) => {
      d.setAttribute('open', '');
      d.dataset.printOpened = '1';
    });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('#reportBody details[data-print-opened]').forEach((d) => {
      d.removeAttribute('open');
      delete d.dataset.printOpened;
    });
  });
}

export function renderReport(container, report) {
  if (!container) return;
  installPrintHook();
  if (!report) {
    container.innerHTML = '<div class="report"><p class="rp-muted" style="padding:18px 0">No report yet. Finish a few exam steps first.</p></div>';
    return;
  }
  report = reportActivity(report);
  const summary = sessionSummary(report);
  const out = [];
  const completion = report.completion;
  const flags = arr(report.flags);
  if (!flags.length) out.push(reportHero(report, summary));
  else if (completion?.simulated) out.push('<p class="partial-banner">Simulated demo · Not a clinical result. Camera measurements have not been collected.</p>');

  if (flags.length) {
    const lvlName = { emergency: 'Emergency', urgent: 'Urgent', soon: 'See a doctor' };
    out.push(`<div class="rp-flags">${flags.map((f) => `<div class="rp-flag ${esc(f.level)}">${f.level === 'emergency' ? '<strong>Call emergency services now</strong><a href="tel:911">Call 911 / your local emergency number</a>' : `<strong>${esc(lvlName[f.level] || 'Get checked')}</strong>`}<span>${esc(flagText(f))}</span></div>`).join('')}</div>`);
  }

  if (report.summary && (flags.length || report.nerveReferral || summary.headline === 'Incomplete screening')) out.push(`<p class="rp-summary">${md(plain(summaryText(report)))}</p>`);

  out.push(markerStrip(summary));

  const conds = (flags.length ? [] : arr(report.conditions)).slice().sort((a, b) => (b.p || 0) - (a.p || 0));
  const drivers = flags.length ? [] : arr(report.drivers);
  if (conds.length || drivers.length) {
    const body = `<div class="rp-conds">${conds.map((c, i) => condCard(c, { top: i === 0 && c.p >= .35 })).join('')}</div>${drivers.length ? `<h4>Possible contributors</h4><p class="rp-muted">Not diagnoses. Inward-rotation deficit means less inward rotation on the sore side.</p><div class="rp-conds">${drivers.map(d => condCard(d, { driver: true })).join('')}</div>` : ''}`;
    out.push(section('Worth ruling out', body, { open: false }));
  }

  const plan = arr(report.plan).filter((ph) => arr(ph.items).length || ph.rule);
  if (plan.length && !flags.length) {
    const body = `<div class="rp-plan" id="reportPlan">${plan.map((ph) => `<div class="rp-phase">
      <span class="rp-phase-num">${esc(ph.phase)}</span>
      <div class="rp-phase-title">${esc(phaseTitle(ph))}</div>
      ${ph.rule ? `<p class="rp-phase-rule">${esc(ph.rule)}</p>` : ''}
      <div class="rp-exs">${arr(ph.items).map(exItem).join('')}</div>
    </div>`).join('')}</div>`;
    out.push(section('Movement plan', body, { open: false }));
  }

  const serve = (flags.length ? [] : arr(report.serve)).map(txt).filter(Boolean);
  const next = (flags.length ? [] : arr(report.next)).map(txt).filter(Boolean);
  if (next.length || serve.length) out.push(section('Next steps', `<ol class="rp-list">${next.map((s) => `<li>${md(s)}</li>`).join('')}</ol>${serve.length ? `<h4>Overhead sport</h4><ul class="rp-list">${serve.map(s => `<li>${md(s)}</li>`).join('')}</ul>` : ''}${plan.length ? '<button class="btn rp-plan-link" type="button">Open movement plan</button>' : ''}`, { open: false }));

  out.push(`<p class="rp-foot">Screening aid, not a diagnosis. ${completion?.simulated ? 'Demo motion and angles are simulated, not clinical measurements.' : 'Camera angles are estimates, not clinical measurements.'} See a sports-medicine doctor or physiotherapist in person for injuries, severe or worsening pain, weakness, numbness, or instability.<br>Bones: BodyParts3D © DBCLS · CC BY-SA 2.1 JP</p>`);

  container.innerHTML = `<div class="report">${flags.length ? `<div class="print-brand">Shoulder Scan · ${esc(reportDate(report.generatedAt))}</div>` : ''}${out.join('')}</div>`;
}

export function reportToText(report) {
  if (!report) return '';
  report = reportActivity(report);
  const L = [];
  const side = report.side === 'L' ? 'Left' : report.side === 'R' ? 'Right' : '';
  L.push('SHOULDER SCAN REPORT');
  const meta = [side && `${side} shoulder`, report.generatedAt && reportDate(report.generatedAt)].filter(Boolean);
  if (meta.length) L.push(meta.join(' · '));
  L.push('');
  const flags = arr(report.flags);
  if (flags.length) {
    L.push('!! RED FLAGS');
    if (flags.some(f => f.level === 'emergency')) L.push('Call emergency services now. Call 911 / your local emergency number.');
    flags.forEach((f) => L.push(`  [${String(f.level || '').toUpperCase()}] ${flagText(f)}`));
    L.push('');
  }
  if (report.summary) L.push('SUMMARY', stripMd(summaryText(report)), '');
  if (report.nerveReferral) L.push(nerveReferral, '');
  if (report.completion?.completed < report.completion?.total) L.push(`Partial exam: ${report.completion.completed} of ${report.completion.total} tests. Results are provisional.`, '');
  if (report.completion?.simulated) L.push('Simulated demo — not a clinical result.', '');
  const conds = (flags.length ? [] : arr(report.conditions)).slice().sort((a, b) => (b.p || 0) - (a.p || 0));
  if (conds.length) {
    L.push('WHAT IT COULD BE');
    conds.forEach((c) => {
      L.push(`- ${c.name} — ${strength(c.p)} evidence`);
      if (c.blurb) L.push(`    ${c.blurb}`);
      arr(c.for).map(txt).forEach((t) => L.push(`    + ${t}`));
      arr(c.against).map(txt).forEach((t) => L.push(`    - ${t}`));
    });
    L.push('');
  }
  const drivers = flags.length ? [] : arr(report.drivers);
  if (drivers.length) {
    L.push('LIKELY DRIVERS');
    drivers.forEach((d) => L.push(`- ${d.name} — ${strength(d.p)} evidence${d.blurb ? ': ' + d.blurb : ''}`));
    L.push('');
  }
  L.push('YOUR MARKERS');
  if (!arr(report.markers).length) L.push('No symptom markers recorded.');
  arr(report.markers).forEach(m => { const { label, context } = markerText(m); L.push(`- ${label} · ${context}`); });
  L.push('');
  const plan = arr(report.flags).length ? [] : arr(report.plan);
  if (plan.length) {
    L.push('WHAT TO DO NEXT');
    plan.forEach((ph) => {
      L.push(phaseTitle(ph));
      if (ph.rule) L.push(`  Rule: ${ph.rule}`);
      arr(ph.items).forEach((it) => {
        L.push(`  • ${it.name}${it.dose ? ' — ' + it.dose : ''}${it.coach ? ' [webcam coach]' : ''}`);
        if (it.why) L.push(`      Why: ${it.why}`);
        if (it.how) L.push(`      How: ${it.how}`);
      });
    });
    L.push('');
  }
  const lists = [['SERVE MODIFICATIONS', flags.length ? [] : report.serve], ['NEXT STEPS', flags.length ? [] : report.next], ['WHAT WE FOUND', report.found]];
  lists.forEach(([title, items]) => {
    const a = arr(items).map(txt).filter(Boolean);
    if (!a.length) return;
    L.push(title);
    a.forEach((t) => L.push(`- ${stripMd(t)}`));
    L.push('');
  });
  L.push('Educational tool — not a medical diagnosis.');
  return L.join('\n');
}

export function downloadJSON(obj, filename = 'shoulder-report.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}
