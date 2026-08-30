/**
 * Enough of the DOM for the report modules to run under Node, so the self-test can render
 * every report for hundreds of simulated profiles and catch crashes and bad text.
 */
const VOID = new Set(['br', 'hr', 'img', 'input', 'i-void']);

class Node {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this.children = [];
    this.dataset = {};
    this._html = '';
    this.style = new Proxy({ cssText: '' }, { set: (o, k, v) => ((o[k] = v), true) });
  }

  set innerHTML(h) { this._html = h; this.children.length = 0; }
  get innerHTML() { return this._html + this.children.map((c) => c.outerHTML).join(''); }

  get outerHTML() {
    const cls = this.className ? ` class="${this.className}"` : '';
    return VOID.has(this.tag) ? `<${this.tag}${cls}>` : `<${this.tag}${cls}>${this.innerHTML}</${this.tag}>`;
  }

  get textContent() { return this.innerHTML.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '); }

  append(...kids) { for (const k of kids) if (k) this.children.push(k); }
  querySelector() { return null; }
  addEventListener() {}
}

export const install = () => {
  globalThis.document = { createElement: (t) => new Node(t), querySelector: () => null };
};
