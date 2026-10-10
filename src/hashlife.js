// Hashlife: Gosper's memoised quadtree algorithm for Life-like automata.
//
// The universe is a quadtree. A node at level L is a square of 2^L x 2^L
// cells made of four level L-1 children. Every node is hash-consed: there is
// exactly one object for any given configuration, so identical regions anywhere
// in space (or time) share structure, and work done on one copy is reused for
// all of them.
//
// The core operation is next(node, j): given a level L node, return the level
// L-1 node in its centre advanced 2^j generations (0 <= j <= L-2). Because
// information travels at most one cell per generation, the centre half after
// 2^(L-2) steps is fully determined by the node itself, so the result can be
// cached on the node forever. Combined with hash-consing that cache is what
// lets regular patterns run for 2^60 generations in milliseconds.

import { parseRule } from './rule.js';

class Node {
  constructor(level, nw, ne, sw, se, pop, id) {
    this.level = level;
    this.nw = nw;
    this.ne = ne;
    this.sw = sw;
    this.se = se;
    this.pop = pop;
    this.id = id;
    this.memo = null; // memo[j] = next(this, j)
  }
}

const DEAD = new Node(0, null, null, null, null, 0, 0);
const ALIVE = new Node(0, null, null, null, null, 1, 1);

const pow2 = (k) => 2 ** k;

function toBigInt(n) {
  if (typeof n === 'bigint') return n;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Generation count must be a non-negative integer, got ${n}`);
  return BigInt(n);
}

export class Universe {
  /**
   * @param {object} [opts]
   * @param {string} [opts.rule]      Life-like rule, default B3/S23 (Conway).
   * @param {number} [opts.maxNodes]  Node table size that triggers garbage collection.
   */
  constructor({ rule = 'B3/S23', maxNodes = 2_000_000 } = {}) {
    this.rule = typeof rule === 'string' ? parseRule(rule) : rule;
    this.maxNodes = maxNodes;
    this.table = new Map();
    this.emptyByLevel = [DEAD];
    this.nextId = 2;
    this.stats = { hits: 0, misses: 0, gcRuns: 0 };
    this.generation = 0n;
    this.root = this.empty(3);
  }

  // ---------------------------------------------------------------- nodes

  join(nw, ne, sw, se) {
    const key = `${nw.id},${ne.id},${sw.id},${se.id}`;
    let node = this.table.get(key);
    if (node === undefined) {
      node = new Node(nw.level + 1, nw, ne, sw, se, nw.pop + ne.pop + sw.pop + se.pop, this.nextId++);
      this.table.set(key, node);
    }
    return node;
  }

  empty(level) {
    while (this.emptyByLevel.length <= level) {
      const e = this.emptyByLevel[this.emptyByLevel.length - 1];
      this.emptyByLevel.push(this.join(e, e, e, e));
    }
    return this.emptyByLevel[level];
  }

  /** Centre level L-1 node of a level L node, no time advance. */
  centre(n) {
    return this.join(n.nw.se, n.ne.sw, n.sw.ne, n.se.nw);
  }

  /** Wrap the root in a node twice its size, keeping it centred on the origin. */
  expand() {
    const r = this.root;
    const e = this.empty(r.level - 1);
    this.root = this.join(
      this.join(e, e, e, r.nw),
      this.join(e, e, r.ne, e),
      this.join(e, r.sw, e, e),
      this.join(r.se, e, e, e),
    );
  }

  /** Drop empty borders so the root is as small as possible (but >= level 3). */
  shrink() {
    while (this.root.level > 3) {
      const c = this.centre(this.root);
      if (c.pop !== this.root.pop) break;
      this.root = c;
    }
  }

  // ------------------------------------------------------------- evolution

  /** Brute force a 4x4 node one generation; returns its 2x2 centre. */
  base(n) {
    const g = [
      [n.nw.nw.pop, n.nw.ne.pop, n.ne.nw.pop, n.ne.ne.pop],
      [n.nw.sw.pop, n.nw.se.pop, n.ne.sw.pop, n.ne.se.pop],
      [n.sw.nw.pop, n.sw.ne.pop, n.se.nw.pop, n.se.ne.pop],
      [n.sw.sw.pop, n.sw.se.pop, n.se.sw.pop, n.se.se.pop],
    ];
    const { birth, survive } = this.rule;
    const cell = (y, x) => {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (dx || dy) k += g[y + dy][x + dx];
      }
      return ((g[y][x] ? survive : birth) >> k) & 1 ? ALIVE : DEAD;
    };
    return this.join(cell(1, 1), cell(1, 2), cell(2, 1), cell(2, 2));
  }

  /**
   * Centre of `n` (level L) advanced 2^j generations, 0 <= j <= L-2.
   * Result is a level L-1 node.
   */
  next(n, j) {
    if (n.pop === 0) return this.empty(n.level - 1);
    if (n.memo !== null && n.memo[j] !== undefined) {
      this.stats.hits++;
      return n.memo[j];
    }
    this.stats.misses++;
    let result;
    if (n.level === 2) {
      result = this.base(n);
    } else {
      const { nw, ne, sw, se } = n;
      // Nine overlapping level L-1 sub-squares, arranged as a 3x3 grid.
      const n00 = nw;
      const n01 = this.join(nw.ne, ne.nw, nw.se, ne.sw);
      const n02 = ne;
      const n10 = this.join(nw.sw, nw.se, sw.nw, sw.ne);
      const n11 = this.join(nw.se, ne.sw, sw.ne, se.nw);
      const n12 = this.join(ne.sw, ne.se, se.nw, se.ne);
      const n20 = sw;
      const n21 = this.join(sw.ne, se.nw, sw.se, se.sw);
      const n22 = se;

      let c00, c01, c02, c10, c11, c12, c20, c21, c22, k;
      if (j === n.level - 2) {
        // Full speed: two half steps of 2^(L-3) each.
        k = j - 1;
        c00 = this.next(n00, k); c01 = this.next(n01, k); c02 = this.next(n02, k);
        c10 = this.next(n10, k); c11 = this.next(n11, k); c12 = this.next(n12, k);
        c20 = this.next(n20, k); c21 = this.next(n21, k); c22 = this.next(n22, k);
      } else {
        // Slower step: crop without advancing, then advance once by 2^j.
        k = j;
        c00 = this.centre(n00); c01 = this.centre(n01); c02 = this.centre(n02);
        c10 = this.centre(n10); c11 = this.centre(n11); c12 = this.centre(n12);
        c20 = this.centre(n20); c21 = this.centre(n21); c22 = this.centre(n22);
      }
      result = this.join(
        this.next(this.join(c00, c01, c10, c11), k),
        this.next(this.join(c01, c02, c11, c12), k),
        this.next(this.join(c10, c11, c20, c21), k),
        this.next(this.join(c11, c12, c21, c22), k),
      );
    }
    if (n.memo === null) n.memo = [];
    n.memo[j] = result;
    return result;
  }

  /** Whether every live cell lies in the central quarter (side/4) of the root. */
  centredInQuarter() {
    const r = this.root;
    if (r.level < 3) return false;
    return r.nw.se.se.pop + r.ne.sw.sw.pop + r.sw.ne.ne.pop + r.se.nw.nw.pop === r.pop;
  }

  /** Advance exactly 2^j generations. */
  stepPow2(j) {
    // With the pattern inside the central quarter of a level M root, live
    // cells are at least 2^(M-3) away from the edge of the level M-1 result,
    // so as long as M >= j + 3 nothing can escape during 2^j generations.
    while (this.root.level < j + 3 || !this.centredInQuarter()) this.expand();
    this.root = this.next(this.root, j);
    this.generation += 1n << BigInt(j);
    this.shrink();
    if (this.table.size > this.maxNodes) this.gc();
    return this;
  }

  /** Advance `gens` generations (number or BigInt), using one power-of-two jump per set bit. */
  step(gens = 1) {
    let g = toBigInt(gens);
    let j = 0;
    while (g > 0n) {
      if (g & 1n) this.stepPow2(j);
      g >>= 1n;
      j++;
    }
    return this;
  }

  /**
   * Throw away every node not reachable from the root, including all memoised
   * results. Hash-consing keeps working because the survivors are re-interned.
   */
  gc() {
    const old = this.root;
    this.table = new Map();
    this.emptyByLevel = [DEAD];
    const seen = new Map();
    const intern = (n) => {
      if (n.level === 0) return n;
      let m = seen.get(n);
      if (m === undefined) {
        m = this.join(intern(n.nw), intern(n.ne), intern(n.sw), intern(n.se));
        seen.set(n, m);
      }
      return m;
    };
    this.root = intern(old);
    this.stats.gcRuns++;
    return this.table.size;
  }

  // ----------------------------------------------------------- cell access

  get population() {
    return this.root.pop;
  }

  get nodeCount() {
    return this.table.size;
  }

  /** Root covers [-half, half) on both axes; grow it until (x, y) fits. */
  ensureContains(x, y) {
    for (;;) {
      const half = pow2(this.root.level - 1);
      if (x >= -half && x < half && y >= -half && y < half) return;
      this.expand();
    }
  }

  setCell(x, y, alive = true) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError('Cell coordinates must be integers');
    this.ensureContains(x, y);
    const set = (n, x, y) => {
      // (x, y) is relative to the centre of n.
      if (n.level === 1) {
        const leaf = alive ? ALIVE : DEAD;
        if (y < 0) return x < 0 ? this.join(leaf, n.ne, n.sw, n.se) : this.join(n.nw, leaf, n.sw, n.se);
        return x < 0 ? this.join(n.nw, n.ne, leaf, n.se) : this.join(n.nw, n.ne, n.sw, leaf);
      }
      const q = pow2(n.level - 2);
      if (y < 0) {
        if (x < 0) return this.join(set(n.nw, x + q, y + q), n.ne, n.sw, n.se);
        return this.join(n.nw, set(n.ne, x - q, y + q), n.sw, n.se);
      }
      if (x < 0) return this.join(n.nw, n.ne, set(n.sw, x + q, y - q), n.se);
      return this.join(n.nw, n.ne, n.sw, set(n.se, x - q, y - q));
    };
    this.root = set(this.root, x, y);
    return this;
  }

  getCell(x, y) {
    let n = this.root;
    const half = pow2(n.level - 1);
    if (x < -half || x >= half || y < -half || y >= half) return 0;
    // Walk down using top-left relative coordinates.
    let px = x + half;
    let py = y + half;
    while (n.level > 0) {
      if (n.pop === 0) return 0;
      const s = pow2(n.level - 1);
      const east = px >= s;
      const south = py >= s;
      n = south ? (east ? n.se : n.sw) : east ? n.ne : n.nw;
      if (east) px -= s;
      if (south) py -= s;
    }
    return n.pop;
  }

  /** Load an iterable of [x, y] pairs (adds to whatever is already there). */
  setCells(cells) {
    for (const [x, y] of cells) this.setCell(x, y, true);
    return this;
  }

  /**
   * Visit live cells, optionally restricted to a rectangle. Empty subtrees are
   * skipped wholesale, so this costs O(live cells * depth), not O(area).
   */
  *cells(rect = null) {
    const stack = [[this.root, -pow2(this.root.level - 1), -pow2(this.root.level - 1)]];
    while (stack.length) {
      const [n, ox, oy] = stack.pop();
      if (n.pop === 0) continue;
      const size = pow2(n.level);
      if (rect && (ox >= rect.x1 || oy >= rect.y1 || ox + size <= rect.x0 || oy + size <= rect.y0)) continue;
      if (n.level === 0) {
        yield [ox, oy];
        continue;
      }
      const s = size / 2;
      stack.push([n.se, ox + s, oy + s], [n.sw, ox, oy + s], [n.ne, ox + s, oy], [n.nw, ox, oy]);
    }
  }

  /** Smallest rectangle containing every live cell (inclusive), or null if empty. */
  bounds() {
    if (this.root.pop === 0) return null;
    // Branch and bound per side: score(ox, oy, size) is the best value any cell
    // inside the square could achieve, so whole squares are pruned once they
    // cannot improve on the best cell found so far. Children are visited
    // nearest-side first so the bound tightens quickly.
    const top = -pow2(this.root.level - 1);
    const search = (score, order) => {
      let best = Infinity;
      const walk = (n, ox, oy) => {
        if (n.pop === 0) return;
        const size = pow2(n.level);
        if (score(ox, oy, size) >= best) return;
        if (n.level === 0) {
          best = score(ox, oy, 1);
          return;
        }
        const s = size / 2;
        const kids = [n.nw, n.ne, n.sw, n.se];
        for (const i of order) walk(kids[i], ox + (i & 1) * s, oy + (i >> 1) * s);
      };
      walk(this.root, top, top);
      return best;
    };
    const x0 = search((ox) => ox, [0, 2, 1, 3]);
    const y0 = search((ox, oy) => oy, [0, 1, 2, 3]);
    const x1 = -search((ox, oy, size) => -(ox + size - 1), [1, 3, 0, 2]);
    const y1 = -search((ox, oy, size) => -(oy + size - 1), [2, 3, 0, 1]);
    return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }

  /**
   * Coarse view for rendering: live blocks of side 2^k as [x, y] in block units,
   * restricted to rect (in cell coordinates). Lets a viewer draw a pattern that
   * spans 2^40 cells without touching individual cells.
   */
  *blocks(k, rect = null) {
    const top = -pow2(this.root.level - 1);
    const stack = [[this.root, top, top]];
    while (stack.length) {
      const [n, ox, oy] = stack.pop();
      if (n.pop === 0) continue;
      const size = pow2(n.level);
      if (rect && (ox >= rect.x1 || oy >= rect.y1 || ox + size <= rect.x0 || oy + size <= rect.y0)) continue;
      if (n.level <= k) {
        yield [Math.floor(ox / pow2(k)), Math.floor(oy / pow2(k)), n.pop];
        continue;
      }
      const s = size / 2;
      stack.push([n.se, ox + s, oy + s], [n.sw, ox, oy + s], [n.ne, ox + s, oy], [n.nw, ox, oy]);
    }
  }

  clear() {
    this.root = this.empty(3);
    this.generation = 0n;
    return this;
  }
}

export { DEAD, ALIVE };
