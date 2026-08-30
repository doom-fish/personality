export const DOMAIN_NAME = {
  N: 'Neuroticism', E: 'Extraversion', O: 'Openness',
  A: 'Agreeableness', C: 'Conscientiousness', H: 'Honesty-Humility',
};

export const DOMAIN_DESC = {
  N: 'negative emotion and stress reactivity',
  E: 'social engagement and drive for stimulation',
  O: 'receptiveness to ideas, aesthetics and novelty',
  A: 'cooperation, trust and concern for others',
  C: 'impulse control, organisation and persistence',
};

export function ordinal(p) {
  const n = Math.round(p);
  const s = [11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return `${n}${s}`;
}

const band = (p) => (p < 10 ? 'vlow' : p < 30 ? 'low' : p < 70 ? 'mid' : p < 90 ? 'high' : 'vhigh');
const labelOf = (p) => ({ vlow: 'very low', low: 'low', mid: 'average', high: 'high', vhigh: 'very high' })[band(p)];
export { band, labelOf };

/** Percentile lookup from the precomputed empirical table. */
function lookup(table, raw, lo) {
  const i = Math.min(Math.max(raw - lo, 0), table.length - 1);
  return table[i];
}

export function score(items, responses, norms, groupKey) {
  const group = norms.groups[groupKey] || norms.groups.total;
  const keyed = (it) => (it.keyed === 'plus' ? responses[it.seq] : 6 - responses[it.seq]);

  const byFacet = {}, byDomain = {};
  for (const it of items) {
    const fk = `${it.domain}|${it.facet}`;
    (byFacet[fk] ??= []).push({ it, v: keyed(it) });
    (byDomain[it.domain] ??= []).push(keyed(it));
  }

  const facets = {}, domains = {}, hexaco = {};
  for (const [fk, arr] of Object.entries(byFacet)) {
    const [d, f] = fk.split('|');
    const raw = arr.reduce((a, b) => a + b.v, 0);
    if (d === 'H') {
      hexaco[f] = { facet: f, raw, max: arr.length * 5, ratio: (100 * raw) / (arr.length * 5) };
    } else {
      facets[fk] = { domain: d, facet: f, raw, n: arr.length, pct: lookup(group.f[fk], raw, 4) };
    }
  }
  for (const [d, arr] of Object.entries(byDomain)) {
    const raw = arr.reduce((a, b) => a + b, 0);
    if (d === 'H') {
      domains.H = { code: 'H', raw, max: arr.length * 5, ratio: (100 * raw) / (arr.length * 5) };
    } else {
      domains[d] = { code: d, raw, n: arr.length, pct: lookup(group.d[d], raw, 24) };
    }
  }

  return { facets, domains, hexaco, responses, items, group: { key: groupKey, n: group.n, rarity: group.rarity }, validity: validity(items, responses) };
}

/**
 * How unusual the whole five-domain profile is, counted against real respondents.
 *
 * Takes every domain where this profile sits at least half a standard deviation from the
 * group mean, then counts how many people deviate at least as far in the same direction on
 * all of them at once. Counted rather than modelled: a Gaussian copula understates the
 * joint tail here by roughly a factor of two.
 *
 * `dom` is the group's domain matrix — one byte per domain, offset by 24.
 */
export function profileRarity(result, dom, order) {
  const R = result.group.rarity;
  if (!R || !dom) return null;
  const k = order.length;
  const n = dom.length / k;
  const z = order.map((d, i) => (result.domains[d].raw - R.mu[i]) / R.sd[i]);
  const use = z.map((v, i) => ({ i, v, raw: result.domains[order[i]].raw })).filter((x) => Math.abs(x.v) >= 0.5);
  if (!use.length) return { pct: 100, oneIn: 1, n, hits: n, domains: [] };

  let hits = 0;
  outer: for (let p = 0; p < n; p++) {
    const base = p * k;
    for (const u of use) {
      const val = dom[base + u.i] + 24;
      if (u.v < 0 ? val > u.raw : val < u.raw) continue outer;
    }
    hits++;
  }

  const share = (100 * hits) / n;
  return {
    pct: share >= 1 ? +share.toFixed(1) : +share.toFixed(3),
    oneIn: hits ? Math.round(n / hits) : n,
    hits, n, sampled: R.sampled,
    reliable: hits >= 20,
    domains: use.map((x) => ({ code: order[x.i], dir: x.v < 0 ? 'low' : 'high', z: +x.v.toFixed(2) })),
  };
}

function validity(items, responses) {
  const all = items.map((i) => responses[i.seq]);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const plus = items.filter((i) => i.keyed === 'plus').map((i) => responses[i.seq]);
  const minus = items.filter((i) => i.keyed === 'minus').map((i) => responses[i.seq]);
  const pctOf = (f) => Math.round((1000 * all.filter(f).length) / all.length) / 10;

  const runs = (() => {
    let best = 1, cur = 1;
    for (let i = 1; i < all.length; i++) {
      cur = all[i] === all[i - 1] ? cur + 1 : 1;
      if (cur > best) best = cur;
    }
    return best;
  })();

  const flags = [];
  const acq = Math.abs(mean(plus) - mean(minus));
  if (acq > 0.75) flags.push('Marked acquiescence bias: positively and negatively keyed items diverge sharply. Scores may be inflated toward agreement.');
  if (pctOf((x) => x === 3) > 45) flags.push('Heavy midpoint use. Many responses were non-committal, which flattens the profile toward average.');
  if (pctOf((x) => x === 1 || x === 5) > 70) flags.push('Very high extreme responding. The profile may be exaggerated at both ends.');
  if (runs >= 12) flags.push(`${runs} identical responses in a row — possible inattentive responding.`);

  return {
    plusMean: +mean(plus).toFixed(2), minusMean: +mean(minus).toFixed(2),
    midpoint: pctOf((x) => x === 3), extreme: pctOf((x) => x === 1 || x === 5),
    longestRun: runs, flags, valid: flags.length === 0,
  };
}

/** Item pairs inside one facet whose keyed values disagree sharply. */
export function contradictions(result, minGap = 3) {
  const out = [];
  const byFacet = {};
  for (const it of result.items) {
    const v = it.keyed === 'plus' ? result.responses[it.seq] : 6 - result.responses[it.seq];
    (byFacet[`${it.domain}|${it.facet}`] ??= []).push({ it, v });
  }
  for (const [fk, arr] of Object.entries(byFacet)) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const gap = Math.abs(arr[i].v - arr[j].v);
        if (gap >= minGap) out.push({ facet: fk, gap, a: arr[i], b: arr[j] });
      }
    }
  }
  return out.sort((x, y) => y.gap - x.gap);
}

/** Scoring for the simple sum-per-scale tests: reverse-keys where the item bank says to. */
export function scoreScales(items, responses, norms, groupKey) {
  const group = norms.groups[groupKey] || norms.groups.total;
  const [rlo, rhi] = norms.meta.response_range;
  const scales = {};
  for (const it of items) {
    const s = (scales[it.scale] ??= { scale: it.scale, raw: 0, n: 0 });
    const v = responses[it.seq];
    s.raw += it.keyed === 'minus' ? rlo + rhi - v : v;
    s.n++;
  }
  for (const s of Object.values(scales)) s.pct = lookup(group.s[s.scale], s.raw, norms.meta.scale_range[s.scale][0]);
  return {
    scales, responses, items,
    group: { key: groupKey, n: group.n },
    style: responseStyle(items, responses, norms.meta.response_range),
  };
}

/** Response-style checks that need no keying: usable on any single-scale-direction test. */
export function responseStyle(items, responses, [lo, hi]) {
  const all = items.map((i) => responses[i.seq]);
  const pctOf = (f) => Math.round((1000 * all.filter(f).length) / all.length) / 10;
  let best = 1, cur = 1;
  for (let i = 1; i < all.length; i++) {
    cur = all[i] === all[i - 1] ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  const flags = [];
  if (pctOf((x) => x === lo || x === hi) > 80) flags.push('Almost every answer sat at one end of the scale, which flattens the differences between scales.');
  if (best >= Math.max(10, items.length / 4)) flags.push(`${best} identical answers in a row — check that the questions were being read.`);
  return { extreme: pctOf((x) => x === lo || x === hi), longestRun: best, flags };
}
