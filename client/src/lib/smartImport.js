// smartImport.js — paste → chunk → JSON → preview → offline sort.
// Pure helpers; the AI path (vision/transcript structuring) calls
// llm.generate with the same output shape, so the preview UI works
// for both. Result summary: "N cards, K skipped: duplicates".
import { normCardSide, sideTooLong, toNFC } from './text';

// Split pasted text into candidate blocks. Transcript mode keeps
// timestamped lines together; notes mode splits on blank lines.
export function chunkText(raw, mode) {
  const text = toNFC(raw || '');
  if (!text.trim()) return [];
  if (mode === 'transcript') {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let cur = [];
    for (const line of lines) {
      if (/^\s*\[?\d{1,2}:\d{2}/.test(line) && cur.length) {
        chunks.push(cur.join('\n'));
        cur = [];
      }
      cur.push(line);
    }
    if (cur.length) chunks.push(cur.join('\n'));
    return chunks.map((c) => c.trim()).filter(Boolean);
  }
  return text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Offline sorter: first tab, else first comma/colon/semicolon,
// else the whole block needs a back side manually.
export function offlineSort(chunks, existing) {
  const seen = new Set(
    (existing || []).map((c) =>
      (normCardSide(c.front) + '||' + normCardSide(c.back)).toLowerCase()
    )
  );
  const cards = [];
  let skippedDuplicates = 0;
  let skippedEmpty = 0;
  let skippedLong = 0;
  for (const chunk of chunks) {
    const oneLine = chunk.replace(/\s*\n\s*/g, ' ').trim();
    if (!oneLine) {
      skippedEmpty++;
      continue;
    }
    if (sideTooLong(oneLine)) {
      skippedLong++;
      continue;
    }
    let front = oneLine;
    let back = '';
    const tab = oneLine.indexOf('\t');
    if (tab >= 0) {
      front = oneLine.slice(0, tab);
      back = oneLine.slice(tab + 1);
    } else {
      const m = oneLine.match(/^(.*?)\s*[,;:]\s*(.+)$/);
      if (m) {
        front = m[1];
        back = m[2];
      }
    }
    front = normCardSide(front);
    back = normCardSide(back);
    if (!front && !back) {
      skippedEmpty++;
      continue;
    }
    const sig = (front + '||' + back).toLowerCase();
    if (seen.has(sig)) {
      skippedDuplicates++;
      continue;
    }
    seen.add(sig);
    cards.push({ front, back, missing: !back });
  }
  return { cards, skippedDuplicates, skippedEmpty, skippedLong };
}

// "42 cards, 3 skipped: duplicates" — caller localises via t()
// with these counts; this helper keeps the shape stable.
export function summarizeResult(sortOut) {
  return {
    added: sortOut.cards.length,
    skippedDuplicates: sortOut.skippedDuplicates,
    skippedEmpty: sortOut.skippedEmpty,
    skippedLong: sortOut.skippedLong,
    needBack: sortOut.cards.filter((c) => c.missing).length,
  };
}

// Prompt builders for the AI path (same JSON shape as offlineSort).
export function buildImportMessages(raw, mode) {
  const kind = mode === 'transcript'
    ? 'a video transcript with timestamps'
    : 'pasted study notes';
  return [
    {
      role: 'user',
      content:
        `Turn ${kind} into flashcards. ` +
        'Return JSON only: {"cards":[{"front":"…","back":"…"}]}. ' +
        'Front is the cue, back the answer. ' +
        'Skip duplicates. Keep each side under 200 characters.\n\n' +
        raw,
    },
  ];
}

export const IMPORT_JSON_KEYS = ['cards'];
