// reviews.test.js — T1 regression tests for the bug-hunt list.
// Run: npm test (node --test test/reviews.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const sm2 = require('../sm2');

test('first and second intervals are 1 and 6', () => {
  const p0 = { repetitions: 0, easeFactor: 2.5, interval: 0 };
  assert.equal(sm2.reviewCard(p0, 4).interval, 1);
  const p1 = { repetitions: 1, easeFactor: 2.5, interval: 1 };
  assert.equal(sm2.reviewCard(p1, 4).interval, 6);
});

test('later intervals round interval * EF', () => {
  const p = { repetitions: 2, easeFactor: 2.5, interval: 6 };
  // q=4 leaves EF at 2.5, so 6 * 2.5 = 15
  assert.equal(sm2.reviewCard(p, 4).interval, 15);
});

test('quality below 3 resets reps and interval', () => {
  const p = { repetitions: 5, easeFactor: 2.4, interval: 30 };
  const next = sm2.reviewCard(p, 2);
  assert.equal(next.repetitions, 0);
  assert.equal(next.interval, 0);
});

test('EF never drops below 1.3', () => {
  let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
  for (let i = 0; i < 25; i++) {
    p = { ...p, ...sm2.reviewCard(p, 3) };
  }
  assert.ok(p.easeFactor >= 1.3);
  const q2 = sm2.reviewCard(
    { repetitions: 3, easeFactor: 1.31, interval: 10 },
    0
  );
  assert.equal(q2.easeFactor, 1.3);
});

test('rating mapping and invalid rating throw', () => {
  assert.equal(sm2.ratingToQuality('hard'), 3);
  assert.equal(sm2.ratingToQuality('ok'), 4);
  assert.equal(sm2.ratingToQuality('easy'), 5);
  assert.throws(() => sm2.ratingToQuality('nope'));
});

test('snapshot and restore round-trip for undo', () => {
  const row = {
    repetitions: 3,
    easeFactor: 2.46,
    interval: 15,
    nextReviewDate: '2026-09-20',
    lastRating: 'ok',
    lastReviewedAt: '2026-09-05T10:00:00.000Z',
  };
  const prev = sm2.snapshotPrev(row);
  const changed = { ...row, ...sm2.reviewCard(row, 5) };
  assert.notEqual(changed.interval, row.interval);
  const restored = sm2.restorePrev(prev);
  assert.equal(restored.interval, 15);
  assert.equal(restored.easeFactor, 2.46);
  assert.equal(restored.repetitions, 3);
  assert.equal(restored.lastRating, 'ok');
});

test('snapshot of a fresh card is null-safe', () => {
  const restored = sm2.restorePrev(sm2.snapshotPrev(null));
  assert.equal(restored.repetitions, 0);
  assert.equal(restored.easeFactor, 2.5);
});
