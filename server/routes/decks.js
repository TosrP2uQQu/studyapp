const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../auth');
const sm2 = require('../sm2');

const router = express.Router();

const SHARE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateShareCode(existing) {
  const taken = new Set(existing.map((d) => d.shareCode));
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += SHARE_CHARSET[Math.floor(Math.random() * SHARE_CHARSET.length)];
    }
    if (!taken.has(code)) return code;
  }
}

function isMember(userId, deckId) {
  const memberships = db.readMemberships();
  return memberships.some((m) => m.userId === userId && m.deckId === deckId);
}

function dueCountFor(userId, deck) {
  const allProgress = db.readProgress();
  let due = 0;
  for (const card of deck.cards || []) {
    const row = allProgress.find(
      (p) => p.userId === userId && p.deckId === deck.id && p.cardId === card.id
    );
    if (!row || sm2.isDue(row.nextReviewDate)) due++;
  }
  return due;
}

// GET /api/decks — decks the current user owns OR is a member of, each with dueCount
router.get('/', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const memberships = db.readMemberships();
  const myDeckIds = new Set(
    memberships.filter((m) => m.userId === req.userId).map((m) => m.deckId)
  );
  const mine = decks.filter((d) => d.ownerId === req.userId || myDeckIds.has(d.id));
  const out = mine.map((d) => ({
    id: d.id,
    ownerId: d.ownerId,
    name: d.name,
    subject: d.subject,
    type: d.type,
    sourceLang: d.sourceLang,
    targetLang: d.targetLang,
    shareCode: d.shareCode,
    createdAt: d.createdAt,
    cardCount: (d.cards || []).length,
    dueCount: dueCountFor(req.userId, d),
    isOwner: d.ownerId === req.userId,
    studyModes: { ...db.defaultStudyModes(), ...(d.studyModes || {}) },
  }));
  res.json(out);
});

// POST /api/decks — create deck, auto-generate shareCode, add owner membership
router.post('/', authMiddleware, (req, res) => {
  const { name, subject, type, sourceLang, targetLang } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Deck name is required' });
  }
  const deckType = type === 'language' ? 'language' : 'general';
  const decks = db.readDecks();
  const users = db.readUsers();
  const owner = users.find((x) => x.id === req.userId);
  const defaults = owner ? db.normalizeUser(owner).defaultStudyModes : db.defaultStudyModes();
  const deck = {
    id: uuidv4(),
    ownerId: req.userId,
    name: String(name).trim(),
    subject: String(subject || '').trim(),
    type: deckType,
    sourceLang: deckType === 'language' ? String(sourceLang || '') : '',
    targetLang: deckType === 'language' ? String(targetLang || '') : '',
    shareCode: generateShareCode(decks),
    createdAt: new Date().toISOString(),
    cards: [],
    studyModes: { ...defaults },
  };
  decks.push(deck);
  db.writeDecks(decks);

  const memberships = db.readMemberships();
  memberships.push({ userId: req.userId, deckId: deck.id, joinedAt: new Date().toISOString() });
  db.writeMemberships(memberships);

  res.status(201).json(deck);
});

// POST /api/decks/join — join by share code (must be before /:id routes)
router.post('/join', authMiddleware, (req, res) => {
  const { shareCode } = req.body || {};
  if (!shareCode) return res.status(400).json({ error: 'shareCode is required' });
  const decks = db.readDecks();
  const deck = decks.find(
    (d) => d.shareCode === String(shareCode).toUpperCase().trim()
  );
  if (!deck) return res.status(404).json({ error: 'Deck not found for that code' });
  const memberships = db.readMemberships();
  const existing = memberships.find(
    (m) => m.userId === req.userId && m.deckId === deck.id
  );
  if (!existing) {
    memberships.push({
      userId: req.userId,
      deckId: deck.id,
      joinedAt: new Date().toISOString(),
    });
    db.writeMemberships(memberships);
    res.json({ message: 'Joined shared deck', deckId: deck.id, alreadyMember: false });
  } else {
    res.json({ message: 'Already in that deck', deckId: deck.id, alreadyMember: true });
  }
});

// GET /api/decks/:id — deck detail incl. cards (403 if not member/owner)
router.get('/:id', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  res.json({ ...db.normalizeDeck(deck), isOwner: deck.ownerId === req.userId });
});

// PUT /api/decks/:id — partial deck fields (owner only)
router.put('/:id', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can edit this deck' });
  }
  const { name, subject, type, sourceLang, targetLang } = req.body || {};
  if (name !== undefined) deck.name = String(name);
  if (subject !== undefined) deck.subject = String(subject);
  if (type !== undefined) {
    deck.type = type === 'language' ? 'language' : 'general';
    if (deck.type !== 'language') {
      deck.sourceLang = '';
      deck.targetLang = '';
    }
  }
  if (sourceLang !== undefined) deck.sourceLang = String(sourceLang);
  if (targetLang !== undefined) deck.targetLang = String(targetLang);
  db.writeDecks(decks);
  res.json(deck);
});

// DELETE /api/decks/:id — owner only
router.delete('/:id', authMiddleware, (req, res) => {
  let decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can delete this deck' });
  }
  decks = decks.filter((d) => d.id !== deck.id);
  db.writeDecks(decks);
  const memberships = db.readMemberships().filter((m) => m.deckId !== deck.id);
  db.writeMemberships(memberships);
  const progress = db.readProgress().filter((p) => p.deckId !== deck.id);
  db.writeProgress(progress);
  res.json({ message: 'Deck deleted' });
});

// ---- study + review + recall (progress.js concerns, mounted under decks router) ----

// GET /api/decks/:id/study — due cards for current user
router.get('/:id/study', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const allProgress = db.readProgress();
  const due = [];
  for (const card of deck.cards || []) {
    const row = allProgress.find(
      (p) => p.userId === req.userId && p.deckId === deck.id && p.cardId === card.id
    );
    if (!row) {
      due.push({ ...card, progress: { ...sm2.defaultProgress(), lastRating: null } });
    } else if (sm2.isDue(row.nextReviewDate)) {
      due.push({ ...card, progress: row });
    }
  }
  res.json({ deckId: deck.id, due });
});

// POST /api/decks/:id/cards/:cardId/review — run SM-2, upsert progress row
router.post('/:id/cards/:cardId/review', authMiddleware, (req, res) => {
  const { rating } = req.body || {};
  if (!['easy', 'ok', 'hard'].includes(rating)) {
    return res.status(400).json({ error: 'rating must be easy, ok, or hard' });
  }
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const card = (deck.cards || []).find((c) => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const q = sm2.ratingToQuality(rating);
  const allProgress = db.readProgress();
  let row = allProgress.find(
    (p) => p.userId === req.userId && p.deckId === deck.id && p.cardId === card.id
  );
  const prev = sm2.snapshotPrev(row);
  const prevInterval = row ? row.interval || 0 : 0;
  const prevEf = row ? row.easeFactor || 2.5 : 2.5;
  const base = row
    ? { repetitions: row.repetitions, easeFactor: row.easeFactor, interval: row.interval }
    : { repetitions: 0, easeFactor: 2.5, interval: 0 };
  const next = sm2.reviewCard(base, q);
  const now = new Date().toISOString();
  if (row) {
    Object.assign(row, next, {
      lastRating: rating,
      lastReviewedAt: now,
      prev,
    });
  } else {
    row = {
      userId: req.userId,
      deckId: deck.id,
      cardId: card.id,
      ...next,
      lastRating: rating,
      lastReviewedAt: now,
      prev,
    };
    allProgress.push(row);
  }
  // Append-only review log, written in the same tick as the SM-2 update.
  // mode/ms come from the client when known; quality mirrors the rating.
  const reviews = db.readReviews();
  const entry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    cardId: card.id,
    deckId: deck.id,
    userId: req.userId,
    ts: now,
    rating,
    quality: q,
    mode: typeof req.body.mode === 'string' ? req.body.mode : 'flip',
    ms: Number.isFinite(req.body.ms) ? req.body.ms : null,
    confidence: [1, 2, 3].includes(req.body.confidence)
      ? req.body.confidence
      : null,
    prevInterval,
    newInterval: next.interval,
    ef: next.easeFactor,
    undone: false,
  };
  reviews.push(entry);
  db.writeProgress(allProgress);
  db.writeReviews(reviews);
  res.json({ ...row, reviewId: entry.id });
});

// POST /:id/cards/:cardId/undo — revert the latest rating on a card.
// Body: { reviewId }. Only the row that created reviewId can be undone,
// and only once. Restores the SM-2 snapshot and marks the log row undone.
router.post('/:id/cards/:cardId/undo', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const { reviewId } = req.body || {};
  const reviews = db.readReviews();
  const entry = reviews.find(
    (r) =>
      r.id === reviewId &&
      r.userId === req.userId &&
      r.deckId === deck.id &&
      r.cardId === req.params.cardId &&
      !r.undone
  );
  if (!entry) {
    return res.status(404).json({ error: 'Nothing to undo' });
  }
  const allProgress = db.readProgress();
  const row = allProgress.find(
    (p) =>
      p.userId === req.userId &&
      p.deckId === deck.id &&
      p.cardId === req.params.cardId
  );
  // Only undo if no newer rating superseded this one.
  if (!row || row.lastReviewedAt !== entry.ts) {
    return res.status(409).json({ error: 'A newer rating exists' });
  }
  Object.assign(row, sm2.restorePrev(row.prev));
  delete row.prev;
  entry.undone = true;
  db.writeProgress(allProgress);
  db.writeReviews(reviews);
  res.json(row);
});

// GET /api/decks/:id/recall-sheet — all cards + user's lastRating, hard first
router.get('/:id/recall-sheet', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const allProgress = db.readProgress();
  const byCard = new Map();
  for (const p of allProgress) {
    if (p.userId === req.userId && p.deckId === deck.id) byCard.set(p.cardId, p);
  }
  const withRating = (deck.cards || []).map((c) => ({
    ...c,
    lastRating: byCard.get(c.id)?.lastRating ?? null,
    nextReviewDate: byCard.get(c.id)?.nextReviewDate ?? null,
  }));
  const hard = withRating.filter((c) => c.lastRating === 'hard');
  const rest = withRating.filter((c) => c.lastRating !== 'hard');
  res.json({ deckId: deck.id, hard, rest, all: withRating });
});

// PATCH /api/decks/:id/study-modes — owner only
// body: { typedRecall?, pretest?, elaborativePrompts? }
router.patch('/:id/study-modes', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can change study modes' });
  }
  const modes = { ...db.defaultStudyModes(), ...(deck.studyModes || {}) };
  for (const key of ['typedRecall', 'pretest', 'elaborativePrompts', 'writtenRecallAI']) {
    if (req.body && req.body[key] !== undefined) modes[key] = req.body[key] === true;
  }
  deck.studyModes = modes;
  db.writeDecks(decks);
  res.json({ studyModes: modes });
});

// GET /api/decks/:id/export — front/back CSV, one button per deck.
// Keeps every deck portable and never locked into this app.
router.get('/:id/export', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['front,back'];
  for (const c of deck.cards || []) lines.push(`${esc(c.front)},${esc(c.back)}`);
  const safe = deck.name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40) || 'deck';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
  res.send(lines.join('\n'));
});

// POST /api/decks/mixed-review — Mixed Review (interleaving): due cards
// from more than one deck in a single shuffled session. Reviews still go
// through the normal per-card review endpoint, so SM-2 stays the single
// source of truth for scheduling.
router.post('/mixed-review', authMiddleware, (req, res) => {
  const { deckIds } = req.body || {};
  if (!Array.isArray(deckIds) || deckIds.length < 1) {
    return res.status(400).json({ error: 'deckIds must be a non-empty array' });
  }
  const decks = db.readDecks();
  const allProgress = db.readProgress();
  const cards = [];
  for (const deckId of deckIds) {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) continue;
    if (deck.ownerId !== req.userId && !isMember(req.userId, deck.id)) continue;
    for (const card of deck.cards || []) {
      const row = allProgress.find(
        (p) => p.userId === req.userId && p.deckId === deck.id && p.cardId === card.id
      );
      if (!row || sm2.isDue(row.nextReviewDate)) {
        cards.push({
          deckId: deck.id,
          deckName: deck.name,
          deckType: deck.type,
          ...card,
          progress: row || { ...sm2.defaultProgress(), lastRating: null },
        });
      }
    }
  }
  // Shuffle so topics mix instead of blocking by deck.
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  res.json({ count: cards.length, cards: cards.slice(0, 100) });
});

module.exports = router;
