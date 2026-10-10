export { Universe } from './hashlife.js';
export { NaiveLife } from './naive.js';
export { parseRule, applyRule, RULES } from './rule.js';
export { parseRLE, parseCells, parsePattern, formatRLE } from './rle.js';
export { PATTERNS } from './patterns.js';

import { Universe } from './hashlife.js';
import { parsePattern } from './rle.js';

/** Build a Universe from RLE or .cells text; the file's rule wins unless one is given. */
export function fromPattern(text, { rule, ...opts } = {}) {
  const p = parsePattern(text);
  const u = new Universe({ rule: rule || p.rule || 'B3/S23', ...opts });
  u.setCells(p.cells);
  u.name = p.name;
  return u;
}
