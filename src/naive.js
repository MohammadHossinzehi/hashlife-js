// Reference engine: a sparse set of live cells stepped one generation at a
// time by counting neighbours. Deliberately simple and obviously correct; the
// test suite uses it as an oracle for the hashlife engine.

import { parseRule } from './rule.js';

const key = (x, y) => `${x},${y}`;

export class NaiveLife {
  constructor(cells = [], rule = 'B3/S23') {
    this.rule = typeof rule === 'string' ? parseRule(rule) : rule;
    this.live = new Set();
    this.generation = 0;
    for (const [x, y] of cells) this.live.add(key(x, y));
  }

  get population() {
    return this.live.size;
  }

  step(gens = 1) {
    const { birth, survive } = this.rule;
    for (let g = 0; g < gens; g++) {
      const counts = new Map();
      for (const k of this.live) {
        const i = k.indexOf(',');
        const x = Number(k.slice(0, i));
        const y = Number(k.slice(i + 1));
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nk = key(x + dx, y + dy);
            counts.set(nk, (counts.get(nk) || 0) + 1);
          }
        }
      }
      const next = new Set();
      for (const [k, n] of counts) {
        const alive = this.live.has(k);
        if (((alive ? survive : birth) >> n) & 1) next.add(k);
      }
      // Live cells with zero neighbours never appear in counts.
      if (survive & 1) for (const k of this.live) if (!counts.has(k)) next.add(k);
      this.live = next;
      this.generation++;
    }
    return this;
  }

  cells() {
    return [...this.live].map((k) => k.split(',').map(Number));
  }
}
