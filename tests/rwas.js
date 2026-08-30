import { scoreScales, ordinal } from '../score.js';
import { el, esc, writer } from '../ui.js';

/* Altemeyer's own reference points, from The Authoritarians (2006), all on the same 20-180
   scoring this test uses. They matter more than the percentile here: the people who took this
   online score far lower than the general public, so the percentile alone reads as if an
   ordinary score were an extreme one. */
const ANCHORS = [
  [75, 'Manitoba students'],
  [90, 'their parents'],
  [100, 'scale midpoint'],
];
const US_ADULTS = 90.3;

const LEVELS = [
  [45, 'Very low', 'You rejected nearly every statement about strong leaders, traditional '
    + 'authority and silencing troublemakers, and endorsed the ones about free thinkers and '
    + 'people living as they choose. Altemeyer\'s low scorers are not simply the mirror image of '
    + 'his high scorers: they tend to be less organised as a bloc, less deferential to their own '
    + 'side\'s authorities, and harder to mobilise.'],
  [70, 'Low', 'You lean consistently against deference to established authority and against '
    + 'punishing people who violate convention. This is roughly where Altemeyer\'s Canadian '
    + 'undergraduates sat, and below the average he measured for the general adult public.'],
  [100, 'Around the population average', 'Your score is close to the figures Altemeyer reported '
    + 'for ordinary adults rather than for students. In this range people usually endorse some '
    + 'conventional authority while rejecting the harsher items about crushing or silencing '
    + 'people. Note that this is an unremarkable result in the population and an above-average '
    + 'one among people who take this test online.'],
  [130, 'Above average', 'You agreed with a fair number of the statements about strong leaders, '
    + 'traditional values and dealing firmly with people who disrupt them. Altemeyer\'s finding '
    + 'was that this cluster travels together: submission to established authority, approval of '
    + 'aggression that authority sanctions, and attachment to convention tend to rise and fall '
    + 'as one thing rather than three.'],
  [Infinity, 'High', 'You endorsed most of the scale. Scores in this range were Altemeyer\'s main '
    + 'research interest, and what he reported about them is worth stating plainly rather than '
    + 'softening: in his experiments high scorers were more willing to administer punishment when '
    + 'an authority approved of it, more likely to hold others to rules they exempted themselves '
    + 'from, and more likely to accept an authority\'s claims without checking them. Those are '
    + 'group-level findings from volunteer samples, not a prediction about you.'],
];

const level = (raw) => LEVELS.find(([cap]) => raw < cap);

/* the raw score at which the shipped percentile table crosses 50 */
const median = (tbl, lo) => lo + tbl.findIndex((v) => v >= 50);

export default {
  id: 'rwas',
  name: 'Authoritarianism',
  sub: 'Right-wing Authoritarianism Scale · 20 items · about 4 minutes',
  blurb: 'Altemeyer\'s measure of deference to established authority, approval of authorised '
    + 'aggression, and attachment to convention. Politically loaded by construction, and the '
    + 'items have aged; read the caveats.',
  prompt: 'How much do you agree?',
  anchors: ['very strongly disagree', 'strongly disagree', 'moderately disagree',
    'slightly disagree', 'neutral', 'slightly agree', 'moderately agree', 'strongly agree',
    'very strongly agree'],
  numerals: ['-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4'],
  paths: { items: 'data/rwas/items.json', norms: 'data/rwas/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const s = r.scales.RWA;
    const [, title, body] = level(s.raw);
    /* Ten items are worded each way, so any uniform set of answers cancels to exactly the
       midpoint. That total looks moderate and means nothing. */
    const vals = r.items.map((i) => r.responses[i.seq]);
    const uniform = vals.every((v) => v === vals[0]);

    w.h1('Authoritarianism');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from the Open-Source Psychometrics RWAS dataset `
      + `(N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Generated `
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your score');
    const head = el('p', null, `<b style="font-size:27px">${s.raw}</b> out of 180. `
      + `<span class="muted">${esc(uniform ? 'not interpretable' : title)}</span>`);
    w.add(head);

    /* the scale itself, with Altemeyer's published reference points marked on it */
    const track = el('div', 'bar');
    track.style.cssText = 'position:relative;margin:14px 0 6px';
    const fill = el('i', 'f mid');
    fill.style.cssText = `width:${Math.max((s.raw - 20) / 160 * 100, 1.5)}%;position:absolute;`
      + 'left:0;top:0;height:8px;border-radius:5px';
    track.append(fill);
    for (const [v] of ANCHORS) {
      const m = el('i', 'm');
      m.style.left = (v - 20) / 160 * 100 + '%';
      track.append(m);
    }
    w.add(track);
    w.p('Marks show ' + ANCHORS.map(([v, n]) => `${esc(n)} (${v})`).join(', ')
      + `. A representative sample of 1,000 American adults averaged ${US_ADULTS}.`, 'tiny');

    w.h2('What the number means');
    if (uniform) {
      w.h3('This score is an artefact of how you answered');
      w.p('You gave the same answer to all twenty items. The scale is exactly balanced — ten '
        + 'statements are worded for authority and ten against it — so a uniform set of answers '
        + 'cancels to exactly 100 whatever that answer was. One hundred is the midpoint of the '
        + 'scale, so the result looks like a considered moderate position while carrying no '
        + 'information at all. Altemeyer balanced the scale for exactly this reason: it makes '
        + 'answering without reading produce a null result rather than a misleading one. Take it '
        + 'again and read the statements if you want a score.');
      w.p('Instruments: the Right-wing Authoritarianism Scale (Altemeyer, 1981; 2006).', 'tiny');
      return out;
    }
    w.h3(title);
    w.p(body);

    w.h3('Why the percentile is the less useful number');
    const tbl = (ctx.norms.groups[r.group.key] || ctx.norms.groups.total).s.RWA;
    const lo = ctx.norms.meta.scale_range.RWA[0];
    const at = (raw) => tbl[Math.round(raw) - lo];
    w.p(`Your ${ordinal(Math.round(s.pct))} percentile is measured against people who chose to `
      + 'take a test called "Right-wing Authoritarianism" on the internet, and that group leans '
      + `far less authoritarian than the public. The median visitor scores about ${median(tbl, lo)}. `
      + `An average American adult, at ${US_ADULTS}, would land near the ${ordinal(Math.round(at(US_ADULTS)))} `
      + 'percentile of this sample. So an entirely ordinary score reads as an extreme one here. '
      + 'Read the raw number against the marks above first, and treat the percentile as a '
      + "statement about this website's visitors rather than about people.");

    const pro = r.items.filter((i) => i.keyed === 'plus');
    const con = r.items.filter((i) => i.keyed === 'minus');
    const mean = (list) => list.reduce((a, i) => a + r.responses[i.seq], 0) / list.length;
    const [p, c] = [mean(pro), mean(con)];
    if (p >= 5.5 && c >= 5.5) {
      w.h3('You agreed with both sides');
      w.p('The scale is balanced: half the items are pro-authority and half are worded the other '
        + 'way. You agreed with both sets, which produces a middling total for a reason that is '
        + 'not moderation. It usually means either genuine ambivalence, or a habit of agreeing '
        + 'with whatever is put in front of you. The second is common enough that Altemeyer '
        + 'balanced the scale specifically to catch it.');
    } else if (p <= 4.5 && c <= 4.5) {
      w.h3('You disagreed with both sides');
      w.p('You rejected both the pro-authority items and the ones worded against them. That also '
        + 'produces a middling total without meaning moderation — more often it means the items '
        + 'themselves did not fit how you think about any of this.');
    }

    w.h2('What this measures, and what it does not');
    w.p('<b>"Right-wing" here is a technical term and not a political party.</b> Altemeyer used it '
      + 'to mean submission to the established authorities of your own society, whoever they are. '
      + 'By that definition a citizen deferring to the authorities of a communist state is a '
      + 'right-wing authoritarian in the scale\'s sense. The label has caused forty years of '
      + 'confusion and the scale would be clearer if he had called it something else.');
    w.p('The scale is one dimension made of three things that travel together: deference to '
      + 'established authority, approval of aggression when authority sanctions it, and attachment '
      + 'to convention. It does not separate them, so a high score does not tell you which of the '
      + 'three is doing the work.');
    w.p('<b>The items have aged badly.</b> They were written for a North American audience and '
      + 'anchor convention to abortion, school prayer, nudist camps, homosexuality and "the '
      + 'old-fashioned ways" as those read in 2006 or earlier. Someone answering outside that '
      + 'context, or twenty years later, is partly being asked a different question — and several '
      + 'items are now closer to consensus than to controversy, which compresses the low end.');
    w.p('Altemeyer\'s own warning is the one to finish on. He wrote that psychological tests make '
      + 'mistakes about individuals, that the RWA scale "can\'t give sure-thing diagnoses of '
      + 'individuals", and that it works on groups because errors in both directions average out. '
      + 'He published it so readers could see what the research measured, not so anyone could be '
      + 'sorted by it.');

    if (r.style.flags.length) for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    w.p('Instrument: the Right-wing Authoritarianism Scale (Altemeyer, 1981; this 22-item version '
      + 'from The Authoritarians, 2006, which the author released as a free download). Items 1 and '
      + '2 of that version are unscored warm-ups and are not asked here, so the 20-180 scoring '
      + 'matches his. Reliability in the norm sample: alpha&nbsp;=&nbsp;.96. The ten reverse-worded '
      + 'items were identified from the data itself and match his published key exactly.', 'tiny');
    return out;
  },

  compare(a, b, labels = ['A', 'B']) {
    const out = el('div');
    const w = writer(out);
    const [x, y] = [a.scales.RWA, b.scales.RWA];
    const d = y.raw - x.raw;
    w.h2('Comparison');
    const t = el('table');
    t.innerHTML = `<thead><tr><th>Scale</th><th style="text-align:right">${esc(labels[0])}</th>`
      + `<th style="text-align:right">${esc(labels[1])}</th><th style="text-align:right">Δ</th>`
      + '<th>Reading</th></tr></thead>';
    const tb = el('tbody');
    const tr = el('tr');
    tr.append(el('td', 'nm', 'Authoritarianism'));
    tr.append(el('td', 'num', x.raw));
    tr.append(el('td', 'num', y.raw));
    tr.append(el('td', 'num', (d > 0 ? '+' : '') + d));
    tr.append(el('td', 'note', Math.abs(d) < 15 ? 'no real difference'
      : `${Math.abs(d) >= 40 ? 'substantially' : 'moderately'} ${d > 0 ? 'higher' : 'lower'} in ${labels[1]}`));
    tb.append(tr);
    t.append(tb);
    w.add(t);
    w.p('Raw scores are compared here rather than percentiles, because the percentile is against '
      + 'an unrepresentative sample and exaggerates small differences. Altemeyer reported that '
      + 'scores are fairly stable in adulthood but move with events — his samples rose after '
      + 'threatening national episodes — so a real shift is possible without anything about the '
      + 'person having changed.');
    return out;
  },
};
