import { scoreScales, ordinal, band } from '../score.js';
import { el, esc, scoreTable, writer } from '../ui.js';

const REVERSE = 'Five of the ten items are worded the other way round, so agreeing with everything '
  + 'does not produce a high score.';

function findings(pct, raw, r) {
  const out = [];
  if (pct >= 90) {
    out.push(['Very high', 'You endorse almost every positive statement about yourself and reject '
      + 'almost every negative one. That is usually what secure self-worth looks like. It is also '
      + 'what defensive self-enhancement looks like, and this questionnaire cannot tell the two '
      + 'apart — the item that separates them, whether you can name real faults without flinching, '
      + 'is not on it.']);
  } else if (pct <= 10) {
    out.push(['Very low', 'You agree with the statements about feeling useless, being a failure and '
      + 'wanting more self-respect. Scores this low are strongly associated with depressed mood, and '
      + 'self-esteem measured during a bad period reads much lower than the same person\'s baseline. '
      + 'If you have taken the depression questionnaire here and it was elevated, read this number as '
      + 'a symptom rather than as a fact about you.']);
  }

  const posItems = r.items.filter((i) => i.keyed === 'plus');
  const negItems = r.items.filter((i) => i.keyed === 'minus');
  const mean = (list) => list.reduce((a, i) => a + r.responses[i.seq], 0) / list.length;
  const pos = mean(posItems);
  const neg = mean(negItems);
  if (pos >= 3 && neg >= 3) {
    out.push(['Split view of yourself', 'You agreed both that you have real qualities and that you '
      + 'often feel useless or ashamed. Those are not contradictory answers — most people who score '
      + 'in the middle got there this way rather than by feeling lukewarm throughout. It usually '
      + 'means your self-worth tracks recent events instead of sitting at a fixed level.']);
  } else if (pos >= 3.5 && neg <= 1.6) {
    out.push(['Consistent', 'Your positive and negative answers agree with each other, which means '
      + 'the score is measuring a settled view rather than the mood of the last hour.']);
  }

  if (raw >= 15 && raw <= 25) {
    out.push(['On the published cut-off', 'Rosenberg suggested treating scores below 15 on the '
      + '0–30 scoring as low self-esteem. You are above that line, but the cut-off was never '
      + 'validated as a clinical threshold and should not be read as one.']);
  }
  return out;
}

export default {
  id: 'rse',
  name: 'Self-esteem',
  sub: 'Rosenberg Self-Esteem Scale · 10 items · about 2 minutes',
  blurb: 'The most used self-esteem measure there is, in ten items. Quick, and better validated '
    + 'than almost anything else on this page.',
  prompt: 'How much do you agree?',
  anchors: ['Strongly disagree', 'Disagree', 'Agree', 'Strongly agree'],
  paths: { items: 'data/rse/items.json', norms: 'data/rse/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const s = r.scales.SE;
    const std = s.raw - s.n; // Rosenberg's usual 0-30 scoring

    w.h1('Self-Esteem');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from the Open-Source Psychometrics Rosenberg dataset `
      + `(N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Generated `
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your score');
    w.add(scoreTable([{ name: 'Self-esteem', sub: 'Global self-worth', raw: std, pct: s.pct }],
      { head: 'Scale', sub: true }));
    w.p(`${std} out of 30 on Rosenberg's usual scoring, which is the `
      + `${ordinal(Math.round(s.pct))} percentile for ${esc(ctx.groupLabel)}. ${REVERSE}`, 'tiny');

    w.h2('What the number means');
    for (const [title, body] of findings(s.pct, std, r)) {
      w.h3(title);
      w.p(body);
    }

    w.h2('What this measures, and what it does not');
    w.p('This is a single global scale: whether you regard yourself as worthwhile, on balance. It '
      + 'deliberately does not break down into domains, so it says nothing about whether you rate '
      + 'your looks, your competence or your likeability differently. People routinely differ a '
      + 'great deal across those while landing in the same place overall.');
    w.p('Self-esteem is also one of the most over-sold constructs in psychology. It correlates with '
      + 'happiness strongly, but decades of work found it predicts very little about performance, '
      + 'and the causal arrow mostly runs from doing well to feeling good rather than the other way '
      + 'round. A high score here is pleasant. It is not an achievement, and a low one is not a '
      + 'character flaw.');
    w.p('Scores move with circumstance. Taking this in a bad week and reading the result as a fixed '
      + 'trait is the most common mistake people make with it.');

    if (r.style.flags.length) for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    w.p('Instrument: Rosenberg Self-Esteem Scale (Rosenberg, 1965), ten items, free to use without '
      + 'permission. Reliability in the norm sample: alpha&nbsp;=&nbsp;.91. The five reverse-worded '
      + 'items were identified from the data itself and match Rosenberg\'s published key exactly.',
      'tiny');
    return out;
  },

  compare(a, b, labels = ['A', 'B']) {
    const out = el('div');
    const w = writer(out);
    const [x, y] = [a.scales.SE, b.scales.SE];
    const d = y.pct - x.pct;
    w.h2('Comparison');
    const t = el('table');
    t.innerHTML = `<thead><tr><th>Scale</th><th style="text-align:right">${esc(labels[0])}</th>`
      + `<th style="text-align:right">${esc(labels[1])}</th><th style="text-align:right">Δ</th>`
      + '<th>Reading</th></tr></thead>';
    const tb = el('tbody');
    const tr = el('tr');
    tr.append(el('td', 'nm', 'Self-esteem'));
    tr.append(el('td', 'pct t-' + band(x.pct), Math.round(x.pct)));
    tr.append(el('td', 'pct t-' + band(y.pct), Math.round(y.pct)));
    tr.append(el('td', 'num', (d > 0 ? '+' : '') + Math.round(d)));
    tr.append(el('td', 'note', Math.abs(d) < 10 ? 'no real difference'
      : `${Math.abs(d) >= 25 ? 'substantially' : 'moderately'} ${d > 0 ? 'higher' : 'lower'} in ${labels[1]}`));
    tb.append(tr);
    t.append(tb);
    w.add(t);
    w.p('Self-esteem is more changeable than personality traits, so a real shift between two '
      + 'administrations is more plausible here than it would be on the personality test. It is '
      + 'still worth asking what else was different about the week.');
    return out;
  },
};
