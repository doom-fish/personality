/**
 * Self-test for scoring, norms and the rule engine. Uses synthetic response patterns only —
 * no real profile data. Run with: node tools/selftest.mjs
 */
import { readFileSync } from 'fs';
import { score, profileRarity, contradictions, ordinal, band, labelOf } from '../score.js';
import { runRules, bluntSummary, extremeFacet, RULES } from '../rules.js';
import { scoreScales } from '../score.js';
import { install } from './dom.mjs';
install();
const NEO = (await import('../tests/neo.js')).default;
const RIASEC = (await import('../tests/riasec.js')).default;
const DASS = (await import('../tests/dass.js')).default;

const root = new URL('../', import.meta.url);
const items = JSON.parse(readFileSync(new URL('data/items.json', root)));
const norms = JSON.parse(readFileSync(new URL('data/norms.json', root)));
const order = norms.meta.domain_order;

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('FAIL  ' + msg); } };
const section = (s) => console.log('\n— ' + s);

/* items */
section('item bank');
ok(items.length === 140, `expected 140 items, got ${items.length}`);
ok(items.filter((i) => i.instrument === 'IPIP-NEO-120').length === 120, 'expected 120 NEO items');
ok(items.filter((i) => i.domain === 'H').length === 20, 'expected 20 Honesty-Humility items');
ok(items.every((i) => ['plus', 'minus'].includes(i.keyed)), 'every item needs a keying direction');
ok(items.every((i) => i.text && i.text.trim().length > 2), 'every item needs text');
ok(new Set(items.map((i) => i.seq)).size === items.length, 'item seq numbers must be unique');
for (const d of order) {
  const n = items.filter((i) => i.domain === d).length;
  ok(n === 24, `domain ${d} should have 24 items, has ${n}`);
  const facets = new Set(items.filter((i) => i.domain === d).map((i) => i.facet));
  ok(facets.size === 6, `domain ${d} should have 6 facets, has ${facets.size}`);
}
console.log(`  ${items.length} items, ${new Set(items.map((i) => i.domain + '|' + i.facet)).size} facets`);

/* norm tables */
section('norm tables');
for (const [key, g] of Object.entries(norms.groups)) {
  const tables = [...Object.entries(g.f), ...Object.entries(g.d)];
  for (const [name, t] of tables) {
    ok(t.every((v) => v >= 0 && v <= 100), `${key}/${name}: percentile outside 0-100`);
    let mono = true;
    for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1]) mono = false;
    ok(mono, `${key}/${name}: percentiles must not decrease as raw score rises`);
  }
  ok(g.n > 300, `${key}: group too small (${g.n})`);
  ok(Object.keys(g.f).length === 30, `${key}: expected 30 facet tables`);
  ok(Object.keys(g.d).length === 5, `${key}: expected 5 domain tables`);
}
console.log(`  ${Object.keys(norms.groups).length} groups checked, all monotone`);

/* scoring behaviour */
section('scoring');
const fill = (fn) => Object.fromEntries(items.map((i) => [i.seq, fn(i)]));
const lo = fill((i) => (i.keyed === 'plus' ? 1 : 5));
const mid = fill(() => 3);
const hi = fill((i) => (i.keyed === 'plus' ? 5 : 1));

for (const key of Object.keys(norms.groups)) {
  const L = score(items, lo, norms, key), M = score(items, mid, norms, key), H = score(items, hi, norms, key);
  for (const d of order) {
    ok(L.domains[d].raw === 24, `${key}/${d}: floor raw should be 24`);
    ok(H.domains[d].raw === 120, `${key}/${d}: ceiling raw should be 120`);
    ok(L.domains[d].pct <= M.domains[d].pct && M.domains[d].pct <= H.domains[d].pct,
      `${key}/${d}: percentile must rise with raw score`);
  }
}
const m = score(items, mid, norms, 'total');
ok(Object.keys(m.facets).length === 30, 'expected 30 scored facets');
ok(Object.keys(m.hexaco).length === 4, 'expected 4 Honesty-Humility facets');
ok(m.domains.H.raw === 60 && m.domains.H.max === 100, 'all-midpoint H should be 60/100');
console.log('  floor/ceiling and monotonicity hold in every group');

/* validity detectors */
section('validity checks');
ok(score(items, mid, norms, 'total').validity.flags.some((f) => /midpoint/i.test(f)),
  'all-midpoint responding should raise a midpoint flag');
ok(score(items, fill(() => 5), norms, 'total').validity.flags.length > 0,
  'answering 5 to everything should raise at least one flag');
ok(score(items, fill(() => 5), norms, 'total').validity.longestRun === 140,
  'longest run should be detected as 140');
const varied = fill((i) => [2, 4, 3, 5, 1, 4, 2, 5, 3, 1][i.seq % 10]);
ok(score(items, varied, norms, 'total').validity.longestRun < 10, 'varied answers should not look like a long run');
console.log('  midpoint, extreme and run detectors fire as expected');

/* rarity */
section('profile rarity');
const key = '1|31-40';
const dom = new Uint8Array(readFileSync(new URL('data/dom/' + norms.groups[key].rarity.file, root)));
ok(dom.length % order.length === 0, 'domain matrix length must divide by 5');
ok(dom.length / order.length === norms.groups[key].rarity.rows, 'domain matrix row count mismatch');
const rExtreme = profileRarity(score(items, hi, norms, key), dom, order);
const rMid = profileRarity(score(items, mid, norms, key), dom, order);
ok(rExtreme.hits <= rMid.hits, 'a maximally extreme profile cannot be commoner than a neutral one');
ok(rExtreme.pct <= 0.1, `extreme profile should be rare, got ${rExtreme.pct}%`);
ok(rExtreme.reliable === false, 'a zero-hit profile must not claim to be a reliable count');
for (const v of [rExtreme, rMid]) {
  ok(v.pct >= 0 && v.pct <= 100, 'rarity percentage out of range');
  ok(v.hits <= v.n, 'hits cannot exceed sample size');
}
console.log(`  extreme ${rExtreme.pct}% (${rExtreme.hits} hits), neutral ${rMid.pct}% (${rMid.hits} hits)`);

/* rule engine */
section('rule engine');
ok(new Set(RULES.map((r) => r.id)).size === RULES.length, 'rule ids must be unique');
const seen = new Set();
let profiles = 0;
for (let s = 0; s < 400; s++) {
  let x = (s * 2654435761) % 4294967296;
  const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  // Bias each domain independently, otherwise every simulated profile lands mid-range
  // and the rules that need an extreme score are never exercised.
  const bias = Object.fromEntries([...order, 'H'].map((d) => [d, 1 + rnd() * 4]));
  const resp = fill((i) => {
    const v = Math.round(bias[i.domain] + (rnd() - 0.5) * 2.5);
    const raw = Math.min(5, Math.max(1, v));
    return i.keyed === 'plus' ? raw : 6 - raw;
  });
  const gk = Object.keys(norms.groups)[s % Object.keys(norms.groups).length];
  const r = score(items, resp, norms, gk);
  const fired = runRules(r);
  const text = fired.map((f) => f.title + ' ' + f.body).join(' ') + ' ' + bluntSummary(r);
  ok(!/undefined|NaN|null|\[object/.test(text), `generated text contains a placeholder value (seed ${s})`);
  ok(!/[^\x00-\x7F\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/.test(text), `non-ascii junk in generated text (seed ${s})`);
  ok(bluntSummary(r).length > 40, `blunt summary too short (seed ${s})`);
  ok(extremeFacet(r) != null, 'extreme facet must always resolve');
  fired.forEach((f) => seen.add(f.id.split(':')[0]));
  profiles++;
}
console.log(`  ${profiles} simulated profiles produced clean text`);
console.log(`  ${seen.size}/${RULES.length} rules triggered at least once`);
const never = RULES.filter((r) => !seen.has(r.id)).map((r) => r.id);
ok(never.length === 0, 'rules never triggered by any simulated profile: ' + never.join(', '));

/* formatting helpers */
section('helpers');
ok(ordinal(1) === '1st' && ordinal(2) === '2nd' && ordinal(3) === '3rd' && ordinal(4) === '4th', 'basic ordinals');
ok(ordinal(11) === '11th' && ordinal(12) === '12th' && ordinal(13) === '13th', 'teen ordinals');
ok(ordinal(21) === '21st' && ordinal(82) === '82nd' && ordinal(99) === '99th', 'compound ordinals');
ok(band(5) === 'vlow' && band(50) === 'mid' && band(95) === 'vhigh', 'band thresholds');
ok(labelOf(50) === 'average', 'label lookup');
ok(contradictions(m).length === 0, 'uniform answers cannot contradict each other');
console.log('  ordinals, bands and contradiction detection correct');

/* ─── informant wording ─── */
section('informant wording');
ok(items.every((i) => i.third && i.third.trim().length > 2), 'every item needs third-person wording');
const firstPerson = items.filter((i) => /\b(I|me|my|myself|am)\b/.test(i.third));
ok(firstPerson.length === 0,
  'third-person wording still contains first-person: ' + firstPerson.slice(0, 3).map((i) => i.seq + ' ' + i.third).join(' | '));
ok(items.every((i) => i.third[0] === i.third[0].toUpperCase()), 'third-person wording must stay capitalised');
console.log(`  ${items.length} items rewritten for informant use, no first person surviving`);

/* ─── the additional tests ─── */
const extra = [
  [RIASEC, JSON.parse(readFileSync(new URL('data/riasec/items.json', root))),
           JSON.parse(readFileSync(new URL('data/riasec/norms.json', root)))],
  [DASS,   JSON.parse(readFileSync(new URL('data/dass/items.json', root))),
           JSON.parse(readFileSync(new URL('data/dass/norms.json', root)))],
];

for (const [test, ti, tn] of extra) {
  section(test.id);
  const [rlo, rhi] = tn.meta.response_range;
  const scales = tn.meta.scales;

  ok(ti.length > 0 && ti.every((i) => i.text && i.scale && i.seq), 'items need seq, text and scale');
  ok(new Set(ti.map((i) => i.seq)).size === ti.length, 'item seq numbers must be unique');
  ok(new Set(ti.map((i) => i.scale)).size === scales.length,
    `expected ${scales.length} scales, found ${new Set(ti.map((i) => i.scale)).size}`);
  ok(test.anchors.length === rhi - rlo + 1,
    `${test.anchors.length} anchors for a ${rhi - rlo + 1}-point scale`);

  const per = scales.map((s) => ti.filter((i) => i.scale === s).length);
  ok(new Set(per).size === 1, 'scales should have equal item counts, got ' + per.join('/'));
  ok(tn.meta.scale_range[0] === per[0] * rlo && tn.meta.scale_range[1] === per[0] * rhi,
    'declared scale range must match items x response range');

  /* norms: one percentile per attainable raw score, monotone, spanning 0-100 */
  for (const [key, g] of Object.entries(tn.groups)) {
    const width = tn.meta.scale_range[1] - tn.meta.scale_range[0] + 1;
    for (const s of scales) {
      const t = g.s[s];
      ok(t && t.length === width, `${key}/${s}: expected ${width} percentiles, got ${t && t.length}`);
      ok(t.every((v, j) => j === 0 || v >= t[j - 1]), `${key}/${s}: percentiles must be non-decreasing`);
      ok(t[0] >= 0 && t[t.length - 1] <= 100, `${key}/${s}: percentiles must stay within 0-100`);
    }
    ok(g.n >= 300, `${key}: norm groups need a usable n, got ${g.n}`);
  }

  /* floor and ceiling answers must land at the ends without going out of range */
  const all = (v) => Object.fromEntries(ti.map((i) => [i.seq, v]));
  const floor = test.score(ti, all(rlo), tn, 'total');
  const ceil = test.score(ti, all(rhi), tn, 'total');
  for (const s of scales) {
    ok(floor.scales[s].raw === per[0] * rlo, `${s}: floor raw wrong`);
    ok(ceil.scales[s].raw === per[0] * rhi, `${s}: ceiling raw wrong`);
    ok(floor.scales[s].pct >= 0 && floor.scales[s].pct <= 100, `${s}: floor percentile out of range`);
    ok(ceil.scales[s].pct >= 0 && ceil.scales[s].pct <= 100, `${s}: ceiling percentile out of range`);
    ok(ceil.scales[s].pct >= floor.scales[s].pct, `${s}: ceiling must not score below floor`);
  }
  ok(floor.style.longestRun === ti.length && floor.style.extreme === 100, 'uniform answers must be flagged');

  /* every report renders, for a spread of profiles across the whole range */
  const ctx = { groupLabel: 'men aged 31-40', norms: tn, meta: { at: Date.now() } };
  let rendered = 0;
  for (let seed = 0; seed < 200; seed++) {
    let x = seed * 2654435761 % 2147483647;
    const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const r = test.score(ti, Object.fromEntries(ti.map((i) => [i.seq, rlo + Math.floor(rnd() * (rhi - rlo + 1))])), tn, 'total');
    const txt = test.report(r, ctx).textContent;
    ok(txt.length > 400, `${test.id}: report came out empty`);
    ok(!/undefined|NaN|\[object/.test(txt), `${test.id}: report text contains a broken value`);
    rendered++;
  }
  console.log(`  ${ti.length} items, ${scales.length} scales, ${Object.keys(tn.groups).length} norm groups, ` +
    `${rendered} reports rendered clean`);
}

/* DASS severity bands must match the published Lovibond cut-offs */
section('dass severity');
{
  const ti = JSON.parse(readFileSync(new URL('data/dass/items.json', root)));
  const tn = JSON.parse(readFileSync(new URL('data/dass/norms.json', root)));
  const ctx = { groupLabel: 'everyone', norms: tn, meta: { at: Date.now() } };
  const CUT = { D: [9, 13, 20, 27], A: [7, 9, 14, 19], S: [14, 18, 25, 33] };
  const WORD = ['Normal', 'Mild', 'Moderate', 'Severe', 'Extremely severe'];

  /* build a response set that gives exactly `std` standardised points on one scale and 0 on the rest */
  const atScore = (scale, std) => {
    const resp = Object.fromEntries(ti.map((i) => [i.seq, 1]));
    let left = std;
    for (const it of ti.filter((x) => x.scale === scale)) {
      const add = Math.min(3, left);
      resp[it.seq] = 1 + add;
      left -= add;
    }
    ok(left === 0, `${scale}: cannot reach a standardised score of ${std}`);
    return DASS.report(DASS.score(ti, resp, tn, 'total'), ctx).textContent;
  };

  for (const [s, cuts] of Object.entries(CUT)) {
    cuts.forEach((cut, i) => {
      ok(atScore(s, cut).includes(WORD[i]), `${s}: ${cut} should read as ${WORD[i]}`);
      ok(atScore(s, cut + 1).includes(WORD[i + 1]), `${s}: ${cut + 1} should read as ${WORD[i + 1]}`);
    });
  }

  const zero = DASS.report(DASS.score(ti, Object.fromEntries(ti.map((i) => [i.seq, 1])), tn, 'total'), ctx).textContent;
  ok(zero.includes('Normal'), 'an all-zero DASS must read as Normal');
  ok(zero.includes('findahelpline'), 'the DASS report must always carry the helpline');
  console.log('  all 12 Lovibond band boundaries land on the correct side');
}

/* Holland code must be the three highest scales, in order */
section('holland code');
{
  const ti = JSON.parse(readFileSync(new URL('data/riasec/items.json', root)));
  const tn = JSON.parse(readFileSync(new URL('data/riasec/norms.json', root)));
  const ctx = { groupLabel: 'everyone', norms: tn, meta: { at: Date.now() } };
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    let x = seed * 40503 % 2147483647;
    const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const resp = Object.fromEntries(ti.map((i) => [i.seq, 1 + Math.floor(rnd() * 5)]));
    const r = RIASEC.score(ti, resp, tn, 'total');
    const want = Object.values(r.scales).sort((a, b) => b.pct - a.pct).slice(0, 3).map((s) => s.scale).join('');
    const got = (RIASEC.report(r, ctx).innerHTML.match(/class="code">([RIASEC]{3})</) || [])[1];
    ok(got === want, `holland code was ${got}, expected ${want}`);
    checked++;
  }
  console.log(`  ${checked} profiles produced the correct three-letter code`);
}

/* the test registry itself */
section('registry');
for (const t of [NEO, RIASEC, DASS]) {
  ok(t.id && t.name && t.sub && t.blurb && t.prompt, `${t.id}: missing descriptive text`);
  ok(Array.isArray(t.anchors) && t.anchors.length >= 4, `${t.id}: needs response anchors`);
  ok(typeof t.score === 'function' && typeof t.report === 'function', `${t.id}: needs score and report`);
  ok(t.paths && t.paths.items && t.paths.norms, `${t.id}: needs data paths`);
}
ok(new Set([NEO, RIASEC, DASS].map((t) => t.id)).size === 3, 'test ids must be unique');
ok(new Set([NEO, RIASEC, DASS].map((t) => t.storageKey || t.id)).size === 3, 'storage keys must be unique');
console.log('  3 tests registered with distinct ids and complete metadata');


console.log('\n' + (fail ? `${fail} FAILURE(S)` : 'ALL SELF-TESTS PASSED'));
process.exit(fail ? 1 : 0);
