// modes.js — pure helpers for study modes: multiple-choice
// distractors, reverse direction, grading pre-suggestions.
export function shuffle(arr, rand) {
  const out = [...arr];
  const r = rand || Math.random;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Distractors from the same deck: other cards' backs, deduped,
// NFC-compared, never equal to the answer. Falls back to fewer
// options rather than inventing wrong answers.
export function buildMcOptions(card, pool, count, rand) {
  const want = count || 4;
  const norm = (s) => String(s || '').normalize('NFC').trim().toLowerCase();
  const answer = norm(card.back);
  const seen = new Set([answer]);
  const others = [];
  for (const c of pool || []) {
    if (!c || c.id === card.id) continue;
    const back = String(c.back || '').trim();
    const key = norm(back);
    if (!back || seen.has(key)) continue;
    seen.add(key);
    others.push({ id: c.id, text: back });
  }
  const picked = shuffle(others, rand).slice(0, Math.max(0, want - 1));
  const options = shuffle(
    [{ id: card.id, text: String(card.back || '').trim() }, ...picked],
    rand
  );
  return { options, answerId: card.id };
}

// Graded modes pre-suggest a rating; the user can override it.
// Correct → OK (not Easy: recognition is easier than recall).
export function suggestRating(correct) {
  return correct ? 'ok' : 'hard';
}

// Reverse direction: swap sides for back→front study, or duplicate
// both ways for vocabulary.
export function applyDirection(cards, dir) {
  if (dir === 'reverse') {
    return cards.map((c) => ({ ...c, front: c.back, back: c.front }));
  }
  if (dir === 'both') {
    return [
      ...cards,
      ...cards.map((c) => ({
        ...c,
        id: `${c.id}__rev`,
        front: c.back,
        back: c.front,
      })),
    ];
  }
  return cards;
}

// Listening: pick a voice matching the deck language when the
// browser has one installed.
export function pickVoice(voices, lang) {
  const list = voices || [];
  if (!list.length) return null;
  const code = String(lang || '').toLowerCase();
  const exact = list.find(
    (v) => String(v.lang || '').toLowerCase() === code
  );
  if (exact) return exact;
  const prefix = code.slice(0, 2);
  const near = list.find((v) =>
    String(v.lang || '').toLowerCase().startsWith(prefix)
  );
  return near || null;
}

export function speechSupported() {
  try {
    return typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
  } catch {
    return false;
  }
}
