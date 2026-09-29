const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router({ mergeParams: true });

// POST /api/decks/:id/cards — { front, back } or { cards: [{front, back}] }
router.post('/', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can add cards' });
  }

  let incoming = [];
  if (Array.isArray(req.body.cards)) {
    incoming = req.body.cards;
  } else if (req.body.front !== undefined || req.body.back !== undefined) {
    incoming = [{ front: req.body.front, back: req.body.back }];
  } else {
    return res.status(400).json({ error: 'Provide { front, back } or { cards: [...] }' });
  }

  const added = [];
  for (const item of incoming) {
    const front = String(item.front ?? '').trim();
    const back = String(item.back ?? '').trim();
    if (!front && !back) continue;
    const card = {
      id: uuidv4(),
      front,
      back,
      createdAt: new Date().toISOString(),
    };
    deck.cards.push(card);
    added.push(card);
  }
  db.writeDecks(decks);
  res.status(201).json({ added, count: added.length });
});

// PUT /api/decks/:id/cards/:cardId — { front, back }
router.put('/:cardId', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can edit cards' });
  }
  const card = (deck.cards || []).find((c) => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (req.body.front !== undefined) card.front = String(req.body.front);
  if (req.body.back !== undefined) card.back = String(req.body.back);
  db.writeDecks(decks);
  res.json(card);
});

// DELETE /api/decks/:id/cards/:cardId
router.delete('/:cardId', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (deck.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can delete cards' });
  }
  const before = (deck.cards || []).length;
  deck.cards = (deck.cards || []).filter((c) => c.id !== req.params.cardId);
  if (deck.cards.length === before) return res.status(404).json({ error: 'Card not found' });
  db.writeDecks(decks);
  const progress = db.readProgress().filter(
    (p) => !(p.deckId === deck.id && p.cardId === req.params.cardId)
  );
  db.writeProgress(progress);
  res.json({ message: 'Card deleted' });
});

module.exports = router;
