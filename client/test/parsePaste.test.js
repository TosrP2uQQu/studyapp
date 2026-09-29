import { describe, expect, it } from 'vitest';
import { parsePaste } from '../src/pages/DeckEditor';

describe('parsePaste', () => {
  it('splits tab-separated lines on the first tab only', () => {
    expect(parsePaste('la biblioteca\tlibrary')).toEqual([
      { front: 'la biblioteca', back: 'library', missing: false },
    ]);
    expect(parsePaste('a\tb\tc')).toEqual([{ front: 'a', back: 'b\tc', missing: false }]);
  });

  it('falls back to the first comma', () => {
    expect(parsePaste('mitochondria, powerhouse of the cell')).toEqual([
      { front: 'mitochondria', back: 'powerhouse of the cell', missing: false },
    ]);
    expect(parsePaste('a, b, c')).toEqual([{ front: 'a', back: 'b, c', missing: false }]);
  });

  it('prefers tab over comma when both are present', () => {
    expect(parsePaste('hola, amigo\thello')).toEqual([
      { front: 'hola, amigo', back: 'hello', missing: false },
    ]);
  });

  it('flags lines with no delimiter as missing a back', () => {
    expect(parsePaste('justaword')).toEqual([{ front: 'justaword', back: '', missing: true }]);
  });

  it('skips blank lines and trims whitespace', () => {
    expect(parsePaste('\n  front  ,  back  \n\n\t\nword\n')).toEqual([
      { front: 'front', back: 'back', missing: false },
      { front: 'word', back: '', missing: true },
    ]);
  });

  it('handles Windows line endings', () => {
    expect(parsePaste('a, b\r\nc\td\r\n')).toEqual([
      { front: 'a', back: 'b', missing: false },
      { front: 'c', back: 'd', missing: false },
    ]);
  });

  it('returns an empty array for empty or garbage input', () => {
    expect(parsePaste('')).toEqual([]);
    expect(parsePaste('\n\n   \n')).toEqual([]);
  });
});
