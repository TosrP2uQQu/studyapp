// local-backend.test.js — offline backend: auth, SM-2 parity,
// decks, reviews+undo, stats, import/export hygiene.
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../src/lib/storage';
import {
  comparePassword,
  difficultyOf,
  hashPassword,
  leechOf,
  reviewCard,
  trendOf,
} from '../src/lib/localSm2';
import {
  load,
  NS,
  save,
} from '../src/lib/localStore';

const AD = new MemoryAdapter();

describe('pbkdf2 passwords', () => {
  it('round-trips and rejects wrong passwords', async () => {
    const h = await hashPassword('secret123');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(await comparePassword('secret123', h)).toBe(true);
    expect(await comparePassword('nope', h)).toBe(false);
  });
});

describe('sm-2 parity with server vectors', () => {
  it('Easy x3 -> intervals 1/6/17, EF 2.6/2.7/2.8', () => {
    let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
    const r1 = reviewCard(p, 5);
    expect(r1.interval).toBe(1);
    expect(r1.easeFactor).toBeCloseTo(2.6, 5);
    const r2 = reviewCard({ ...p, ...r1 }, 5);
    expect(r2.interval).toBe(6);
    expect(r2.easeFactor).toBeCloseTo(2.7, 5);
    const r3 = reviewCard({ ...p, ...r2 }, 5);
    expect(r3.interval).toBe(17);
    expect(r3.easeFactor).toBeCloseTo(2.8, 5);
  });
  it('Hard x3 -> intervals 1/6/12', () => {
    let p = { repetitions: 0, easeFactor: 2.5, interval: 0 };
    p = { ...p, ...reviewCard(p, 3) };
    p = { ...p, ...reviewCard(p, 3) };
    const r = reviewCard(p, 3);
    expect(r.interval).toBe(12);
    expect(r.easeFactor).toBeCloseTo(2.08, 2);
  });
  it('q<3 resets to relearning with floored EF', () => {
    const r = reviewCard(
      { repetitions: 5, easeFactor: 2.4, interval: 30 },
      2
    );
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(0);
    const f = reviewCard(
      { repetitions: 3, easeFactor: 1.31, interval: 10 },
      0
    );
    expect(f.easeFactor).toBe(1.3);
  });
});

describe('review aggregation parity', () => {
  const mk = (ratings) =>
    ratings.map((r, i) => ({
      cardId: 'c',
      rating: r,
      ts: `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      undone: false,
    }));
  it('trend and leech match server rules', () => {
    expect(trendOf(mk(['hard', 'hard', 'easy', 'easy']))).toBe(
      'improving'
    );
    expect(trendOf(mk(['easy', 'easy', 'hard', 'hard']))).toBe(
      'worsening'
    );
    expect(leechOf(mk(['ok', 'hard', 'hard', 'hard', 'hard']))).toBe(
      true
    );
    expect(leechOf(mk(['ok', 'hard', 'ok']))).toBe(false);
  });
  it('difficulty scores hard cards high', () => {
    expect(difficultyOf([])).toBe(0);
    const hard = difficultyOf(mk(['hard', 'hard', 'hard', 'hard']));
    expect(hard).toBeGreaterThan(50);
  });
});

describe('store round-trips', () => {
  it('namespaced load/save isolates tables', () => {
    save(NS.users, [{ id: 'u1' }], AD);
    save(NS.decks, [{ id: 'd1' }], AD);
    expect(load(NS.users, AD)).toEqual([{ id: 'u1' }]);
    expect(load(NS.decks, AD)).toEqual([{ id: 'd1' }]);
    expect(load(NS.reviews, AD)).toEqual([]);
  });
});

describe('router end-to-end (offline account)', () => {
  it('register -> deck -> study -> review -> undo -> stats -> delete', async () => {
    const mod = await import('../src/lib/localBackend');
    const tag = `t${Date.now() % 100000}`;
    const reg = await mod.routeLocal(
      'post',
      '/auth/register',
      { username: `${tag}u`, password: 'pw1234' },
      {}
    );
    expect(reg.token.startsWith('local-')).toBe(true);
    const cfg = { headers: { Authorization: `Bearer ${reg.token}` } };

    const me = await mod.routeLocal('get', '/users/me', undefined, cfg);
    expect(me.username).toBe(`${tag}u`);
    expect(me.appearance.uiLang).toBe('en');

    const deck = await mod.routeLocal(
      'post',
      '/decks',
      { name: `${tag} deck`, subject: '', type: 'general' },
      cfg
    );
    expect(deck.shareCode).toHaveLength(6);

    const added = await mod.routeLocal(
      'post',
      `/decks/${deck.id}/cards`,
      { cards: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }] },
      cfg
    );
    expect(added.count).toBe(2);

    const study = await mod.routeLocal(
      'get',
      `/decks/${deck.id}/study`,
      undefined,
      cfg
    );
    expect(study.due.length).toBe(2);

    const cardId = study.due[0].id;
    const rated = await mod.routeLocal(
      'post',
      `/decks/${deck.id}/cards/${cardId}/review`,
      { rating: 'ok', mode: 'flip', ms: 1200 },
      cfg
    );
    expect(rated.interval).toBe(1);
    expect(rated.reviewId).toBeTruthy();

    const sheet = await mod.routeLocal(
      'get',
      `/decks/${deck.id}/recall-sheet`,
      undefined,
      cfg
    );
    expect(sheet.all.length).toBe(2);
    expect(sheet.all.find((c) => c.id === cardId).stats.total).toBe(1);

    const undone = await mod.routeLocal(
      'post',
      `/decks/${deck.id}/cards/${cardId}/undo`,
      { reviewId: rated.reviewId },
      cfg
    );
    expect(undone.lastRating).toBe(null);

    const stats = await mod.routeLocal('get', '/stats', undefined, cfg);
    expect(stats.total.cards).toBe(2);
    expect(stats.reviewsPerDay.length).toBe(30);

    const exp = await mod.routeLocal(
      'post',
      '/users/me/export-all',
      {},
      cfg
    );
    expect(exp.app).toBe('studyapp');
    expect(exp.user.username).toBe(`${tag}u`);
    expect(JSON.stringify(exp)).not.toMatch(/passwordHash|apiKey/);

    const gone = await mod.routeLocal(
      'delete',
      '/users/me',
      { currentPassword: 'pw1234' },
      cfg
    );
    expect(gone.message).toBe('Account deleted');
    await expect(
      mod.routeLocal('get', '/users/me', undefined, cfg)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects duplicates, bad logins, bad ratings', async () => {
    const mod = await import('../src/lib/localBackend');
    const tag = `d${Date.now() % 100000}`;
    await mod.routeLocal(
      'post',
      '/auth/register',
      { username: `${tag}u`, password: 'pw1234' },
      {}
    );
    await expect(
      mod.routeLocal(
        'post',
        '/auth/register',
        { username: `${tag}u`, password: 'pw1234' },
        {}
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      mod.routeLocal(
        'post',
        '/auth/login',
        { username: `${tag}u`, password: 'wrong' },
        {}
      )
    ).rejects.toMatchObject({ status: 401 });
    const login = await mod.routeLocal(
      'post',
      '/auth/login',
      { username: `${tag}u`, password: 'pw1234' },
      {}
    );
    const cfg = { headers: { Authorization: `Bearer ${login.token}` } };
    await expect(
      mod.routeLocal('post', '/users/me/import', { backup: {} }, cfg)
    ).rejects.toMatchObject({ status: 400 });
  });
});
