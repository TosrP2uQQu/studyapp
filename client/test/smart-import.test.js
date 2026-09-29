// smart-import.test.js — T3: chunking, offline sort, summary.
import { describe, expect, it } from 'vitest';
import {
  buildImportMessages,
  chunkText,
  offlineSort,
  summarizeResult,
} from '../src/lib/smartImport';

describe('smart import', () => {
  it('chunks notes on blank lines', () => {
    const out = chunkText('a\tb\n\nc\td', 'notes');
    expect(out).toEqual(['a\tb', 'c\td']);
    expect(chunkText('   ', 'notes')).toEqual([]);
  });
  it('chunks transcripts on timestamps', () => {
    const raw = '[00:01] hello\nmore\n[00:05] world';
    const out = chunkText(raw, 'transcript');
    expect(out.length).toBe(2);
    expect(out[0]).toMatch(/hello/);
  });
  it('sorts offline on tab/comma, flags missing backs', () => {
    const out = offlineSort(['a\tb', 'x, y', 'lonely'], []);
    expect(out.cards.length).toBe(3);
    expect(out.cards[0]).toEqual({
      front: 'a',
      back: 'b',
      missing: false,
    });
    expect(out.cards[2].missing).toBe(true);
  });
  it('dedupes within paste and against existing', () => {
    const existing = [{ front: 'a', back: 'b' }];
    const out = offlineSort(['a\tb', 'a\tb', 'c\td'], existing);
    expect(out.cards.length).toBe(1);
    expect(out.skippedDuplicates).toBe(2);
  });
  it('skips empty and over-long blocks', () => {
    const out = offlineSort(['', 'x'.repeat(2001)], []);
    expect(out.cards.length).toBe(0);
    expect(out.skippedEmpty).toBe(1);
    expect(out.skippedLong).toBe(1);
  });
  it('summarizes counts for the result line', () => {
    const s = summarizeResult({
      cards: [{ front: 'a', back: '', missing: true }],
      skippedDuplicates: 2,
      skippedEmpty: 1,
      skippedLong: 0,
    });
    expect(s).toEqual({
      added: 1,
      skippedDuplicates: 2,
      skippedEmpty: 1,
      skippedLong: 0,
      needBack: 1,
    });
  });
  it('import prompt asks for JSON only', () => {
    const msgs = buildImportMessages('raw notes', 'notes');
    expect(msgs[0].content).toMatch(/JSON only/);
    expect(msgs[0].content).toMatch(/raw notes/);
  });
});
