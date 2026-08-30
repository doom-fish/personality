import { scoreScales, ordinal, band } from '../score.js';
import { el, esc, scoreTable, writer } from '../ui.js';

const NAME = {
  M: 'Machiavellianism', P: 'Psychopathy', N: 'Narcissism', H: 'Vulnerable narcissism',
};
const GLOSS = {
  M: 'Strategic manipulation of other people',
  P: 'Callousness and lack of remorse',
  N: 'Wanting admiration, status and special treatment',
  H: 'Thin-skinned self-focus, easily stung',
};

const READ = {
  M: ['You do not report using people instrumentally.',
    'You report a working willingness to manage people towards outcomes you want.',
    'You report manipulating, flattering and deceiving to get your way as a normal tactic.'],
  P: ['You report caring about the effect you have on people.',
    'You report a streak of detachment about other people\'s feelings.',
    'You report low remorse and low concern for morality — the trait with the worst outcomes of the three.'],
  N: ['You do not report needing admiration.',
    'You report liking status and attention, which most people do.',
    'You report wanting admiration, prestige and special favours as a standing expectation.'],
  H: ['You do not report being easily stung.',
    'You report some sensitivity to slights and a tendency to take remarks personally.',
    'You report taking things personally, feeling watched, and being easily hurt by ridicule.'],
};

const level = (pct) => (pct >= 85 ? 2 : pct >= 40 ? 1 : 0);

export default {
  id: 'dark',
  name: 'Dark triad',
  sub: 'Dirty Dozen + Hypersensitive Narcissism · 22 items · about 3 minutes',
  blurb: 'Machiavellianism, psychopathy and narcissism, plus the vulnerable narcissism the Dark '
    + 'Triad misses. Short, and the least flattering thing here.',
  prompt: 'How much do you agree?',
  anchors: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
  paths: { items: 'data/dark/items.json', norms: 'data/dark/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const order = ['M', 'P', 'N', 'H'];
    const triad = ['M', 'P', 'N'];
    const top = order.map((s) => ({ s, pct: r.scales[s].pct })).sort((a, b) => b.pct - a.pct);

    w.h1('Dark Triad');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from the Open-Source Psychometrics Dark Triad `
      + `dataset (N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Generated `
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your scores');
    w.add(scoreTable(order.map((s) => ({
      name: NAME[s], sub: GLOSS[s], raw: r.scales[s].raw, pct: r.scales[s].pct,
      tone: band(100 - r.scales[s].pct),
    })), { head: 'Trait', sub: true }));
    w.p('Colours are inverted: on these scales, low is the benign end. Percentiles compare you with '
      + 'other people who chose to take a test called "Dark Triad", which is not a neutral sample.', 'tiny');

    w.h2('What the numbers say');
    for (const s of order) {
      w.h3(NAME[s]);
      w.p(`${ordinal(Math.round(r.scales[s].pct))} percentile. ${READ[s][level(r.scales[s].pct)]}`);
    }

    const triadHigh = triad.filter((s) => r.scales[s].pct >= 85);
    if (triadHigh.length >= 2) {
      w.h3('The combination');
      w.p(`You are in the top 15% on ${triadHigh.map((s) => NAME[s].toLowerCase()).join(' and ')}. `
        + 'These three overlap heavily — the common core is callousness — and elevation on more than '
        + 'one is the configuration that predicts the outcomes people care about: counterproductive '
        + 'work behaviour, short-term mating strategies, and relationships that end badly and '
        + 'repeatedly. None of that is a diagnosis, and none of it is fixed.');
    }
    if (r.scales.H.pct >= 75 && r.scales.N.pct <= 40) {
      w.h3('Vulnerable, not grandiose');
      w.p('You score high on hypersensitivity but low on wanting admiration. That combination is the '
        + 'reason the Dark Triad alone gives a misleading picture of narcissism: the grandiose form '
        + 'is confident and status-seeking, the vulnerable form is self-focused but anxious and '
        + 'easily wounded. They look nothing alike from outside and correlate only weakly.');
    }
    if (top[0].pct < 60 && top[top.length - 1].pct > 15) {
      w.h3('Unremarkable');
      w.p('Nothing here is elevated. That is the common result and it is the boring one — most people '
        + 'taking this test are hoping for something more interesting than "you are ordinarily '
        + 'self-interested", and most of them get it anyway.');
    }

    w.h2('What this measures, and what it does not');
    w.p('These are self-reports of socially undesirable traits, which is the format most vulnerable '
      + 'to simply not answering honestly. People high on Machiavellianism are, definitionally, '
      + 'willing to misrepresent themselves — and yet these scales still work, because most '
      + 'respondents with the traits are untroubled enough by them to admit them. A low score is '
      + 'weaker evidence than a high one.');
    w.p('The Dirty Dozen buys its brevity at a cost: twelve items across three traits means four '
      + 'items each, so it captures the shared callous core well and the distinctions between the '
      + 'three traits poorly. Read a single elevated subscale cautiously; read the pattern across '
      + 'all four with more confidence.');
    w.p('None of these are clinical categories. Psychopathy here is a personality dimension on which '
      + 'everyone sits somewhere, not the forensic construct, and this cannot and does not identify '
      + 'anyone as a psychopath.');

    if (r.style.flags.length) for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    w.p('Instruments: the Dirty Dozen (Jonason &amp; Webster, 2010) and the Hypersensitive Narcissism '
      + 'Scale (Hendin &amp; Cheek, 1997), both published in full in their source articles. '
      + 'Reliabilities in the norm sample: alpha&nbsp;=&nbsp;.82, .78, .78 and .74.', 'tiny');
    return out;
  },

  compare(a, b, labels = ['A', 'B']) {
    const out = el('div');
    const w = writer(out);
    w.h2('Comparison');
    const t = el('table');
    t.innerHTML = `<thead><tr><th>Trait</th><th style="text-align:right">${esc(labels[0])}</th>`
      + `<th style="text-align:right">${esc(labels[1])}</th><th style="text-align:right">Δ</th>`
      + '<th>Reading</th></tr></thead>';
    const tb = el('tbody');
    for (const s of ['M', 'P', 'N', 'H']) {
      const [x, y] = [a.scales[s].pct, b.scales[s].pct];
      const d = y - x;
      const tr = el('tr');
      tr.append(el('td', 'nm', NAME[s]));
      tr.append(el('td', 'pct t-' + band(100 - x), Math.round(x)));
      tr.append(el('td', 'pct t-' + band(100 - y), Math.round(y)));
      tr.append(el('td', 'num', (d > 0 ? '+' : '') + Math.round(d)));
      tr.append(el('td', 'note', Math.abs(d) < 10 ? 'no real difference'
        : `${Math.abs(d) >= 25 ? 'substantially' : 'moderately'} ${d > 0 ? 'higher' : 'lower'} in ${labels[1]}`));
      tb.append(tr);
    }
    t.append(tb);
    w.add(t);
    w.p('Self-ratings and other-ratings diverge more on these traits than on any others measured '
      + 'here, and the direction is consistent: observers score people higher than they score '
      + 'themselves. A gap is the expected result, not an error.');
    return out;
  },
};
