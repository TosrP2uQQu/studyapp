// storage.js — StorageAdapter interface + LocalAdapter.
// The adapter interface stays stable so a Dexie/IndexedDB backend
// can replace LocalAdapter without touching callers.
export const STORAGE_VERSION = 'studyapp.v1';

function key(ns) {
  return `${STORAGE_VERSION}.${ns}`;
}

function quotaError(err) {
  if (!err) return false;
  if (err.name === 'QuotaExceededError') return true;
  if (err.code === 22 || err.code === 1014) return true;
  return false;
}

// Adapter contract: get(ns) -> value|null, set(ns, value),
// remove(ns), keys() -> string[]. All sync; async backends
// wrap with Promise.resolve at the call site.
export class MemoryAdapter {
  constructor() {
    this.map = new Map();
  }
  get(ns) {
    return this.map.has(ns) ? this.map.get(ns) : null;
  }
  set(ns) {
    this.map.set(ns, arguments[1]);
  }
  remove(ns) {
    this.map.delete(ns);
  }
  keys() {
    return [...this.map.keys()];
  }
}

export class LocalAdapter extends MemoryAdapter {
  constructor(opts) {
    super();
    this.prefix = key('');
    this.onQuota = (opts && opts.onQuota) || null;
    this.available = LocalAdapter.probe();
  }
  static probe() {
    try {
      const k = '__studyapp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }
  get(ns) {
    if (!this.available) return super.get(ns);
    try {
      const raw = localStorage.getItem(key(ns));
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return super.get(ns);
    }
  }
  set(ns, value) {
    if (!this.available) {
      super.set(ns, value);
      return { ok: true, memory: true };
    }
    try {
      localStorage.setItem(key(ns), JSON.stringify(value));
      return { ok: true, memory: false };
    } catch (err) {
      if (quotaError(err) && this.onQuota) {
        try {
          this.onQuota(ns);
        } catch {
          /* banner already shown */
        }
      }
      super.set(ns, value);
      return { ok: false, memory: true, quota: quotaError(err) };
    }
  }
  remove(ns) {
    if (this.available) {
      try {
        localStorage.removeItem(key(ns));
      } catch {
        /* fall through to memory */
      }
    }
    super.remove(ns);
  }
}

let singleton = null;

// getAdapter(): LocalAdapter normally, MemoryAdapter when
// storage is unavailable (private mode) — caller shows a banner.
export function getAdapter(opts) {
  if (!singleton) singleton = new LocalAdapter(opts);
  return singleton;
}

// Ask the browser to keep site data (best effort, no throw).
export function requestPersistence() {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && nav.storage && nav.storage.persist) {
      return nav.storage.persist().catch(() => false);
    }
  } catch {
    /* unsupported browser */
  }
  return Promise.resolve(false);
}

// Session cursor: survive refresh within a tab session only.
// Falls back to a module-level map when sessionStorage is missing
// (private mode, SSR, unit tests) — then it lasts for the page view.
const cursorMemory = new Map();

function sessionStore() {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    /* blocked */
  }
  return null;
}

export function saveCursor(deckId, index) {
  const store = sessionStore();
  if (store) {
    try {
      store.setItem(key('cursor.' + deckId), String(index));
      return;
    } catch {
      /* fall through to memory */
    }
  }
  cursorMemory.set(deckId, index);
}

export function loadCursor(deckId) {
  const store = sessionStore();
  if (store) {
    try {
      const v = store.getItem(key('cursor.' + deckId));
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch {
      /* fall through to memory */
    }
  }
  const m = cursorMemory.get(deckId);
  return Number.isFinite(m) && m >= 0 ? m : 0;
}

export function clearCursor(deckId) {
  cursorMemory.delete(deckId);
  const store = sessionStore();
  if (!store) return;
  try {
    store.removeItem(key('cursor.' + deckId));
  } catch {
    /* ignore */
  }
}

// All resume cursors (deckId -> index), for the Today page.
export function listCursors() {
  const out = [];
  for (const [k, v] of cursorMemory.entries()) {
    if (v > 0) out.push({ deckId: k, index: v });
  }
  const store = sessionStore();
  if (!store) return out;
  try {
    const prefix = key('cursor.');
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(prefix)) {
        const deckId = k.slice(prefix.length);
        const n = parseInt(store.getItem(k), 10);
        if (Number.isFinite(n) && n > 0) {
          if (!out.some((e) => e.deckId === deckId)) {
            out.push({ deckId, index: n });
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
