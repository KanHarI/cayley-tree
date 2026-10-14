import { describe, expect, it } from 'vitest';
import { inv, mul, mulWord, parseWord, runs, wordHTML, wordText, type Gen } from '../src/group';

const A: Gen = 0, B: Gen = 1, Ai: Gen = 2, Bi: Gen = 3;

describe('words', () => {
  it('inverts generators', () => {
    expect([A, B, Ai, Bi].map(inv)).toEqual([Ai, Bi, A, B]);
  });

  it('reduces as it multiplies', () => {
    expect(mul([A, B], Bi)).toEqual([A]);
    expect(mul([A, B], A)).toEqual([A, B, A]);
    expect(mulWord([A, B], [Bi, Ai])).toEqual([]);
    expect(mulWord([], [A, B, Ai, Bi])).toEqual([A, B, Ai, Bi]);   // the commutator does not cancel
  });

  it('groups runs into powers', () => {
    expect(runs([A, A, Bi])).toEqual([{ letter: 'a', exp: 2 }, { letter: 'b', exp: -1 }]);
    expect(wordText([])).toBe('e');
    expect(wordText([A, A, Bi, Ai])).toBe('a²b⁻¹a⁻¹');
    expect(wordText(Array(12).fill(B))).toBe('b¹²');
  });

  it('renders HTML with superscripts, keeping only the newest runs', () => {
    expect(wordHTML([])).toBe('<span class="e">e</span>');
    expect(wordHTML([A, Bi])).toBe('ab<sup>−1</sup>');
    expect(wordHTML([A, B, A, B], 2)).toBe('…ab');
  });
});

describe('parseWord', () => {
  it('reads letters, capitals as inverses and exponents', () => {
    expect(parseWord('a b A B')).toEqual({ moves: [A, B, Ai, Bi] });
    expect(parseWord('a^3 b^-2')).toEqual({ moves: [A, A, A, Bi, Bi] });
    expect(parseWord("a⁻¹ b' a-1")).toEqual({ moves: [Ai, Bi, Ai] });
    expect(parseWord('A^-2')).toEqual({ moves: [A, A] });
  });

  it('keeps moves unreduced, so a word walks there and back', () => {
    expect(parseWord('a A')).toEqual({ moves: [A, Ai] });
  });

  it('rejects other characters, empty input and long words', () => {
    expect(parseWord('a c')).toHaveProperty('error');
    expect(parseWord('   ')).toHaveProperty('error');
    expect(parseWord('a^500')).toHaveProperty('error');
  });
});
