// sm2.js — spaced repetition algorithm (isolated pure module, no Express).
// Rating -> quality mapping: hard=3, ok=4, easy=5.
function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function ratingToQuality(rating) {
  if (rating === 'hard') return 3;
  if (rating === 'ok') return 4;
  if (rating === 'easy') return 5;
  throw new Error('Invalid rating: ' + rating);
}

function defaultProgress() {
  return {
    repetitions: 0,
    easeFactor: 2.5,
    interval: 0,
    nextReviewDate: toISODateOnly(todayDateOnly()),
  };
}

// NOTE: Hard/OK/Easy map to q 3/4/5, so ratings never trigger the
// q<3 relearning reset in normal study — `hard` simply grows the
// interval more slowly than `easy`. The reset path exists for API
// completeness and is covered by tests.
function reviewCard(progress, q) {
  let { repetitions, easeFactor, interval } = progress;

  // Update ease factor first, using the classic SM-2 formula.
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  if (q < 3) {
    // Failed recall: reset to relearning, keep the floored EF.
    repetitions = 0;
    interval = 0;
  } else if (repetitions === 0) {
    interval = 1;
  } else if (repetitions === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * easeFactor);
  }
  if (q >= 3) repetitions = repetitions + 1;

  const nextReviewDate = toISODateOnly(addDays(todayDateOnly(), interval));

  return { repetitions, easeFactor, interval, nextReviewDate };
}

function isDue(nextReviewDate) {
  if (!nextReviewDate) return true;
  // Compare date-only strings lexicographically (YYYY-MM-DD sorts correctly).
  const today = toISODateOnly(todayDateOnly());
  const day = String(nextReviewDate).slice(0, 10);
  return day <= today;
}

// Snapshot the schedulable state before a review so Undo can restore it.
function snapshotPrev(row) {
  if (!row) return null;
  return {
    repetitions: row.repetitions || 0,
    easeFactor: row.easeFactor || 2.5,
    interval: row.interval || 0,
    nextReviewDate: row.nextReviewDate || null,
    lastRating: row.lastRating || null,
    lastReviewedAt: row.lastReviewedAt || null,
  };
}

// Restore a snapshot taken by snapshotPrev. Returns the restored fields.
function restorePrev(prev) {
  const p = prev || {};
  return {
    repetitions: p.repetitions || 0,
    easeFactor: p.easeFactor || 2.5,
    interval: p.interval || 0,
    nextReviewDate: p.nextReviewDate || null,
    lastRating: p.lastRating || null,
    lastReviewedAt: p.lastReviewedAt || null,
  };
}

module.exports = {
  reviewCard,
  ratingToQuality,
  defaultProgress,
  isDue,
  toISODateOnly,
  todayDateOnly,
  snapshotPrev,
  restorePrev,
};
