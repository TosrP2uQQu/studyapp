// foundation.test.js — T1 regression tests: day rollover,
// NFC/accents, review log + undo, leech, rate guard.
import { describe, expect, it } from 'vitest';
import {
  DAY_START_HOUR,
  dayString,
  dueString,
  sameStudyDay,
  studyDayString,
} from '../src/lib/day';
import {
  matchesQuery,
  normCardSide,
  normSearch,
  sideTooLong,
  toNFC,
} from '../src/lib/text';
import {
  MemoryAdapter,
  getAdapter,
  loadCursor,
  saveCursor,
} from '../src/lib/storage';
import {
  createRateGuard,
  difficultyScore,
  isLeech,
  lastN,
  logReview,
  popUndo,
  ratingCounts,
  undoDepth,
} from '../src/lib/reviews';

function local(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min || 0, 0, 0);
}

describe('study day boundaries', () => {
  it('rolls over at 04:00, not midnight', () => {
    expect(DAY_START_HOUR).toBe(4);
    expect(studyDayString(local(2026, 3, 10, 3, 59))).toBe(
      '2026-03-09'
    );
    expect(studyDayString(local(2026, 3, 10, 4, 0))).toBe(
      '2026-03-10'
    );
    expect(studyDayString(local(2026, 3, 10, 0, 30))).toBe(
      '2026-03-09'
    );
  });
  it('sameStudyDay spans midnight before 04:00', () => {
    const a = local(2026, 3, 9, 23, 30);
    const b = local(2026, 3, 10, 2, 0);
    expect(sameStudyDay(a, b)).toBe(true);
    expect(sameStudyDay(a, local(2026, 3, 10, 5, 0))).toBe(
      false
    );
  });
  it('dueString is DST-safe (spring forward)', () => {
    // 2026-03-29 is the EU spring-forward Sunday.
    expect(dueString('2026-03-28', 1)).toBe('2026-03-29');
    expect(dueString('2026-03-28', 2)).toBe('2026-03-30');
    expect(dueString('2026-10-24', 2)).toBe('2026-10-26');
    expect(dayString(local(2026, 9, 29, 12))).toBe(
      '2026-09-29'
    );
  });
});

describe('text normalisation', () => {
  it('NFC composes decomposed input', () => {
    const decomposed = 'e\u0301';
    expect(toNFC(decomposed)).toBe('\u00e9');
    expect(toNFC(decomposed).length).toBe(1);
  });
  it('search is accent-insensitive', () => {
    expect(matchesQuery('ąžuolas', 'azuolas')).toBe(true);
    expect(matchesQuery('KÖLN', 'koln')).toBe(true);
    expect(matchesQuery('labas', 'LAB')).toBe(true);
    expect(matchesQuery('labas', 'viso')).toBe(false);
    expect(normSearch('Ė').length).toBeGreaterThan(0);
  });
  it('import trims, collapses, rejects junk', () => {
    expect(normCardSide('  labas   pasauli  ')).toBe(
      'labas pasauli'
    );
    expect(normCardSide('   ')).toBe('');
    expect(sideTooLong('x'.repeat(2001))).toBe(true);
    expect(sideTooLong('ok')).toBe(false);
  });
});

describe('review log + undo', () => {
  function fresh() {
    return new MemoryAdapter();
  }
  it('appends and reads back per card', () => {
    const ad = fresh();
    logReview({ cardId: 'c1', rating: 'hard' }, ad);
    logReview({ cardId: 'c1', rating: 'ok' }, ad);
    logReview({ cardId: 'c2', rating: 'easy' }, ad);
    expect(lastN('c1', 8, ad).length).toBe(2);
    expect(ratingCounts('c1', ad)).toEqual({
      hard: 1,
      ok: 1,
      easy: 0,
    });
  });
  it('undo pops latest first, caps depth at 10', () => {
    const ad = fresh();
    for (let i = 0; i < 12; i++) {
      logReview({ cardId: 'c1', rating: 'ok' }, ad);
    }
    expect(undoDepth(ad)).toBe(10);
    const popped = popUndo(ad);
    expect(popped.cardId).toBe('c1');
    expect(undoDepth(ad)).toBe(10);
  });
  it('undone rows are invisible to counts', () => {
    const ad = fresh();
    logReview({ cardId: 'c1', rating: 'hard' }, ad);
    popUndo(ad);
    expect(ratingCounts('c1', ad).hard).toBe(0);
    expect(lastN('c1', 8, ad).length).toBe(0);
  });
  it('leech flags 4 hard in last 8', () => {
    const ad = fresh();
    expect(isLeech('c9', ad)).toBe(false);
    const seq = ['ok', 'hard', 'hard', 'ok', 'hard', 'hard'];
    seq.forEach((r) => logReview({ cardId: 'c9', rating: r }, ad));
    expect(isLeech('c9', ad)).toBe(true);
  });
  it('difficulty 0 for new cards, high for hard cards', () => {
    const ad = fresh();
    expect(difficultyScore('new', ad)).toBe(0);
    for (let i = 0; i < 6; i++) {
      logReview({ cardId: 'h', rating: 'hard' }, ad);
    }
    expect(difficultyScore('h', ad)).toBeGreaterThan(50);
  });
  it('rate guard blocks double taps', () => {
    const tryAcquire = createRateGuard();
    expect(tryAcquire()).toBe(true);
    expect(tryAcquire()).toBe(false);
  });
});

describe('storage adapter + cursor', () => {
  it('memory adapter round-trips', () => {
    const ad = new MemoryAdapter();
    expect(ad.get('x')).toBe(null);
    ad.set('x', { a: 1 });
    expect(ad.get('x')).toEqual({ a: 1 });
    ad.remove('x');
    expect(ad.get('x')).toBe(null);
  });
  it('singleton adapter is usable', () => {
    expect(getAdapter().get('__probe__')).toBe(null);
  });
  it('cursor survives in sessionStorage', () => {
    saveCursor('deck-probe', 4);
    expect(loadCursor('deck-probe')).toBe(4);
  });
});
