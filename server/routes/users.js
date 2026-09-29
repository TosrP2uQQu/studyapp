const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { callAI, encryptKey, DEFAULT_MODELS } = require('../ai');

const router = express.Router();

// Public view of one user's settings: key material never leaves the
// server except as the last 4 characters, once saved.
function publicAiSettings(ai) {
  return {
    provider: ai.provider || 'none',
    model: ai.model || '',
    baseUrl: ai.baseUrl || '',
    keyLast4: ai.apiKeyLast4 || '',
    gradingTiming: ai.gradingTiming === 'end' ? 'end' : 'immediate',
    gradingStrictness: ['lenient', 'standard', 'strict'].includes(ai.gradingStrictness)
      ? ai.gradingStrictness
      : 'standard',
    configured: ['anthropic', 'openai', 'gemini', 'mistral', 'groq', 'custom'].includes(ai.provider)
      ? Boolean(ai.apiKeyEnc)
      : ai.provider === 'ollama'
        ? Boolean(ai.baseUrl)
        : false,
  };
}

// Server-usable credentials. Returns null when there is nothing the
// server may call: provider off, key missing — or Local (Ollama), which
// is client-side only by architecture (Section 1) and must never be
// proxied through this server.
function aiCredentials(ai) {
  if (!ai || ai.provider === 'none' || ai.provider === 'ollama') return null;
  if (ai.provider === 'custom') {
    if (!ai.apiKeyEnc || !ai.baseUrl) return null;
    const { decryptKey } = require('../ai');
    return {
      provider: 'custom',
      apiKey: decryptKey(ai.apiKeyEnc),
      baseUrl: ai.baseUrl,
      model: ai.model || '',
    };
  }
  if (!['anthropic', 'openai', 'gemini', 'mistral', 'groq'].includes(ai.provider)) return null;
  if (!ai.apiKeyEnc) return null;
  const { decryptKey } = require('../ai');
  return {
    provider: ai.provider,
    apiKey: decryptKey(ai.apiKeyEnc),
    model: ai.model || DEFAULT_MODELS[ai.provider],
  };
}

function isOllama(ai) {
  return ai && ai.provider === 'ollama';
}

router.get('/me', authMiddleware, (req, res) => {
  const users = db.readUsers();
  const raw = users.find((u) => u.id === req.userId);
  if (!raw) return res.status(404).json({ error: 'User not found' });
  const u = db.normalizeUser(raw);
  res.json({
    id: u.id,
    username: u.username,
    createdAt: u.createdAt,
    studyPrefs: u.studyPrefs,
    onboarded: u.onboarded,
    ai: publicAiSettings(u.aiSettings),
    settingsMode: u.settingsMode,
    appearance: u.appearance,
    defaultStudyModes: u.defaultStudyModes,
  });
});

router.put('/me/prefs', authMiddleware, (req, res) => {
  const { daysPerWeek, minutesPerSession, onboarded } = req.body || {};
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const norm = db.normalizeUser(u);
  const prefs = { ...norm.studyPrefs };
  if (daysPerWeek !== undefined) {
    const d = Number(daysPerWeek);
    if (!Number.isFinite(d) || d < 1 || d > 7) {
      return res.status(400).json({ error: 'daysPerWeek must be 1-7' });
    }
    prefs.daysPerWeek = Math.round(d);
  }
  if (minutesPerSession !== undefined) {
    const m = Number(minutesPerSession);
    if (!Number.isFinite(m) || m < 5 || m > 180) {
      return res.status(400).json({ error: 'minutesPerSession must be 5-180' });
    }
    prefs.minutesPerSession = Math.round(m);
  }
  u.studyPrefs = prefs;
  if (onboarded !== undefined) u.onboarded = onboarded === true;
  db.writeUsers(users);
  res.json({ studyPrefs: prefs, onboarded: u.onboarded === true });
});

// PUT /api/users/me/study-prefs — Phase 3 settings (extends /me/prefs,
// which stays for backward compatibility).
router.put('/me/study-prefs', authMiddleware, (req, res) => {
  const { daysPerWeek, minutesPerSession, sessionCardCap, reminderBannerEnabled } = req.body || {};
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const prefs = { ...db.normalizeUser(u).studyPrefs };
  if (daysPerWeek !== undefined) {
    const d = Number(daysPerWeek);
    if (!Number.isFinite(d) || d < 1 || d > 7) {
      return res.status(400).json({ error: 'daysPerWeek must be 1-7' });
    }
    prefs.daysPerWeek = Math.round(d);
  }
  if (minutesPerSession !== undefined) {
    const m = Number(minutesPerSession);
    if (!Number.isFinite(m) || m < 5 || m > 180) {
      return res.status(400).json({ error: 'minutesPerSession must be 5-180' });
    }
    prefs.minutesPerSession = Math.round(m);
  }
  if (sessionCardCap !== undefined) {
    if (sessionCardCap === null) {
      prefs.sessionCardCap = null;
    } else {
      const c = Number(sessionCardCap);
      if (!Number.isFinite(c) || c < 5 || c > 200) {
        return res.status(400).json({ error: 'sessionCardCap must be null or 5-200' });
      }
      prefs.sessionCardCap = Math.round(c);
    }
  }
  if (reminderBannerEnabled !== undefined) {
    prefs.reminderBannerEnabled = reminderBannerEnabled === true;
  }
  u.studyPrefs = prefs;
  db.writeUsers(users);
  res.json({ studyPrefs: prefs });
});

// PUT /api/users/me/settings-mode — body: { settingsMode: 'simple'|'advanced' }
router.put('/me/settings-mode', authMiddleware, (req, res) => {
  const { settingsMode } = req.body || {};
  if (!['simple', 'advanced'].includes(settingsMode)) {
    return res.status(400).json({ error: 'settingsMode must be simple or advanced' });
  }
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.settingsMode = settingsMode;
  db.writeUsers(users);
  res.json({ settingsMode });
});

const APPEARANCE_ENUMS = {
  theme: ['light', 'dark', 'system', 'contrast', 'sepia', 'amoled'],
  fontSizeStep: ['small', 'medium', 'large', 'xlarge'],
  headingFont: ['source-serif-4', 'lora', 'spectral', 'merriweather', 'playfair-display', 'crimson-pro', 'libre-baskerville', 'fraunces'],
  bodyFont: ['ibm-plex-sans', 'inter', 'work-sans', 'manrope', 'source-sans-3', 'karla', 'public-sans', 'space-grotesk'],
  accentColor: ['ink', 'plum', 'teal'],
  density: ['compact', 'comfortable', 'spacious'],
  flipStyle: ['flip', 'fade', 'slide'],
  reduceMotion: ['system', 'always', 'never'],
  uiLang: ['en', 'ru', 'lt'],
  lineHeight: ['normal', 'relaxed', 'loose'],
  letterSpacing: ['normal', 'wide', 'wider'],
};

// PUT /api/users/me/appearance — partial updates allowed; unknown or
// invalid values are rejected, never silently stored.
router.put('/me/appearance', authMiddleware, (req, res) => {
  const body = req.body || {};
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const appearance = { ...db.normalizeUser(u).appearance };
  for (const [key, allowed] of Object.entries(APPEARANCE_ENUMS)) {
    if (body[key] === undefined) continue;
    if (!allowed.includes(body[key])) {
      return res.status(400).json({ error: `${key} must be one of: ${allowed.join(', ')}` });
    }
    appearance[key] = body[key];
  }
  u.appearance = appearance;
  db.writeUsers(users);
  res.json({ appearance });
});

// PUT /api/users/me/default-study-modes — pre-fills Deck Editor toggles
// for decks created afterwards; never touches existing decks.
router.put('/me/default-study-modes', authMiddleware, (req, res) => {
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const modes = { ...db.normalizeUser(u).defaultStudyModes };
  for (const key of ['typedRecall', 'pretest', 'elaborativePrompts']) {
    if (req.body && req.body[key] !== undefined) modes[key] = req.body[key] === true;
  }
  u.defaultStudyModes = modes;
  db.writeUsers(users);
  res.json({ defaultStudyModes: modes });
});

router.put('/me/ai-settings', authMiddleware, (req, res) => {
  const { provider, apiKey, baseUrl, model, gradingTiming, gradingStrictness } = req.body || {};
  if (!['none', 'anthropic', 'openai', 'gemini', 'mistral', 'groq', 'ollama', 'custom'].includes(provider)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const norm = db.normalizeUser(u);
  const next = { ...norm.aiSettings, provider };
  if (provider === 'none') {
    next.apiKeyEnc = '';
    next.apiKeyLast4 = '';
    next.baseUrl = '';
    next.model = '';
  } else if (provider === 'ollama' || provider === 'custom') {
    // No key is ever needed for Local; Custom needs key + URL + model.
    // The base URL is the person's own machine (ollama) or their own
    // endpoint (custom) — stored, never proxied through here for ollama.
    if (provider === 'custom') {
      if (apiKey) {
        const trimmed = String(apiKey).trim();
        if (!trimmed) return res.status(400).json({ error: 'API key is required' });
        next.apiKeyEnc = encryptKey(trimmed);
        next.apiKeyLast4 = trimmed.slice(-4);
      } else if (!norm.aiSettings.apiKeyEnc || norm.aiSettings.provider !== 'custom') {
        return res.status(400).json({ error: 'API key is required' });
      }
      if (!baseUrl && !norm.aiSettings.baseUrl) {
        return res.status(400).json({ error: 'Base URL is required for a custom provider' });
      }
      if (!model && !norm.aiSettings.model) {
        return res.status(400).json({ error: 'Model name is required for a custom provider' });
      }
    } else {
      next.apiKeyEnc = '';
      next.apiKeyLast4 = '';
    }
    if (baseUrl !== undefined) next.baseUrl = String(baseUrl);
    else if (!next.baseUrl) {
      next.baseUrl = provider === 'ollama' ? 'http://localhost:11434/v1' : '';
    }
    if (model !== undefined) next.model = String(model);
  } else {
    if (apiKey) {
      const trimmed = String(apiKey).trim();
      if (!trimmed) return res.status(400).json({ error: 'API key is required' });
      next.apiKeyEnc = encryptKey(trimmed);
      next.apiKeyLast4 = trimmed.slice(-4);
    } else if (!norm.aiSettings.apiKeyEnc || norm.aiSettings.provider !== provider) {
      // Switching cloud providers always needs that provider's key.
      return res.status(400).json({ error: 'API key is required' });
    }
    next.baseUrl = '';
    if (model !== undefined) next.model = String(model);
    else if (!next.model || norm.aiSettings.provider !== provider) {
      next.model = String(DEFAULT_MODELS[provider] || '');
    }
  }
  if (gradingTiming !== undefined) {
    if (!['immediate', 'end'].includes(gradingTiming)) {
      return res.status(400).json({ error: 'gradingTiming must be immediate or end' });
    }
    next.gradingTiming = gradingTiming;
  }
  if (gradingStrictness !== undefined) {
    if (!['lenient', 'standard', 'strict'].includes(gradingStrictness)) {
      return res.status(400).json({ error: 'gradingStrictness must be lenient, standard, or strict' });
    }
    next.gradingStrictness = gradingStrictness;
  }
  u.aiSettings = next;
  db.writeUsers(users);
  res.json({ ai: publicAiSettings(next) });
});

// Test credentials (provided or already saved) with one trivial request.
// Nothing is saved by this endpoint. Local (Ollama) is tested from the
// browser instead — this endpoint refuses it loudly rather than hitting
// the server's own localhost on the visitor's behalf.
router.post('/me/ai-settings/test', authMiddleware, async (req, res) => {
  const { provider, apiKey, baseUrl, model } = req.body || {};
  if (provider === 'ollama') {
    return res.status(400).json({
      error: 'Local is tested from your browser, against your own base URL',
      clientSide: true,
    });
  }
  try {
    let creds;
    if (provider === 'custom') {
      let key = apiKey;
      let url = baseUrl;
      let mdl = model;
      if (!key || !url) {
        const users = db.readUsers();
        const uu = users.find((x) => x.id === req.userId);
        const saved = uu && db.normalizeUser(uu).aiSettings;
        if (saved && saved.provider === 'custom') {
          const { decryptKey } = require('../ai');
          if (!key && saved.apiKeyEnc) key = decryptKey(saved.apiKeyEnc);
          if (!url) url = saved.baseUrl;
          if (!mdl) mdl = saved.model;
        }
      }
      if (!key || !url || !mdl) {
        return res.status(400).json({ error: 'Custom needs a key, a base URL, and a model to test' });
      }
      creds = { provider: 'custom', apiKey: key, baseUrl: url, model: mdl };
    } else {
      let key = apiKey;
      if (!key) {
        const users = db.readUsers();
        const u = users.find((x) => x.id === req.userId);
        const saved = u && db.normalizeUser(u).aiSettings;
        if (saved && saved.apiKeyEnc && saved.provider === provider) {
          const { decryptKey } = require('../ai');
          key = decryptKey(saved.apiKeyEnc);
        }
      }
      if (!key) return res.status(400).json({ error: 'No API key to test' });
      creds = { provider, apiKey: key, model: model || DEFAULT_MODELS[provider] };
    }
    const { text } = await callAI({
      ...creds,
      userId: req.userId,
      messages: [{ role: 'user', content: 'Reply with the word ok and nothing else.' }],
      feature: 'key-test',
    });
    res.json({ ok: Boolean(text), sample: String(text).slice(0, 80) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// PUT /api/users/me/password — requires the current password.
router.put('/me/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  const { comparePassword, hashPassword } = require('../auth');
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!comparePassword(String(currentPassword), u.passwordHash)) {
    return res.status(401).json({ error: 'Current password is wrong' });
  }
  u.passwordHash = hashPassword(String(newPassword));
  db.writeUsers(users);
  res.json({ message: 'Password changed' });
});

// GET /api/users/me/ai-log — this user's own ai.js log lines only
// (feature + byte count, never content). Lines logged before user tagging
// existed carry no user and are not shown to anyone.
router.get('/me/ai-log', authMiddleware, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const logFile = path.join(__dirname, '..', 'data', 'ai-calls.log');
  let lines = [];
  try {
    lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  } catch {
    lines = [];
  }
  const mine = [];
  for (const line of lines) {
    // Format: "<iso> user=<id> feature=<f> provider=<p> bytes_sent=<n>"
    const m = line.match(/^(\S+) user=(\S+) feature=(\S+) provider=(\S+) bytes_sent=(\d+)/);
    if (m && m[2] === req.userId) {
      mine.push({ timestamp: m[1], feature: m[3], provider: m[4], bytesSent: Number(m[5]) });
    }
  }
  res.json({ entries: mine.slice(-200) });
});

// POST /api/users/me/export-all — full JSON backup: owned decks, the
// user's own progress rows and quiz results, and settings. Never member
// decks, never the password hash, never key material.
router.post('/me/export-all', authMiddleware, (req, res) => {
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const norm = db.normalizeUser(u);
  const decks = db.readDecks().filter((d) => d.ownerId === req.userId);
  const deckIds = new Set(decks.map((d) => d.id));
  res.json({
    app: 'studyapp',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: {
      username: norm.username,
      studyPrefs: norm.studyPrefs,
      settingsMode: norm.settingsMode,
      appearance: norm.appearance,
      defaultStudyModes: norm.defaultStudyModes,
    },
    decks: decks.map((d) => db.normalizeDeck(d)),
    progress: db.readProgress().filter((p) => p.userId === req.userId && deckIds.has(p.deckId)),
    quizResults: db.readQuizResults().filter((q) => q.userId === req.userId && deckIds.has(q.deckId)),
  });
});

function isValidBackup(b) {
  return (
    b && b.app === 'studyapp' && b.version === 1 &&
    b.user && typeof b.user === 'object' &&
    Array.isArray(b.decks) && Array.isArray(b.progress) && Array.isArray(b.quizResults)
  );
}

// POST /api/users/me/import — restore a backup from export-all.
// body: { backup, mode: 'merge'|'replace' }. Imported decks get fresh ids
// and share codes so nothing collides with decks already on disk.
router.post('/me/import', authMiddleware, (req, res) => {
  const { backup, mode } = req.body || {};
  if (!isValidBackup(backup)) {
    return res.status(400).json({ error: 'That file is not a StudyApp backup' });
  }
  if (!['merge', 'replace'].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'merge' or 'replace'" });
  }
  const { v4: uuidv4 } = require('uuid');
  const SHARE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const decks = db.readDecks();

  if (mode === 'replace') {
    const ownedIds = new Set(decks.filter((d) => d.ownerId === req.userId).map((d) => d.id));
    db.writeDecks(decks.filter((d) => !ownedIds.has(d.id)));
    db.writeProgress(db.readProgress().filter((p) => !(p.userId === req.userId && ownedIds.has(p.deckId))));
    db.writeQuizResults(db.readQuizResults().filter((q) => !(q.userId === req.userId && ownedIds.has(q.deckId))));
  }

  const live = db.readDecks();
  const taken = new Set(live.map((d) => d.shareCode));
  const newCode = () => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) code += SHARE[Math.floor(Math.random() * SHARE.length)];
      if (!taken.has(code)) {
        taken.add(code);
        return code;
      }
    }
  };

  let deckCount = 0;
  let progressCount = 0;
  const afterDecks = db.readDecks();
  const afterProgress = db.readProgress();
  const afterQuiz = db.readQuizResults();
  const afterMembers = db.readMemberships();
  const now = new Date().toISOString();

  for (const d of backup.decks) {
    if (!d || !Array.isArray(d.cards)) continue;
    const deckId = uuidv4();
    const cardIdMap = new Map();
    const cards = d.cards
      .filter((c) => c && (c.front !== undefined || c.back !== undefined))
      .map((c) => {
        const id = uuidv4();
        cardIdMap.set(c.id, id);
        return { id, front: String(c.front ?? ''), back: String(c.back ?? ''), createdAt: c.createdAt || now };
      });
    afterDecks.push({
      id: deckId,
      ownerId: req.userId,
      name: String(d.name || 'Imported deck'),
      subject: String(d.subject || ''),
      type: d.type === 'language' ? 'language' : 'general',
      sourceLang: String(d.sourceLang || ''),
      targetLang: String(d.targetLang || ''),
      shareCode: newCode(),
      createdAt: d.createdAt || now,
      cards,
      studyModes: { ...db.defaultStudyModes(), ...(d.studyModes || {}) },
    });
    afterMembers.push({ userId: req.userId, deckId, joinedAt: now });
    deckCount++;
    for (const p of (backup.progress || []).filter((p) => p && p.deckId === d.id && cardIdMap.has(p.cardId))) {
      afterProgress.push({
        userId: req.userId, deckId, cardId: cardIdMap.get(p.cardId),
        repetitions: Number(p.repetitions) || 0,
        easeFactor: Number(p.easeFactor) || 2.5,
        interval: Number(p.interval) || 0,
        nextReviewDate: String(p.nextReviewDate || '').slice(0, 10) || sm2today(),
        lastRating: ['easy', 'ok', 'hard'].includes(p.lastRating) ? p.lastRating : null,
        lastReviewedAt: p.lastReviewedAt || null,
      });
      progressCount++;
    }
    for (const q of (backup.quizResults || []).filter((q) => q && q.deckId === d.id)) {
      afterQuiz.push({ ...q, id: uuidv4(), userId: req.userId, deckId });
    }
  }
  // Restore settings from the backup (appearance, prefs, modes, mode).
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (u && backup.user) {
    const norm = db.normalizeUser(u);
    if (backup.user.studyPrefs) u.studyPrefs = { ...norm.studyPrefs, ...backup.user.studyPrefs };
    if (backup.user.appearance) u.appearance = { ...norm.appearance, ...backup.user.appearance };
    if (backup.user.defaultStudyModes) {
      u.defaultStudyModes = { ...norm.defaultStudyModes, ...backup.user.defaultStudyModes };
    }
    if (['simple', 'advanced'].includes(backup.user.settingsMode)) {
      u.settingsMode = backup.user.settingsMode;
    }
    db.writeUsers(users);
  }

  db.writeDecks(afterDecks);
  db.writeProgress(afterProgress);
  db.writeQuizResults(afterQuiz);
  db.writeMemberships(afterMembers);
  res.json({ message: 'Backup imported', decks: deckCount, progressRows: progressCount });
});

function sm2today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// DELETE /api/users/me — requires the current password. Deletes owned
// decks (and their cards/progress), the user's own progress and quiz
// history everywhere, their memberships, and the account record.
router.delete('/me', authMiddleware, (req, res) => {
  const { currentPassword } = req.body || {};
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }
  const { comparePassword } = require('../auth');
  const users = db.readUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!comparePassword(String(currentPassword), u.passwordHash)) {
    return res.status(401).json({ error: 'Current password is wrong' });
  }
  const ownedIds = new Set(db.readDecks().filter((d) => d.ownerId === req.userId).map((d) => d.id));
  db.writeDecks(db.readDecks().filter((d) => !ownedIds.has(d.id)));
  db.writeMemberships(
    db.readMemberships().filter((m) => m.userId !== req.userId && !ownedIds.has(m.deckId))
  );
  db.writeProgress(
    db.readProgress().filter((p) => p.userId !== req.userId && !ownedIds.has(p.deckId))
  );
  db.writeQuizResults(db.readQuizResults().filter((q) => q.userId !== req.userId));
  db.writeUsers(users.filter((x) => x.id !== req.userId));
  res.json({ message: 'Account deleted' });
});

module.exports = { router, aiCredentials, publicAiSettings };
