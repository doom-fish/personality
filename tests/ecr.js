import { scoreScales, ordinal, band } from '../score.js';
import { el, esc, scoreTable, writer } from '../ui.js';

const NAME = { ANX: 'Anxiety', AVO: 'Avoidance' };
const GLOSS = {
  ANX: 'Fear of being abandoned or not loved enough',
  AVO: 'Discomfort with closeness and depending on someone',
};

const STYLE = {
  'lo-lo': {
    name: 'Secure',
    gist: 'You are reasonably comfortable depending on a partner and being depended on, and you do '
      + 'not spend much time worrying about where you stand.',
    cost: 'The blind spot is assuming other people find closeness as easy as you do. Partners who '
      + 'do not can read your steadiness as indifference.',
  },
  'hi-lo': {
    name: 'Preoccupied',
    gist: 'You want closeness and you get it, but you monitor the relationship constantly and read '
      + 'small changes in a partner\'s attention as evidence that something is wrong.',
    cost: 'The behaviour that follows — seeking reassurance, protesting distance — tends to produce '
      + 'exactly the withdrawal you are afraid of. That loop is the single most useful thing this '
      + 'result can tell you, because it is the part you control.',
  },
  'lo-hi': {
    name: 'Dismissing',
    gist: 'You are self-sufficient and not especially troubled by whether a partner is close enough. '
      + 'You would rather handle things yourself than lean on someone.',
    cost: 'Self-report is least accurate here. People with this pattern describe themselves as fine '
      + 'while showing physiological stress responses they do not report. Partners usually experience '
      + 'the distance long before you notice it.',
  },
  'hi-hi': {
    name: 'Fearful',
    gist: 'You want closeness and distrust it at the same time. Wanting someone and expecting to be '
      + 'let down are both live at once, so you approach and then pull back.',
    cost: 'This is the most uncomfortable pattern to live inside, and the one most clearly linked to '
      + 'difficult early relationships. It is also the one that responds best to therapy, precisely '
      + 'because the conflict is already conscious.',
  },
};

/** The raw score at which this group crosses the 50th percentile. */
const median = (tbl, lo) => {
  const i = tbl.findIndex((p) => p >= 50);
  return lo + (i < 0 ? tbl.length - 1 : i);
};

export default {
  id: 'ecr',
  name: 'Attachment style',
  sub: 'Experiences in Close Relationships · 36 items · about 5 minutes',
  blurb: 'How you behave in close relationships, on the two dimensions the research actually uses: '
    + 'anxiety about abandonment and avoidance of closeness.',
  prompt: 'How much do you agree, thinking about romantic relationships generally?',
  anchors: ['Strongly disagree', 'Disagree', 'Neither', 'Agree', 'Strongly agree'],
  paths: { items: 'data/ecr/items.json', norms: 'data/ecr/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const g = ctx.norms.groups[r.group.key] || ctx.norms.groups.total;
    const hi = (s) => r.scales[s].raw > median(g.s[s], ctx.norms.meta.scale_range[s][0]);
    const style = STYLE[`${hi('ANX') ? 'hi' : 'lo'}-${hi('AVO') ? 'hi' : 'lo'}`];

    w.h1('Attachment');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from the Open-Source Psychometrics ECR dataset `
      + `(N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Generated `
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your pattern');
    w.add(el('p', 'code', esc(style.name)));
    w.p(style.gist);
    w.p(style.cost);
    w.p('The four labels are a convenience. Attachment is two continuous dimensions, not four boxes, '
      + 'and yours were assigned by whether each score sits above or below the median for your '
      + 'comparison group. If either number is near the middle, the label is close to arbitrary and '
      + 'the dimensions below are what to read.', 'tiny');

    w.h2('The two dimensions');
    w.add(scoreTable(['ANX', 'AVO'].map((s) => ({
      name: NAME[s], sub: GLOSS[s], raw: r.scales[s].raw, pct: r.scales[s].pct,
      tone: band(100 - r.scales[s].pct),
    })), { head: 'Dimension', sub: true, lastHead: 'Level' }));
    w.p('Colours are inverted here: low is the comfortable end of both dimensions. Anxiety and '
      + 'avoidance are close to independent, so being high on one says almost nothing about the other.',
      'tiny');

    w.h2('What this measures, and what it does not');
    w.p('These items ask about romantic relationships in general, not about one particular partner. '
      + 'That matters, because attachment is partly relationship-specific: the same person can be '
      + 'secure with one partner and anxious with another. A general questionnaire averages over '
      + 'that and can miss it entirely.');
    w.p('Attachment style is moderately stable across years but it is not fixed, and the popular '
      + 'framing that it is set in infancy overstates the evidence badly. Longitudinal studies find '
      + 'meaningful change, most often towards security, and relationship experience is one of the '
      + 'things that moves it.');
    w.p(`If you are currently single or recently out of a relationship, the anxiety score in `
      + `particular tends to read higher than it would otherwise. Yours is at the `
      + `${ordinal(Math.round(r.scales.ANX.pct))} percentile, so take that with the appropriate salt.`);

    if (r.style.flags.length) for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    w.p('Instrument: Experiences in Close Relationships (Brennan, Clark &amp; Shaver, 1998), 36 items, '
      + 'distributed for free research use. Reliabilities in the norm sample: avoidance '
      + 'alpha&nbsp;=&nbsp;.94, anxiety alpha&nbsp;=&nbsp;.92. The ten reverse-worded items were '
      + 'identified from the data and match the published key exactly.', 'tiny');
    return out;
  },

  compare(a, b, labels = ['A', 'B']) {
    const out = el('div');
    const w = writer(out);
    w.h2('Comparison');
    const t = el('table');
    t.innerHTML = `<thead><tr><th>Dimension</th><th style="text-align:right">${esc(labels[0])}</th>`
      + `<th style="text-align:right">${esc(labels[1])}</th><th style="text-align:right">Δ</th>`
      + '<th>Reading</th></tr></thead>';
    const tb = el('tbody');
    for (const s of ['ANX', 'AVO']) {
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
    w.p('Two people in a relationship comparing these is the most informative use of this test. '
      + 'The combination that predicts the most conflict is one partner high on anxiety and the '
      + 'other high on avoidance, because each one\'s natural response to stress is precisely what '
      + 'the other cannot tolerate.');
    return out;
  },
};
