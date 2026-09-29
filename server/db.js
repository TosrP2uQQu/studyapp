// db.js — single data-access module for Phase 1 JSON file storage.
// All reads/writes go through here so swapping to a real DB later
// only means rewriting this one module.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  decks: path.join(DATA_DIR, 'decks.json'),
  memberships: path.join(DATA_DIR, 'memberships.json'),
  progress: path.join(DATA_DIR, 'progress.json'),
  quizResults: path.join(DATA_DIR, 'quizResults.json'),
  reviews: path.join(DATA_DIR, 'reviews.json'),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const file of Object.values(FILES)) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '[]', 'utf8');
    }
  }
}

function readJson(file) {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeJsonAtomic(file, data) {
  ensureDataDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readUsers() { return readJson(FILES.users); }
function writeUsers(arr) { writeJsonAtomic(FILES.users, arr); }

function readDecks() { return readJson(FILES.decks); }
function writeDecks(arr) { writeJsonAtomic(FILES.decks, arr); }

function readMemberships() { return readJson(FILES.memberships); }
function writeMemberships(arr) { writeJsonAtomic(FILES.memberships, arr); }

function readProgress() { return readJson(FILES.progress); }
function writeProgress(arr) { writeJsonAtomic(FILES.progress, arr); }

function readQuizResults() { return readJson(FILES.quizResults); }
function writeQuizResults(arr) { writeJsonAtomic(FILES.quizResults, arr); }

// Append-only review log (Phase 6 T1). One row per rating from every
// mode; scheduling still reads progress.json only.
function readReviews() { return readJson(FILES.reviews); }
function writeReviews(arr) { writeJsonAtomic(FILES.reviews, arr); }

// ---- Phase 2 additions (safe defaults over Phase-1 records) ----
function defaultStudyPrefs() {
  // NOTE (Phase 3 call): the spec sketch shows days/minutes as null, but
  // Phase-2 onboarding and prefs validation treat them as required numbers
  // defaulting to 4/15. Those defaults stay so existing flows don't break;
  // only the genuinely new fields default to empty.
  return { daysPerWeek: 4, minutesPerSession: 15, sessionCardCap: null, reminderBannerEnabled: true };
}

function defaultAppearance() {
  return {
    theme: 'system',
    fontSizeStep: 'medium',
    headingFont: 'source-serif-4',
    bodyFont: 'ibm-plex-sans',
    accentColor: 'ink',
    density: 'comfortable',
    flipStyle: 'flip',
    reduceMotion: 'system',
    uiLang: 'en',
    lineHeight: 'normal',
    letterSpacing: 'normal',
  };
}

function defaultAiSettings() {
  return {
    provider: 'none',
    apiKeyEnc: '',
    apiKeyLast4: '',
    baseUrl: '',
    model: '',
    gradingTiming: 'immediate',
    gradingStrictness: 'standard',
  };
}

function defaultStudyModes() {
  return { typedRecall: false, pretest: false, elaborativePrompts: false, writtenRecallAI: false };
}

function normalizeUser(u) {
  return {
    ...u,
    studyPrefs: { ...defaultStudyPrefs(), ...(u.studyPrefs || {}) },
    onboarded: u.onboarded === true,
    aiSettings: { ...defaultAiSettings(), ...(u.aiSettings || {}) },
    settingsMode: u.settingsMode === 'advanced' ? 'advanced' : 'simple',
    appearance: { ...defaultAppearance(), ...(u.appearance || {}) },
    defaultStudyModes: { ...defaultStudyModes(), ...(u.defaultStudyModes || {}) },
  };
}

function normalizeDeck(d) {
  return {
    ...d,
    studyModes: { ...defaultStudyModes(), ...(d.studyModes || {}) },
  };
}

module.exports = {
  ensureDataDir,
  readUsers,
  writeUsers,
  readDecks,
  writeDecks,
  readMemberships,
  writeMemberships,
  readProgress,
  writeProgress,
  readQuizResults,
  writeQuizResults,
  readReviews,
  writeReviews,
  defaultStudyPrefs,
  defaultAppearance,
  defaultAiSettings,
  defaultStudyModes,
  normalizeUser,
  normalizeDeck,
};
