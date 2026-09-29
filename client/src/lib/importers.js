// importers.js — open-format imports: Quizlet/Anki text exports
// (auto-detect tab/comma/semicolon + card separators), CSV with
// headers, plain lines. Exports: JSON, CSV, Anki TSV.
import { normCardSide } from './text';

// Which single-char delimiter splits this sample best?
export function detectDelimiter(sample) {
  const lines = String(sample || '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 20);
  if (!lines.length) return '\t';
  const scores = { '\t': 0, ';': 0, ',': 0 };
  for (const line of lines) {
    // A delimiter counts when it appears exactly once-ish per line
    // across most lines (Quizlet/Anki one-card-per-line shape).
    for (const d of Object.keys(scores)) {
      const n = line.split(d).length - 1;
      if (n >= 1 && n <= 3) scores[d]++;
    }
  }
  let best = '\t';
  let bestScore = -1;
  for (const [d, s] of Object.entries(scores)) {
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  // No delimiter found anywhere: plain lines.
  if (bestScore <= 0) return '\n';
  return best;
}

// Split into card blocks: blank-line separated groups win when they
// exist (multi-line cards), else single lines.
export function splitBlocks(raw) {
  const text = String(raw || '').replace(/\r/g, '');
  if (!text.trim()) return [];
  const groups = text
    .split(/\n\s*\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  if (groups.length > 1) return groups;
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function parseDelimited(raw) {
  const delim = detectDelimiter(raw);
  const blocks = splitBlocks(raw);
  const cards = [];
  for (const block of blocks) {
    const oneLine = block.replace(/\s*\n\s*/g, ' ').trim();
    if (!oneLine) continue;
    let front = oneLine;
    let back = '';
    if (delim === '\n') {
      front = oneLine;
    } else {
      const idx = oneLine.indexOf(delim);
      if (idx >= 0) {
        front = oneLine.slice(0, idx);
        back = oneLine.slice(idx + 1);
      }
    }
    front = normCardSide(front);
    back = normCardSide(back);
    if (!front && !back) continue;
    cards.push({ front, back, missing: !back });
  }
  return { cards, delim };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// CSV with headers: front/back (or Front/Back, question/answer).
export function parseCsv(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (!lines.length) return { cards: [], headers: [] };
  const headers = splitCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase()
  );
  const fi = headers.findIndex((h) =>
    ['front', 'question', 'term', 'word'].includes(h)
  );
  const bi = headers.findIndex((h) =>
    ['back', 'answer', 'definition', 'translation'].includes(h)
  );
  if (fi < 0 || bi < 0) return { cards: [], headers };
  const cards = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const front = normCardSide(cells[fi] || '');
    const back = normCardSide(cells[bi] || '');
    if (!front && !back) continue;
    cards.push({ front, back, missing: !back });
  }
  return { cards, headers };
}

const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function toCsv(cards) {
  const lines = ['front,back'];
  for (const c of cards || []) {
    lines.push(`${escCsv(c.front)},${escCsv(c.back)}`);
  }
  return lines.join('\n');
}

export function toTsv(cards) {
  return (cards || [])
    .map((c) => `${c.front || ''}\t${c.back || ''}`)
    .join('\n');
}

export function toJson(cards, name) {
  return JSON.stringify(
    { name: name || 'deck', cards: cards || [] },
    null,
    2
  );
}

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
