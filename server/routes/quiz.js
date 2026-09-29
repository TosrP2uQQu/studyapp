const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { callAI } = require('../ai');
const { aiCredentials } = require('./users');

const router = express.Router();

// Pending quizzes live in memory (single local server, Phase 1 style).
// Each entry expires after 2 hours. Results are appended to
// quizResults.json on grading — grading never touches progress.json,
// so SM-2 scheduling stays driven only by manual Hard/OK/Easy reviews.
const pending = new Map();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDeckFor(userId, deckId) {
  const decks = db.readDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return { error: 'Deck not found', status: 404 };
  const memberships = db.readMemberships();
  const member = memberships.some((m) => m.userId === userId && m.deckId === deckId);
  if (deck.ownerId !== userId && !member) {
    return { error: 'Not a member of this deck', status: 403 };
  }
  return { deck };
}

// Deterministic local quiz builder. Uses only this deck's own cards:
// multiple-choice wrong answers are other cards' backs from the same deck.
function buildLocalQuiz(deck, count, includeShortAnswer) {
  const cards = shuffle(deck.cards || []).slice(0, Math.max(count, 1));
  return cards.map((card, i) => {
    const others = shuffle((deck.cards || []).filter((c) => c.id !== card.id)).slice(0, 3);
    const wantMcq =
      others.length >= 2 && (i % 2 === 0 || !includeShortAnswer);
    if (wantMcq) {
      const options = shuffle([card.back, ...others.map((c) => c.back)]);
      return {
        index: i,
        kind: 'multiple-choice',
        prompt: card.front,
        options,
        answer: card.back,
      };
    }
    return { index: i, kind: 'short-answer', prompt: card.front, answer: card.back };
  });
}

async function buildAiQuiz(deck, count, creds, userId) {
  const cards = (deck.cards || []).map((c) => ({ front: c.front, back: c.back }));
  const { text } = await callAI({
    ...creds,
    userId,
    feature: 'quiz-generation',
    messages: [
      {
        role: 'system',
        content:
          'You write short study quizzes. Reply with JSON only, no other text.',
      },
      {
        role: 'user',
        content: `Write ${count} quiz questions using ONLY the cards below. Mix multiple-choice and short-answer. For multiple-choice, every wrong option must be the back of another card from this list. Reply as JSON: {"questions": [{"kind": "multiple-choice"|"short-answer", "prompt": "<a card front>", "options": ["..."], "answer": "<the exact back>"}]}. Cards: ${JSON.stringify(cards)}`,
      },
    ],
  });
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI did not return JSON');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('AI returned no questions');
  }
  const fronts = new Set(cards.map((c) => c.front));
  const backs = new Set(cards.map((c) => c.back));
  const valid = parsed.questions
    .filter(
      (q) =>
        q &&
        fronts.has(q.prompt) &&
        backs.has(q.answer) &&
        (q.kind === 'short-answer' ||
          (q.kind === 'multiple-choice' &&
            Array.isArray(q.options) &&
            q.options.includes(q.answer)))
    )
    .slice(0, count)
    .map((q, i) => ({
      index: i,
      kind: q.kind,
      prompt: String(q.prompt),
      options: q.kind === 'multiple-choice' ? q.options.map(String) : undefined,
      answer: String(q.answer),
    }));
  if (valid.length === 0) throw new Error('AI questions did not match deck cards');
  return valid;
}

// POST /api/decks/:id/quiz — build a quiz from that deck's cards only.
router.post('/:id/quiz', authMiddleware, async (req, res) => {
  const { error, status, deck } = getDeckFor(req.userId, req.params.id);
  if (error) return res.status(status).json({ error });
  if ((deck.cards || []).length < 2) {
    return res.status(400).json({ error: 'Add at least 2 cards before quizzing' });
  }
  const count = Math.min(Math.max(Number(req.body?.count) || 5, 1), 10);
  const includeShortAnswer = req.body?.includeShortAnswer !== false;

  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  const creds = u ? aiCredentials(db.normalizeUser(u).aiSettings) : null;

  let questions;
  let aiUsed = false;
  if (creds) {
    try {
      questions = await buildAiQuiz(deck, count, creds, req.userId);
      aiUsed = true;
    } catch {
      // Fall back to the local builder rather than failing the quiz.
      questions = buildLocalQuiz(deck, count, includeShortAnswer);
    }
  } else {
    questions = buildLocalQuiz(deck, count, includeShortAnswer);
  }

  const quizId = uuidv4();
  pending.set(quizId, {
    userId: req.userId,
    deckId: deck.id,
    questions,
    createdAt: Date.now(),
  });
  res.json({ quizId, aiUsed, aiAvailable: Boolean(creds), questions });
});

function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function gradeShortAnswer(correct, response, creds, userId) {
  if (normalizeAnswer(correct) === normalizeAnswer(response)) {
    return { correct: true, aiGraded: false };
  }
  if (!creds) return { correct: false, aiGraded: false, selfCheck: true };
  try {
    const { text } = await callAI({
      ...creds,
      userId,
      feature: 'quiz-grading',
      messages: [
        { role: 'system', content: 'You grade short quiz answers leniently. Reply with JSON only.' },
        {
          role: 'user',
          content: `Correct answer: ${correct}. Learner answered: ${response}. Same meaning with minor wording differences counts as correct. Reply JSON: {"correct": true/false, "note": "one short sentence"}.`,
        },
      ],
    });
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return { correct: parsed.correct === true, aiGraded: true, note: String(parsed.note || '') };
  } catch {
    return { correct: false, aiGraded: false, selfCheck: true };
  }
}

// POST /api/decks/:id/quiz/:quizId/grade — score responses, log the result.
// Never writes to progress.json: quiz results are informational only.
router.post('/:id/quiz/:quizId/grade', authMiddleware, async (req, res) => {
  const entry = pending.get(req.params.quizId);
  if (!entry || entry.userId !== req.userId || entry.deckId !== req.params.id) {
    return res.status(404).json({ error: 'Quiz not found or expired' });
  }
  if (Date.now() - entry.createdAt > 2 * 60 * 60 * 1000) {
    pending.delete(req.params.quizId);
    return res.status(404).json({ error: 'Quiz expired' });
  }
  const answers = req.body?.answers || [];
  const byIndex = new Map(answers.map((a) => [a.index, a.response]));

  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  const creds = u ? aiCredentials(db.normalizeUser(u).aiSettings) : null;

  const results = [];
  for (const q of entry.questions) {
    const response = byIndex.get(q.index);
    if (q.kind === 'multiple-choice') {
      const picked = typeof response === 'number' ? q.options[response] : String(response ?? '');
      results.push({
        index: q.index,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        response: picked,
        correctAnswer: q.answer,
        correct: picked === q.answer,
        aiGraded: false,
      });
    } else {
      const g = await gradeShortAnswer(q.answer, response, creds, req.userId);
      results.push({
        index: q.index,
        kind: q.kind,
        prompt: q.prompt,
        response: String(response ?? ''),
        correctAnswer: q.answer,
        ...g,
      });
    }
  }
  const score = results.filter((r) => r.correct).length;
  const log = db.readQuizResults();
  log.push({
    id: uuidv4(),
    userId: req.userId,
    deckId: entry.deckId,
    timestamp: new Date().toISOString(),
    score,
    total: results.length,
    aiUsed: results.some((r) => r.aiGraded),
    questions: results.map((r) => ({
      kind: r.kind,
      prompt: r.prompt,
      correctAnswer: r.correctAnswer,
      response: r.response,
      correct: r.correct,
    })),
  });
  db.writeQuizResults(log);
  pending.delete(req.params.quizId);
  res.json({ score, total: results.length, results });
});

module.exports = router;
