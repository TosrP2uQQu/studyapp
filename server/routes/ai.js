const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { callAI } = require('../ai');
const { aiCredentials, publicAiSettings } = require('./users');

const router = express.Router();

const STRICTNESS = {
  lenient:
    'Be generous: paraphrases, partial answers that capture the main idea, and minor factual wobbles count as at least almost correct.',
  standard:
    'Accept paraphrases with the same meaning as correct. Partial answers covering the main idea are almost correct. Missing the point or serious errors are incorrect.',
  strict:
    'Require precise, complete answers. Anything missing a key element is at most almost correct; vague or partially wrong answers are incorrect.',
};

function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Same prompt shape as the client's written-recall grader (aiClient.js)
// so Local and cloud grading judge by the same rubric.
function writtenRecallMessages({ front, back, answer, strictness }) {
  return [
    {
      role: 'system',
      content:
        'You grade written recall answers. Reply with JSON only: {"tier": "correct"|"almost"|"incorrect", "explanation": "one or two short sentences"}.',
    },
    {
      role: 'user',
      content: `Card front: ${front}\nCorrect answer: ${back}\nLearner wrote: ${answer}\n${STRICTNESS[strictness] || STRICTNESS.standard}\nTier the learner's answer.`,
    },
  ];
}

function parseTier(text) {
  const start = String(text || '').indexOf('{');
  const end = String(text || '').lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI did not return JSON');
  const parsed = JSON.parse(String(text).slice(start, end + 1));
  if (!['correct', 'almost', 'incorrect'].includes(parsed.tier)) {
    throw new Error('AI returned an unknown tier');
  }
  return { tier: parsed.tier, explanation: String(parsed.explanation || '') };
}

// POST /api/ai/feedback — optional AI-assisted feedback on a learner's
// own-words explanation (Explain It) or Why answer. Only the single
// card plus the learner's text is sent, and only when the learner asks.
router.post('/feedback', authMiddleware, async (req, res) => {
  const { cardFront, cardBack, kind, text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'No explanation text to review' });
  }
  if (!['explain', 'why'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be explain or why' });
  }
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  const creds = u ? aiCredentials(db.normalizeUser(u).aiSettings) : null;
  if (!creds) {
    return res.status(400).json({ error: 'AI is not configured', needsKey: true });
  }
  const task =
    kind === 'explain'
      ? 'The learner explained a flashcard in their own words, like teaching someone younger.'
      : 'The learner answered "why is this true?" for a flashcard.';
  try {
    const { text: feedback } = await callAI({
      ...creds,
      userId: req.userId,
      feature: 'explain-feedback',
      messages: [
        {
          role: 'system',
          content: 'You are a brief, encouraging study coach. Reply in 2-3 sentences.',
        },
        {
          role: 'user',
          content: `${task} Card front: ${cardFront}. Card back: ${cardBack}. Learner wrote: ${text}. Point out what they got right and one thing to sharpen.`,
        },
      ],
    });
    res.json({ feedback });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/grade — grade one written-recall answer. Informational only:
// it never writes to progress.json. The card must belong to a deck the
// caller can access (so a stored key can't be used as a free-form AI proxy).
// Not used for Local — that path is client-side (Section 1).
router.post('/grade', authMiddleware, async (req, res) => {
  const { deckId, cardId, front, back, answer } = req.body || {};
  if (!deckId || !front || !back || answer === undefined) {
    return res.status(400).json({ error: 'deckId, front, back, and answer are required' });
  }
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const memberships = db.readMemberships();
  const member = memberships.some((m) => m.userId === req.userId && m.deckId === deckId);
  if (deck.ownerId !== req.userId && !member) {
    return res.status(403).json({ error: 'Not a member of this deck' });
  }
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  const norm = u ? db.normalizeUser(u) : null;
  const creds = norm ? aiCredentials(norm.aiSettings) : null;
  if (norm && norm.aiSettings.provider === 'ollama') {
    return res.status(400).json({
      error: 'Local grading runs in your browser, against your own base URL',
      clientSide: true,
    });
  }
  if (!creds) {
    return res.status(400).json({ error: 'AI is not configured', needsKey: true });
  }
  // Deterministic shortcut: a normalized exact match is correct without
  // spending an AI call.
  if (normalizeAnswer(back) === normalizeAnswer(answer)) {
    return res.json({ tier: 'correct', explanation: 'Matches the card.', aiGraded: false });
  }
  try {
    const strictness = publicAiSettings(norm.aiSettings).gradingStrictness;
    const { text } = await callAI({
      ...creds,
      userId: req.userId,
      feature: 'written-recall-grading',
      messages: writtenRecallMessages({ front, back, answer, strictness }),
    });
    res.json({ ...parseTier(text), aiGraded: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
