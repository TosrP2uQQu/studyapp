// aiClient.js — browser-side AI calls for the Local (Ollama) provider ONLY.
// Cloud providers must never be called from here (keys stay server-side,
// and most cloud APIs block direct browser calls via CORS). Local is the
// one deliberate exception: the request goes straight from this browser to
// the person's own base URL and never touches our server — not even the
// ai.js audit log sees it (checklist item: Local must never appear in
// server logs). DOM-free on purpose, so it stays unit-testable.

export const OLLAMA_SUGGESTION = 'http://localhost:11434/v1';

// Normalize to an OpenAI-compatible root: Ollama serves those endpoints
// under /v1, so a bare "http://localhost:11434" becomes ".../v1".
export function ollamaRoot(baseUrl) {
  const b = String(baseUrl || '').trim().replace(/\/+$/, '');
  return b.endsWith('/v1') ? b : `${b}/v1`;
}

async function fetchJson(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

// Minimal connectivity check: list models. No key, no message content.
export async function testOllama({ baseUrl }) {
  const root = ollamaRoot(baseUrl);
  const r = await fetchJson(`${root}/models`, { method: 'GET' }, 15000);
  if (!r.ok) throw new Error(`Ollama unreachable at ${root} (HTTP ${r.status})`);
  const models = (r.json && r.json.data) || [];
  return { ok: true, models: models.map((m) => m.id).filter(Boolean) };
}

export async function chatOllama({ baseUrl, model, messages }) {
  if (!model) throw new Error('Ollama model name is required');
  const root = ollamaRoot(baseUrl);
  const r = await fetchJson(`${root}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  if (!r.ok) throw new Error(`Ollama error ${r.status}: ${String(r.text).slice(0, 200)}`);
  const msg = r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message;
  return { text: (msg && msg.content) || '' };
}

// Rubric mirror of the server's STRICTNESS map (routes/ai.js): same words,
// so Local and cloud grading judge by the same standard.
export const STRICTNESS = {
  lenient:
    'Be generous: paraphrases, partial answers that capture the main idea, and minor factual wobbles count as at least almost correct.',
  standard:
    'Accept paraphrases with the same meaning as correct. Partial answers covering the main idea are almost correct. Missing the point or serious errors are incorrect.',
  strict:
    'Require precise, complete answers. Anything missing a key element is at most almost correct; vague or partially wrong answers are incorrect.',
};

export function buildWrittenRecallMessages({ front, back, answer, strictness }) {
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

export function buildQuizGradeMessages({ correct, response, strictness }) {
  return [
    {
      role: 'system',
      content: 'You grade short quiz answers leniently. Reply with JSON only.',
    },
    {
      role: 'user',
      content: `Correct answer: ${correct}. Learner answered: ${response}. ${STRICTNESS[strictness] || STRICTNESS.standard} Reply JSON: {"correct": true/false, "note": "one short sentence"}.`,
    },
  ];
}

export function buildFeedbackMessages({ cardFront, cardBack, kind, text }) {
  const task =
    kind === 'explain'
      ? 'The learner explained a flashcard in their own words, like teaching someone younger.'
      : 'The learner answered "why is this true?" for a flashcard.';
  return [
    { role: 'system', content: 'You are a brief, encouraging study coach. Reply in 2-3 sentences.' },
    {
      role: 'user',
      content: `${task} Card front: ${cardFront}. Card back: ${cardBack}. Learner wrote: ${text}. Point out what they got right and one thing to sharpen.`,
    },
  ];
}

export function parseTier(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI did not return JSON');
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (!['correct', 'almost', 'incorrect'].includes(parsed.tier)) {
    throw new Error('AI returned an unknown tier');
  }
  return { tier: parsed.tier, explanation: String(parsed.explanation || '') };
}
