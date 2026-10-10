// Life-like rule parsing.
//
// A Life-like (outer totalistic, Moore neighbourhood) rule is fully described
// by two sets of neighbour counts: the counts that make a dead cell come alive
// (birth) and the counts that keep a live cell alive (survival). We store both
// as 9 bit masks so the inner loop is a single shift and AND.

const BS = /^B([0-8]*)\/S([0-8]*)$/i;
const SB = /^([0-8]*)\/([0-8]*)$/;

function digitsToMask(digits) {
  let mask = 0;
  for (const ch of digits) mask |= 1 << Number(ch);
  return mask;
}

function maskToDigits(mask) {
  let out = '';
  for (let i = 0; i <= 8; i++) if (mask & (1 << i)) out += i;
  return out;
}

/**
 * Parse a rule string. Accepts "B3/S23" (any case) and the older "23/3"
 * survival/birth notation. Returns { birth, survive, name }.
 */
export function parseRule(text = 'B3/S23') {
  const src = String(text).trim();
  let b;
  let s;
  let m = src.match(BS);
  if (m) {
    b = m[1];
    s = m[2];
  } else if ((m = src.match(SB))) {
    s = m[1];
    b = m[2];
  } else {
    throw new Error(`Unrecognised rule "${src}" (expected something like B3/S23)`);
  }
  const birth = digitsToMask(b);
  const survive = digitsToMask(s);
  if (birth & 1) {
    // With B0 the empty plane is not a fixed point, so the "empty space stays
    // empty" assumption that hashlife's padding relies on breaks down.
    throw new Error(`Rules with B0 are not supported by hashlife ("${src}")`);
  }
  return { birth, survive, name: `B${maskToDigits(birth)}/S${maskToDigits(survive)}` };
}

/** Next state of one cell given its state and live neighbour count. */
export function applyRule(rule, alive, neighbours) {
  return ((alive ? rule.survive : rule.birth) >> neighbours) & 1;
}

export const RULES = {
  life: 'B3/S23',
  highlife: 'B36/S23',
  seeds: 'B2/S',
  daynight: 'B3678/S34678',
  lifewithoutdeath: 'B3/S012345678',
  maze: 'B3/S12345',
  twobytwo: 'B36/S125',
};
