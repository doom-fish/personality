import {
  score as scoreNeo, profileRarity, contradictions, ordinal, band, labelOf, DOMAIN_NAME, DOMAIN_DESC,
} from '../score.js';
import { runRules, bluntSummary, extremeFacet } from '../rules.js';
import { el, esc, bar, scoreTable, writer } from '../ui.js';

const DOM_ORDER = ['N', 'E', 'O', 'A', 'C'];
const MAX_FINDINGS = 6;

/* "you" and "they" take the same verb forms, so second to third person is a pure swap. */
const THIRD = [[/\byourself\b/g, 'themselves'], [/\bYourself\b/g, 'Themselves'],
  [/\byours\b/g, 'theirs'], [/\byour\b/g, 'their'], [/\bYour\b/g, 'Their'],
  [/\byou're\b/g, "they're"], [/\bYou're\b/g, "They're"],
  [/\byou\b/g, 'they'], [/\bYou\b/g, 'They']];
const asThird = (s) => THIRD.reduce((t, [p, r]) => t.replace(p, r), s);

const domCache = {};
function domMatrix(norms, key) {
  const f = norms.groups[key]?.rarity?.file;
  if (!f) return Promise.resolve(null);
  domCache[key] ??= fetch('data/dom/' + f)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? new Uint8Array(b) : null))
    .catch(() => null);
  return domCache[key];
}

export default {
  id: 'neo',
  name: 'Personality',
  sub: 'IPIP-NEO-120 + Honesty-Humility · 140 items · about 20 minutes',
  blurb: 'Five domains, thirty facets and an honesty scale, scored against 410,376 people and '
    + 'written up bluntly. The long one, and the one worth doing properly.',
  prompt: 'How accurately does this describe you?',
  anchors: ['Very inaccurate', 'Moderately inaccurate', 'Neither', 'Moderately accurate', 'Very accurate'],
  informant: {
    prompt: 'How accurately does this describe them?',
    anchors: ['Very inaccurate', 'Moderately inaccurate', 'Neither', 'Moderately accurate', 'Very accurate'],
  },
  storageKey: 'pt.v1',
  paths: { items: 'data/items.json', norms: 'data/norms.json' },

  async score(items, responses, norms, key) {
    const r = scoreNeo(items, responses, norms, key);
    r.rarity = profileRarity(r, await domMatrix(norms, key), norms.meta.domain_order);
    return r;
  },

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const obs = ctx.meta.mode === 'informant';
    const who = obs ? (ctx.meta.subject || 'this person') : 'you';
    const t = (s) => (obs ? asThird(s) : s);

    w.h1(obs ? 'Informant Report' : 'Personality Report');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from Johnson's IPIP-NEO-120 validation dataset `
      + `(N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Percentiles are exact `
      + `tie-corrected ranks. Generated ${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    if (obs) {
      w.add(el('div', 'warn', `These are someone else's ratings of ${esc(who)}, compared against `
        + 'norms built from self-ratings. Observer and self ratings agree only moderately (typically '
        + 'r ≈ .4 to .6) and differ slightly in average level, so read the percentiles as close '
        + 'approximations rather than exact ranks.'));
    }

    if (!obs) {
      w.h2('Did you answer usefully?');
      const v = r.validity;
      if (v.flags.length) for (const f of v.flags) w.add(el('div', 'warn', esc(f)));
      else w.p('No response-style problems detected. The profile below can be read at face value.', 'muted');
      w.p(`Agreement with positively vs negatively keyed items: ${v.plusMean} vs ${v.minusMean}. `
        + `Midpoint answers ${v.midpoint}%. Extreme answers ${v.extreme}%. Longest identical run `
        + `${v.longestRun}.`, 'tiny');
    }

    w.h2('The five domains');
    w.add(scoreTable(DOM_ORDER.map((d) => ({
      name: DOMAIN_NAME[d], sub: DOMAIN_DESC[d], raw: r.domains[d].raw, pct: r.domains[d].pct,
    })), { head: 'Domain', sub: true }));
    w.p('Tick marks show the 25th, 50th and 75th percentiles of the comparison group.', 'tiny');

    w.h2('The short version');
    w.add(el('p', null, esc(t(bluntSummary(r)))));
    if (r.rarity && r.rarity.domains.length) {
      const d = r.rarity.domains.map((x) => `${x.dir} ${DOMAIN_NAME[x.code]}`);
      const list = d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}` : d[0];
      w.p(`Combination: <b>${list}</b>. Of ${r.rarity.n.toLocaleString()} people in the comparison group, `
        + `<b>${r.rarity.hits.toLocaleString()}</b> are at least as extreme in all of those directions `
        + `at once — <b>${r.rarity.pct}%</b>, or about 1 in ${r.rarity.oneIn.toLocaleString()}. `
        + (r.rarity.reliable
          ? 'That is a count of real respondents, not a modelled estimate.'
          : 'Too few matching respondents to state this precisely — treat it as "rare" and nothing finer.')
        + ' Unusual is not the same as good or bad.', 'muted');
    }

    const fired = runRules(r).slice(0, MAX_FINDINGS);
    if (fired.length) {
      w.h2(`What actually stands out (${fired.length})`);
      fired.forEach((f, i) => {
        const d = el('div', 'find' + (i === 0 ? ' key' : ''));
        d.append(el('b', null, esc(t(f.title))));
        d.append(el('div', null, esc(t(f.body))));
        w.add(d);
      });
    }

    w.h2('Facet detail');
    w.p('Domain scores hide more than they show. These are the 30 facets that compose them.', 'muted');
    for (const d of DOM_ORDER) {
      w.h3(`<span class="tag ${band(r.domains[d].pct)}">${d}</span> ${DOMAIN_NAME[d]} `
        + `<span class="muted" style="font-weight:400">— ${ordinal(r.domains[d].pct)} percentile</span>`);
      w.add(scoreTable(Object.values(r.facets).filter((f) => f.domain === d)
        .sort((a, b) => b.pct - a.pct)
        .map((f) => ({ name: f.facet, raw: f.raw, pct: f.pct }))));
    }

    w.h2('Honesty-Humility');
    w.p('The Big Five has no honesty dimension. These 20 IPIP HEXACO items cover it. No population '
      + 'norms exist for this scale, so these are reported as raw proportions only — no percentile is '
      + 'shown, because none can be honestly computed.', 'muted');
    const ht = el('table');
    ht.innerHTML = '<thead><tr><th>Facet</th><th style="text-align:right">Raw</th>'
      + '<th style="text-align:right">%</th><th></th></tr></thead>';
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
    w.add(ht);
    w.p(`Total ${r.domains.H.raw}/${r.domains.H.max} (${Math.round(r.domains.H.ratio)}%).`, 'tiny');

    const cx = contradictions(r).filter((c) => c.gap >= 4);
    if (cx.length) {
      w.h2(obs ? 'Where the ratings disagreed with themselves' : 'Where you contradicted yourself');
      w.p(`${cx.length} item pair${cx.length > 1 ? 's' : ''} within the same facet drew opposite answers. `
        + 'That is normal — it usually means the trait is context-dependent rather than that the '
        + 'questions were answered carelessly.', 'muted');
      const ul = el('ul', 'muted');
      for (const c of cx.slice(0, 5)) {
        ul.append(el('li', null, `<b>${esc(c.facet.split('|')[1])}:</b> “${esc(c.a.it.text)}” vs `
          + `“${esc(c.b.it.text)}”`));
      }
      w.add(ul);
    }

    w.h2('How to read this, and what it cannot do');
    const ex = extremeFacet(r);
    w.p(`This is a questionnaire about self-description${obs ? ', here filled in by an observer' : ''}. `
      + 'It measures how a person is described today, which correlates with but is not identical to how '
      + `they behave. Percentiles are comparisons, not verdicts: the most extreme score, ${ex.facet} at `
      + `the ${ordinal(ex.pct)} percentile, means the answers sat further from the middle of the `
      + 'comparison group there than anywhere else — not that anything is wrong.');
    w.p('Traits are moderately stable in adulthood but not fixed; retest correlations over years run '
      + 'around .6–.8, so meaningful change is possible and slow. Facet scores rest on four items each '
      + 'and are noisier than domain scores — treat differences of under about ten percentile points as '
      + 'nothing. Nothing here diagnoses a disorder or predicts an individual outcome; personality '
      + 'effects are real but modest in size.');
    w.p('Instruments: IPIP-NEO-120 (Johnson, 2014), items in the public domain via ipip.ori.org; '
      + 'IPIP HEXACO Honesty-Humility (Ashton &amp; Lee), 20 items. Norms computed directly from '
      + "Johnson's open validation dataset (osf.io/tbmh5). Facet mapping was verified by reproducing "
      + "the published Cronbach's alphas (.64–.88 facets, .82–.91 domains) before any score here was "
      + 'interpreted. IPIP publishes no official norms and warns that canned norms mislead; that is '
      + 'exactly why these were recomputed against a matched subgroup.', 'tiny');
    return out;
  },

  compare(a, b, labels = ['A', 'B']) {
    const out = el('div');
    const w = writer(out);
    w.h2('Comparison');
    const t = el('table');
    t.innerHTML = `<thead><tr><th>Domain</th><th style="text-align:right">${esc(labels[0])}</th>`
      + `<th style="text-align:right">${esc(labels[1])}</th><th style="text-align:right">Δ</th>`
      + '<th>Reading</th></tr></thead>';
    const tb = el('tbody');
    for (const d of DOM_ORDER) {
      const x = a.domains[d].pct, y = b.domains[d].pct, dz = y - x;
      const tr = el('tr');
      tr.append(el('td', 'nm', DOMAIN_NAME[d]));
      tr.append(el('td', 'pct t-' + band(x), Math.round(x)));
      tr.append(el('td', 'pct t-' + band(y), Math.round(y)));
      tr.append(el('td', 'num', (dz > 0 ? '+' : '') + Math.round(dz)));
      tr.append(el('td', 'note', Math.abs(dz) < 10 ? 'no real difference'
        : `${Math.abs(dz) >= 25 ? 'substantially' : 'moderately'} ${dz > 0 ? 'higher' : 'lower'} in ${labels[1]}`));
      tb.append(tr);
    }
    t.append(tb);
    w.add(t);

    const moved = Object.keys(a.facets)
      .map((k) => ({ k, d: b.facets[k].pct - a.facets[k].pct }))
      .filter((x) => Math.abs(x.d) >= 15).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 8);
    if (moved.length) {
      w.h3('Largest facet differences');
      const ul = el('ul', 'muted');
      for (const m of moved) {
        ul.append(el('li', null, `${esc(m.k.split('|')[1])}: ${m.d > 0 ? '+' : ''}${Math.round(m.d)} points`));
      }
      w.add(ul);
    }
    w.p('Differences under about ten percentile points are within measurement noise and should not be '
      + 'interpreted. If these are the same person at different times, note that mood and context shift '
      + 'self-report even when the underlying trait has not changed. If one is a self-rating and one is '
      + 'an informant rating, disagreement is the interesting part: observers are usually better than '
      + 'the person themselves on visible traits like Extraversion, and worse on private ones like '
      + 'Neuroticism.', 'tiny');
    return out;
  },
};
