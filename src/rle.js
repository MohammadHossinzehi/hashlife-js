// Pattern file formats: RLE (the de facto standard used by Golly and LifeWiki)
// and plaintext .cells. Parsing returns plain [x, y] pairs so the result can
// feed either engine.

/**
 * Parse an RLE pattern.
 * Returns { cells, width, height, rule, name, comments }.
 */
export function parseRLE(text) {
  const lines = String(text).split(/\r?\n/);
  const comments = [];
  let name = null;
  let rule = null;
  let width = null;
  let height = null;
  let body = '';
  let headerSeen = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const tag = line[1];
      const rest = line.slice(2).trim();
      if (tag === 'N') name = rest;
      else if (tag === 'r') rule = rest;
      else comments.push(rest);
      continue;
    }
    if (!headerSeen && /^x\s*=/.test(line)) {
      headerSeen = true;
      for (const part of line.split(',')) {
        const [k, v] = part.split('=').map((t) => t.trim());
        if (k === 'x') width = Number(v);
        else if (k === 'y') height = Number(v);
        else if (k === 'rule') rule = v;
      }
      continue;
    }
    body += line;
    if (line.includes('!')) break;
  }

  const cells = [];
  let x = 0;
  let y = 0;
  let count = '';
  for (const ch of body) {
    if (ch >= '0' && ch <= '9') {
      count += ch;
      continue;
    }
    const n = count === '' ? 1 : Number(count);
    count = '';
    if (ch === '!') break;
    if (ch === '$') {
      y += n;
      x = 0;
    } else if (ch === 'b' || ch === '.') {
      x += n;
    } else if (/[a-zA-Z]/.test(ch)) {
      // 'o' is the live state; other letters are multi-state extensions and are
      // treated as live so two-state viewers still show something sensible.
      for (let i = 0; i < n; i++) cells.push([x + i, y]);
      x += n;
    } else if (/\s/.test(ch)) {
      continue;
    } else {
      throw new Error(`Unexpected character "${ch}" in RLE body`);
    }
  }

  return { cells, width, height, rule, name, comments };
}

/** Parse a plaintext .cells pattern ('!' comments, 'O' alive, '.' dead). */
export function parseCells(text) {
  const cells = [];
  const comments = [];
  let name = null;
  let y = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.startsWith('!')) {
      const c = raw.slice(1).trim();
      if (c.startsWith('Name:')) name = c.slice(5).trim();
      else comments.push(c);
      continue;
    }
    for (let x = 0; x < raw.length; x++) if (raw[x] === 'O' || raw[x] === '*') cells.push([x, y]);
    y++;
  }
  return { cells, width: null, height: null, rule: null, name, comments };
}

/** Auto-detect RLE vs plaintext. */
export function parsePattern(text) {
  const t = String(text);
  if (/^\s*(#|x\s*=)/m.test(t) && !/^!/m.test(t)) return parseRLE(t);
  if (/^[.O*!\s]*$/.test(t) || /^!/m.test(t)) return parseCells(t);
  return parseRLE(t);
}

/**
 * Serialise cells to RLE, normalised so the bounding box starts at (0, 0).
 * Lines are wrapped at 70 characters as the format recommends.
 */
export function formatRLE(cells, { rule = 'B3/S23', name = null, comments = [] } = {}) {
  const list = [...cells];
  const out = [];
  if (name) out.push(`#N ${name}`);
  for (const c of comments) out.push(`#C ${c}`);
  if (list.length === 0) {
    out.push(`x = 0, y = 0, rule = ${rule}`, '!');
    return out.join('\n') + '\n';
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of list) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  out.push(`x = ${x1 - x0 + 1}, y = ${y1 - y0 + 1}, rule = ${rule}`);

  const rows = new Map();
  for (const [x, y] of list) {
    const r = y - y0;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(x - x0);
  }

  const tokens = [];
  const run = (n, ch) => tokens.push((n > 1 ? n : '') + ch);
  const ys = [...rows.keys()].sort((a, b) => a - b);
  let prevY = 0;
  for (let i = 0; i < ys.length; i++) {
    const r = ys[i];
    if (i > 0) run(r - prevY, '$');
    prevY = r;
    const xs = [...new Set(rows.get(r))].sort((a, b) => a - b);
    let cursor = 0;
    let k = 0;
    while (k < xs.length) {
      let len = 1;
      while (k + len < xs.length && xs[k + len] === xs[k] + len) len++;
      if (xs[k] > cursor) run(xs[k] - cursor, 'b');
      run(len, 'o');
      cursor = xs[k] + len;
      k += len;
    }
  }
  tokens.push('!');

  let line = '';
  for (const t of tokens) {
    if (line.length + t.length > 70) {
      out.push(line);
      line = '';
    }
    line += t;
  }
  if (line) out.push(line);
  return out.join('\n') + '\n';
}
