// Report rendering: HTML view, plain-text export, JSON download. No external deps.
import { phaseTitle, formatValue, reportDate, reportHeadline, displayReport, activityCopy } from './experience.js';
import { MARK_PATHS } from './marker-icons.js';

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
  const how = it.how ? `<details><summary>How to do it</summary><p>${esc(it.how)}</p></details>` : '';
  return `<div class="rp-ex">
    <div class="rp-ex-head"><span class="rp-ex-name">${esc(it.name)}</span>${coach}</div>
    ${it.dose ? `<div class="rp-ex-dose">${esc(it.dose)}</div>` : ''}
    ${it.why ? `<p class="rp-ex-why">${esc(it.why)}</p>` : ''}
    ${how}
  </div>`;
}

function motionRange(motion = {}) {
  const forward = motion.forward || {}, side = motion.side || {};
  const useSide = ![forward.R, forward.L].some(Number.isFinite) && [side.R, side.L].some(Number.isFinite);
  return { range: useSide ? side : forward, name: useSide ? 'Side raise' : 'Forward raise' };
}
function motionChart(motion = {}, simulated = false) {
  const known = value => Number.isFinite(value) && value >= 0 && value <= 180;
  const { range, name } = motionRange(motion);
  const value = side => known(range[side]) ? `${Math.round(range[side])}°` : 'Not tested';
  const reading = side => `<strong${known(range[side]) ? '' : ' class="rom-untested"'}>${value(side)}</strong>`;
  const arcs = ['R', 'L'].map((side, i) => {
    const r = 132 - i * 22, angle = Math.PI + (range[side] || 0) * Math.PI / 180;
    return `<path class="rom-track" d="M${180 - r} 150a${r} ${r} 0 0 1 ${r * 2} 0"/>
      ${known(range[side]) ? `<path class="rom-arc ${side}" pathLength="180" stroke-dasharray="${range[side]} 180" d="M${180 - r} 150a${r} ${r} 0 0 1 ${r * 2} 0"/><circle class="rom-end ${side}" cx="${180 + r * Math.cos(angle)}" cy="${150 + r * Math.sin(angle)}" r="4"/>` : ''}`;
  }).join('');
  const ticks = [0, 45, 90, 135, 180].map(deg => {
    const a = Math.PI + deg * Math.PI / 180;
    return `<path class="rom-tick" d="M${180 + 143 * Math.cos(a)} ${150 + 143 * Math.sin(a)}l${6 * Math.cos(a)} ${6 * Math.sin(a)}"/>`;
  }).join('');
  const missing = ![range.R, range.L].some(known);
  return `<figure class="rp-motion">
    <figcaption><h4>Range of motion</h4><span>${simulated ? 'Simulated · ' : ''}${name.toLowerCase()}</span></figcaption>
    <svg class="rom-chart" viewBox="0 0 360 172" role="img" aria-label="Range of motion, ${name.toLowerCase()}: right ${value('R')}, left ${value('L')}">
      ${ticks}${arcs}<text x="48" y="169" text-anchor="middle">0°</text><text x="312" y="169" text-anchor="middle">180°</text>
    </svg>
    <div class="rom-values"><div><span class="rom-side R">R · Right</span>${reading('R')}</div><div><span class="rom-side L">L · Left</span>${reading('L')}</div></div>
    <p class="rom-note">${missing ? 'No movement measurements recorded.' : `Peak elevation during ${name.toLowerCase()}s.`}</p>
  </figure>`;
}

function findingsTiles(report) {
  const motion = report.motion || {};
  const peaks = ['R', 'L'].map(s => [motion.forward?.[s], motion.side?.[s]].filter(Number.isFinite));
  const values = Object.values(motionRange(motion).range).filter(Number.isFinite);
  const lead = Math.max(0, ...arr(report.conditions).map(c => Number(c.p) || 0));
  const sides = peaks.map((v, i) => v.length ? ['Right', 'Left'][i] : null).filter(Boolean);
  const tiles = [
    [report.completion?.simulated ? 'Simulated peak raise' : 'Peak arm raise', values.length ? `${Math.round(Math.max(...values))}°` : 'Not tested'],
    ['Symptom markers', String(arr(report.markers).length)],
    ['Pattern strength', strength(lead)],
    ['Side tested', sides.join(' + ') || 'Not tested'],
  ];
  return `<section class="rp-findings"><h4>What we found</h4><div class="rp-stat-grid">${tiles.map(([label, value]) => `<div class="rp-stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>${report.painReconciliation ? `<p class="rp-reconciliation">${esc(report.painReconciliation)}</p>` : ''}</section>`;
}

function markerTimeline(markers) {
  const known = markers.filter(m => Number.isFinite(m.elevation));
  if (!known.length) return '';
  return `<figure class="rp-marker-timeline"><figcaption>Symptoms by arm angle <span>Elevation · moment of press</span></figcaption><svg viewBox="0 0 640 94" role="img" aria-label="Symptom markers on an elevation axis, from zero to 180 degrees">
    <path class="marker-axis" d="M24 49H616"/>${[0, 45, 90, 135, 180].map(a => `<path class="marker-axis" d="M${24 + a / 180 * 592} 45v8"/><text x="${24 + a / 180 * 592}" y="80" text-anchor="middle">${a}°</text>`).join('')}
    ${known.map((m, i) => {
      const x = 24 + Math.max(0, Math.min(180, m.elevation)) / 180 * 592, y = i % 2 ? 31 : 9;
      return `<g><title>${esc(markerText(m).label)} · ${esc(markerText(m).context)}</title><path class="marker-stem" d="M${x} ${y + 22}V49"/><svg x="${x - 10}" y="${y}" width="20" height="20" viewBox="0 0 24 24"><path class="marker-glyph" d="${MARK_PATHS[m.type] || MARK_PATHS.pain}"/></svg></g>`;
    }).join('')}</svg></figure>`;
}

function reportHero(report) {
  const lead = arr(report.conditions).slice().sort((a, b) => (b.p || 0) - (a.p || 0))[0];
  const title = report.nerveReferral ? 'Ask a clinician about your neck / nerves'
    : reportHeadline(report).replace(/\s*\([^)]*\)/g, '');
  const incomplete = title === 'Incomplete screening';
  const image = /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(report.anatomySnapshot || '')
    ? `<img class="rp-anatomy-image" src="${esc(report.anatomySnapshot)}" alt="3D anatomy captured from this screening session">`
    : '<div class="rp-anatomy-empty">No anatomy snapshot saved for this session.</div>';
  const completion = report.completion;
  const imageLabel = report.anatomyCapture?.kind === 'bilateral-forward-peaks' ? 'Forward raise · composite of recorded peaks' : 'Session anatomy';
  return `<section class="rp-hero">
    <div class="rp-brand"><svg viewBox="0 0 32 32" width="23" height="23" aria-hidden="true"><circle cx="9" cy="23" r="7"/><circle cx="23" cy="9" r="7"/></svg><span>Shoulder Scan</span><time>${esc(new Date(report.generatedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</time></div>
    <h3 class="rp-hero-title">${esc(title)}</h3>
    <p class="rp-hero-context">${report.nerveReferral ? nerveReferral : incomplete ? `Possible: ${esc(lead?.name || 'not enough evidence yet')}. Finish the exam before drawing conclusions.` : lead?.p >= .35 ? 'A screening finding to explore with a clinician, not a diagnosis.' : 'The screen is inconclusive. A clinician can help you understand your symptoms.'}</p>
    <div class="rp-hero-status">${completion?.simulated ? '<span class="rp-simulated">Simulated demo · Not a clinical result</span>' : '<span>Camera angles are estimates</span>'}${completion && completion.completed < completion.total ? `<span>Partial exam: ${completion.completed} of ${completion.total} tests. Results are provisional.</span>` : ''}</div>
    <div class="rp-hero-visuals">${motionChart(report.motion, completion?.simulated)}
      <figure class="rp-anatomy"><div class="rp-anatomy-plate">${image}</div><figcaption>${imageLabel}${completion?.simulated ? ' · simulated' : ''}</figcaption></figure>
    </div>
    <p class="rp-hero-credit">Screening aid, not a diagnosis.</p>
  </section>`;
}

let printHookInstalled = false;
function markerText(m) {
  const type = { pain: 'Pain', click: 'Click', pull: 'Pull', unstable: 'Unstable' }[m.type] || m.type;
  const seconds = Math.max(0, Math.floor(m.elapsed || 0));
  return {
    label: `${m.side || ''} ${type} · ${formatValue(m.elevation)}${m.elevation == null ? '' : '°'}`.trim(),
    context: `${m.test || 'Free movement'} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} into exam`,
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
  const out = [];
  const completion = report.completion;
  const flags = arr(report.flags);
  if (!flags.length) out.push(reportHero(report));
  else if (completion?.simulated) out.push('<p class="partial-banner">Simulated demo · Not a clinical result. Camera measurements have not been collected.</p>');

  if (flags.length) {
    const lvlName = { emergency: 'Emergency', urgent: 'Urgent', soon: 'See a doctor' };
    out.push(`<div class="rp-flags">${flags.map((f) => `<div class="rp-flag ${esc(f.level)}">${f.level === 'emergency' ? '<strong>Call emergency services now</strong><a href="tel:911">Call 911 / your local emergency number</a>' : `<strong>${esc(lvlName[f.level] || 'Get checked')}</strong>`}<span>${esc(flagText(f))}</span></div>`).join('')}</div>`);
  }

  if (!flags.length) out.push(findingsTiles(report));
  if (report.summary && (flags.length || report.nerveReferral || reportHeadline(report) === 'Incomplete screening')) out.push(section('Screening context', `<p class="rp-summary">${md(plain(summaryText(report)))}</p>`));

  const conds = (flags.length ? [] : arr(report.conditions)).slice().sort((a, b) => (b.p || 0) - (a.p || 0));
  if (conds.length) {
    const main = conds.filter((c) => (c.p || 0) >= 0.35);
    const shown = main.length ? main.slice(0, 3) : conds.slice(0, 1);
    const rest = conds.filter((c) => !shown.includes(c));
    let body = `<div class="rp-conds">${shown.map((c, i) => condCard(c, { top: i === 0 })).join('')}</div>`;
    if (rest.length) {
      body += `<details class="rp-sec rp-more"><summary><span>${rest.length} less likely condition${rest.length > 1 ? 's' : ''}</span></summary><div class="rp-conds">${rest.map((c) => condCard(c)).join('')}</div></details>`;
    }
    out.push(section(main.length ? 'What it could be' : 'Worth ruling out', body));
  }

  const drivers = (flags.length ? [] : arr(report.drivers)).slice().sort((a, b) => (b.p || 0) - (a.p || 0));
  if (drivers.length) {
    out.push(section('Likely drivers', `<p class="rp-muted" style="margin:0 0 8px">Not diagnoses — the reasons the tissue got overloaded. GIRD / IR deficit means less inward rotation on the sore side than the other side.</p><div class="rp-conds">${drivers.map((d) => condCard(d, { driver: true })).join('')}</div>`, { open: false, count: drivers.length }));
  }

  const markers = arr(report.markers).slice().sort((a, b) => (a.elapsed || 0) - (b.elapsed || 0));
  out.push(section('Your markers', markers.length ? `${markerTimeline(markers)}<ul class="rp-markers">${markers.map(m => {
    const { label, context } = markerText(m);
    return `<li><strong>${esc(label)}</strong><span>${esc(context)}</span></li>`;
  }).join('')}</ul>` : '<p class="rp-muted">No symptom markers recorded.</p>', { count: markers.length }));

  const plan = arr(report.plan).filter((ph) => arr(ph.items).length || ph.rule);
  if (plan.length && !flags.length) {
    const body = `<div class="rp-plan">${plan.map((ph) => `<div class="rp-phase">
      <span class="rp-phase-num">${esc(ph.phase)}</span>
      <div class="rp-phase-title">${esc(phaseTitle(ph))}</div>
      ${ph.rule ? `<p class="rp-phase-rule">${esc(ph.rule)}</p>` : ''}
      <div class="rp-exs">${arr(ph.items).map(exItem).join('')}</div>
    </div>`).join('')}</div>`;
    out.push(section((conds[0]?.p || 0) < .35 ? 'General movement plan' : 'Rehab plan', body, { open: (conds[0]?.p || 0) >= .5 && !completion?.simulated && completion?.completed >= completion?.total }));
  }

  const serve = (flags.length ? [] : arr(report.serve)).map(txt).filter(Boolean);
  if (serve.length) out.push(section('Serve modifications', `<ul class="rp-list">${serve.map((s) => `<li>${md(s)}</li>`).join('')}</ul>`, { open: false, count: serve.length }));

  const next = (flags.length ? [] : arr(report.next)).map(txt).filter(Boolean);
  if (next.length) out.push(section('Next steps', `<ol class="rp-list">${next.map((s) => `<li>${md(s)}</li>`).join('')}</ol>`));

  out.push(`<p class="rp-foot">${completion?.simulated ? 'Demo motion and angles are simulated, not clinical measurements.' : 'Educational screening from a conversation and camera, not a medical diagnosis. Camera angles are estimates, not clinical measurements.'} See a sports-medicine doctor or physiotherapist in person for injuries, severe or worsening pain, weakness, numbness, or instability.<br>Bones: BodyParts3D © DBCLS · CC BY-SA 2.1 JP</p>`);

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
