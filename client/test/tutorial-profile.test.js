// tutorial-profile.test.js — T2: tutorial flags, profile store.
import { describe, expect, it } from 'vitest';
import { getAdapter } from '../src/lib/storage';
import { LANGS } from '../src/pages/DeckEditor';

describe('tutorial + profile (browser-side)', () => {
  it('deck language list has 38 entries', () => {
    expect(LANGS.length).toBe(38);
  });
  it('tutorial done flag round-trips', async () => {
    const mod = await import('../src/pages/Tutorial');
    getAdapter().remove('tutorial');
    expect(mod.tutorialDone()).toBe(false);
    mod.markTutorialDone();
    expect(mod.tutorialDone()).toBe(true);
    expect(mod.TUTORIAL_VERSION).toBe(1);
    getAdapter().remove('tutorial');
  });
  it('profile save/load round-trips', async () => {
    const mod = await import('../src/pages/Profile');
    const key = 'profile.__test_user__';
    getAdapter().remove(key);
    const loaded = mod.loadProfile('__test_user__');
    expect(loaded.avatar).toBeTruthy();
    expect(
      mod.saveProfile('__test_user__', {
        displayName: 'Test',
        avatar: 'owl',
        learningLangs: ['lt', 'es'],
      })
    ).toBe(true);
    const back = mod.loadProfile('__test_user__');
    expect(back.displayName).toBe('Test');
    expect(back.learningLangs).toEqual(['lt', 'es']);
    getAdapter().remove(key);
  });
});
