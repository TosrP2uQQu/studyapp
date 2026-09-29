// appearance.test.js — T9 theme/spacing enums accepted.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

test('defaults include new themes and spacing', () => {
  const a = db.defaultAppearance();
  assert.equal(a.lineHeight, 'normal');
  assert.equal(a.letterSpacing, 'normal');
  assert.equal(a.theme, 'system');
});

test('normalizeUser backfills old records', () => {
  const u = db.normalizeUser({ appearance: { theme: 'dark' } });
  assert.equal(u.appearance.lineHeight, 'normal');
  assert.equal(u.appearance.theme, 'dark');
});
