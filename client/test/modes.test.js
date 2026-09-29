// modes.test.js — T7: MC distractors, direction, voices.
import { describe, expect, it } from 'vitest';
import {
  applyDirection,
  buildMcOptions,
  pickVoice,
  shuffle,
  suggestRating,
} from '../src/lib/modes';

const POOL = [
  { id: '1', back: 'hello' },
  { id: '2', back: 'thanks' },
  { id: '3', back: 'water' },
  { id: '4', back: 'book' },
  { id: '5', back: 'hello' },
];

describe('multiple choice', () => {
  it('builds 4 options with the answer included', () => {
    const { options, answerId } = buildMcOptions(
      { id: '1', back: 'hello' },
      POOL,
      4,
      () => 0.5
    );
    expect(options.length).toBe(4);
    expect(answerId).toBe('1');
    expect(options.some((o) => o.id === '1')).toBe(true);
  });
  it('never duplicates the answer or itself', () => {
    const { options } = buildMcOptions(
      { id: '1', back: 'hello' },
      POOL,
      4,
      () => 0
    );
    const texts = options.map((o) => o.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.filter((x) => x === 'hello').length).toBe(1);
  });
  it('shrinks gracefully with a tiny pool', () => {
    const { options } = buildMcOptions(
      { id: '1', back: 'hello' },
      [{ id: '2', back: 'thanks' }],
      4,
      () => 0.9
    );
    expect(options.length).toBe(2);
  });
  it('suggests ok for correct, hard for wrong', () => {
    expect(suggestRating(true)).toBe('ok');
    expect(suggestRating(false)).toBe('hard');
  });
});

describe('direction and voices', () => {
  it('reverses and doubles vocab', () => {
    const cards = [{ id: 'a', front: 'x', back: 'y' }];
    const rev = applyDirection(cards, 'reverse');
    expect(rev[0].front).toBe('y');
    const both = applyDirection(cards, 'both');
    expect(both.length).toBe(2);
    expect(applyDirection(cards, 'forward')).toEqual(cards);
  });
  it('picks exact then prefix voices', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'lt-LT' }];
    expect(pickVoice(voices, 'lt').lang).toBe('lt-LT');
    expect(pickVoice(voices, 'en-GB').lang).toBe('en-US');
    expect(pickVoice([], 'en')).toBe(null);
  });
  it('shuffle keeps all elements', () => {
    const out = shuffle([1, 2, 3, 4], () => 0.1);
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
});
