/**
 * Self-test for scoring, norms and the rule engine. Uses synthetic response patterns only —
 * no real profile data. Run with: node tools/selftest.mjs
 */
import { readFileSync } from 'fs';
import { score, profileRarity, contradictions, ordinal, band, labelOf } from '../score.js';
import { runRules, bluntSummary, extremeFacet, RULES } from '../rules.js';

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

console.log('\n' + (fail ? `${fail} FAILURE(S)` : 'ALL SELF-TESTS PASSED'));
process.exit(fail ? 1 : 0);
