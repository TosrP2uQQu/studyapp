// reviewStats.test.js — T4 aggregation regression tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../reviewStats');

function row(cardId, rating, ts) {
  return { cardId, rating, ts, undone: false };
}

test('aggregateCard on an unrated card', () => {
  const a = stats.aggregateCard('c1', []);
  assert.equal(a.lastRating, null);
  assert.deepEqual(a.counts, { hard: 0, ok: 0, easy: 0 });
  assert.equal(a.total, 0);
  assert.equal(a.trend, 'flat');
  assert.equal(a.difficulty, 0);
  assert.equal(a.leech, false);
});

test('counts and last rating', () => {
  const rows = [
    row('c1', 'hard', '2026-09-01T10:00:00Z'),
    row('c1', 'ok', '2026-09-02T10:00:00Z'),
    row('c1', 'easy', '2026-09-03T10:00:00Z'),
    row('c2', 'hard', '2026-09-03T10:00:00Z'),
  ];
  const a = stats.aggregateCard('c1', rows);
  assert.equal(a.lastRating, 'easy');
  assert.deepEqual(a.counts, { hard: 1, ok: 1, easy: 1 });
  assert.equal(a.total, 3);
});

test('undone rows are excluded', () => {
  const rows = [
    row('c1', 'hard', '2026-09-01T10:00:00Z'),
    { cardId: 'c1', rating: 'hard', ts: '2026-09-02T10:00:00Z', undone: true },
  ];
  const a = stats.aggregateCard('c1', rows);
  assert.equal(a.total, 1);
  assert.equal(a.counts.hard, 1);
});

test('trend improving / worsening / flat', () => {
  const mk = (seq) => seq.map((r, i) =>
    row('c', r, `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`));
  assert.equal(
    stats.trendOf(mk(['hard', 'hard', 'easy', 'easy'])),
    'improving'
  );
  assert.equal(
    stats.trendOf(mk(['easy', 'easy', 'hard', 'hard'])),
    'worsening'
  );
  assert.equal(stats.trendOf(mk(['ok', 'ok'])), 'flat');
});

test('leech rule: 4 hard in last 8, or 8 lapses', () => {
  const mk = (seq) => seq.map((r, i) =>
    row('c', r, `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`));
  assert.equal(
    stats.leechOf(mk(['ok', 'hard', 'hard', 'hard', 'hard'])),
    true
  );
  assert.equal(stats.leechOf(mk(['ok', 'hard', 'ok'])), false);
  const many = [];
  for (let i = 0; i < 8; i++) {
    many.push(row('c', i % 3 === 0 ? 'ok' : 'hard', `2026-08-${i + 1}T10:00:00Z`));
  }
  assert.equal(stats.leechOf(many), true);
});

test('difficulty 0-100, hard cards score high', () => {
  assert.equal(stats.difficultyOf([]), 0);
  const mk = (n, r) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(row('c', r, `2026-09-${i + 1}T10:00:00Z`));
    return out;
  };
  const hard = stats.difficultyOf(mk(6, 'hard'));
  const easy = stats.difficultyOf(mk(6, 'easy'));
  assert.ok(hard > 50);
  assert.ok(easy < hard);
  assert.ok(hard <= 100 && easy >= 0);
});
