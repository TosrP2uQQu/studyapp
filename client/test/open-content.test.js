// open-content.test.js — T8: delimiter detect, CSV, wiki shape.
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  detectDelimiter,
  download,
  parseCsv,
  parseDelimited,
  splitBlocks,
  toCsv,
  toJson,
  toTsv,
} from '../src/lib/importers';
import { fetchSummary, wikiEndpoint } from '../src/lib/wiki';

describe('importers', () => {
  it('detects tab, semicolon, comma, or plain lines', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
    expect(detectDelimiter('a;b\nc;d')).toBe(';');
    expect(detectDelimiter('a,b\nc,d')).toBe(',');
    expect(detectDelimiter('lonely\nlines')).toBe('\n');
    expect(detectDelimiter('')).toBe('\t');
  });
  it('splits blank-line groups before single lines', () => {
    expect(splitBlocks('a\n\nb')).toEqual(['a', 'b']);
    expect(splitBlocks('a\nb')).toEqual(['a', 'b']);
    expect(splitBlocks('')).toEqual([]);
  });
  it('parses semicolon exports', () => {
    const { cards, delim } = parseDelimited('a;b\nc;d');
    expect(delim).toBe(';');
    expect(cards).toEqual([
      { front: 'a', back: 'b', missing: false },
      { front: 'c', back: 'd', missing: false },
    ]);
  });
  it('parses CSV with headers and quotes', () => {
    const { cards } = parseCsv(
      'front,back\n"a, b",c\nlonely,'
    );
    expect(cards[0]).toEqual({
      front: 'a, b',
      back: 'c',
      missing: false,
    });
    expect(cards[1].missing).toBe(true);
  });
  it('rejects CSV without known headers', () => {
    expect(parseCsv('x,y\na,b').cards).toEqual([]);
  });
  it('exports round-trip', () => {
    const cards = [{ front: 'a"b', back: 'c' }];
    expect(toCsv(cards)).toBe('front,back\n"a""b","c"');
    expect(toTsv(cards)).toBe('a"b\tc');
    expect(JSON.parse(toJson(cards, 'd')).cards.length).toBe(1);
  });
});

describe('wikipedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('endpoint is per-language', () => {
    expect(wikiEndpoint('lt')).toBe('https://lt.wikipedia.org/w/api.php');
  });
  it('returns extract + link + license', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              1: { title: 'Vilnius', extract: 'Capital of Lithuania.' },
            },
          },
        }),
      }))
    );
    const out = await fetchSummary('Vilnius', 'en');
    expect(out.title).toBe('Vilnius');
    expect(out.extract).toMatch(/Capital/);
    expect(out.url).toMatch(/wikipedia\.org/);
    expect(out.license).toBe('CC BY-SA');
  });
  it('throws not-found on missing pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ query: { pages: { 1: { missing: true } } } }),
      }))
    );
    await expect(fetchSummary('zzzqqq', 'en')).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
