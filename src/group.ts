// The free group F₂ = ⟨a, b⟩. A generator doubles as a drawing direction:
// 0 = a (right), 1 = b (up), 2 = a⁻¹ (left), 3 = b⁻¹ (down).

export type Gen = 0 | 1 | 2 | 3;
/** A reduced word, read left to right. The empty word is the identity e. */
export type Word = readonly Gen[];

export const GENS: readonly Gen[] = [0, 1, 2, 3];

/** Unit step for each generator in screen coordinates (y grows downwards). */
export const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, -1], [-1, 0], [0, 1]];

export const inv = (i: Gen): Gen => ((i + 2) & 3) as Gen;

/** w · i, reduced. */
export function mul(w: Word, i: Gen): Gen[] {
  const r = w.slice();
  if (r.length && r[r.length - 1] === inv(i)) r.pop();
  else r.push(i);
  return r;
}

/** w · path, reduced (path need not be reduced). */
export function mulWord(w: Word, path: Word): Gen[] {
  let r = w.slice();
  for (const i of path) r = mul(r, i);
  return r;
}

export const wordKey = (w: Word): string => w.join('');

export interface Run {
  letter: 'a' | 'b';
  exp: number;
}

/** Group repeated letters: a a b⁻¹ → a², b⁻¹. */
export function runs(w: Word): Run[] {
  const out: { i: Gen; n: number }[] = [];
  for (const i of w) {
    const last = out[out.length - 1];
    if (last && last.i === i) last.n++;
    else out.push({ i, n: 1 });
  }
  return out.map(r => ({ letter: r.i & 1 ? 'b' : 'a', exp: r.i >= 2 ? -r.n : r.n }));
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

export const runText = (r: Run): string =>
  r.letter + (r.exp === 1 ? '' : String(r.exp).split('').map(c => SUP[c]).join(''));

/** Plain-text form with Unicode superscripts, e.g. "a²b⁻¹". */
export function wordText(w: Word): string {
  return w.length ? runs(w).map(runText).join('') : 'e';
}

/** HTML form for the readout, keeping only the last maxRuns runs. */
export function wordHTML(w: Word, maxRuns = 60): string {
  if (!w.length) return '<span class="e">e</span>';
  let rs = runs(w);
  let pre = '';
  if (rs.length > maxRuns) {
    rs = rs.slice(rs.length - maxRuns);
    pre = '…';
  }
  return pre + rs.map(r => r.letter + (r.exp === 1 ? '' : `<sup>${String(r.exp).replace('-', '−')}</sup>`)).join('');
}

export const MAX_WORD = 200;

/**
 * Parse a typed word: a, b, A (= a⁻¹), B (= b⁻¹), with exponents like a^3, b^-2, a⁻¹ or a'.
 * Returns the letters as moves (not reduced, so "a A" walks there and back).
 */
export function parseWord(str: string): { moves: Gen[] } | { error: string } {
  const re = /([abAB])\s*(?:\^\s*\(?\s*([-+−]?\d+)\s*\)?|(⁻¹|'|-1))?/g;
  const leftover = str.replace(re, '').replace(/[\s·*]/g, '');
  if (leftover.length) return { error: 'Use a, b, A (= a⁻¹), B (= b⁻¹), with exponents like a^3 or b^-2.' };
  const out: Gen[] = [];
  for (const m of str.matchAll(re)) {
    const base = m[1].toLowerCase() === 'a' ? 0 : 1;
    let e = m[1] === m[1].toUpperCase() ? -1 : 1;
    if (m[2]) e *= parseInt(m[2].replace('−', '-'), 10);
    else if (m[3]) e *= -1;
    const i = (e >= 0 ? base : base + 2) as Gen;
    for (let k = 0; k < Math.abs(e) && out.length <= MAX_WORD; k++) out.push(i);
  }
  if (out.length > MAX_WORD) return { error: `That word is longer than ${MAX_WORD} letters. Try something shorter.` };
  if (!out.length) return { error: 'Type a word first, for example  a b A B.' };
  return { moves: out };
}
