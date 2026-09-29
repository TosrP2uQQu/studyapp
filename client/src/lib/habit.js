// habit.js — ethical habit engine (no guilt, no grinding).
// XP: every rating earns; daily cap; gentle levels.
// Goal streak: days meeting the daily card goal; freezes earned
// (1 per 7-day run, max 3) auto-apply to single missed days;
// the weekly rest day never breaks anything. Broken streaks get
// a warm welcome-back, never shame.
import { getAdapter } from './storage';
import { studyDayString } from './day';

export const DAILY_XP_CAP = 200;
export const XP_BASE = 10;
export const XP_QUICK_BONUS = 2;
export const XP_OVERDUE_BONUS = 5;
export const QUICK_MS = 8000;
export const FREEZE_MAX = 3;

const LEVELS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

export function levelFor(total) {
  let level = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i]) level = i + 1;
  }
  return level;
}

export function xpForLevel(level) {
  return LEVELS[Math.min(Math.max(level - 1, 0), LEVELS.length - 1)];
}

function storeKey(username) {
  return 'habit.' + (username || 'guest');
}

export function loadHabit(username) {
  try {
    const v = getAdapter().get(storeKey(username));
    if (v && typeof v === 'object') {
      return {
        xpTotal: v.xpTotal || 0,
        xpDays: v.xpDays || {},
        goalDays: v.goalDays || [],
        freezes: v.freezes || 0,
        lastFreezeStreak: v.lastFreezeStreak || 0,
        ach: v.ach || {},
        goal: v.goal || 20,
        examDates: v.examDates || {},
        intention: v.intention || null,
      };
    }
  } catch {
    /* fresh */
  }
  return {
    xpTotal: 0,
    xpDays: {},
    goalDays: [],
    freezes: 0,
    lastFreezeStreak: 0,
    ach: {},
    goal: 20,
    examDates: {},
    intention: null,
  };
}

export function saveHabit(username, state) {
  try {
    getAdapter().set(storeKey(username), state);
  } catch {
    /* best effort */
  }
}

// Award XP for one rating. All ratings earn; hard is never punished.
// Cram practice earns a small flat amount (no grinding incentive).
export function awardReviewXp(username, opts) {
  const o = opts || {};
  const st = loadHabit(username);
  const today = studyDayString(Date.now());
  const dayXp = st.xpDays[today] || 0;
  let gain = XP_BASE;
  if (o.cram) {
    gain = 5;
  } else {
    if (typeof o.ms === 'number' && o.ms <= QUICK_MS) gain += XP_QUICK_BONUS;
    if (o.overdue) gain += XP_OVERDUE_BONUS;
  }
  const room = Math.max(0, DAILY_XP_CAP - dayXp);
  const applied = Math.min(gain, room);
  st.xpTotal += applied;
  st.xpDays[today] = dayXp + applied;
  saveHabit(username, st);
  return { gained: applied, capped: gain > applied, total: st.xpTotal };
}

// Mark the daily goal met (called when reviewsToday >= goal).
export function markGoalDay(username, when) {
  const st = loadHabit(username);
  const day = studyDayString(when || Date.now());
  if (!st.goalDays.includes(day)) {
    st.goalDays.push(day);
    st.goalDays.sort();
    st.goalDays = st.goalDays.slice(-120);
    saveHabit(username, st);
  }
  return st;
}

// Goal streak over goalDays with freeze bank + rest day.
// Returns { streak, freezes, usedFreeze, welcomeBack }.
export function goalStreak(goalDays, opts) {
  const o = opts || {};
  const restDay = o.restDay == null ? null : o.restDay;
  let freezes = o.freezes || 0;
  const days = [...new Set(goalDays || [])].sort();
  if (!days.length) {
    return { streak: 0, freezes, usedFreeze: false, welcomeBack: false };
  }
  const today = studyDayString(o.today || Date.now());
  // Walk back from today (or yesterday if today is unmet so far).
  let cursor = today;
  if (days[days.length - 1] < today) {
    cursor = addDaysStr(today, -1);
  }
  const set = new Set(days);
  let streak = 0;
  let usedFreeze = false;
  let welcomeBack = false;
  for (;;) {
    if (set.has(cursor)) {
      streak++;
      cursor = addDaysStr(cursor, -1);
      continue;
    }
    if (restDay != null && new Date(cursor + 'T12:00:00').getDay() === restDay) {
      cursor = addDaysStr(cursor, -1);
      continue;
    }
    if (freezes > 0 && !usedFreeze) {
      freezes--;
      usedFreeze = true;
      streak++;
      cursor = addDaysStr(cursor, -1);
      continue;
    }
    if (streak === 0 && cursor < today) welcomeBack = true;
    break;
  }
  return { streak, freezes, usedFreeze, welcomeBack };
}

function addDaysStr(dayStr, n) {
  const d = new Date(dayStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Earn 1 freeze per 7-day run (max 3). Call with the current streak.
export function maybeEarnFreeze(username, streak) {
  const st = loadHabit(username);
  if (streak > 0 && streak % 7 === 0 && st.lastFreezeStreak !== streak) {
    st.freezes = Math.min(FREEZE_MAX, st.freezes + 1);
    st.lastFreezeStreak = streak;
    saveHabit(username, st);
    return true;
  }
  return false;
}

// Mastery buckets by SM-2 state.
export function masteryBucket(progress) {
  if (!progress || !progress.lastReviewedAt) return 'new';
  if ((progress.repetitions || 0) < 3) return 'learning';
  if ((progress.interval || 0) >= 21) return 'mature';
  return 'young';
}

const STAGES = ['seed', 'sprout', 'sapling', 'tree', 'grove'];

export function deckStage(pctMature) {
  const p = Math.max(0, Math.min(1, pctMature || 0));
  if (p >= 0.8) return STAGES[4];
  if (p >= 0.6) return STAGES[3];
  if (p >= 0.4) return STAGES[2];
  if (p >= 0.15) return STAGES[1];
  return STAGES[0];
}

// Exam planner: required new cards/day + honest status.
export function examPlan(opts) {
  const o = opts || {};
  const today = studyDayString(o.today || Date.now());
  const daysLeft = Math.max(
    0,
    Math.round(
      (new Date(o.examDate + 'T12:00:00') - new Date(today + 'T12:00:00')) /
        86400000
    )
  );
  const remaining = Math.max(0, (o.totalCards || 0) - (o.matureCards || 0));
  const required = daysLeft === 0 ? remaining : Math.ceil(remaining / daysLeft);
  const pace = o.reviewsPerDay || 0;
  const status = pace >= required
    ? 'ahead'
    : pace >= required * 0.7
      ? 'on-track'
      : 'behind';
  return { daysLeft, remaining, required, pace, status };
}

// Implementation intention → downloadable .ics (daily RRULE).
export function buildICS(opts) {
  const o = opts || {};
  const time = o.time || '19:00';
  const cue = o.cue || 'dinner';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const [hh, mm] = time.split(':');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyApp//Habit//EN',
    'BEGIN:VEVENT',
    `UID:${stamp}-studyapp@localhost`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp.slice(0, 8)}T${hh}${mm}00`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:Study (after ${cue})`,
    'DESCRIPTION:I will study after ' + cue,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

const SLEEP_TIPS = [
  'well.sleep1',
  'well.sleep2',
  'well.sleep3',
];

export function sleepTipKey(when) {
  const d = new Date(when || Date.now());
  return SLEEP_TIPS[d.getDate() % SLEEP_TIPS.length];
}

// Achievements: icon, description, progress. None reward grinding
// hours; all are kind. Evaluated over a snapshot in Today.jsx.
export const ACHIEVEMENTS = [
  { id: 'first-review', icon: '🌱' },
  { id: 'streak-7', icon: '🔥' },
  { id: 'streak-30', icon: '🏔' },
  { id: 'reviews-100', icon: '💯' },
  { id: 'reviews-1000', icon: '🚀' },
  { id: 'first-import', icon: '📥' },
  { id: 'first-tutor', icon: '🦉' },
  { id: 'first-video', icon: '🎬' },
  { id: 'comeback', icon: '🌅' },
  { id: 'early-bird', icon: '🐦' },
  { id: 'calm-week', icon: '🍃' },
  { id: 'goal-week', icon: '🎯' },
];

export function checkAchievements(snapshot) {
  const s = snapshot || {};
  const out = {};
  out['first-review'] = (s.totalReviews || 0) >= 1;
  out['streak-7'] = (s.goalStreak || 0) >= 7;
  out['streak-30'] = (s.goalStreak || 0) >= 30;
  out['reviews-100'] = (s.totalReviews || 0) >= 100;
  out['reviews-1000'] = (s.totalReviews || 0) >= 1000;
  out['first-import'] = Boolean(s.imported);
  out['first-tutor'] = Boolean(s.tutorChats);
  out['first-video'] = Boolean(s.videosAttached);
  out['comeback'] = Boolean(s.welcomeBackSeen);
  out['early-bird'] = Boolean(s.finishedBefore22);
  out['calm-week'] = (s.restDaysTaken || 0) >= 1;
  out['goal-week'] = (s.goalDays7 || 0) >= 5;
  return out;
}
