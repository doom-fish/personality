import { ordinal, DOMAIN_NAME } from './score.js';

const P = (r, d, f) => r.facets[`${d}|${f}`]?.pct ?? null;
const D = (r, d) => r.domains[d]?.pct ?? null;
const H = (r, f) => r.hexaco[f]?.ratio ?? null;
const nm = (r, d, f) => `${f} ${ordinal(P(r, d, f))}`;

const facetsOf = (r, d) => Object.values(r.facets).filter((x) => x.domain === d);
const spread = (r, d) => {
  const p = facetsOf(r, d).map((x) => x.pct);
  return Math.max(...p) - Math.min(...p);
};
const lowest = (r, d) => facetsOf(r, d).sort((a, b) => a.pct - b.pct)[0];
const highest = (r, d) => facetsOf(r, d).sort((a, b) => b.pct - a.pct)[0];

/**
 * Each rule fires on a checkable score pattern and emits text whose numbers
 * are interpolated from the result, never authored freehand.
 */
export const RULES = [
  {
    id: 'domain-masking',
    prio: 100,
    multi: true,
    test: (r) => 'NEOAC'.split('').filter((d) => D(r, d) >= 22 && D(r, d) <= 78 && spread(r, d) >= 42),
    text: (r, d) => {
      const hi = highest(r, d), lo = lowest(r, d);
      return {
        title: `The ${DOMAIN_NAME[d]} score is an artefact of averaging.`,
        body: `${ordinal(D(r, d))} percentile looks unremarkable. Underneath it: ${lo.facet} ` +
          `${ordinal(lo.pct)}, but ${hi.facet} ${ordinal(hi.pct)} — a spread of ${Math.round(spread(r, d))} ` +
          `points. Reading this domain as a single number would be actively misleading; the facets below ` +
          `are what matter.`,
      };
    },
  },
  {
    id: 'impulse-cluster',
    prio: 95,
    test: (r) => P(r, 'C', 'Cautiousness') < 28 && (P(r, 'C', 'Dutifulness') < 30 || P(r, 'N', 'Immoderation') > 68),
    text: (r) => ({
      title: 'Impulse control is the central liability, and it is coherent.',
      body: `Cautiousness ${ordinal(P(r, 'C', 'Cautiousness'))}, Dutifulness ${ordinal(P(r, 'C', 'Dutifulness'))}, ` +
        `Immoderation ${ordinal(P(r, 'N', 'Immoderation'))}. These are separate scales that happen to agree, ` +
        `which is what makes it a finding rather than noise. This is the pattern most likely to cost you ` +
        `something concrete.`,
    }),
  },
  {
    id: 'capability-execution-gap',
    prio: 92,
    test: (r) => P(r, 'C', 'Self-Efficacy') >= 32 &&
      Math.min(P(r, 'C', 'Dutifulness'), P(r, 'C', 'Orderliness'), P(r, 'C', 'Self-Discipline')) < 30,
    text: (r) => ({
      title: 'The gap that will define your frustration.',
      body: `Self-Efficacy ${ordinal(P(r, 'C', 'Self-Efficacy'))} and Achievement-Striving ` +
        `${ordinal(P(r, 'C', 'Achievement-Striving'))} — you believe you are capable and you want to ` +
        `accomplish things. But Dutifulness ${ordinal(P(r, 'C', 'Dutifulness'))}, Orderliness ` +
        `${ordinal(P(r, 'C', 'Orderliness'))}, Self-Discipline ${ordinal(P(r, 'C', 'Self-Discipline'))}. ` +
        `Ambition is intact; the machinery that converts it into finished work is not. That gap does not ` +
        `close by trying harder — it closes with external structure and deadlines you cannot renegotiate.`,
    }),
  },
  {
    id: 'cooperative-not-warm',
    prio: 88,
    test: (r) => P(r, 'A', 'Cooperation') > 62 && P(r, 'A', 'Trust') < 38,
    text: (r) => ({
      title: 'Agreeable in behaviour, not in disposition.',
      body: `Cooperation ${ordinal(P(r, 'A', 'Cooperation'))} and Anger ${ordinal(P(r, 'N', 'Anger'))} — you ` +
        `do not fight, yell, insult or retaliate. But Trust ${ordinal(P(r, 'A', 'Trust'))} and Altruism ` +
        `${ordinal(P(r, 'A', 'Altruism'))}. You are not warm; you are non-combative and guarded. People will ` +
        `read that as easygoing and be wrong about you.`,
    }),
  },
  {
    id: 'ideas-not-feelings',
    prio: 85,
    test: (r) => P(r, 'O', 'Intellect') > 62 && P(r, 'O', 'Emotionality') < 38,
    text: (r) => ({
      title: 'Open to ideas, closed to feelings.',
      body: `Intellect ${ordinal(P(r, 'O', 'Intellect'))} and Liberalism ${ordinal(P(r, 'O', 'Liberalism'))} ` +
        `against Emotionality ${ordinal(P(r, 'O', 'Emotionality'))} and Imagination ` +
        `${ordinal(P(r, 'O', 'Imagination'))}. Openness here is intellectual, not affective — low awareness ` +
        `of your own emotional reactions alongside intact reading of other people's.`,
    }),
  },
  {
    id: 'internalising',
    prio: 80,
    test: (r) => P(r, 'N', 'Anger') < 30 && (P(r, 'N', 'Vulnerability') > 65 || P(r, 'N', 'Depression') > 65),
    text: (r) => ({
      title: 'Distress turns inward, not outward.',
      body: `Anger ${ordinal(P(r, 'N', 'Anger'))} against Vulnerability ${ordinal(P(r, 'N', 'Vulnerability'))} ` +
        `and Depression ${ordinal(P(r, 'N', 'Depression'))}. Under pressure you do not become difficult — ` +
        `you become overwhelmed. Others may not notice, which means you will not be offered help.`,
    }),
  },
  {
    id: 'withdrawn',
    prio: 78,
    test: (r) => D(r, 'E') < 18,
    text: (r) => ({
      title: 'Social withdrawal is broad, not selective.',
      body: `Extraversion ${ordinal(D(r, 'E'))} overall, with Gregariousness ` +
        `${ordinal(P(r, 'E', 'Gregariousness'))}, Friendliness ${ordinal(P(r, 'E', 'Friendliness'))} and ` +
        `Assertiveness ${ordinal(P(r, 'E', 'Assertiveness'))}. This is not shyness in one setting; it is ` +
        `consistent across approach, group contact and taking charge. The practical cost is that the ` +
        `accountability and opportunity that come through people will not arrive on their own.`,
    }),
  },
  {
    id: 'unassertive-agreeable',
    prio: 70,
    test: (r) => D(r, 'A') > 65 && P(r, 'E', 'Assertiveness') < 28,
    text: (r) => ({
      title: 'Accommodating and unassertive is an exploitable combination.',
      body: `Agreeableness ${ordinal(D(r, 'A'))} with Assertiveness ${ordinal(P(r, 'E', 'Assertiveness'))}. ` +
        `You will absorb costs rather than impose them, and you will not be the one who says so.`,
    }),
  },
  {
    id: 'high-c-rigid',
    prio: 68,
    test: (r) => D(r, 'C') > 88,
    text: (r) => ({
      title: 'Very high Conscientiousness has a cost side.',
      body: `Conscientiousness ${ordinal(D(r, 'C'))}, with Orderliness ${ordinal(P(r, 'C', 'Orderliness'))} ` +
        `and Dutifulness ${ordinal(P(r, 'C', 'Dutifulness'))}. The failure mode is rigidity, difficulty ` +
        `delegating, and moralising at people who work differently.`,
    }),
  },
  {
    id: 'high-n',
    prio: 72,
    test: (r) => D(r, 'N') > 85,
    text: (r) => ({
      title: 'Stress reactivity is the dominant feature of this profile.',
      body: `Neuroticism ${ordinal(D(r, 'N'))}, led by ${highest(r, 'N').facet} ` +
        `${ordinal(highest(r, 'N').pct)}. This is the single strongest personality predictor of ` +
        `lower life and job satisfaction, and it amplifies whatever else is going on below.`,
    }),
  },
  {
    id: 'low-n',
    prio: 60,
    test: (r) => D(r, 'N') < 12,
    text: (r) => ({
      title: 'Unusually low stress reactivity.',
      body: `Neuroticism ${ordinal(D(r, 'N'))}. Genuine resilience, but the blind spot is ` +
        `under-reacting to real problems and misreading distress in others as overreaction.`,
    }),
  },
  {
    id: 'low-a',
    prio: 74,
    test: (r) => D(r, 'A') < 15,
    text: (r) => ({
      title: 'Low Agreeableness is a real interpersonal cost.',
      body: `Agreeableness ${ordinal(D(r, 'A'))}, with Cooperation ${ordinal(P(r, 'A', 'Cooperation'))} and ` +
        `Morality ${ordinal(P(r, 'A', 'Morality'))}. It buys you negotiating position and candour; it costs ` +
        `you goodwill you will eventually need.`,
    }),
  },
  {
    id: 'closed',
    prio: 58,
    test: (r) => D(r, 'O') < 15,
    text: (r) => ({
      title: 'Strong preference for the familiar.',
      body: `Openness ${ordinal(D(r, 'O'))}, with Adventurousness ${ordinal(P(r, 'O', 'Adventurousness'))} ` +
        `and Intellect ${ordinal(P(r, 'O', 'Intellect'))}. Practical and consistent, but the risk is ` +
        `mistaking unfamiliarity for a bad idea.`,
    }),
  },
  {
    id: 'ethical-not-humble',
    prio: 55,
    test: (r) => H(r, 'Fairness') > 60 && H(r, 'Greed Avoidance') > 55 &&
      (H(r, 'Sincerity') < 55 || H(r, 'Modesty') < 55),
    text: (r) => ({
      title: 'Ethical, but not humble.',
      body: `Fairness ${Math.round(H(r, 'Fairness'))}% and Greed Avoidance ` +
        `${Math.round(H(r, 'Greed Avoidance'))}% are elevated — you will not cheat, steal or chase money ` +
        `and status. Sincerity ${Math.round(H(r, 'Sincerity'))}% and Modesty ${Math.round(H(r, 'Modesty'))}% ` +
        `are not: you manage impressions and rate yourself above average.`,
    }),
  },
  {
    id: 'low-h',
    prio: 76,
    test: (r) => r.domains.H && r.domains.H.ratio < 40,
    text: (r) => ({
      title: 'Low Honesty-Humility is the one result worth taking seriously.',
      body: `Honesty-Humility ${Math.round(r.domains.H.ratio)}% overall, with Fairness ` +
        `${Math.round(H(r, 'Fairness'))}%. This is the strongest single predictor of exploitative and ` +
        `counterproductive behaviour in the six-factor literature, and it is the trait people are least ` +
        `willing to see in themselves.`,
    }),
  },
];

export function extremeFacet(r) {
  const all = Object.values(r.facets);
  return all.map((f) => ({ ...f, dev: Math.abs(f.pct - 50) })).sort((a, b) => b.dev - a.dev)[0];
}

export function runRules(r) {
  const out = [];
  for (const rule of RULES) {
    const hit = rule.test(r);
    if (!hit) continue;
    if (rule.multi && Array.isArray(hit)) {
      for (const arg of hit) out.push({ id: `${rule.id}:${arg}`, prio: rule.prio, ...rule.text(r, arg) });
    } else {
      out.push({ id: rule.id, prio: rule.prio, ...rule.text(r) });
    }
  }
  return out.sort((a, b) => b.prio - a.prio);
}

/** Synthesised closing paragraph, assembled from whichever clauses fire. */
export function bluntSummary(r) {
  const c = [];
  if (D(r, 'O') > 70) c.push('bright and ideas-driven');
  else if (D(r, 'O') < 25) c.push('practical and concrete');
  if (D(r, 'E') < 25) c.push('socially withdrawn');
  else if (D(r, 'E') > 75) c.push('socially forward');
  if (D(r, 'N') > 75) c.push('easily rattled');
  else if (D(r, 'N') < 25) c.push('hard to rattle');
  if (D(r, 'A') > 75) c.push('accommodating');
  else if (D(r, 'A') < 25) c.push('combative');

  const person = c.length ? `A ${c.join(', ')} person` : 'A broadly average profile';
  const exec = D(r, 'C') < 25
    ? ' with weak executive follow-through'
    : D(r, 'C') > 75 ? ' with strong executive follow-through' : ' with ordinary follow-through';

  let risk;
  if (D(r, 'C') < 25 && P(r, 'C', 'Self-Efficacy') > 30) {
    risk = 'that you will consistently under-deliver relative to what you can obviously do, and act on ' +
      'impulses before evaluating them';
  } else if (r.domains.H && r.domains.H.ratio < 45) {
    risk = 'that you will rationalise taking advantage of people who trusted you, and not notice you are doing it';
  } else if (D(r, 'N') > 75) {
    risk = 'that stress reactivity will erode the things you are otherwise well equipped to do';
  } else if (D(r, 'A') < 25) {
    risk = 'that you will win arguments and lose the relationships that made them worth winning';
  } else if (D(r, 'E') < 20) {
    risk = 'that isolation will quietly remove the accountability and opportunity that come through other people';
  } else {
    risk = 'that no single trait is extreme enough to force a change you may still need to make';
  }

  const shield = [];
  if (P(r, 'A', 'Cooperation') > 65) shield.push('Cooperation');
  if (H(r, 'Fairness') > 60) shield.push('Fairness');
  const notMalicious = shield.length
    ? ` The risk is not that you will do something malicious — ${shield.join(' and ')} rule that out.`
    : '';

  return `${person}${exec}, and an ${P(r, 'C', 'Self-Efficacy') > 30 ? 'accurate' : 'uncertain'} sense of ` +
    `your own ability.${notMalicious} It is ${risk}.`;
}
