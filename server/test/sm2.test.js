// Unit tests for the SM-2 module (server/sm2.js).
// Expected values below are hand-computed from the implemented formulas:
//   easeFactor += 0.1 - (5-q) * (0.08 + (5-q) * 0.02), floored at 1.3
//   reps 0 -> interval 1; reps 1 -> interval 6; else round(interval * EF)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sm2 = require('../sm2');

function approx(a, b) {
  assert.ok(Math.abs(a - b) < 1e-9, `expected ~${b}, got ${a}`);
}

function expectedDate(daysOut) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysOut);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('reviewCard', () => {
  it('brand-new card rated Easy three times: intervals 1, 6, 17', () => {
    let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
    let r = sm2.reviewCard(p, 5);
    assert.equal(r.repetitions, 1);
    assert.equal(r.interval, 1);
    approx(r.easeFactor, 2.6);
    assert.equal(r.nextReviewDate, expectedDate(1));

    r = sm2.reviewCard(r, 5);
    assert.equal(r.repetitions, 2);
    assert.equal(r.interval, 6);
    approx(r.easeFactor, 2.7);
    assert.equal(r.nextReviewDate, expectedDate(6));

    r = sm2.reviewCard(r, 5);
    assert.equal(r.repetitions, 3);
    assert.equal(r.interval, 17); // round(6 * 2.8) = round(16.8)
    approx(r.easeFactor, 2.8);
    assert.equal(r.nextReviewDate, expectedDate(17));
  });

  it('Hard every time grows ease slowly: EF 2.36, 2.22, interval 12', () => {
    let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
    let r = sm2.reviewCard(p, 3);
    assert.equal(r.repetitions, 1);
    assert.equal(r.interval, 1);
    approx(r.easeFactor, 2.36); // 2.5 + (0.1 - 2*0.12)

    r = sm2.reviewCard(r, 3);
    assert.equal(r.repetitions, 2);
    assert.equal(r.interval, 6);
    approx(r.easeFactor, 2.22);

    r = sm2.reviewCard(r, 3);
    assert.equal(r.repetitions, 3);
    assert.equal(r.interval, 12); // round(6 * 2.08) = round(12.48)
    approx(r.easeFactor, 2.08);
  });

  it('mixed Easy, Hard, OK', () => {
    let r = sm2.reviewCard({ repetitions: 0, easeFactor: 2.5, interval: 0 }, 5);
    approx(r.easeFactor, 2.6);
    r = sm2.reviewCard(r, 3);
    approx(r.easeFactor, 2.46); // 2.6 - 0.14
    assert.equal(r.interval, 6);
    r = sm2.reviewCard(r, 4);
    approx(r.easeFactor, 2.46); // q=4 leaves EF unchanged: 0.1 - 1*0.10 = 0
    assert.equal(r.interval, 15); // round(6 * 2.46) = round(14.76)
    assert.equal(r.repetitions, 3);
  });

  it('ease factor never drops below 1.3', () => {
    let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
    for (let i = 0; i < 20; i++) p = sm2.reviewCard(p, 3);
    assert.equal(p.easeFactor, 1.3);
    assert.equal(p.repetitions, 20);
  });
});

describe('helpers', () => {
  it('ratingToQuality maps hard/ok/easy to 3/4/5 and rejects junk', () => {
    assert.equal(sm2.ratingToQuality('hard'), 3);
    assert.equal(sm2.ratingToQuality('ok'), 4);
    assert.equal(sm2.ratingToQuality('easy'), 5);
    assert.throws(() => sm2.ratingToQuality('nope'));
  });

  it('defaultProgress is a due-now card', () => {
    const d = sm2.defaultProgress();
    assert.deepEqual(
      { repetitions: d.repetitions, easeFactor: d.easeFactor, interval: d.interval },
      { repetitions: 0, easeFactor: 2.5, interval: 0 }
    );
    assert.ok(sm2.isDue(d.nextReviewDate));
  });

  it('isDue compares date-only: past and today due, future not', () => {
    assert.equal(sm2.isDue('2000-01-01'), true);
    assert.equal(sm2.isDue(null), true);
    assert.equal(sm2.isDue('2999-12-31'), false);
  });
});
