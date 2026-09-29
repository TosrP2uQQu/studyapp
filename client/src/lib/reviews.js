// reviews.js — client-side mirror of the append-only review log.
// The server log (reviews.json) is the truth when online; this mirror
// drives instant UI (history strip, undo depth, leech flags) and keeps
// working offline. Shape matches the server rows.
import { getAdapter } from './storage';

const NS = 'reviews';
export const UNDO_DEPTH = 10;

export const RATINGS = ['hard', 'ok', 'easy'];

export function isRating(v) {
  return RATINGS.includes(v);
}

function load(adapter) {
  const rows = (adapter || getAdapter()).get(NS);
  return Array.isArray(rows) ? rows : [];
}

function save(adapter, rows) {
  (adapter || getAdapter()).set(NS, rows);
}

export function logReview(entry, adapter) {
  const ad = adapter || getAdapter();
  const rows = load(ad);
  const row = {
    id: entry.id || `${Date.now()}-${rows.length}`,
    cardId: entry.cardId,
    deckId: entry.deckId || null,
    ts: entry.ts || new Date().toISOString(),
    rating: entry.rating,
    mode: entry.mode || 'flip',
    ms: entry.ms == null ? null : entry.ms,
    prevInterval: entry.prevInterval ?? null,
    newInterval: entry.newInterval ?? null,
    undone: false,
  };
  rows.push(row);
  save(ad, rows);
  return row;
}

// Undo pops the latest non-undone row (max UNDO_DEPTH deep UI;
// server enforces single-step restore per card).
export function popUndo(adapter) {
  const ad = adapter || getAdapter();
  const rows = load(ad);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].undone) {
      rows[i].undone = true;
      save(ad, rows);
      return rows[i];
    }
  }
  return null;
}

export function undoDepth(adapter) {
  const rows = load(adapter);
  let n = 0;
  for (const r of rows) {
    if (!r.undone) n++;
  }
  return Math.min(n, UNDO_DEPTH);
}

export function lastN(cardId, n, adapter) {
  const rows = load(adapter).filter(
    (r) => r.cardId === cardId && !r.undone
  );
  return rows.slice(-n);
}

export function ratingCounts(cardId, adapter) {
  const out = { hard: 0, ok: 0, easy: 0 };
  for (const r of load(adapter)) {
    if (r.cardId === cardId && !r.undone && isRating(r.rating)) {
      out[r.rating]++;
    }
  }
  return out;
}

// Leech: 4+ Hard in the last 8 reviews, or 8+ total lapses.
export function isLeech(cardId, adapter) {
  const recent = lastN(cardId, 8, adapter);
  const hardRecent = recent.filter((r) => r.rating === 'hard');
  if (recent.length >= 4 && hardRecent.length >= 4) return true;
  const all = ratingCounts(cardId, adapter);
  return all.hard >= 8;
}

// Difficulty 0-100: recent-weighted hard share + lapse count +
// slow answers. Pure helper, also used by deck views.
export function difficultyScore(cardId, adapter) {
  const rows = load(adapter).filter(
    (r) => r.cardId === cardId && !r.undone
  );
  if (!rows.length) return 0;
  const recent = rows.slice(-8);
  let w = 0;
  let total = 0;
  recent.forEach((r, i) => {
    const weight = i + 1;
    total += weight;
    if (r.rating === 'hard') w += weight;
  });
  const hardShare = total ? w / total : 0;
  const lapses = rows.filter((r) => r.rating === 'hard').length;
  const slow = rows.filter(
    (r) => typeof r.ms === 'number' && r.ms > 20000
  ).length;
  const score = hardShare * 70 + Math.min(lapses, 10) * 2;
  const slowAdj = Math.min(slow, 5);
  return Math.max(0, Math.min(100, Math.round(score + slowAdj)));
}

// Idempotency guard for double-click/double-Enter on rating buttons.
// Returns true when the tap should be processed.
export function createRateGuard() {
  let busy = false;
  return function tryAcquire() {
    if (busy) return false;
    busy = true;
    return true;
  };
}
