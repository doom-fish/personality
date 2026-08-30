import { scoreScales } from '../score.js';
import { el, esc, scoreTable, writer } from '../ui.js';

const NAME = { D: 'Depression', A: 'Anxiety', S: 'Stress' };
const GLOSS = {
  D: 'flatness, hopelessness, nothing worth doing',
  A: 'physical fear responses, panic, dread',
  S: 'tension, irritability, being unable to settle',
};

/* Lovibond & Lovibond's published DASS-42 cut-offs, on the standard 0-3 item scoring. */
const CUTS = {
  D: [9, 13, 20, 27],
  A: [7, 9, 14, 19],
  S: [14, 18, 25, 33],
};
const LEVELS = ['Normal', 'Mild', 'Moderate', 'Severe', 'Extremely severe'];
const TONES = ['high', 'mid', 'low', 'vlow', 'vlow'];

const severity = (scale, std) => CUTS[scale].findIndex((c) => std <= c) + 1 || 5;

const HELP = 'https://findahelpline.com';

export default {
  id: 'dass',
  name: 'Depression, anxiety and stress',
  sub: 'DASS-42 · 42 items · about 5 minutes',
  blurb: 'A widely used screening questionnaire covering the past week. Not a diagnosis, and it '
    + 'measures your last seven days rather than what you are like in general.',
  prompt: 'How much did this apply to you over the past week?',
  anchors: ['Did not apply to me at all', 'Applied to some degree', 'Applied to a considerable degree',
    'Applied to me very much'],
  care: true,
  paths: { items: 'data/dass/items.json', norms: 'data/dass/norms.json' },

  score: (items, responses, norms, key) => scoreScales(items, responses, norms, key),

  report(r, ctx) {
    const out = el('div');
    const w = writer(out);
    const rows = ['D', 'A', 'S'].map((s) => {
      const std = r.scales[s].raw - r.scales[s].n;
      const sev = severity(s, std);
      return { scale: s, std, sev, pct: r.scales[s].pct };
    });
    const worst = Math.max(...rows.map((x) => x.sev));
    /* "I felt that life wasn't worthwhile" — surface support on this item alone. */
    const bleak = r.items.find((i) => i.code === '21');
    const bleakAnswer = bleak ? r.responses[bleak.seq] : 1;

    w.h1('Depression, Anxiety and Stress');
    w.p('This covers <b>the past week only</b>. It is a screening questionnaire, not a diagnosis, and a '
      + 'high score means "worth taking to someone qualified", not "you have an illness". Generated '
      + `${new Date(ctx.meta.at || Date.now()).toLocaleDateString()}.`, 'lede');

    w.h2('Your scores');
    w.add(scoreTable(rows.map((x) => ({
      name: NAME[x.scale], sub: GLOSS[x.scale], raw: x.std, pct: x.pct,
      label: LEVELS[x.sev - 1], tone: TONES[x.sev - 1],
    })), { head: 'Scale', sub: true, lastHead: 'Severity' }));
    w.p('Raw scores use the standard 0–42 DASS scoring. The severity label comes from Lovibond and '
      + 'Lovibond\'s published cut-offs, which are referenced to a general adult sample.', 'tiny');

    const urgent = worst >= 4 || bleakAnswer >= 3;
    const box = el('div', 'care');
    box.append(el('b', null, urgent ? 'Worth talking to someone' : 'If any of this changes'));
    if (worst >= 4) {
      box.append(el('div', null,
        'One or more scales are in the severe range for the past week. That is common and treatable, '
        + 'and it is a reason to speak to a GP or a therapist rather than to sit with it.'));
    }
    if (bleakAnswer >= 3) {
      box.append(el('div', null,
        'You said that feeling life was not worthwhile applied to you this week. Whatever else the '
        + 'numbers say, that is worth saying out loud to someone.'));
    }
    if (!urgent) {
      box.append(el('div', null,
        'Nothing here is in the severe range this week. A questionnaire only sees the week you took it '
        + 'in, so this is not a guarantee about any other week.'));
    }
    box.append(el('div', null, `Free helplines by country: <a href="${HELP}" target="_blank" `
      + `rel="noopener">findahelpline.com</a>. If you are in immediate danger, use your local `
      + 'emergency number.'));
    w.add(box);

    w.h2('Why the percentile is the least useful column');
    w.p('The percentile compares you with other people who chose to take a depression questionnaire on '
      + 'the internet. That group is not the general population and is not close to it — the '
      + `<i>average</i> person in this sample of ${ctx.norms.meta.total_cases.toLocaleString()} scores in `
      + 'the severe range for depression. Sitting at the 50th percentile here is not reassuring, and a '
      + 'low percentile does not mean you are fine. Read the severity column, which is anchored to a '
      + 'general adult sample, and treat the percentile as context about who else takes these tests.');

    w.h2('What this measures, and what it does not');
    w.p('The three scales separate reasonably well but correlate strongly with each other and with trait '
      + 'Neuroticism; people who are high on one are usually somewhat high on the others. Depression here '
      + 'means low positive affect — flatness, no anticipation, nothing seeming worth the effort. Anxiety '
      + 'is weighted towards physical fear responses. Stress is persistent tension and difficulty '
      + 'switching off.');
    w.p('Because it asks about the past week, this is a snapshot, not a trait. A bad week moves it a long '
      + 'way. If you want to know whether something is persistent, take it again in a fortnight and '
      + 'compare, rather than reading a single administration as a verdict.');
    if (r.style.flags.length) for (const f of r.style.flags) w.add(el('div', 'warn', esc(f)));
    w.p('Instrument: Depression Anxiety Stress Scales, 42-item version (Lovibond &amp; Lovibond, 1995), '
      + 'public domain per the University of New South Wales. Norms computed from the Open-Source '
      + 'Psychometrics response dump; the three scales reproduce reliabilities of .92 to .96 in that '
      + 'data. This app is not a medical device and gives no medical advice.', 'tiny');
    return out;
  },
};
