const hasWindow = typeof window !== 'undefined';
const synth = hasWindow ? window.speechSynthesis : undefined;
const SR = hasWindow ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
const VOICE_PREFS = ['Samantha', 'Google US English', 'Daniel', 'Karen', 'Natural'];
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'my', 'it', 'is', 'i', 'at', 'with', 'for', 'when']);
const NUMS = {
  one: 1, first: 1, '1': 1, '1st': 1, two: 2, second: 2, '2': 2, '2nd': 2, to: 2, too: 2,
  three: 3, third: 3, '3': 3, '3rd': 3, four: 4, fourth: 4, for: 4, '4': 4, '4th': 4,
  five: 5, fifth: 5, '5': 5, '5th': 5, six: 6, sixth: 6, '6': 6, '6th': 6,
  seven: 7, seventh: 7, '7': 7, eight: 8, eighth: 8, '8': 8, nine: 9, ninth: 9, '9': 9,
};
const ORDINALS = new Set(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', '1st', '2nd', '3rd', '4th', '5th', '6th']);
const PLAIN_NUMS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const hasPhrase = (n, phrase) => {
  const p = norm(phrase);
  return p.trim() !== '' && n.includes(p);
};
const firstIndex = (n, phrases) => {
  let best = -1;
  for (const ph of phrases) {
    const i = n.indexOf(norm(ph));
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
};

function cleanForSpeech(text) {
  return String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|[.,!?;:]|$)/g, '$1')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1].length + p.length) < 160) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

let cachedVoice = null;
function pickVoice() {
  if (!synth) return null;
  if (cachedVoice) return cachedVoice;
  const voices = synth.getVoices() || [];
  if (!voices.length) return null;
  for (const pref of VOICE_PREFS) {
    const v = voices.find((x) => x.name.includes(pref) && /^en/i.test(x.lang));
    if (v) return (cachedVoice = v);
  }
  return (cachedVoice = voices.find((x) => /^en-US/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang)) || null);
}
if (synth) {
  synth.addEventListener?.('voiceschanged', () => { cachedVoice = null; pickVoice(); });
  pickVoice();
}

function readEnabled() {
  try { return localStorage.getItem('ss.voice') !== '0'; } catch { return true; }
}

const pending = new Set();
let keepAlive = [];
let rec = null;
let recStop = null;

export const voice = {
  ttsSupported: !!(synth && hasWindow && window.SpeechSynthesisUtterance),
  sttSupported: !!SR,
  enabled: readEnabled(),

  setEnabled(b) {
    this.enabled = !!b;
    try { localStorage.setItem('ss.voice', this.enabled ? '1' : '0'); } catch {}
    if (!this.enabled) this.cancel();
  },

  speak(text, { interrupt = true } = {}) {
    const clean = cleanForSpeech(text);
    if (!this.enabled || !this.ttsSupported || !clean) return Promise.resolve();
    if (interrupt) this.cancel();
    const chunks = splitSentences(clean);
    return new Promise((resolve) => {
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pending.delete(finish);
        keepAlive = keepAlive.filter((u) => !utts.includes(u));
        resolve();
      };
      pending.add(finish);
      const v = pickVoice();
      const utts = chunks.map((c) => {
        const u = new SpeechSynthesisUtterance(c);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
        u.rate = 1.02;
        return u;
      });
      const last = utts[utts.length - 1];
      last.onend = finish;
      for (const u of utts) u.onerror = finish;
      keepAlive.push(...utts);
      const words = clean.split(/\s+/).length;
      const arm = () => { clearTimeout(timer); timer = setTimeout(finish, 4000 + words * 600); };
      utts[0].onstart = arm;
      timer = setTimeout(finish, 15000 + words * 600);
      if (synth.paused) synth.resume();
      for (const u of utts) synth.speak(u);
    });
  },

  cancel() {
    if (synth) synth.cancel();
    for (const f of [...pending]) f();
    keepAlive = [];
  },

  get speaking() { return !!synth?.speaking || pending.size > 0; },

  listen({ onPartial, onFinal, onEnd, continuous = false } = {}) {
    if (!SR) {
      queueMicrotask(() => onEnd?.({ error: 'unsupported' }));
      return () => {};
    }
    this.cancel();
    this.stopListening();
    let stopped = false;
    let lastError = null;
    let r;
    const start = () => {
      r = new SR();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = continuous;
      r.maxAlternatives = 1;
      r.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) { if (txt.trim()) onFinal?.(txt.trim(), res[0]?.confidence ?? 1); } else interim += txt;
        }
        if (interim.trim()) onPartial?.(interim.trim());
      };
      r.onerror = (ev) => { lastError = ev.error || 'error'; };
      r.onend = () => {
        const fatal = lastError && lastError !== 'no-speech' && lastError !== 'aborted';
        if (continuous && !stopped && !fatal) {
          lastError = null;
          try { start(); return; } catch {}
        }
        if (rec === r) { rec = null; recStop = null; }
        onEnd?.({ error: lastError });
      };
      rec = r;
      r.start();
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { r?.stop(); } catch {}
    };
    recStop = stop;
    try { start(); } catch (e) {
      rec = null;
      recStop = null;
      queueMicrotask(() => onEnd?.({ error: e?.message || 'start-failed' }));
    }
    return stop;
  },

  stopListening() {
    const s = recStop;
    recStop = null;
    if (s) s();
  },

  get listening() { return !!rec; },

  matchOption(transcript, opts) {
    const n = norm(transcript);
    const toks = n.trim().split(' ').filter(Boolean);
    if (!toks.length || !opts?.length) return -1;
    const tokSet = new Set(toks);
    const scores = opts.map(() => 0);
    const bump = (idx, s) => { if (idx >= 0 && idx < scores.length) scores[idx] += s; };

    for (let i = 0; i < toks.length - 1; i++) {
      if (/^(option|number|choice|answer)$/.test(toks[i]) && NUMS[toks[i + 1]]) bump(NUMS[toks[i + 1]] - 1, 10);
    }
    for (const t of toks) if (ORDINALS.has(t)) bump(NUMS[t] - 1, 4);
    const content = toks.filter((t) => !STOP.has(t) && !/^(um|uh|please|okay|ok)$/.test(t));
    if (content.length === 1 && PLAIN_NUMS.has(content[0])) bump(NUMS[content[0]] - 1, 4);

    opts.forEach((o, i) => {
      const label = norm(o.label);
      if (label.trim()) {
        if (label === n) scores[i] += 10;
        else if (n.includes(label)) scores[i] += 5;
      }
      if (o.kw) for (const ph of String(o.kw).split('|')) if (hasPhrase(n, ph)) scores[i] += 2;
      for (const lt of new Set(label.trim().split(' '))) {
        if (lt.length > 1 && !STOP.has(lt) && tokSet.has(lt)) scores[i] += 1;
      }
    });

    const max = Math.max(...scores);
    if (max <= 0) return -1;
    const best = scores.indexOf(max);
    return scores.indexOf(max, best + 1) === -1 ? best : -1;
  },

  matchYesNo(transcript) {
    const n = norm(transcript);
    const no = firstIndex(n, ['no', 'nope', 'nah', 'not really', 'negative', 'not at all', 'it does not', 'it doesnt', 'it didnt', 'i dont', 'i do not', 'incorrect', 'never']);
    const yes = firstIndex(n, ['yes', 'yeah', 'yep', 'yup', 'correct', 'it does', 'sure', 'absolutely', 'definitely', 'affirmative', 'uh huh', 'i do', 'that is right', 'thats right']);
    if (no < 0 && yes < 0) return null;
    if (no >= 0 && (yes < 0 || no <= yes)) return 'no';
    return 'yes';
  },
};

const MARKERS = [
  ['pain', ['pain', 'painful', 'hurts', 'hurt', 'hurting', 'ouch', 'ow', 'ouch that hurts', 'sore']],
  ['stop', ['stop', 'pause', 'wait']],
  ['unstable', ['unstable', 'slip', 'slips', 'slipping', 'slipped', 'loose', 'shift', 'shifts', 'shifting', 'shifted', 'giving way', 'gave way', 'dislocate', 'subluxing']],
  ['click', ['click', 'clicks', 'clicked', 'clicking', 'pop', 'pops', 'popped', 'popping', 'clunk', 'clunked', 'snap', 'snapped', 'snapping', 'crack', 'cracked', 'grind', 'grinding']],
  ['pull', ['pull', 'pulls', 'pulling', 'tight', 'tightness', 'stretch', 'stretches', 'stretching', 'stiff']],
  ['repeat', ['repeat', 'again', 'say that again', 'come again', 'what was that', 'pardon']],
  ['skip', ['skip', 'skip it', 'skip this']],
  ['next', ['next', 'ok next', 'okay next', 'done', 'finished', 'im done', 'go on', 'continue', 'move on']],
];

export function parseMarkerCommand(transcript) {
  const n = norm(transcript);
  if (!n.trim()) return null;
  for (const [cmd, phrases] of MARKERS) if (phrases.some((p) => hasPhrase(n, p))) return cmd;
  return null;
}
