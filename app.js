import { $, el, esc } from './ui.js';
import neo from './tests/neo.js';
import riasec from './tests/riasec.js';
import dass from './tests/dass.js';
import rse from './tests/rse.js';
import ecr from './tests/ecr.js';
import dark from './tests/dark.js';

const TESTS = [neo, rse, ecr, riasec, dark, dass];
const byId = Object.fromEntries(TESTS.map((t) => [t.id, t]));
const keyFor = (t) => t.storageKey || `pt.v1.${t.id}`;

const PER_PAGE = 10;
const AGE_LABEL = {
  '-20': 'aged 20 or under', '21-30': 'aged 21–30', '31-40': 'aged 31–40',
  '41-50': 'aged 41–50', '51+': 'aged 51 or over',
};

let test = null, items = [], norms = null;
let st = { sex: '1', age: 30, responses: {}, page: 0, mode: 'self' };

const save = () => { try { localStorage.setItem(keyFor(test), JSON.stringify(st)); } catch { /* full or blocked */ } };
const loadState = (t) => { try { return JSON.parse(localStorage.getItem(keyFor(t)) || 'null'); } catch { return null; } };

function bandFor(age) {
  const a = +age;
  return a <= 20 ? '-20' : a <= 30 ? '21-30' : a <= 40 ? '31-40' : a <= 50 ? '41-50' : '51+';
}
function groupKey(s) {
  const k = `${s.sex}|${bandFor(s.age)}`;
  return norms.groups[k] ? k : 'total';
}
function groupLabel(s) {
  const k = groupKey(s);
  if (k === 'total') return `all ${norms.groups.total.n.toLocaleString()} respondents`;
  const [sx, bd] = k.split('|');
  return `${norms.groups[k].n.toLocaleString()} ${sx === '1' ? 'men' : 'women'} ${AGE_LABEL[bd]}`;
}

function show(id, crumb = '') {
  for (const s of document.querySelectorAll('section')) s.classList.add('hide');
  $('#s-' + id).classList.remove('hide');
  $('#crumb').textContent = crumb;
  window.scrollTo(0, 0);
}

/* ── home ──────────────────────────────────────────────────────── */
function renderHome() {
  const box = $('#tests');
  box.textContent = '';
  for (const t of TESTS) {
    const card = el('div', 'card');
    card.dataset.test = t.id;
    card.append(el('h3', null, esc(t.name)));
    card.append(el('div', 'sub', esc(t.sub)));
    card.append(el('p', null, esc(t.blurb)));
    const row = el('div', 'row');
    const start = el('button', 'primary', 'Start');
    start.onclick = () => open(t);
    row.append(start);
    const s = loadState(t);
    const n = s && s.responses ? Object.keys(s.responses).length : 0;
    if (n) {
      const b = el('button', null, s.at && n >= (s.total || 0) ? 'Last result' : `Resume (${n} answered)`);
      b.onclick = () => open(t, s);
      row.append(b);
    }
    card.append(row);
    box.append(card);
  }
}

/* ── loading ───────────────────────────────────────────────────── */
async function open(t, resume) {
  test = t;
  $('#crumb').textContent = 'Loading…';
  try {
    [items, norms] = await Promise.all([
      fetch(t.paths.items).then((r) => r.json()),
      fetch(t.paths.norms).then((r) => r.json()),
    ]);
  } catch {
    items = norms = null;
    $('#crumb').textContent = '';
    alert(`Could not load the data for ${t.name}. Check your connection and try again.`);
    return;
  }
  $('#setup-title').textContent = t.name;
  $('#setup-sub').textContent = t.sub;
  $('#mode-box').classList.toggle('hide', !t.informant);
  $('#care-box').classList.toggle('hide', !t.care);
  if (resume) {
    st = resume;
    if (Object.keys(st.responses).length === items.length) return finish(st);
    show('test');
    return renderPage();
  }
  st = { sex: '1', age: 30, responses: {}, page: 0, mode: 'self' };
  $('#mode').value = 'self';
  onMode();
  info();
  show('setup', t.name);
}

/* ── questionnaire ─────────────────────────────────────────────── */
const pageItems = () => items.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE);
const pageCount = () => Math.ceil(items.length / PER_PAGE);
const answered = () => Object.keys(st.responses).length;
const anchors = () => (st.mode === 'informant' && test.informant ? test.informant.anchors : test.anchors);
const itemText = (it) => (st.mode === 'informant' && it.third ? it.third : it.text);

function renderPage() {
  const box = $('#qs');
  box.textContent = '';
  const a = anchors();
  $('#prompt').textContent = st.mode === 'informant' && test.informant ? test.informant.prompt : test.prompt;
  for (const it of pageItems()) {
    const q = el('div', 'q');
    q.dataset.seq = it.seq;
    q.append(el('div', 'txt', `<b>${it.seq}</b>${esc(itemText(it).replace(/\.$/, ''))}`));
    const sc = el('div', 'scale' + (a.length === 4 ? ' four' : ''));
    for (let v = 1; v <= a.length; v++) {
      const lab = el('label');
      lab.innerHTML = `<input type="radio" name="q${it.seq}" value="${v}"${st.responses[it.seq] === v ? ' checked' : ''}>`
        + `<span><span class="n">${v}</span>${esc(a[v - 1])}</span>`;
      lab.querySelector('input').addEventListener('change', () => { st.responses[it.seq] = v; save(); sync(); });
      sc.append(lab);
    }
    q.append(sc);
    box.append(q);
  }
  sync();
}

function sync() {
  const done = pageItems().every((i) => st.responses[i.seq]);
  $('#next').disabled = !done;
  $('#next').textContent = st.page === pageCount() - 1 ? 'See results' : 'Next';
  $('#prev').disabled = st.page === 0;
  const pct = (answered() / items.length) * 100;
  $('#bar').style.width = pct + '%';
  $('#count').textContent = `${answered()} of ${items.length} answered · page ${st.page + 1} of ${pageCount()}`;
  $('#crumb').textContent = `${Math.round(pct)}%`;
}

document.addEventListener('keydown', (e) => {
  if (!test || $('#s-test').classList.contains('hide')) return;
  const max = anchors().length;
  if (!/^[1-9]$/.test(e.key) || +e.key > max) return;
  if (e.target.matches('input[type=number],select,textarea')) return;
  const next = pageItems().find((i) => !st.responses[i.seq]);
  if (!next) return;
  st.responses[next.seq] = +e.key;
  save();
  const inp = document.querySelector(`input[name=q${next.seq}][value="${e.key}"]`);
  if (inp) { inp.checked = true; inp.closest('.q').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  sync();
});

/* ── report ────────────────────────────────────────────────────── */
let current = null;

async function finish(state) {
  const r = await test.score(items, state.responses, norms, groupKey(state));
  current = r;
  $('#rpt').textContent = '';
  $('#rpt').append(test.report(r, { groupLabel: groupLabel(state), norms, meta: state }));
  $('#cmp').classList.toggle('hide', !test.compare);
  show('report', 'Report');
  return r;
}

function payload() {
  return {
    app: 'openpsych', test: test.id, version: 2, at: Date.now(),
    sex: st.sex, age: st.age, mode: st.mode, subject: st.subject, responses: st.responses,
  };
}

function readResult(file, then) {
  const fr = new FileReader();
  fr.onload = () => {
    let d;
    try { d = JSON.parse(fr.result); } catch { d = null; }
    if (!d || !d.responses || typeof d.responses !== 'object') {
      alert('That file is not a result exported from this app.');
      return;
    }
    then(d);
  };
  fr.readAsText(file);
}

/** Validate a parsed result against the test currently loaded. */
function matchesLoaded(d) {
  if (d.test && d.test !== test.id) {
    alert(`That file is a ${TESTS.find((t) => t.id === d.test)?.name || 'different'} result, not ${test.name}.`);
    return false;
  }
  if (Object.keys(d.responses).length !== items.length) {
    alert('That file is not a complete set of answers for this test.');
    return false;
  }
  return true;
}

/* ── wiring ────────────────────────────────────────────────────── */
$('#theme').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  $('#theme').textContent = dark ? 'Dark' : 'Light';
  try { localStorage.setItem('pt.theme', dark ? 'light' : 'dark'); } catch { /* blocked */ }
};

const info = () => {
  $('#groupinfo').innerHTML = `Compared against <b>${groupLabel({ sex: $('#sex').value, age: $('#age').value })}</b>.`;
};
function onMode() {
  const obs = $('#mode').value === 'informant';
  $('#subject-box').classList.toggle('hide', !obs);
  $('#demo-label').textContent = obs ? 'About the person you are rating' : 'About you';
}
$('#mode').onchange = onMode;
$('#sex').onchange = info;
$('#age').oninput = info;

$('#home').onclick = () => { renderHome(); show('home'); };
$('#back-home').onclick = () => { renderHome(); show('home'); };

$('#start').onclick = () => {
  st = {
    sex: $('#sex').value, age: +$('#age').value, responses: {}, page: 0,
    mode: test.informant ? $('#mode').value : 'self',
    subject: $('#subject').value.trim() || null,
    total: items.length,
  };
  save();
  show('test', '0%');
  renderPage();
};

$('#next').onclick = () => {
  if (st.page === pageCount() - 1) { st.at = Date.now(); save(); finish(st); return; }
  st.page++; save(); renderPage();
};
$('#prev').onclick = () => { st.page--; save(); renderPage(); };
$('#quit').onclick = () => { save(); renderHome(); show('home'); };

$('#print').onclick = () => window.print();
$('#save').onclick = () => {
  const b = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(b);
  a.download = `${test.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#wipe').onclick = () => {
  if (!confirm('Erase your answers and results for every test in this browser? This cannot be undone.')) return;
  for (const t of TESTS) { try { localStorage.removeItem(keyFor(t)); } catch { /* blocked */ } }
  renderHome();
  show('home');
};

$('#loadfile').onclick = () => $('#file').click();
$('#file').onchange = (e) => e.target.files[0] && readResult(e.target.files[0], async (d) => {
  const t = TESTS.find((x) => x.id === (d.test || 'neo'));
  if (!t) { alert('That file is from a test this app no longer has.'); return; }
  await open(t, { sex: '1', age: 30, page: 0, mode: 'self', ...d, responses: d.responses });
  if (!matchesLoaded(d)) { renderHome(); show('home'); }
});

$('#cmp').onclick = () => $('#cmpfile').click();
$('#cmpfile').onchange = (e) => e.target.files[0] && readResult(e.target.files[0], async (d) => {
  if (!matchesLoaded(d)) return;
  const b = await test.score(items, d.responses, norms, groupKey(d));
  const mine = st.mode === 'informant' ? 'Informant' : 'Self';
  const theirs = d.mode === 'informant' ? 'Informant' : 'Self';
  $('#rpt').append(test.compare(current, b, [mine, theirs === mine ? theirs + ' (file)' : theirs]));
  $('#rpt').lastChild.scrollIntoView({ behavior: 'smooth' });
});

/* ── boot ──────────────────────────────────────────────────────── */
try {
  if (localStorage.getItem('pt.theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    $('#theme').textContent = 'Light';
  }
} catch { /* blocked */ }
renderHome();
