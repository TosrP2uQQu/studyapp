// localStore.js — browser-side tables for offline mode.
// Same shapes as the server JSON files; keys are per-user rows.
// Nothing secret lives here: password hashes are PBKDF2 digests,
// AI keys live in keys.js (session/local), never in these tables.
import { getAdapter } from './storage';

const NS = {
  users: 'local.users',
  session: 'local.session',
  decks: 'local.decks',
  members: 'local.members',
  progress: 'local.progress',
  reviews: 'local.reviews',
  quizResults: 'local.quizResults',
  aiLog: 'local.aiLog',
};

export function uid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function load(ns, adapter) {
  try {
    const v = (adapter || getAdapter()).get(ns);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function save(ns, rows, adapter) {
  (adapter || getAdapter()).set(ns, rows);
}

export function loadObj(ns, adapter) {
  try {
    const v = (adapter || getAdapter()).get(ns);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function saveObj(ns, obj, adapter) {
  (adapter || getAdapter()).set(ns, obj);
}

// ---- defaults mirroring server/db.js ----

export function defaultStudyPrefs() {
  return {
    daysPerWeek: 4,
    minutesPerSession: 15,
    sessionCardCap: null,
    reminderBannerEnabled: true,
  };
}

export function defaultAppearance() {
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

export function defaultStudyModes() {
  return {
    typedRecall: false,
    pretest: false,
    elaborativePrompts: false,
    writtenRecallAI: false,
  };
}

export function defaultAiSettings() {
  return {
    provider: 'none',
    baseUrl: '',
    model: '',
    gradingTiming: 'immediate',
    gradingStrictness: 'standard',
  };
}

export function normalizeUser(u) {
  const x = u || {};
  return {
    ...x,
    studyPrefs: { ...defaultStudyPrefs(), ...(x.studyPrefs || {}) },
    appearance: { ...defaultAppearance(), ...(x.appearance || {}) },
    defaultStudyModes: {
      ...defaultStudyModes(),
      ...(x.defaultStudyModes || {}),
    },
    aiSettings: { ...defaultAiSettings(), ...(x.aiSettings || {}) },
    settingsMode: x.settingsMode === 'advanced' ? 'advanced' : 'simple',
    onboarded: x.onboarded === true,
  };
}

export function normalizeDeck(d) {
  const x = d || {};
  return {
    ...x,
    cards: Array.isArray(x.cards) ? x.cards : [],
    studyModes: { ...defaultStudyModes(), ...(x.studyModes || {}) },
  };
}

// ---- validation enums mirroring the server ----

export const APPEARANCE_ENUMS = {
  theme: ['light', 'dark', 'system', 'contrast', 'sepia', 'amoled'],
  fontSizeStep: ['small', 'medium', 'large', 'xlarge'],
  headingFont: [
    'source-serif-4', 'lora', 'spectral', 'merriweather',
    'playfair-display', 'crimson-pro', 'libre-baskerville', 'fraunces',
  ],
  bodyFont: [
    'ibm-plex-sans', 'inter', 'work-sans', 'manrope',
    'source-sans-3', 'karla', 'public-sans', 'space-grotesk',
  ],
  accentColor: ['ink', 'plum', 'teal'],
  density: ['compact', 'comfortable', 'spacious'],
  flipStyle: ['flip', 'fade', 'slide'],
  reduceMotion: ['system', 'always', 'never'],
  uiLang: ['en', 'ru', 'lt'],
  lineHeight: ['normal', 'relaxed', 'loose'],
  letterSpacing: ['normal', 'wide', 'wider'],
};

export const PROVIDERS = [
  'none', 'anthropic', 'openai', 'gemini', 'mistral',
  'groq', 'ollama', 'custom',
];

const SHARE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newShareCode(taken) {
  const set = taken || new Set();
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += SHARE[Math.floor(Math.random() * SHARE.length)];
    }
    if (!set.has(code)) return code;
  }
}

export function publicAiSettings(ai, keyLast4) {
  const a = ai || {};
  const cloud = [
    'anthropic', 'openai', 'gemini', 'mistral', 'groq', 'custom',
  ];
  return {
    provider: a.provider || 'none',
    model: a.model || '',
    baseUrl: a.baseUrl || '',
    keyLast4: keyLast4 || '',
    gradingTiming: a.gradingTiming === 'end' ? 'end' : 'immediate',
    gradingStrictness: ['lenient', 'standard', 'strict'].includes(
      a.gradingStrictness
    )
      ? a.gradingStrictness
      : 'standard',
    configured: cloud.includes(a.provider)
      ? Boolean(keyLast4)
      : a.provider === 'ollama'
        ? Boolean(a.baseUrl)
        : false,
  };
}

export { NS };
