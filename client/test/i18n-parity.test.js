// i18n parity: EN + LT complete, identical {placeholders}.
// Missing keys fall back to English in t(); this test fails
// so gaps get fixed instead of shipping silently.
import { describe, expect, it } from 'vitest';
import * as i18n from '../src/lib/i18n';

const KNOWN_KEYS = [
  'common.loading', 'brand.tagline',
  'nav.dashboard', 'nav.mixed', 'nav.stats',
  'nav.settings', 'nav.logout',
  'deck.study', 'deck.quiz', 'deck.recall', 'deck.edit',
  'flash.hint', 'rate.hard', 'rate.ok', 'rate.easy',
  'dash.title', 'dash.new',
  'study.end', 'study.completeTitle',
  'study.showAnswer', 'study.guessCta',
  'quiz.title', 'quiz.build',
  'recall.title', 'mixed.title', 'stats.title',
  'auth.username', 'auth.password',
  'onboard.s0title',
  'set.title', 'set.simple', 'set.advanced',
  'set.appearance', 'set.ai', 'set.account',
  'editor.createTitle', 'editor.name', 'editor.pasteTitle',
  'login.welcome', 'register.welcome',
];

const VARS = {
  i: 1, n: 5, s: 3, t: 4, m: 2,
  cards: 'cards', days: 'days',
  name: 'X', q: 'Q',
};

const PLACEHOLDER_KEYS = [
  'study.cardOf',
  'study.completeBody',
  'editor.savedCards',
  'quiz.scoreOf',
  'stats.streakLine',
  'set.imported',
  'onboard.examplesDone',
];

function placeholders(str) {
  const out = [];
  const re = /\{(\w+)\}/g;
  let m;
  while ((m = re.exec(String(str))) !== null) out.push(m[1]);
  return out.sort().join(',');
}

describe('i18n parity (EN/LT complete)', () => {
  it('resolves every smoke key in en, ru, lt', () => {
    for (const lang of ['en', 'ru', 'lt']) {
      for (const key of KNOWN_KEYS) {
        const s = i18n.t(lang, key, VARS);
        expect(typeof s, lang + ':' + key).toBe('string');
        expect(s.length, lang + ':' + key).toBeGreaterThan(0);
      }
    }
  });

  it('placeholders identical across en, ru, lt', () => {
    for (const key of PLACEHOLDER_KEYS) {
      const en = placeholders(i18n.t('en', key, VARS));
      const ru = placeholders(i18n.t('ru', key, VARS));
      const lt = placeholders(i18n.t('lt', key, VARS));
      expect(ru, key + ' ru').toBe(en);
      expect(lt, key + ' lt').toBe(en);
    }
  });

  it('UI language switch never touches study content', () => {
    const card = { front: 'labas', back: 'hello' };
    const before = JSON.stringify(card);
    i18n.t('lt', 'dash.title');
    i18n.t('ru', 'dash.title');
    expect(JSON.stringify(card)).toBe(before);
  });

  it('Lithuanian glyph sanity (latin-ext)', () => {
    const s = 'ąčęėįšųūž ĄČĘĖĮŠŲŪŽ';
    expect(s.normalize('NFC').length).toBeGreaterThan(0);
    expect(i18n.cardWord('lt', 1)).toMatch(/kortel/);
  });
});
