// reviewStats.js — pure aggregation over the append-only review
// log. Used by the recall-sheet endpoint and (via the same shapes)
// the client mirror. No Express dependency.
function scoreOf(rating) {
  if (rating === 'hard') return 0;
  if (rating === 'ok') return 1;
  return 2;
}

// Trend from the last reviews: compare the mean score of the most
// recent half against the older half (needs 4+ reviews).
function trendOf(rows) {
  const seq = rows.filter((r) => !r.undone).slice(-8);
  if (seq.length < 4) return 'flat';
  const half = Math.floor(seq.length / 2);
  const older = seq.slice(0, half);
  const newer = seq.slice(half);
  const mean = (xs) =>
    xs.reduce((a, r) => a + scoreOf(r.rating), 0) / xs.length;
  const diff = mean(newer) - mean(older);
  if (diff > 0.25) return 'improving';
  if (diff < -0.25) return 'worsening';
  return 'flat';
}

function countsOf(rows) {
  const out = { hard: 0, ok: 0, easy: 0 };
  for (const r of rows) {
    if (r.undone) continue;
    if (r.rating === 'hard') out.hard++;
    else if (r.rating === 'ok') out.ok++;
    else if (r.rating === 'easy') out.easy++;
  }
  return out;
}

function leechOf(rows) {
  const seq = rows.filter((r) => !r.undone);
  const recent = seq.slice(-8);
  const hardRecent = recent.filter((r) => r.rating === 'hard').length;
  if (recent.length >= 4 && hardRecent >= 4) return true;
  return countsOf(rows).hard >= 8;
}

function difficultyOf(rows) {
  const seq = rows.filter((r) => !r.undone);
  if (!seq.length) return 0;
  const recent = seq.slice(-8);
  let w = 0;
  let total = 0;
  recent.forEach((r, i) => {
    const weight = i + 1;
    total += weight;
    if (r.rating === 'hard') w += weight;
  });
  const hardShare = total ? w / total : 0;
  const lapses = seq.filter((r) => r.rating === 'hard').length;
  const slow = seq.filter(
    (r) => typeof r.ms === 'number' && r.ms > 20000
  ).length;
  const score = hardShare * 70 + Math.min(lapses, 10) * 2;
  return Math.max(0, Math.min(100, Math.round(score + Math.min(slow, 5))));
}

// Aggregate one card's rows into the recall-sheet shape.
function aggregateCard(cardId, rows) {
  const seq = rows
    .filter((r) => r.cardId === cardId && !r.undone)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const counts = countsOf(seq);
  const last = seq.length ? seq[seq.length - 1].rating : null;
  return {
    lastRating: last,
    counts,
    total: seq.length,
    trend: trendOf(seq),
    difficulty: difficultyOf(seq),
    leech: leechOf(seq),
  };
}

module.exports = {
  aggregateCard,
  countsOf,
  difficultyOf,
  leechOf,
  trendOf,
};
