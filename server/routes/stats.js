const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const sm2 = require('../sm2');

const router = express.Router();

function dateOnly(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Streak: consecutive days ending today (or yesterday if nothing reviewed
// yet today) with at least one card reviewed. Purely a personal
// adherence indicator — no points, no sharing.
function computeStreak(reviewDates) {
  const days = new Set(reviewDates);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dateOnly(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(dateOnly(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Card buckets, stated plainly so the UI can label them honestly:
// new = never reviewed; learning = reviewed but fewer than 3 successful
// recalls; mastered = interval grown to 30+ days; due = review date
// reached (includes every new card).
function bucketize(deck, progressByCard) {
  let total = 0;
  let isNew = 0;
  let learning = 0;
  let mastered = 0;
  let due = 0;
  for (const card of deck.cards || []) {
    total++;
    const row = progressByCard.get(card.id);
    if (!row) {
      isNew++;
      due++;
      continue;
    }
    if (row.repetitions < 3) learning++;
    if (row.interval >= 30) mastered++;
    if (sm2.isDue(row.nextReviewDate)) due++;
  }
  return { total, new: isNew, learning, due, mastered };
}

router.get('/', authMiddleware, (req, res) => {
  const userId = req.userId;
  const decks = db.readDecks().map(db.normalizeDeck);
  const memberships = db.readMemberships();
  const myDeckIds = new Set(
    memberships.filter((m) => m.userId === userId).map((m) => m.deckId)
  );
  const mine = decks.filter((d) => d.ownerId === userId || myDeckIds.has(d.id));
  const allProgress = db.readProgress().filter((p) => p.userId === userId);

  const perDeck = mine.map((d) => {
    const byCard = new Map();
    for (const p of allProgress) {
      if (p.deckId === d.id) byCard.set(p.cardId, p);
    }
    return { deckId: d.id, name: d.name, ...bucketize(d, byCard) };
  });

  const sum = (k) => perDeck.reduce((a, d) => a + d[k], 0);
  const total = {
    decks: mine.length,
    cards: sum('total'),
    new: sum('new'),
    learning: sum('learning'),
    due: sum('due'),
    mastered: sum('mastered'),
  };

  // Cards reviewed per day, last 30 days, from real review timestamps.
  const counts = new Map();
  const reviewDates = [];
  for (const p of allProgress) {
    if (!p.lastReviewedAt) continue;
    const day = dateOnly(p.lastReviewedAt);
    reviewDates.push(day);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const reviewsPerDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const day = dateOnly(d);
    reviewsPerDay.push({ date: day, count: counts.get(day) || 0 });
  }

  const quizResults = db.readQuizResults().filter((q) => q.userId === userId);

  res.json({
    streak: computeStreak(reviewDates),
    total,
    perDeck,
    reviewsPerDay,
    quizSessions: quizResults.length,
  });
});

module.exports = router;
