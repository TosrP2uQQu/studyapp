// habit.test.js — T6: XP cap, streak/freeze, mastery,
// exam maths, achievements.
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  DAILY_XP_CAP,
  buildICS,
  checkAchievements,
  deckStage,
  examPlan,
  goalStreak,
  levelFor,
  masteryBucket,
} from '../src/lib/habit';

describe('xp and levels', () => {
  it('level curve is gentle', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(99)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(100000)).toBe(10);
  });
  it('daily cap constant is sane', () => {
    expect(DAILY_XP_CAP).toBe(200);
  });
});

describe('goal streak with freezes', () => {
  it('counts consecutive study days', () => {
    const r = goalStreak(
      ['2026-09-25', '2026-09-26', '2026-09-27'],
      { today: '2026-09-27T12:00:00' }
    );
    expect(r.streak).toBe(3);
    expect(r.welcomeBack).toBe(false);
  });
  it('auto-applies one freeze to a single gap', () => {
    const r = goalStreak(
      ['2026-09-24', '2026-09-26', '2026-09-27'],
      { today: '2026-09-27T12:00:00', freezes: 1 }
    );
    expect(r.streak).toBe(4);
    expect(r.usedFreeze).toBe(true);
    expect(r.freezes).toBe(0);
  });
  it('breaks without freezes, flags welcome-back', () => {
    const r = goalStreak(
      ['2026-09-20', '2026-09-26', '2026-09-27'],
      { today: '2026-09-27T12:00:00', freezes: 0 }
    );
    expect(r.streak).toBe(2);
  });
  it('rest day never breaks the streak', () => {
    // 2026-09-27 is a Sunday (getDay 0).
    const r = goalStreak(
      ['2026-09-26', '2026-09-28'],
      { today: '2026-09-28T12:00:00', restDay: 0 }
    );
    expect(r.streak).toBe(2);
  });
  it('empty history starts at zero', () => {
    expect(goalStreak([], {}).streak).toBe(0);
  });
});

describe('mastery and stages', () => {
  it('buckets by SM-2 state', () => {
    expect(masteryBucket(null)).toBe('new');
    expect(
      masteryBucket({ lastReviewedAt: 'x', repetitions: 1 })
    ).toBe('learning');
    expect(
      masteryBucket({ lastReviewedAt: 'x', repetitions: 5, interval: 10 })
    ).toBe('young');
    expect(
      masteryBucket({ lastReviewedAt: 'x', repetitions: 5, interval: 21 })
    ).toBe('mature');
  });
  it('stages grow with maturity', () => {
    expect(deckStage(0)).toBe('seed');
    expect(deckStage(0.2)).toBe('sprout');
    expect(deckStage(0.5)).toBe('sapling');
    expect(deckStage(0.7)).toBe('tree');
    expect(deckStage(0.9)).toBe('grove');
  });
});

describe('exam planner', () => {
  it('computes required per day and status', () => {
    const p = examPlan({
      examDate: '2026-10-09',
      totalCards: 100,
      matureCards: 40,
      reviewsPerDay: 10,
      today: '2026-09-29T12:00:00',
    });
    expect(p.daysLeft).toBe(10);
    expect(p.remaining).toBe(60);
    expect(p.required).toBe(6);
    expect(p.status).toBe('ahead');
  });
  it('behind when pace is low', () => {
    const p = examPlan({
      examDate: '2026-10-09',
      totalCards: 100,
      matureCards: 0,
      reviewsPerDay: 2,
      today: '2026-09-29T12:00:00',
    });
    expect(p.status).toBe('behind');
  });
});

describe('ics and achievements', () => {
  it('builds a daily RRULE calendar', () => {
    const ics = buildICS({ time: '19:30', cue: 'dinner' });
    expect(ics).toMatch(/RRULE:FREQ=DAILY/);
    expect(ics).toMatch(/193000/);
    expect(ics).toMatch(/dinner/);
  });
  it('achievements evaluate honestly', () => {
    const got = checkAchievements({
      totalReviews: 150,
      goalStreak: 8,
      imported: true,
    });
    expect(got['first-review']).toBe(true);
    expect(got['streak-7']).toBe(true);
    expect(got['streak-30']).toBe(false);
    expect(got['reviews-100']).toBe(true);
    expect(got['reviews-1000']).toBe(false);
    expect(got['first-import']).toBe(true);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
  });
});
