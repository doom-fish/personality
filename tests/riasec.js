import { scoreScales, ordinal } from '../score.js';
import { el, esc, scoreTable, writer } from '../ui.js';

const NAME = { R: 'Realistic', I: 'Investigative', A: 'Artistic', S: 'Social', E: 'Enterprising', C: 'Conventional' };
const GLOSS = {
  R: 'building, fixing, machines, outdoors',
  I: 'analysing, researching, figuring things out',
  A: 'designing, writing, composing, open-ended work',
  S: 'teaching, helping, caring for people',
  E: 'persuading, selling, leading, taking risks',
  C: 'ordering, recording, checking, following procedure',
};
const LIKES = {
  R: 'work with a physical result you can point at',
  I: 'problems that reward thinking rather than talking',
  A: 'room to make something that did not exist before',
  S: 'work whose point is another person',
  E: 'influence, momentum and the freedom to push',
  C: 'clear rules, clean records and knowing you got it right',
};
const HEX = 'RIASEC';

/** Steps around Holland's hexagon: 1 = neighbouring types, 3 = opposites. */
const distance = (a, b) => {
  const d = Math.abs(HEX.indexOf(a) - HEX.indexOf(b));
  return Math.min(d, 6 - d);
};

function findings(sorted) {
  const out = [];
  const pct = Object.fromEntries(sorted.map((s) => [s.scale, s.pct]));
  const [top, second] = sorted;
  const spread = top.pct - sorted[sorted.length - 1].pct;

  if (spread < 25) {
    out.push({
      title: 'The profile barely differentiates.',
      body: `Your highest and lowest interests are only ${Math.round(spread)} percentile points apart. `
        + 'Holland calls this an undifferentiated profile. It does not mean you have no preferences — it '
        + 'means this instrument cannot see them, and you should not use it to choose between fields.',
    });
  } else if (top.pct - second.pct >= 20) {
    out.push({
      title: `${NAME[top.scale]} dominates.`,
      body: `${NAME[top.scale]} sits ${Math.round(top.pct - second.pct)} points clear of anything else. `
        + `Work without ${GLOSS[top.scale]} in it will feel like a compromise no matter how good the terms are.`,
    });
  }

  const d = distance(top.scale, second.scale);
  if (d === 3) {
    out.push({
      title: `${NAME[top.scale]} and ${NAME[second.scale]} pull in opposite directions.`,
      body: 'These sit opposite each other on Holland\'s hexagon — the classic hard combination. Few single '
        + 'roles serve both, so this usually resolves as a job that feeds one and a serious outside '
        + 'commitment that feeds the other, rather than one perfect job.',
    });
  } else if (d === 1 && spread >= 25) {
    out.push({
      title: 'Coherent interests.',
      body: `${NAME[top.scale]} and ${NAME[second.scale]} are neighbours on the hexagon, so your top two `
        + 'point at overlapping kinds of work. Consistent profiles like this predict occupational choice '
        + 'and persistence better than scattered ones.',
    });
  }

  for (const [a, b] of [['R', 'S'], ['I', 'E'], ['A', 'C']]) {
    if (pct[a] >= 70 && pct[b] >= 70) {
      out.push({
        title: `Both ${NAME[a]} and ${NAME[b]} are high.`,
        body: 'These are hexagon opposites, and scoring high on both is uncommon. Expect to find most job '
          + `descriptions half-satisfying: they will offer ${GLOSS[a]} or ${GLOSS[b]}, rarely both.`,
      });
    }
  }
  if (pct.C <= 20 && (pct.I >= 70 || pct.A >= 70)) {
    out.push({
      title: 'Process work will grind you down.',
      body: `Conventional is at the ${ordinal(pct.C)} percentile. Record-keeping, compliance and procedure `
        + 'are not neutral overhead for you, they are an active cost — which matters most in roles that '
        + 'quietly accumulate them, like senior technical jobs that drift into governance.',
    });
  }
  if (pct.E <= 20) {
    out.push({
      title: 'You do not want to sell or lead.',
      body: `Enterprising is at the ${ordinal(pct.E)} percentile. Promotion tracks usually convert technical `
        + 'work into persuasion work. That is worth knowing before you accept one, not after.',
    });
  }
  return out;
}

export default {
  id: 'riasec',
  name: 'Career interests',
  sub: 'O*NET Interest Profiler · 48 items · about 6 minutes',
  blurb: 'What kinds of work you would enjoy, scored as a Holland code against 134,390 people. '
    + 'Measures interest — not ability, and not personality.',
  prompt: 'How much would you enjoy doing this?',
  anchors: ['Strongly dislike', 'Dislike', 'Neutral', 'Enjoy', 'Strongly enjoy'],
  paths: { items: 'data/riasec/items.json', norms: 'data/riasec/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const sorted = Object.values(r.scales).sort((a, b) => b.pct - a.pct);
    const code = sorted.slice(0, 3).map((s) => s.scale).join('');

    w.h1('Interest Profile');
    w.p(`Normed against <b>${ctx.groupLabel}</b> from the Open-Source Psychometrics RIASEC dataset `
      + `(N&nbsp;=&nbsp;${ctx.norms.meta.total_cases.toLocaleString()}). Generated `
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your Holland code');
    w.add(el('p', 'code', esc(code)));
    w.p(`<b>${sorted.slice(0, 3).map((s) => NAME[s.scale]).join(' · ')}</b>. The three interest types you `
      + 'scored highest on, in order. Holland codes are used to index occupations: the same three letters '
      + 'attached to a job mean the day-to-day activities of that job look like the things you just said '
      + 'you would enjoy.');
    w.p(`You want ${LIKES[sorted[0].scale]}.`, 'muted');

    w.h2('The six types');
    w.add(scoreTable(sorted.map((s) => ({
      name: NAME[s.scale], sub: GLOSS[s.scale], raw: s.raw, pct: s.pct,
    })), { head: 'Type', sub: true }));
    w.p('Raw scores run from 8 to 40. Percentiles compare you with people of your sex and age band who '
      + 'took the same test.', 'tiny');

    const found = findings(sorted);
    if (found.length) {
      w.h2(`What this actually says (${found.length})`);
      found.forEach((f, i) => {
        const d = el('div', 'find' + (i === 0 ? ' key' : ''));
        d.append(el('b', null, esc(f.title)));
        d.append(el('div', null, f.body));
        w.add(d);
      });
    }

    if (r.style.flags.length) {
      w.h2('Response style');
      for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    }

    w.h2('How to read this, and what it cannot do');
    w.p('Interest inventories predict what you will <i>enjoy</i> and stay in. They say nothing about what '
      + 'you are good at, and the two come apart often enough to matter: people are routinely competent at '
      + 'work they find tedious, and enthusiastic about work they are mediocre at. Do not read a high score '
      + 'as talent.');
    w.p('The comparison group is people who chose to take an online careers test, which skews young and '
      + 'internet-literate. Interests also shift with exposure — scores taken before you have tried a kind '
      + 'of work are weaker evidence than scores taken after.');
    w.p('Items are the O*NET Interest Profiler short form, produced by the US Department of Labor and in '
      + 'the public domain. Norms computed directly from the Open-Source Psychometrics response dump; the '
      + 'six scales reproduce reliabilities of .84 to .90 in that data, checked before any score here was '
      + 'interpreted.', 'tiny');
    return out;
  },
};
