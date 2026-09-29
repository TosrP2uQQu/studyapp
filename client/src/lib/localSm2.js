// localSm2.js — pure study math for offline mode: SM-2 (ported
// from server/sm2.js, same vectors), review aggregation (ported
// from server/reviewStats.js), stats helpers, and PBKDF2 passwords.

export function dayStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ratingToQuality(rating) {
  if (rating === 'hard') return 3;
  if (rating === 'ok') return 4;
  if (rating === 'easy') return 5;
  throw new Error('Invalid rating: ' + rating);
}

export function defaultProgress() {
  return {
    repetitions: 0,
    easeFactor: 2.5,
    interval: 0,
    nextReviewDate: dayStr(todayLocal()),
  };
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function reviewCard(progress, q) {
  let { repetitions, easeFactor, interval } = progress;
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;
  if (q < 3) {
    repetitions = 0;
    interval = 0;
  } else if (repetitions === 0) {
    interval = 1;
  } else if (repetitions === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * easeFactor);
  }
  if (q >= 3) repetitions = repetitions + 1;
  return {
    repetitions,
    easeFactor,
    interval,
    nextReviewDate: dayStr(addDays(todayLocal(), interval)),
  };
}

export function isDue(nextReviewDate) {
  if (!nextReviewDate) return true;
  return String(nextReviewDate).slice(0, 10) <= dayStr(todayLocal());
}

export function snapshotPrev(row) {
  if (!row) return null;
  return {
    repetitions: row.repetitions || 0,
    easeFactor: row.easeFactor || 2.5,
    interval: row.interval || 0,
    nextReviewDate: row.nextReviewDate || null,
    lastRating: row.lastRating || null,
    lastReviewedAt: row.lastReviewedAt || null,
  };
}

export function restorePrev(prev) {
  const p = prev || {};
  return {
    repetitions: p.repetitions || 0,
    easeFactor: p.easeFactor || 2.5,
    interval: p.interval || 0,
    nextReviewDate: p.nextReviewDate || null,
    lastRating: p.lastRating || null,
    lastReviewedAt: p.lastReviewedAt || null,
  };
}

// ---- review aggregation (reviewStats port) ----

function scoreOf(rating) {
  if (rating === 'hard') return 0;
  if (rating === 'ok') return 1;
  return 2;
}

export function trendOf(rows) {
  const seq = rows.filter((r) => !r.undone).slice(-8);
  if (seq.length < 4) return 'flat';
  const half = Math.floor(seq.length / 2);
  const mean = (xs) =>
    xs.reduce((a, r) => a + scoreOf(r.rating), 0) / xs.length;
  const diff = mean(seq.slice(half)) - mean(seq.slice(0, half));
  if (diff > 0.25) return 'improving';
  if (diff < -0.25) return 'worsening';
  return 'flat';
}

export function countsOf(rows) {
  const out = { hard: 0, ok: 0, easy: 0 };
  for (const r of rows) {
    if (r.undone) continue;
    if (r.rating === 'hard') out.hard++;
    else if (r.rating === 'ok') out.ok++;
    else if (r.rating === 'easy') out.easy++;
  }
  return out;
}

export function leechOf(rows) {
  const seq = rows.filter((r) => !r.undone);
  const recent = seq.slice(-8);
  const hardRecent = recent.filter((r) => r.rating === 'hard').length;
  if (recent.length >= 4 && hardRecent >= 4) return true;
  return countsOf(rows).hard >= 8;
}

export function difficultyOf(rows) {
  const seq = rows.filter((r) => !r.undone);
  if (!seq.length) return 0;
  const recent = seq.slice(-8);
  let w = 0;
  let total = 0;
  recent.forEach((r, i) => {
    const weight = i + 1;
    total += weight;
    if (r.rating === 'hard') w += weight;
  });
  const hardShare = total ? w / total : 0;
  const lapses = seq.filter((r) => r.rating === 'hard').length;
  const slow = seq.filter(
    (r) => typeof r.ms === 'number' && r.ms > 20000
  ).length;
  const score = hardShare * 70 + Math.min(lapses, 10) * 2;
  return Math.max(0, Math.min(100, Math.round(score + Math.min(slow, 5))));
}

export function aggregateCard(cardId, rows) {
  const seq = rows
    .filter((r) => r.cardId === cardId && !r.undone)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const last = seq.length ? seq[seq.length - 1].rating : null;
  return {
    lastRating: last,
    counts: countsOf(seq),
    total: seq.length,
    trend: trendOf(seq),
    difficulty: difficultyOf(seq),
    leech: leechOf(seq),
  };
}

// ---- stats helpers ----

export function computeStreak(reviewDates) {
  const days = new Set(reviewDates);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(dayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function bucketize(deck, progressByCard) {
  let total = 0;
  let fresh = 0;
  let learning = 0;
  let mastered = 0;
  let due = 0;
  for (const card of deck.cards || []) {
    total++;
    const row = progressByCard.get(card.id);
    if (!row) {
      fresh++;
      due++;
      continue;
    }
    if (row.repetitions < 3) learning++;
    if (row.interval >= 30) mastered++;
    if (isDue(row.nextReviewDate)) due++;
  }
  return { total, new: fresh, learning, due, mastered };
}

export function reviewsPerDay(allProgress, days) {
  const counts = new Map();
  for (const p of allProgress) {
    if (!p.lastReviewedAt) continue;
    const day = dayStr(p.lastReviewedAt);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const out = [];
  const n = days || 30;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const day = dayStr(d);
    out.push({ date: day, count: counts.get(day) || 0 });
  }
  return out;
}

// ---- PBKDF2 passwords (browser) ----

function subtle() {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return crypto.subtle;
    }
  } catch {
    /* unavailable */
  }
  return null;
}

export function cryptoAvailable() {
  return Boolean(subtle());
}

function b64encode(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  if (typeof btoa !== 'undefined') return btoa(bin);
  return Buffer.from(bin, 'binary').toString('base64');
}

function b64decode(b64) {
  if (typeof atob !== 'undefined') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

const PBKDF2_ITER = 100000;

export async function hashPassword(password) {
  const s = subtle();
  if (!s) {
    throw new Error(
      'This browser cannot hash passwords (WebCrypto unavailable).'
    );
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await s.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await s.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITER}$${b64encode(salt)}$${b64encode(bits)}`;
}

export async function comparePassword(password, stored) {
  const s = subtle();
  if (!s) return false;
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  const salt = b64decode(parts[2]);
  const expect = b64decode(parts[3]);
  const key = await s.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = new Uint8Array(
    await s.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      key,
      256
    )
  );
  if (bits.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expect[i];
  return diff === 0;
}
