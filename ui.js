import { band, labelOf } from './score.js';

export const $ = (s) => document.querySelector(s);
export const el = (t, c, h) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (h != null) n.innerHTML = h;
  return n;
};
export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function bar(pct, tone) {
  const b = el('div', 'bar');
  const f = el('i', 'f ' + (tone || band(pct)));
  f.style.cssText = `width:${Math.max(pct, 1.5)}%;position:absolute;left:0;top:0;height:8px;border-radius:5px`;
  b.append(f);
  for (const q of [25, 50, 75]) {
    const m = el('i', q === 50 ? 'm' : 'q25');
    m.style.left = q + '%';
    b.append(m);
  }
  return b;
}

export function scoreTable(rows, opts = {}) {
  const t = el('table');
  t.innerHTML = `<thead><tr><th>${opts.head || 'Facet'}</th><th style="text-align:right">Raw</th>` +
    `<th style="text-align:right">Pct</th><th></th><th>${opts.lastHead || 'Level'}</th></tr></thead>`;
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    tr.append(el('td', 'nm', opts.sub ? `${esc(r.name)}<span class="sub">${esc(r.sub)}</span>` : esc(r.name)));
    tr.append(el('td', 'num', r.raw));
    tr.append(el('td', 'pct t-' + (r.tone || band(r.pct)), Math.round(r.pct)));
    const bc = el('td', 'barc'); bc.append(bar(r.pct, r.tone)); tr.append(bc);
    tr.append(el('td', 'lab', r.label != null ? esc(r.label) : labelOf(r.pct)));
    tb.append(tr);
  }
  t.append(tb);
  return t;
}

/** Standard block of report furniture: heading, paragraph, appender. */
export function writer(root) {
  return {
    add: (n) => root.append(n),
    h1: (s) => root.append(el('h1', null, s)),
    h2: (s) => root.append(el('h2', null, s)),
    h3: (s) => root.append(el('h3', null, s)),
    p: (s, c) => root.append(el('p', c, s)),
  };
}
