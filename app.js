import { score, profileRarity, contradictions, ordinal, band, labelOf, DOMAIN_NAME, DOMAIN_DESC } from './score.js';
import { runRules, bluntSummary, extremeFacet } from './rules.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const KEY = 'pt.v1';
const PER_PAGE = 10;
const MAX_FINDINGS = 6;
const ANCHORS = ['Very inaccurate', 'Moderately inaccurate', 'Neither', 'Moderately accurate', 'Very accurate'];
const DOM_ORDER = ['N', 'E', 'O', 'A', 'C'];

let items = [], norms = null;
let st = { sex: '1', age: 30, responses: {}, page: 0 };

/* ── persistence ───────────────────────────────────────────────── */
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

function bandFor(age) {
  const a = +age;
  return a <= 20 ? '-20' : a <= 30 ? '21-30' : a <= 40 ? '31-40' : a <= 50 ? '41-50' : '51+';
}
function groupKey(s) {
  if (s.sex === 'total') return 'total';
  const k = `${s.sex}|${bandFor(s.age)}`;
  return norms.groups[k] ? k : 'total';
}
function groupLabel(s) {
  const k = groupKey(s);
  if (k === 'total') return `all ${norms.groups.total.n.toLocaleString()} respondents`;
  const [sx, bd] = k.split('|');
  const b = { '-20': 'aged 20 or under', '21-30': 'aged 21–30', '31-40': 'aged 31–40', '41-50': 'aged 41–50', '51+': 'aged 51 or over' }[bd];
  return `${norms.groups[k].n.toLocaleString()} ${sx === '1' ? 'men' : 'women'} ${b}`;
}

/* ── navigation ────────────────────────────────────────────────── */
function show(id, crumb = '') {
  for (const s of document.querySelectorAll('section')) s.classList.add('hide');
  $('#s-' + id).classList.remove('hide');
  $('#crumb').textContent = crumb;
  window.scrollTo(0, 0);
}

/* ── questionnaire ─────────────────────────────────────────────── */
const pageItems = () => items.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE);
const pageCount = () => Math.ceil(items.length / PER_PAGE);
const answered = () => Object.keys(st.responses).length;

function renderPage() {
  const box = $('#qs');
  box.textContent = '';
  for (const it of pageItems()) {
    const q = el('div', 'q');
    q.append(el('div', 'txt', `<b>${it.seq}</b>${esc(it.text.replace(/\.$/, ''))}`));
    const sc = el('div', 'scale');
    for (let v = 1; v <= 5; v++) {
      const lab = el('label');
      lab.innerHTML = `<input type="radio" name="q${it.seq}" value="${v}"${st.responses[it.seq] === v ? ' checked' : ''}>` +
        `<span><span class="n">${v}</span>${ANCHORS[v - 1]}</span>`;
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
  $('#next').textContent = st.page === pageCount() - 1 ? 'See my results' : 'Next';
  $('#prev').disabled = st.page === 0;
  const pct = (answered() / items.length) * 100;
  $('#bar').style.width = pct + '%';
  $('#count').textContent = `${answered()} of ${items.length} answered · page ${st.page + 1} of ${pageCount()}`;
  $('#crumb').textContent = `${Math.round(pct)}%`;
}

document.addEventListener('keydown', (e) => {
  if ($('#s-test').classList.contains('hide')) return;
  if (!/^[1-5]$/.test(e.key) || e.target.matches('input[type=number],select,textarea')) return;
  const next = pageItems().find((i) => !st.responses[i.seq]);
  if (!next) return;
  st.responses[next.seq] = +e.key;
  save();
  const inp = document.querySelector(`input[name=q${next.seq}][value="${e.key}"]`);
  if (inp) { inp.checked = true; inp.closest('.q').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  sync();
});

/* ── report ────────────────────────────────────────────────────── */
function bar(pct) {
  const b = el('div', 'bar');
  const f = el('i', 'f ' + band(pct));
  f.style.cssText = `width:${Math.max(pct, 1.5)}%;position:absolute;left:0;top:0;height:8px;border-radius:5px`;
  b.append(f);
  for (const q of [25, 50, 75]) {
    const m = el('i', q === 50 ? 'm' : 'q25');
    m.style.left = q + '%';
    b.append(m);
  }
  return b;
}

function scoreTable(rows, opts = {}) {
  const t = el('table');
  t.innerHTML = `<thead><tr><th>${opts.head || 'Facet'}</th><th style="text-align:right">Raw</th>` +
    `<th style="text-align:right">Pct</th><th></th><th>Level</th></tr></thead>`;
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    tr.append(el('td', 'nm', opts.sub ? `${esc(r.name)}<span class="sub">${esc(r.sub)}</span>` : esc(r.name)));
    tr.append(el('td', 'num', r.raw));
    tr.append(el('td', 'pct t-' + band(r.pct), Math.round(r.pct)));
    const bc = el('td', 'barc'); bc.append(bar(r.pct)); tr.append(bc);
    tr.append(el('td', 'lab', labelOf(r.pct)));
    tb.append(tr);
  }
  t.append(tb);
  return t;
}

function report(r, meta) {
  const out = el('div');
  const add = (n) => out.append(n);
  const h2 = (s) => add(el('h2', null, s));
  const p = (s, c) => add(el('p', c, s));

  add(el('h1', null, 'Personality Report'));
  p(`Normed against <b>${groupLabel(meta)}</b> from Johnson's IPIP-NEO-120 validation dataset ` +
    `(N&nbsp;=&nbsp;${norms.meta.total_cases.toLocaleString()}). Percentiles are exact tie-corrected ranks. ` +
    `Generated ${new Date(meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

  /* validity */
  h2('Did you answer usefully?');
  const v = r.validity;
  if (v.flags.length) for (const f of v.flags) add(el('div', 'warn', esc(f)));
  else p('No response-style problems detected. The profile below can be read at face value.', 'muted');
  p(`Agreement with positively vs negatively keyed items: ${v.plusMean} vs ${v.minusMean}. ` +
    `Midpoint answers ${v.midpoint}%. Extreme answers ${v.extreme}%. Longest identical run ${v.longestRun}.`, 'tiny');

  /* domains */
  h2('The five domains');
  add(scoreTable(DOM_ORDER.map((d) => ({
    name: DOMAIN_NAME[d], sub: DOMAIN_DESC[d], raw: r.domains[d].raw, pct: r.domains[d].pct,
  })), { head: 'Domain', sub: true }));
  p('Tick marks show the 25th, 50th and 75th percentiles of your comparison group.', 'tiny');

  /* verdict */
  h2('The short version');
  add(el('p', null, esc(bluntSummary(r))));
  if (r.rarity && r.rarity.domains.length) {
    const d = r.rarity.domains.map((x) => `${x.dir} ${DOMAIN_NAME[x.code]}`);
    const list = d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}` : d[0];
    p(`Combination: <b>${list}</b>. Of ${r.rarity.n.toLocaleString()} people in your comparison group, ` +
      `<b>${r.rarity.hits.toLocaleString()}</b> are at least as extreme as you in all of those directions ` +
      `at once — <b>${r.rarity.pct}%</b>, or about 1 in ${r.rarity.oneIn.toLocaleString()}. ` +
      (r.rarity.reliable
        ? 'That is a count of real respondents, not a modelled estimate.'
        : 'Too few matching respondents to state this precisely — treat it as "rare" and nothing finer.') +
      ' Unusual is not the same as good or bad.', 'muted');
  }

  /* findings */
  const fired = runRules(r).slice(0, MAX_FINDINGS);
  if (fired.length) {
    h2(`What actually stands out (${fired.length})`);
    fired.forEach((f, i) => {
      const d = el('div', 'find' + (i === 0 ? ' key' : ''));
      d.append(el('b', null, esc(f.title)));
      d.append(el('div', null, esc(f.body)));
      add(d);
    });
  }

  /* facets */
  h2('Facet detail');
  p('Domain scores hide more than they show. These are the 30 facets that compose them.', 'muted');
  for (const d of DOM_ORDER) {
    add(el('h3', null, `<span class="tag ${band(r.domains[d].pct)}">${d}</span> ${DOMAIN_NAME[d]} ` +
      `<span class="muted" style="font-weight:400">— ${ordinal(r.domains[d].pct)} percentile</span>`));
    const rows = Object.values(r.facets).filter((f) => f.domain === d)
      .sort((a, b) => b.pct - a.pct)
      .map((f) => ({ name: f.facet, raw: f.raw, pct: f.pct }));
    add(scoreTable(rows));
  }

  /* hexaco */
  h2('Honesty-Humility');
  p('The Big Five has no honesty dimension. These 20 IPIP HEXACO items cover it. ' +
    'No population norms exist for this scale, so these are reported as raw proportions only — ' +
    'no percentile is shown, because none can be honestly computed.', 'muted');
  const ht = el('table');
  ht.innerHTML = '<thead><tr><th>Facet</th><th style="text-align:right">Raw</th><th style="text-align:right">%</th><th></th></tr></thead>';
  const htb = el('tbody');
  for (const f of Object.values(r.hexaco)) {
    const tr = el('tr');
    tr.append(el('td', 'nm', esc(f.facet)));
    tr.append(el('td', 'num', `${f.raw}/${f.max}`));
    tr.append(el('td', 'pct', Math.round(f.ratio)));
    const bc = el('td', 'barc'); bc.append(bar(f.ratio)); tr.append(bc);
    htb.append(tr);
  }
  ht.append(htb);
  add(ht);
  p(`Total ${r.domains.H.raw}/${r.domains.H.max} (${Math.round(r.domains.H.ratio)}%).`, 'tiny');

  /* internal consistency */
  const cx = contradictions(r).filter((c) => c.gap >= 4);
  if (cx.length) {
    h2('Where you contradicted yourself');
    p(`${cx.length} item pair${cx.length > 1 ? 's' : ''} within the same facet drew opposite answers. ` +
      `That is normal — it usually means the trait is context-dependent for you rather than that you answered carelessly.`, 'muted');
    const ul = el('ul', 'muted');
    for (const c of cx.slice(0, 5)) {
      ul.append(el('li', null, `<b>${esc(c.facet.split('|')[1])}:</b> “${esc(c.a.it.text)}” vs “${esc(c.b.it.text)}”`));
    }
    add(ul);
  }

  /* limits */
  h2('How to read this, and what it cannot do');
  const ex = extremeFacet(r);
  p(`This is a self-report questionnaire. It measures how you describe yourself today, which correlates ` +
    `with but is not identical to how you behave. Percentiles are comparisons, not verdicts: your most ` +
    `extreme score, ${ex.facet} at the ${ordinal(ex.pct)} percentile, means you answered further from the ` +
    `middle of your comparison group there than anywhere else — not that anything is wrong.`);
  p(`Traits are moderately stable in adulthood but not fixed; retest correlations over years run around ` +
    `.6–.8, so meaningful change is possible and slow. Facet scores rest on four items each and are ` +
    `noisier than domain scores — treat differences of under about ten percentile points as nothing. ` +
    `Nothing here diagnoses a disorder or predicts an individual outcome; personality effects are real ` +
    `but modest in size.`);
  p(`Instruments: IPIP-NEO-120 (Johnson, 2014), items in the public domain via ipip.ori.org; ` +
    `IPIP HEXACO Honesty-Humility (Ashton &amp; Lee), 20 items. Norms computed directly from Johnson's ` +
    `open validation dataset (osf.io/tbmh5). Facet mapping was verified by reproducing the published ` +
    `Cronbach's alphas (.64–.88 facets, .82–.91 domains) before any score here was interpreted. ` +
    `IPIP publishes no official norms and warns that canned norms mislead; that is exactly why these ` +
    `were recomputed against a matched subgroup.`, 'tiny');
  return out;
}

/* ── compare ───────────────────────────────────────────────────── */
function comparison(a, b) {
  const out = el('div');
  out.append(el('h2', null, 'Comparison'));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Domain</th><th style="text-align:right">A</th>' +
    '<th style="text-align:right">B</th><th style="text-align:right">Δ</th><th>Reading</th></tr></thead>';
  const tb = el('tbody');
  for (const d of DOM_ORDER) {
    const x = a.domains[d].pct, y = b.domains[d].pct, dz = y - x;
    const tr = el('tr');
    tr.append(el('td', 'nm', DOMAIN_NAME[d]));
    tr.append(el('td', 'pct t-' + band(x), Math.round(x)));
    tr.append(el('td', 'pct t-' + band(y), Math.round(y)));
    tr.append(el('td', 'num', (dz > 0 ? '+' : '') + Math.round(dz)));
    tr.append(el('td', 'note', Math.abs(dz) < 10 ? 'no real difference' :
      `${Math.abs(dz) >= 25 ? 'substantially' : 'moderately'} ${dz > 0 ? 'higher' : 'lower'} in B`));
    tb.append(tr);
  }
  t.append(tb);
  out.append(t);

  const moved = Object.keys(a.facets)
    .map((k) => ({ k, d: b.facets[k].pct - a.facets[k].pct }))
    .filter((x) => Math.abs(x.d) >= 15).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 8);
  if (moved.length) {
    out.append(el('h3', null, 'Largest facet differences'));
    const ul = el('ul', 'muted');
    for (const m of moved) {
      ul.append(el('li', null, `${esc(m.k.split('|')[1])}: ${m.d > 0 ? '+' : ''}${Math.round(m.d)} points`));
    }
    out.append(ul);
  }
  out.append(el('p', 'tiny', 'Differences under about ten percentile points are within measurement noise ' +
    'and should not be interpreted. If A and B are the same person at different times, note that ' +
    'mood and context shift self-report even when the underlying trait has not changed.'));
  return out;
}

/* ── finish ────────────────────────────────────────────────────── */
const domCache = {};
async function domMatrix(key) {
  const f = norms.groups[key]?.rarity?.file;
  if (!f) return null;
  if (!domCache[key]) {
    domCache[key] = fetch('data/dom/' + f)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new Uint8Array(b) : null))
      .catch(() => null);
  }
  return domCache[key];
}

async function finish(state) {
  const key = groupKey(state);
  const r = score(items, state.responses, norms, key);
  r.rarity = profileRarity(r, await domMatrix(key), norms.meta.domain_order);
  $('#rpt').textContent = '';
  $('#rpt').append(report(r, state));
  show('report', 'Report');
  return r;
}

function payload() {
  return { app: 'ipip-neo-120+hexaco-h', version: 1, at: Date.now(), sex: st.sex, age: st.age, responses: st.responses };
}

function importFile(file, then) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d.responses || Object.keys(d.responses).length !== items.length) throw new Error('incomplete');
      then(d);
    } catch (e) {
      alert('That file is not a complete result from this app.');
    }
  };
  fr.readAsText(file);
}

/* ── wiring ────────────────────────────────────────────────────── */
$('#theme').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  $('#theme').textContent = dark ? 'Dark' : 'Light';
  try { localStorage.setItem('pt.theme', dark ? 'light' : 'dark'); } catch {}
};

$('#go').onclick = () => show('setup', 'Setup');
$('#back-intro').onclick = () => show('intro');
const info = () => { $('#groupinfo').innerHTML = `You will be compared against <b>${groupLabel({ sex: $('#sex').value, age: $('#age').value })}</b>.`; };
$('#sex').onchange = info;
$('#age').oninput = info;

$('#start').onclick = () => {
  st = { sex: $('#sex').value, age: +$('#age').value, responses: {}, page: 0 };
  save();
  show('test', '0%');
  renderPage();
};

$('#resume').onclick = () => {
  const s = load();
  if (!s) return;
  st = s;
  if (Object.keys(st.responses).length === items.length) finish(st);
  else { show('test'); renderPage(); }
};

$('#next').onclick = () => {
  if (st.page === pageCount() - 1) { st.at = Date.now(); save(); finish(st); return; }
  st.page++; save(); renderPage(); window.scrollTo(0, 0);
};
$('#prev').onclick = () => { st.page--; save(); renderPage(); window.scrollTo(0, 0); };
$('#quit').onclick = () => { save(); show('intro'); boot(); };

$('#print').onclick = () => window.print();
$('#save').onclick = () => {
  const b = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(b);
  a.download = `personality-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#wipe').onclick = () => {
  if (!confirm('Erase your answers and results from this browser? This cannot be undone.')) return;
  try { localStorage.removeItem(KEY); } catch {}
  st = { sex: '1', age: 30, responses: {}, page: 0 };
  show('intro'); boot();
};

$('#loadfile').onclick = () => $('#file').click();
$('#file').onchange = (e) => e.target.files[0] && importFile(e.target.files[0], (d) => { st = d; save(); finish(d); });

$('#cmp').onclick = () => $('#cmpfile').click();
$('#cmpfile').onchange = (e) => e.target.files[0] && importFile(e.target.files[0], (d) => {
  const a = score(items, st.responses, norms, groupKey(st));
  const b = score(items, d.responses, norms, groupKey(d));
  $('#rpt').append(comparison(a, b));
  $('#rpt').lastChild.scrollIntoView({ behavior: 'smooth' });
});

/* ── boot ──────────────────────────────────────────────────────── */
function boot() {
  const s = load();
  const n = s && s.responses ? Object.keys(s.responses).length : 0;
  const btn = $('#resume');
  btn.classList.toggle('hide', n === 0);
  btn.textContent = n === items.length ? 'View my last result' : `Resume (${n} of ${items.length} answered)`;
}

(async () => {
  try { document.documentElement.dataset.theme = localStorage.getItem('pt.theme') || 'light'; } catch {}
  $('#theme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark';
  const [i, n] = await Promise.all([
    fetch('data/items.json').then((r) => r.json()),
    fetch('data/norms.json').then((r) => r.json()),
  ]);
  items = i; norms = n;
  info();
  boot();
})();
