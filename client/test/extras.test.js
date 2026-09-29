// extras.test.js — T10: share-code round-trip (+SD0 fallback),
// confidence passthrough, leech split helper.
import { describe, expect, it } from 'vitest';
import {
  compressionSupported,
  decodeDeck,
  encodeDeck,
  encodeDeckSync,
} from '../src/lib/share';
import { logReview, lastN } from '../src/lib/reviews';
import { MemoryAdapter } from '../src/lib/storage';

const DECK = {
  name: 'demo',
  cards: [
    { front: 'ačiū', back: 'thanks' },
    { front: 'x', back: '' },
  ],
};

describe('share codes', () => {
  it('SD0 sync round-trips', async () => {
    const code = encodeDeckSync(DECK);
    expect(code.startsWith('SD0:')).toBe(true);
    const back = await decodeDeck(code);
    expect(back.name).toBe('demo');
    expect(back.cards.length).toBe(2);
    expect(back.cards[0].front).toBe('ačiū');
  });
  it('async encode prefers SD1 where supported', async () => {
    const code = await encodeDeck(DECK);
    if (compressionSupported()) {
      expect(code.startsWith('SD1:')).toBe(true);
      const back = await decodeDeck(code);
      expect(back.cards.length).toBe(2);
    } else {
      expect(code.startsWith('SD0:')).toBe(true);
    }
  });
  it('rejects garbage, wrong shape, empties', async () => {
    await expect(decodeDeck('hello')).rejects.toThrow();
    await expect(decodeDeck('SD0:bm90LWpzb24=')).rejects.toThrow();
    const empty = encodeDeckSync({ name: 'e', cards: [] });
    await expect(decodeDeck(empty)).rejects.toThrow();
  });
  it('caps size (2000 cards, 2000 chars)', () => {
    const big = {
      name: 'b',
      cards: Array.from({ length: 2500 }, () => ({
        front: 'x'.repeat(3000),
        back: 'y',
      })),
    };
    const code = encodeDeckSync(big);
    return decodeDeck(code).then((back) => {
      expect(back.cards.length).toBe(2000);
      expect(back.cards[0].front.length).toBe(2000);
    });
  });
});

describe('confidence passthrough', () => {
  it('stores confidence 1-3 in the mirror', () => {
    const ad = new MemoryAdapter();
    logReview({ cardId: 'c', rating: 'ok', confidence: 2 }, ad);
    expect(lastN('c', 8, ad)[0].confidence).toBe(2);
  });
});
