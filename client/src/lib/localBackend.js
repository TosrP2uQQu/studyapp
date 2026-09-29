// localBackend.js — full offline backend for static hosting.
// Same routes and response shapes as the Express server, backed by
// browser storage (localStore) instead of JSON files. api.js routes
// here automatically when no server answers (GitHub Pages).
import {
  NS,
  PROVIDERS,
  APPEARANCE_ENUMS,
  defaultStudyModes,
  load,
  loadObj,
  newShareCode,
  normalizeDeck,
  normalizeUser,
  nowIso,
  publicAiSettings,
  save,
  saveObj,
  uid,
} from './localStore.js';
import {
  aggregateCard,
  bucketize,
  comparePassword,
  computeStreak,
  defaultProgress,
  hashPassword,
  isDue,
  ratingToQuality,
  restorePrev,
  reviewCard,
  reviewsPerDay,
  snapshotPrev,
} from './localSm2.js';
import { generate } from './llm.js';
import { getBrowserKey } from './keys.js';
import {
  buildFeedbackMessages,
  buildQuizGradeMessages,
  buildWrittenRecallMessages,
  parseTier,
} from './aiClient.js';
import STARTER from '../data/starter-decks.json';

// ---- offline flag (api.js flips it on first dead server) ----

let offline = false;

export function isLocalMode() {
  return offline;
}

export function markLocal() {
  offline = true;
}

// ---- errors shaped like axios rejections ----

function fail(status, error, extra) {
  const e = new Error(error);
  e.status = status;
  e.data = { error, ...(extra || {}) };
  throw e;
}

function ok(body) {
  return body;
}

// ---- tables ----

function users() {
  return load(NS.users);
}

function decks() {
  return load(NS.decks);
}

function members() {
  return load(NS.members);
}

function progress() {
  return load(NS.progress);
}

function reviews() {
  return load(NS.reviews);
}

function quizResults() {
  return load(NS.quizResults);
}

function session() {
  return loadObj(NS.session);
}

// ---- auth ----

function userIdFrom(config) {
  const h = (config && config.headers) || {};
  const auth = h.Authorization || h.authorization || '';
  const m = String(auth).match(/^Bearer (.+)$/);
  if (!m) fail(401, 'Missing token');
  const s = session();
  if (!s.token || s.token !== m[1]) fail(401, 'Invalid token');
  return s.userId;
}

function findUser(id) {
  const u = users().find((x) => x.id === id);
  if (!u) fail(404, 'User not found');
  return normalizeUser(u);
}

function saveUser(next) {
  const rows = users();
  const i = rows.findIndex((x) => x.id === next.id);
  if (i >= 0) rows[i] = next;
  else rows.push(next);
  save(NS.users, rows);
}

function freshToken() {
  return `local-${uid()}`;
}

// ---- AI helpers (browser keys, never stored here) ----

function localCreds(user) {
  const ai = (user && user.aiSettings) || {};
  const provider = ai.provider || 'none';
  if (provider === 'none' || provider === 'ollama') return null;
  const apiKey = getBrowserKey(provider);
  if (!apiKey) return null;
  if (provider === 'custom') {
    if (!ai.baseUrl || !ai.model) return null;
    return { provider, apiKey, baseUrl: ai.baseUrl, model: ai.model };
  }
  return { provider, apiKey, model: ai.model || '' };
}

function aiLog(userId, feature, provider, bytes) {
  const rows = load(NS.aiLog);
  rows.push({
    timestamp: nowIso(),
    userId,
    feature,
    provider,
    bytesSent: bytes,
  });
  save(NS.aiLog, rows.slice(-200));
}

// ---- quiz builder (server port) ----

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildLocalQuiz(deck, count, includeShort) {
  const cards = shuffle(deck.cards || []).slice(0, Math.max(count, 1));
  return cards.map((card, i) => {
    const others = shuffle(
      (deck.cards || []).filter((c) => c.id !== card.id)
    ).slice(0, 3);
    const wantMcq = others.length >= 2 && (i % 2 === 0 || !includeShort);
    if (wantMcq) {
      const options = shuffle([card.back, ...others.map((c) => c.back)]);
      return {
        index: i,
        kind: 'multiple-choice',
        prompt: card.front,
        options,
        answer: card.back,
      };
    }
    return {
      index: i,
      kind: 'short-answer',
      prompt: card.front,
      answer: card.back,
    };
  });
}

const pendingQuiz = new Map();

function normAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- membership ----

function canRead(userId, deck) {
  if (!deck) return false;
  if (deck.ownerId === userId) return true;
  return members().some((m) => m.userId === userId && m.deckId === deck.id);
}

function getDeck(userId, id) {
  const deck = decks().find((d) => d.id === id);
  if (!deck) fail(404, 'Deck not found');
  if (!canRead(userId, deck)) fail(403, 'Not a member of this deck');
  return normalizeDeck(deck);
}

function dueCards(userId, deck, allProgress) {
  const out = [];
  for (const card of deck.cards || []) {
    const row = allProgress.find(
      (p) => p.userId === userId && p.deckId === deck.id && p.cardId === card.id
    );
    if (!row) {
      out.push({ ...card, progress: { ...defaultProgress(), lastRating: null } });
    } else if (isDue(row.nextReviewDate)) {
      out.push({ ...card, progress: row });
    }
  }
  return out;
}

// ================= route =================

export async function routeLocal(method, url, body, config) {
  const m = String(method || 'get').toLowerCase();
  const path = String(url || '').split('?')[0];
  const seg = path.split('/').filter(Boolean);

  // ---- auth (no token needed) ----
  if (m === 'post' && path === '/auth/register') {
    return register(body);
  }
  if (m === 'post' && path === '/auth/login') {
    return login(body);
  }

  const userId = userIdFrom(config);
  const user = findUser(userId);

  // ---- users/me ----
  if (m === 'get' && path === '/users/me') return meView(user);
  if (m === 'put' && path === '/users/me/prefs') {
    return savePrefs(user, body, false);
  }
  if (m === 'put' && path === '/users/me/study-prefs') {
    return savePrefs(user, body, true);
  }
  if (m === 'put' && path === '/users/me/settings-mode') {
    return saveSettingsMode(user, body);
  }
  if (m === 'put' && path === '/users/me/appearance') {
    return saveAppearance(user, body);
  }
  if (m === 'put' && path === '/users/me/default-study-modes') {
    return saveDefaultModes(user, body);
  }
  if (m === 'put' && path === '/users/me/ai-settings') {
    return saveAiSettings(user, body);
  }
  if (m === 'post' && path === '/users/me/ai-settings/test') {
    return testAiSettings(user, body);
  }
  if (m === 'put' && path === '/users/me/password') {
    return changePassword(user, body);
  }
  if (m === 'get' && path === '/users/me/ai-log') {
    return aiLogView(user);
  }
  if (m === 'post' && path === '/users/me/export-all') {
    return exportAll(user);
  }
  if (m === 'post' && path === '/users/me/import') {
    return importBackup(user, body);
  }
  if (m === 'delete' && path === '/users/me') {
    return deleteAccount(user, body);
  }

  // ---- decks ----
  if (m === 'get' && path === '/decks') return listDecks(userId);
  if (m === 'post' && path === '/decks') return createDeck(user, body);
  if (m === 'post' && path === '/decks/join') {
    return joinDeck(userId, body);
  }
  if (m === 'post' && path === '/decks/mixed-review') {
    return mixedReview(userId, body);
  }
  if (seg[0] === 'decks' && seg[1]) {
    // /decks/:id/cards/:cardId/review|undo (5 segments)
    if (seg.length === 5 && seg[2] === 'cards' && m === 'post') {
      if (seg[4] === 'review') {
        return reviewCardRoute(userId, seg[1], seg[3], body);
      }
      if (seg[4] === 'undo') {
        return undoRoute(userId, seg[1], seg[3], body);
      }
      fail(404, 'Not found');
    }
    // /decks/:id/quiz/:quizId/grade (5 segments)
    if (seg.length === 5 && seg[2] === 'quiz' && m === 'post') {
      return gradeQuiz(user, seg[1], seg[3], body);
    }
    return deckRoute(user, userId, m, seg.slice(1), body);
  }

  // ---- quiz via decks/:id/quiz handled in deckRoute ----

  // ---- ai ----
  if (m === 'post' && path === '/ai/grade') {
    return aiGrade(user, body);
  }
  if (m === 'post' && path === '/ai/feedback') {
    return aiFeedback(user, body);
  }

  // ---- misc ----
  if (m === 'post' && path === '/translate') {
    fail(502, 'No translation service in offline mode');
  }
  if (m === 'post' && path === '/examples/lithuanian') {
    return seedExamples(userId);
  }
  if (m === 'get' && path === '/stats') return statsView(userId);

  fail(404, 'Not found');
}

// ================= auth =================

async function register(body) {
  const { username, password } = body || {};
  if (!username || !password) {
    fail(400, 'Username and password are required');
  }
  if (String(password).length < 4) {
    fail(400, 'Password must be at least 4 characters');
  }
  const rows = users();
  const exists = rows.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (exists) fail(400, 'Username already exists');
  const user = normalizeUser({
    id: uid(),
    username: String(username),
    passwordHash: await hashPassword(String(password)),
    createdAt: nowIso(),
  });
  rows.push(user);
  save(NS.users, rows);
  const token = freshToken();
  saveObj(NS.session, { userId: user.id, token });
  return ok({ token, user: { id: user.id, username: user.username } });
}

async function login(body) {
  const { username, password } = body || {};
  if (!username || !password) {
    fail(400, 'Username and password are required');
  }
  const rows = users();
  const user = rows.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  let good = false;
  try {
    good = user && (await comparePassword(String(password), user.passwordHash));
  } catch {
    good = false;
  }
  if (!user || !good) fail(401, 'Invalid username or password');
  const token = freshToken();
  saveObj(NS.session, { userId: user.id, token });
  return ok({ token, user: { id: user.id, username: user.username } });
}

// ================= users =================

function meView(user) {
  return ok({
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    studyPrefs: user.studyPrefs,
    onboarded: user.onboarded,
    ai: publicAiSettings(user.aiSettings, getBrowserKey(user.aiSettings.provider)),
    settingsMode: user.settingsMode,
    appearance: user.appearance,
    defaultStudyModes: user.defaultStudyModes,
  });
}

function savePrefs(user, body, extended) {
  const b = body || {};
  const prefs = { ...user.studyPrefs };
  if (b.daysPerWeek !== undefined) {
    const d = Number(b.daysPerWeek);
    if (!Number.isFinite(d) || d < 1 || d > 7) {
      fail(400, 'daysPerWeek must be 1-7');
    }
    prefs.daysPerWeek = Math.round(d);
  }
  if (b.minutesPerSession !== undefined) {
    const n = Number(b.minutesPerSession);
    if (!Number.isFinite(n) || n < 5 || n > 180) {
      fail(400, 'minutesPerSession must be 5-180');
    }
    prefs.minutesPerSession = Math.round(n);
  }
  if (extended) {
    if (b.sessionCardCap !== undefined) {
      if (b.sessionCardCap === null) prefs.sessionCardCap = null;
      else {
        const c = Number(b.sessionCardCap);
        if (!Number.isFinite(c) || c < 5 || c > 200) {
          fail(400, 'sessionCardCap must be null or 5-200');
        }
        prefs.sessionCardCap = Math.round(c);
      }
    }
    if (b.reminderBannerEnabled !== undefined) {
      prefs.reminderBannerEnabled = b.reminderBannerEnabled === true;
    }
  }
  user.studyPrefs = prefs;
  if (b.onboarded !== undefined) user.onboarded = b.onboarded === true;
  saveUser(user);
  if (extended) return ok({ studyPrefs: prefs });
  return ok({ studyPrefs: prefs, onboarded: user.onboarded === true });
}

function saveSettingsMode(user, body) {
  const v = body && body.settingsMode;
  if (!['simple', 'advanced'].includes(v)) {
    fail(400, 'settingsMode must be simple or advanced');
  }
  user.settingsMode = v;
  saveUser(user);
  return ok({ settingsMode: v });
}

function saveAppearance(user, body) {
  const b = body || {};
  const appearance = { ...user.appearance };
  for (const [key, allowed] of Object.entries(APPEARANCE_ENUMS)) {
    if (b[key] === undefined) continue;
    if (!allowed.includes(b[key])) {
      fail(400, `${key} must be one of: ${allowed.join(', ')}`);
    }
    appearance[key] = b[key];
  }
  user.appearance = appearance;
  saveUser(user);
  return ok({ appearance });
}

function saveDefaultModes(user, body) {
  const modes = { ...user.defaultStudyModes };
  for (const key of ['typedRecall', 'pretest', 'elaborativePrompts']) {
    if (body && body[key] !== undefined) modes[key] = body[key] === true;
  }
  user.defaultStudyModes = modes;
  saveUser(user);
  return ok({ defaultStudyModes: modes });
}

function saveAiSettings(user, body) {
  const b = body || {};
  const { provider, baseUrl, model, gradingTiming, gradingStrictness } = b;
  if (!PROVIDERS.includes(provider)) fail(400, 'Unknown provider');
  const next = { ...user.aiSettings, provider };
  if (provider === 'none') {
    next.baseUrl = '';
    next.model = '';
  } else if (provider === 'ollama' || provider === 'custom') {
    if (provider === 'custom' && !baseUrl && !next.baseUrl) {
      fail(400, 'Base URL is required for a custom provider');
    }
    if (provider === 'custom' && !model && !next.model) {
      fail(400, 'Model name is required for a custom provider');
    }
    if (baseUrl !== undefined) next.baseUrl = String(baseUrl);
    else if (!next.baseUrl && provider === 'ollama') {
      next.baseUrl = 'http://localhost:11434/v1';
    }
    if (model !== undefined) next.model = String(model);
  } else {
    next.baseUrl = '';
    if (model !== undefined) next.model = String(model);
  }
  if (gradingTiming !== undefined) {
    if (!['immediate', 'end'].includes(gradingTiming)) {
      fail(400, 'gradingTiming must be immediate or end');
    }
    next.gradingTiming = gradingTiming;
  }
  if (gradingStrictness !== undefined) {
    if (!['lenient', 'standard', 'strict'].includes(gradingStrictness)) {
      fail(400, 'gradingStrictness must be lenient, standard, or strict');
    }
    next.gradingStrictness = gradingStrictness;
  }
  user.aiSettings = next;
  saveUser(user);
  const last4 = getBrowserKey(provider).slice(-4);
  return ok({ ai: publicAiSettings(next, last4) });
}

async function testAiSettings(user, body) {
  const b = body || {};
  const provider = b.provider || user.aiSettings.provider;
  if (provider === 'ollama') {
    fail(400, 'Local is tested from your browser', { clientSide: true });
  }
  const apiKey = b.apiKey || getBrowserKey(provider);
  if (!apiKey) fail(400, 'No API key to test');
  const cfg = {
    provider,
    apiKey,
    baseUrl: b.baseUrl || user.aiSettings.baseUrl || '',
    model: b.model || user.aiSettings.model || '',
  };
  try {
    const out = await generate(cfg, {
      system: 'Reply with the word ok and nothing else.',
      messages: [{ role: 'user', content: 'ping' }],
      cache: false,
    });
    aiLog(user.id, 'key-test', provider, 60);
    return ok({ ok: Boolean(out.text), sample: String(out.text).slice(0, 80) });
  } catch (err) {
    fail(502, err.aiCode || err.message || 'Test failed');
  }
}

async function changePassword(user, body) {
  const b = body || {};
  if (!b.currentPassword || !b.newPassword) {
    fail(400, 'Current and new passwords are required');
  }
  if (String(b.newPassword).length < 4) {
    fail(400, 'New password must be at least 4 characters');
  }
  const good = await comparePassword(String(b.currentPassword), user.passwordHash);
  if (!good) fail(401, 'Current password is wrong');
  user.passwordHash = await hashPassword(String(b.newPassword));
  saveUser(user);
  return ok({ message: 'Password changed' });
}

function aiLogView(user) {
  const rows = load(NS.aiLog).filter((e) => e.userId === user.id);
  return ok({
    entries: rows.slice(-200).map((e) => ({
      timestamp: e.timestamp,
      feature: e.feature,
      provider: e.provider,
      bytesSent: e.bytesSent,
    })),
  });
}

function exportAll(user) {
  const owned = decks().filter((d) => d.ownerId === user.id);
  const ids = new Set(owned.map((d) => d.id));
  return ok({
    app: 'studyapp',
    version: 1,
    exportedAt: nowIso(),
    user: {
      username: user.username,
      studyPrefs: user.studyPrefs,
      settingsMode: user.settingsMode,
      appearance: user.appearance,
      defaultStudyModes: user.defaultStudyModes,
    },
    decks: owned.map(normalizeDeck),
    progress: progress().filter(
      (p) => p.userId === user.id && ids.has(p.deckId)
    ),
    quizResults: quizResults().filter(
      (q) => q.userId === user.id && ids.has(q.deckId)
    ),
  });
}

function importBackup(user, body) {
  const b = body || {};
  const backup = b.backup;
  const mode = b.mode;
  const valid =
    backup && backup.app === 'studyapp' && backup.version === 1 &&
    backup.user && typeof backup.user === 'object' &&
    Array.isArray(backup.decks) && Array.isArray(backup.progress) &&
    Array.isArray(backup.quizResults);
  if (!valid) fail(400, 'That file is not a StudyApp backup');
  if (!['merge', 'replace'].includes(mode)) {
    fail(400, "mode must be 'merge' or 'replace'");
  }
  let allDecks = decks();
  let allProgress = progress();
  let allQuiz = quizResults();
  let allMembers = members();
  if (mode === 'replace') {
    const owned = new Set(
      allDecks.filter((d) => d.ownerId === user.id).map((d) => d.id)
    );
    allDecks = allDecks.filter((d) => !owned.has(d.id));
    allProgress = allProgress.filter(
      (p) => !(p.userId === user.id && owned.has(p.deckId))
    );
    allQuiz = allQuiz.filter(
      (q) => !(q.userId === user.id && owned.has(q.deckId))
    );
  }
  const taken = new Set(allDecks.map((d) => d.shareCode));
  let deckCount = 0;
  let progressCount = 0;
  const now = nowIso();
  for (const d of backup.decks) {
    if (!d || !Array.isArray(d.cards)) continue;
    const deckId = uid();
    const cardMap = new Map();
    const cards = d.cards
      .filter((c) => c && (c.front !== undefined || c.back !== undefined))
      .map((c) => {
        const id = uid();
        cardMap.set(c.id, id);
        return {
          id,
          front: String(c.front ?? ''),
          back: String(c.back ?? ''),
          createdAt: c.createdAt || now,
        };
      });
    allDecks.push({
      id: deckId,
      ownerId: user.id,
      name: String(d.name || 'Imported deck'),
      subject: String(d.subject || ''),
      type: d.type === 'language' ? 'language' : 'general',
      sourceLang: String(d.sourceLang || ''),
      targetLang: String(d.targetLang || ''),
      shareCode: newShareCode(taken),
      createdAt: d.createdAt || now,
      cards,
      studyModes: { ...defaultStudyModes(), ...(d.studyModes || {}) },
    });
    taken.add(allDecks[allDecks.length - 1].shareCode);
    allMembers.push({ userId: user.id, deckId, joinedAt: now });
    deckCount++;
    for (const p of (backup.progress || []).filter(
      (p) => p && p.deckId === d.id && cardMap.has(p.cardId)
    )) {
      allProgress.push({
        userId: user.id,
        deckId,
        cardId: cardMap.get(p.cardId),
        repetitions: Number(p.repetitions) || 0,
        easeFactor: Number(p.easeFactor) || 2.5,
        interval: Number(p.interval) || 0,
        nextReviewDate: String(p.nextReviewDate || '').slice(0, 10) || now.slice(0, 10),
        lastRating: ['easy', 'ok', 'hard'].includes(p.lastRating)
          ? p.lastRating
          : null,
        lastReviewedAt: p.lastReviewedAt || null,
      });
      progressCount++;
    }
    for (const q of (backup.quizResults || []).filter(
      (q) => q && q.deckId === d.id
    )) {
      allQuiz.push({ ...q, id: uid(), userId: user.id, deckId });
    }
  }
  const rows = users();
  const u = rows.find((x) => x.id === user.id);
  if (u && backup.user) {
    const norm = normalizeUser(u);
    if (backup.user.studyPrefs) {
      u.studyPrefs = { ...norm.studyPrefs, ...backup.user.studyPrefs };
    }
    if (backup.user.appearance) {
      u.appearance = { ...norm.appearance, ...backup.user.appearance };
    }
    if (backup.user.defaultStudyModes) {
      u.defaultStudyModes = {
        ...norm.defaultStudyModes,
        ...backup.user.defaultStudyModes,
      };
    }
    if (['simple', 'advanced'].includes(backup.user.settingsMode)) {
      u.settingsMode = backup.user.settingsMode;
    }
  }
  save(NS.users, rows);
  save(NS.decks, allDecks);
  save(NS.progress, allProgress);
  save(NS.quizResults, allQuiz);
  save(NS.members, allMembers);
  return ok({
    message: 'Backup imported',
    decks: deckCount,
    progressRows: progressCount,
  });
}

function deleteAccount(user, body) {
  const b = body || {};
  if (!b.currentPassword) fail(400, 'Current password is required');
  return comparePassword(String(b.currentPassword), user.passwordHash).then(
    (good) => {
      if (!good) fail(401, 'Current password is wrong');
      const owned = new Set(
        decks().filter((d) => d.ownerId === user.id).map((d) => d.id)
      );
      save(NS.decks, decks().filter((d) => !owned.has(d.id)));
      save(NS.members, members().filter(
        (x) => x.userId !== user.id && !owned.has(x.deckId)
      ));
      save(NS.progress, progress().filter(
        (p) => p.userId !== user.id && !owned.has(p.deckId)
      ));
      save(NS.quizResults, quizResults().filter((q) => q.userId !== user.id));
      save(NS.users, users().filter((x) => x.id !== user.id));
      // Session intentionally kept (server JWTs are stateless too):
      // the next /users/me answers 404 and the client logs out.
      return ok({ message: 'Account deleted' });
    }
  );
}

// ================= decks =================

function deckSummary(userId, deck, allProgress) {
  let due = 0;
  for (const card of deck.cards || []) {
    const row = allProgress.find(
      (p) => p.userId === userId && p.deckId === deck.id && p.cardId === card.id
    );
    if (!row || isDue(row.nextReviewDate)) due++;
  }
  return {
    id: deck.id,
    ownerId: deck.ownerId,
    name: deck.name,
    subject: deck.subject,
    type: deck.type,
    sourceLang: deck.sourceLang,
    targetLang: deck.targetLang,
    shareCode: deck.shareCode,
    createdAt: deck.createdAt,
    cardCount: (deck.cards || []).length,
    dueCount: due,
    isOwner: deck.ownerId === userId,
    studyModes: { ...defaultStudyModes(), ...(deck.studyModes || {}) },
  };
}

function myDecks(userId) {
  const ids = new Set(
    members().filter((x) => x.userId === userId).map((x) => x.deckId)
  );
  return decks()
    .map(normalizeDeck)
    .filter((d) => d.ownerId === userId || ids.has(d.id));
}

function listDecks(userId) {
  const allProgress = progress();
  return ok(myDecks(userId).map((d) => deckSummary(userId, d, allProgress)));
}

function createDeck(user, body) {
  const b = body || {};
  if (!b.name || !String(b.name).trim()) {
    fail(400, 'Deck name is required');
  }
  const all = decks();
  const deck = {
    id: uid(),
    ownerId: user.id,
    name: String(b.name).trim(),
    subject: String(b.subject || '').trim(),
    type: b.type === 'language' ? 'language' : 'general',
    sourceLang: String(b.sourceLang || ''),
    targetLang: String(b.targetLang || ''),
    shareCode: newShareCode(new Set(all.map((d) => d.shareCode))),
    createdAt: nowIso(),
    cards: [],
    studyModes: { ...user.defaultStudyModes },
  };
  all.push(deck);
  save(NS.decks, all);
  const ms = members();
  ms.push({ userId: user.id, deckId: deck.id, joinedAt: nowIso() });
  save(NS.members, ms);
  return ok(normalizeDeck(deck));
}

function joinDeck(userId, body) {
  const code = body && body.shareCode;
  if (!code) fail(400, 'shareCode is required');
  const deck = decks().find(
    (d) => d.shareCode === String(code).toUpperCase().trim()
  );
  if (!deck) fail(404, 'Deck not found for that code');
  const ms = members();
  const existing = ms.find(
    (x) => x.userId === userId && x.deckId === deck.id
  );
  if (!existing) {
    ms.push({ userId, deckId: deck.id, joinedAt: nowIso() });
    save(NS.members, ms);
    return ok({
      message: 'Joined shared deck',
      deckId: deck.id,
      alreadyMember: false,
    });
  }
  return ok({
    message: 'Already in that deck',
    deckId: deck.id,
    alreadyMember: true,
  });
}

function putDeck(user, id, body) {
  const all = decks();
  const deck = all.find((d) => d.id === id);
  if (!deck) fail(404, 'Deck not found');
  if (deck.ownerId !== user.id) {
    fail(403, 'Only the owner can edit this deck');
  }
  const b = body || {};
  if (b.name !== undefined) deck.name = String(b.name);
  if (b.subject !== undefined) deck.subject = String(b.subject);
  if (b.type !== undefined) {
    deck.type = b.type === 'language' ? 'language' : 'general';
    if (deck.type !== 'language') {
      deck.sourceLang = '';
      deck.targetLang = '';
    }
  }
  if (b.sourceLang !== undefined) deck.sourceLang = String(b.sourceLang);
  if (b.targetLang !== undefined) deck.targetLang = String(b.targetLang);
  save(NS.decks, all);
  return ok(normalizeDeck(deck));
}

function deleteDeck(user, id) {
  let all = decks();
  const deck = all.find((d) => d.id === id);
  if (!deck) fail(404, 'Deck not found');
  if (deck.ownerId !== user.id) {
    fail(403, 'Only the owner can delete this deck');
  }
  all = all.filter((d) => d.id !== deck.id);
  save(NS.decks, all);
  save(NS.members, members().filter((x) => x.deckId !== deck.id));
  save(NS.progress, progress().filter((p) => p.deckId !== deck.id));
  return ok({ message: 'Deck deleted' });
}

function saveStudyModes(user, id, body) {
  const all = decks();
  const deck = all.find((d) => d.id === id);
  if (!deck) fail(404, 'Deck not found');
  if (deck.ownerId !== user.id) {
    fail(403, 'Only the owner can change study modes');
  }
  const modes = { ...defaultStudyModes(), ...(deck.studyModes || {}) };
  for (const key of ['typedRecall', 'pretest', 'elaborativePrompts', 'writtenRecallAI']) {
    if (body && body[key] !== undefined) modes[key] = body[key] === true;
  }
  deck.studyModes = modes;
  save(NS.decks, all);
  return ok({ studyModes: modes });
}

function exportCsv(userId, id) {
  const deck = getDeck(userId, id);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['front,back'];
  for (const c of deck.cards || []) {
    lines.push(`${esc(c.front)},${esc(c.back)}`);
  }
  return ok(lines.join('\n'));
}

function mixedReview(userId, body) {
  const ids = body && body.deckIds;
  if (!Array.isArray(ids) || ids.length < 1) {
    fail(400, 'deckIds must be a non-empty array');
  }
  const all = decks();
  const allProgress = progress();
  const cards = [];
  for (const deckId of ids) {
    const deck = all.find((d) => d.id === deckId);
    if (!deck || !canRead(userId, deck)) continue;
    for (const card of deck.cards || []) {
      const row = allProgress.find(
        (p) => p.userId === userId && p.deckId === deck.id && p.cardId === card.id
      );
      if (!row || isDue(row.nextReviewDate)) {
        cards.push({
          deckId: deck.id,
          deckName: deck.name,
          deckType: deck.type,
          ...card,
          progress: row || { ...defaultProgress(), lastRating: null },
        });
      }
    }
  }
  const mixed = shuffle(cards);
  return ok({ count: mixed.length, cards: mixed.slice(0, 100) });
}

function deckRoute(user, userId, m, seg, body) {
  const id = seg[0];
  if (seg.length === 1) {
    if (m === 'get') {
      const deck = getDeck(userId, id);
      return ok({ ...deck, isOwner: deck.ownerId === userId });
    }
    if (m === 'put') return putDeck(user, id, body);
    if (m === 'delete') return deleteDeck(user, id);
  }
  if (seg.length === 2 && seg[1] === 'study-modes' && m === 'patch') {
    return saveStudyModes(user, id, body);
  }
  if (seg.length === 2 && seg[1] === 'study' && m === 'get') {
    const deck = getDeck(userId, id);
    return ok({ deckId: deck.id, due: dueCards(userId, deck, progress()) });
  }
  if (seg.length === 2 && seg[1] === 'recall-sheet' && m === 'get') {
    return recallSheet(userId, id);
  }
  if (seg.length === 2 && seg[1] === 'reviews' && m === 'get') {
    return deckReviews(userId, id);
  }
  if (seg.length === 2 && seg[1] === 'export' && m === 'get') {
    return exportCsv(userId, id);
  }
  if (seg.length === 2 && seg[1] === 'cards' && m === 'post') {
    return addCards(user, id, body);
  }
  if (seg.length === 2 && seg[1] === 'quiz' && m === 'post') {
    return buildQuiz(user, id, body);
  }
  if (seg.length === 3 && seg[1] === 'cards' && m === 'put') {
    return putCard(user, id, seg[2], body);
  }
  if (seg.length === 3 && seg[1] === 'cards' && m === 'delete') {
    return deleteCard(user, id, seg[2]);
  }
  fail(404, 'Not found');
}

// ================= cards =================

function ownerDeck(user, id, verb) {
  const all = decks();
  const deck = all.find((d) => d.id === id);
  if (!deck) fail(404, 'Deck not found');
  if (deck.ownerId !== user.id) fail(403, `Only the owner can ${verb} cards`);
  return { all, deck };
}

function addCards(user, id, body) {
  const { all, deck } = ownerDeck(user, id, 'add');
  const b = body || {};
  let incoming = [];
  if (Array.isArray(b.cards)) incoming = b.cards;
  else if (b.front !== undefined || b.back !== undefined) {
    incoming = [{ front: b.front, back: b.back }];
  } else {
    fail(400, 'Provide { front, back } or { cards: [...] }');
  }
  const added = [];
  for (const item of incoming) {
    const front = String(item.front ?? '').trim();
    const back = String(item.back ?? '').trim();
    if (!front && !back) continue;
    const card = { id: uid(), front, back, createdAt: nowIso() };
    deck.cards.push(card);
    added.push(card);
  }
  save(NS.decks, all);
  return ok({ added, count: added.length });
}

function putCard(user, id, cardId, body) {
  const { all, deck } = ownerDeck(user, id, 'edit');
  const card = (deck.cards || []).find((c) => c.id === cardId);
  if (!card) fail(404, 'Card not found');
  const b = body || {};
  if (b.front !== undefined) card.front = String(b.front);
  if (b.back !== undefined) card.back = String(b.back);
  save(NS.decks, all);
  return ok(card);
}

function deleteCard(user, id, cardId) {
  const { all, deck } = ownerDeck(user, id, 'delete');
  const before = (deck.cards || []).length;
  deck.cards = (deck.cards || []).filter((c) => c.id !== cardId);
  if (deck.cards.length === before) fail(404, 'Card not found');
  save(NS.decks, all);
  save(NS.progress, progress().filter(
    (p) => !(p.deckId === deck.id && p.cardId === cardId)
  ));
  return ok({ message: 'Card deleted' });
}

// ================= reviews =================

function reviewCardRoute(userId, deckId, cardId, body) {
  const b = body || {};
  if (!['easy', 'ok', 'hard'].includes(b.rating)) {
    fail(400, 'rating must be easy, ok, or hard');
  }
  const deck = getDeck(userId, deckId);
  const card = (deck.cards || []).find((c) => c.id === cardId);
  if (!card) fail(404, 'Card not found');
  const q = ratingToQuality(b.rating);
  const allProgress = progress();
  let row = allProgress.find(
    (p) => p.userId === userId && p.deckId === deck.id && p.cardId === card.id
  );
  const prev = snapshotPrev(row);
  const prevInterval = row ? row.interval || 0 : 0;
  const base = row
    ? { repetitions: row.repetitions, easeFactor: row.easeFactor, interval: row.interval }
    : { repetitions: 0, easeFactor: 2.5, interval: 0 };
  const next = reviewCard(base, q);
  const ts = nowIso();
  if (row) Object.assign(row, next, { lastRating: b.rating, lastReviewedAt: ts, prev });
  else {
    row = {
      userId, deckId: deck.id, cardId: card.id, ...next,
      lastRating: b.rating, lastReviewedAt: ts, prev,
    };
    allProgress.push(row);
  }
  const log = reviews();
  const entry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    cardId: card.id,
    deckId: deck.id,
    userId,
    ts,
    rating: b.rating,
    quality: q,
    mode: typeof b.mode === 'string' ? b.mode : 'flip',
    ms: Number.isFinite(b.ms) ? b.ms : null,
    confidence: [1, 2, 3].includes(b.confidence) ? b.confidence : null,
    prevInterval,
    newInterval: next.interval,
    ef: next.easeFactor,
    undone: false,
  };
  log.push(entry);
  save(NS.progress, allProgress);
  save(NS.reviews, log);
  return ok({ ...row, reviewId: entry.id });
}

function undoRoute(userId, deckId, cardId, body) {
  const b = body || {};
  const log = reviews();
  const entry = log.find(
    (r) => r.id === b.reviewId && r.userId === userId &&
      r.deckId === deckId && r.cardId === cardId && !r.undone
  );
  if (!entry) fail(404, 'Nothing to undo');
  const allProgress = progress();
  const row = allProgress.find(
    (p) => p.userId === userId && p.deckId === deckId && p.cardId === cardId
  );
  if (!row || row.lastReviewedAt !== entry.ts) {
    fail(409, 'A newer rating exists');
  }
  Object.assign(row, restorePrev(row.prev));
  delete row.prev;
  entry.undone = true;
  save(NS.progress, allProgress);
  save(NS.reviews, log);
  return ok(row);
}

function recallSheet(userId, deckId) {
  const deck = getDeck(userId, deckId);
  const allProgress = progress();
  const byCard = new Map();
  for (const p of allProgress) {
    if (p.userId === userId && p.deckId === deck.id) byCard.set(p.cardId, p);
  }
  const log = reviews().filter(
    (r) => r.userId === userId && r.deckId === deck.id && !r.undone
  );
  const withRating = (deck.cards || []).map((c) => ({
    ...c,
    lastRating: byCard.get(c.id)?.lastRating ?? null,
    nextReviewDate: byCard.get(c.id)?.nextReviewDate ?? null,
    stats: aggregateCard(c.id, log),
  }));
  const hard = withRating.filter((c) => c.lastRating === 'hard');
  const rest = withRating.filter((c) => c.lastRating !== 'hard');
  return ok({ deckId: deck.id, hard, rest, all: withRating });
}

function deckReviews(userId, deckId) {
  getDeck(userId, deckId);
  const rows = reviews()
    .filter((r) => r.userId === userId && r.deckId === deckId && !r.undone)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .slice(-500);
  return ok({ deckId, reviews: rows });
}

// ================= stats =================

function statsView(userId) {
  const mine = myDecks(userId);
  const allProgress = progress().filter((p) => p.userId === userId);
  const perDeck = mine.map((d) => {
    const byCard = new Map();
    for (const p of allProgress) {
      if (p.deckId === d.id) byCard.set(p.cardId, p);
    }
    return { deckId: d.id, name: d.name, ...bucketize(d, byCard) };
  });
  const sum = (k) => perDeck.reduce((a, d) => a + d[k], 0);
  const reviewDates = [];
  for (const p of allProgress) {
    if (p.lastReviewedAt) reviewDates.push(p.lastReviewedAt.slice(0, 10));
  }
  const sessions = quizResults().filter((q) => q.userId === userId).length;
  return ok({
    streak: computeStreak(reviewDates),
    total: {
      decks: mine.length,
      cards: sum('total'),
      new: sum('new'),
      learning: sum('learning'),
      due: sum('due'),
      mastered: sum('mastered'),
    },
    perDeck,
    reviewsPerDay: reviewsPerDay(allProgress, 30),
    quizSessions: sessions,
  });
}

// ================= quiz =================

function quizCreds(user) {
  const ai = user.aiSettings || {};
  const provider = ai.provider || 'none';
  if (provider === 'none' || provider === 'ollama') return null;
  const apiKey = getBrowserKey(provider);
  if (!apiKey) return null;
  if (provider === 'custom' && (!ai.baseUrl || !ai.model)) return null;
  return {
    provider,
    apiKey,
    baseUrl: ai.baseUrl || '',
    model: ai.model || '',
  };
}

async function buildAiQuiz(deck, count, creds) {
  const cards = (deck.cards || []).map((c) => ({ front: c.front, back: c.back }));
  const out = await generate(creds, {
    system: 'You write short study quizzes. Reply with JSON only, no other text.',
    messages: [{
      role: 'user',
      content: `Write ${count} quiz questions using ONLY the cards below. Mix multiple-choice and short-answer. For multiple-choice, every wrong option must be the back of another card from this list. Reply as JSON: {"questions": [{"kind": "multiple-choice"|"short-answer", "prompt": "<a card front>", "options": ["..."], "answer": "<the exact back>"}]}. Cards: ${JSON.stringify(cards)}`,
    }],
    json: { keys: ['questions'], required: true },
    cache: false,
  });
  const parsed = out.json;
  if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    throw new Error('AI returned no questions');
  }
  const fronts = new Set(cards.map((c) => c.front));
  const backs = new Set(cards.map((c) => c.back));
  const valid = parsed.questions
    .filter((q) => q && fronts.has(q.prompt) && backs.has(q.answer) && (
      q.kind === 'short-answer' || (q.kind === 'multiple-choice' &&
        Array.isArray(q.options) && q.options.includes(q.answer))
    ))
    .slice(0, count)
    .map((q, i) => ({
      index: i,
      kind: q.kind,
      prompt: String(q.prompt),
      options: q.kind === 'multiple-choice' ? q.options.map(String) : undefined,
      answer: String(q.answer),
    }));
  if (!valid.length) throw new Error('AI questions did not match deck cards');
  return valid;
}

function buildQuiz(user, deckId, body) {
  const deck = getDeck(user.id, deckId);
  if ((deck.cards || []).length < 2) {
    fail(400, 'Add at least 2 cards before quizzing');
  }
  const b = body || {};
  const count = Math.min(Math.max(Number(b.count) || 5, 1), 10);
  const includeShort = b.includeShortAnswer !== false;
  const creds = quizCreds(user);
  return (async () => {
    let questions;
    let aiUsed = false;
    if (creds) {
      try {
        questions = await buildAiQuiz(deck, count, creds);
        aiUsed = true;
      } catch {
        questions = buildLocalQuiz(deck, count, includeShort);
      }
    } else {
      questions = buildLocalQuiz(deck, count, includeShort);
    }
    const quizId = uid();
    pendingQuiz.set(quizId, {
      userId: user.id,
      deckId: deck.id,
      questions,
      createdAt: Date.now(),
    });
    return ok({
      quizId,
      aiUsed,
      aiAvailable: Boolean(creds),
      questions,
    });
  })();
}

async function gradeShort(correct, response, creds) {
  if (normAnswer(correct) === normAnswer(response)) {
    return { correct: true, aiGraded: false };
  }
  if (!creds) return { correct: false, aiGraded: false, selfCheck: true };
  try {
    const out = await generate(creds, {
      system: 'You grade short quiz answers leniently. Reply with JSON only.',
      messages: [{
        role: 'user',
        content: `Correct answer: ${correct}. Learner answered: ${response}. Same meaning with minor wording differences counts as correct. Reply JSON: {"correct": true/false, "note": "one short sentence"}.`,
      }],
      json: { keys: ['correct'], required: true },
      cache: false,
    });
    const v = out.json || {};
    return {
      correct: v.correct === true,
      aiGraded: true,
      note: String(v.note || ''),
    };
  } catch {
    return { correct: false, aiGraded: false, selfCheck: true };
  }
}

async function gradeQuiz(user, deckId, quizId, body) {
  const entry = pendingQuiz.get(quizId);
  if (!entry || entry.userId !== user.id || entry.deckId !== deckId) {
    fail(404, 'Quiz not found or expired');
  }
  if (Date.now() - entry.createdAt > 2 * 60 * 60 * 1000) {
    pendingQuiz.delete(quizId);
    fail(404, 'Quiz expired');
  }
  const answers = (body && body.answers) || [];
  const byIndex = new Map(answers.map((a) => [a.index, a.response]));
  const creds = quizCreds(user);
  const results = [];
  for (const q of entry.questions) {
    const response = byIndex.get(q.index);
    if (q.kind === 'multiple-choice') {
      const picked = typeof response === 'number'
        ? q.options[response]
        : String(response ?? '');
      results.push({
        index: q.index,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        response: picked,
        correctAnswer: q.answer,
        correct: picked === q.answer,
        aiGraded: false,
      });
    } else {
      const g = await gradeShort(q.answer, response, creds);
      results.push({
        index: q.index,
        kind: q.kind,
        prompt: q.prompt,
        response: String(response ?? ''),
        correctAnswer: q.answer,
        ...g,
      });
    }
  }
  const score = results.filter((r) => r.correct).length;
  const log = quizResults();
  log.push({
    id: uid(),
    userId: user.id,
    deckId: entry.deckId,
    timestamp: nowIso(),
    score,
    total: results.length,
    aiUsed: results.some((r) => r.aiGraded),
    questions: results.map((r) => ({
      kind: r.kind,
      prompt: r.prompt,
      correctAnswer: r.correctAnswer,
      response: r.response,
      correct: r.correct,
    })),
  });
  save(NS.quizResults, log);
  pendingQuiz.delete(quizId);
  return ok({ score, total: results.length, results });
}

// ================= ai (grade + feedback via browser key) =================

function strictnessOf(user) {
  const s = user.aiSettings && user.aiSettings.gradingStrictness;
  return ['lenient', 'standard', 'strict'].includes(s) ? s : 'standard';
}

async function aiGrade(user, body) {
  const b = body || {};
  const creds = quizCreds(user);
  if (!creds) fail(400, 'AI is not configured', { needsKey: true });
  const front = String(b.front || '');
  const back = String(b.back || '');
  const answer = String(b.answer || '');
  if (normAnswer(back) === normAnswer(answer) && back && answer) {
    return ok({ tier: 'correct', explanation: 'Matches the card.', aiGraded: false });
  }
  try {
    const out = await generate(creds, {
      system: 'You grade written recall answers.',
      messages: buildWrittenRecallMessages({
        front,
        back,
        answer,
        strictness: strictnessOf(user),
      }),
      cache: false,
    });
    aiLog(user.id, 'grade', creds.provider, (front + back + answer).length);
    return ok({ ...parseTier(out.text), aiGraded: true });
  } catch (err) {
    fail(502, err.aiCode || err.message || 'Grading failed');
  }
}

async function aiFeedback(user, body) {
  const b = body || {};
  const creds = quizCreds(user);
  if (!creds) fail(400, 'AI is not configured', { needsKey: true });
  if (!String(b.text || '').trim()) fail(400, 'No explanation text to review');
  try {
    const out = await generate(creds, {
      system: 'You give short feedback on study explanations.',
      messages: buildFeedbackMessages({
        cardFront: String(b.cardFront || ''),
        cardBack: String(b.cardBack || ''),
        kind: 'explain',
        text: String(b.text || ''),
      }),
      cache: false,
    });
    aiLog(user.id, 'explain-feedback', creds.provider, String(b.text).length);
    return ok({ feedback: out.text });
  } catch (err) {
    fail(502, err.aiCode || err.message || 'Feedback failed');
  }
}

// ================= examples =================

const EXAMPLE_MAP = [
  { match: 'lt-a1-phrases', skip: 'LT' },
  { match: 'lt-history-geo', skip: 'Lietuva' },
  { match: 'math-algebra-geo', skip: 'math' },
  { match: 'study-techniques', skip: 'study science' },
];

function seedExamples(userId) {
  const all = decks();
  const mine = all.filter((d) => d.ownerId === userId);
  const taken = new Set(all.map((d) => d.shareCode));
  const created = [];
  for (const ex of EXAMPLE_MAP) {
    const tpl = (STARTER || []).find((d) => d.id === ex.match);
    if (!tpl) continue;
    const skip = mine.some((d) =>
      String(d.name || '').toLowerCase().includes(ex.skip.toLowerCase())
    );
    if (skip) continue;
    const deck = {
      id: uid(),
      ownerId: userId,
      name: tpl.name,
      subject: tpl.subject || '',
      type: tpl.type === 'language' ? 'language' : 'general',
      sourceLang: tpl.sourceLang || '',
      targetLang: tpl.targetLang || '',
      shareCode: newShareCode(taken),
      createdAt: nowIso(),
      cards: (tpl.cards || []).map((c) => ({
        id: uid(),
        front: c.front,
        back: c.back,
        createdAt: nowIso(),
      })),
      studyModes: { ...defaultStudyModes() },
    };
    taken.add(deck.shareCode);
    all.push(deck);
    const ms = members();
    ms.push({ userId, deckId: deck.id, joinedAt: nowIso() });
    save(NS.members, ms);
    created.push({ id: deck.id, name: deck.name, cards: deck.cards.length });
  }
  save(NS.decks, all);
  return ok({ created: created.length, decks: created });
}
