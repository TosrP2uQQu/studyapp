// POST /api/examples/lithuanian — one-click example decks for new
// Lithuanian-speaking users (offered in onboarding). Creates up to 4 decks
// with verified content. Skips any deck name the caller already owns, so it
// is safe to call twice. No AI, no key, works fully offline.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../auth');

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

const C = (front, back, explanation) => ({
  id: uuidv4(),
  front,
  back,
  ...(explanation ? { explanation } : {}),
  createdAt: new Date().toISOString(),
});

const EXAMPLE_DECKS = [
  {
    name: 'Lietuvių kalba — pradedantiesiems (LT→EN)',
    subject: 'Lietuvių kalba',
    type: 'language',
    sourceLang: 'lt',
    targetLang: 'en',
    cards: [
      ['labas', 'hello'], ['ačiū', 'thank you'], ['prašau', "please / you're welcome"],
      ['atsiprašau', 'sorry / excuse me'], ['viso gero', 'goodbye'], ['iki pasimatymo', 'see you later'],
      ['taip', 'yes'], ['ne', 'no'], ['duona', 'bread'], ['vanduo', 'water'],
      ['pienas', 'milk'], ['obuolys', 'apple'], ['katė', 'cat'], ['šuo', 'dog'],
      ['namas', 'house'], ['mokykla', 'school'], ['knyga', 'book'], ['draugas', 'friend (male)'],
      ['Kaip sekasi?', 'How are you?'], ['Kaip tave vadina?', 'What is your name?'],
      ['vienas', '1'], ['du', '2'], ['trys', '3'], ['keturi', '4'], ['penki', '5'],
      ['šeši', '6'], ['septyni', '7'], ['aštuoni', '8'], ['devyni', '9'], ['dešimt', '10'],
      ['Man patinka mokytis.', 'I like to study.'], ['Aš gyvenu Vilniuje.', 'I live in Vilnius.'],
    ].map(([front, back]) => C(front, back)),
  },
  {
    name: 'Lietuva: pagrindai',
    subject: 'Lietuva',
    type: 'general',
    cards: [
      ['Sostinė', 'Vilnius'],
      ['Nepriklausomybė atkurta', '1990 m. kovo 11 d.'],
      ['Įstojo į ES', '2004 m. gegužės 1 d.'],
      ['Įstojo į NATO', '2004 m. kovo 29 d.'],
      ['Euras įvestas', '2015 m. sausio 1 d.'],
      ['Ilgiausia upė', 'Nemunas'],
      ['Baltijos šalys', 'Lietuva, Latvija, Estija'],
      ['Valstybės atkūrimo diena', '1918 m. vasario 16 d.'],
    ].map(([front, back]) => C(front, back)),
  },
  {
    name: 'Math & science basics',
    subject: 'Math',
    type: 'general',
    cards: [
      C('Triangle interior angles sum to…', '180°', 'A line through a vertex parallel to the opposite side shows alternate angles add up.'),
      C('Pythagoras for right triangles', 'a²+b²=c²', 'Rearrange four triangles inside a square of side a+b.'),
      C('d/dx of x²', '2x', 'Limit of ((x+h)²−x²)/h = 2x+h → 2x.'),
      C('Area of a circle', 'πr²', 'Unroll thin rings into a triangle: ½·2πr·r.'),
      C('Quadratic formula', 'x=(−b±√(b²−4ac))/(2a)', 'Complete the square.'),
      C('Slope of a line', '(y₂−y₁)/(x₂−x₁)', 'Rise over run.'),
    ],
  },
  {
    name: 'Study science',
    subject: 'Learning',
    type: 'general',
    cards: [
      C('Spacing effect', 'Study spread over days beats cramming.', 'Forgetting a little between sessions makes recall stronger.'),
      C('Testing effect', 'Active recall beats rereading.', 'Trying to remember builds memory; rereading only feels fluent.'),
      C('Interleaving', 'Mixing topics beats blocking one at a time.', 'Switching topics trains you to tell similar ideas apart.'),
    ],
  },
];

router.post('/lithuanian', authMiddleware, (req, res) => {
  const decks = db.readDecks();
  const ownedNames = new Set(
    decks.filter((d) => d.ownerId === req.userId).map((d) => d.name)
  );
  const memberships = db.readMemberships();
  const created = [];
  for (const tpl of EXAMPLE_DECKS) {
    if (ownedNames.has(tpl.name)) continue;
    const deck = {
      id: uuidv4(),
      ownerId: req.userId,
      name: tpl.name,
      subject: tpl.subject,
      type: tpl.type,
      sourceLang: tpl.sourceLang || '',
      targetLang: tpl.targetLang || '',
      shareCode: generateShareCode(decks),
      createdAt: new Date().toISOString(),
      cards: tpl.cards.map((c) => ({ ...c, id: uuidv4(), createdAt: new Date().toISOString() })),
      studyModes: { ...db.defaultStudyModes() },
    };
    decks.push(deck);
    memberships.push({ userId: req.userId, deckId: deck.id, joinedAt: new Date().toISOString() });
    created.push({ id: deck.id, name: deck.name, cards: deck.cards.length });
  }
  db.writeDecks(decks);
  db.writeMemberships(memberships);
  res.status(201).json({ created: created.length, decks: created });
});

module.exports = router;
