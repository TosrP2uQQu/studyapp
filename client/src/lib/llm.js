// llm.js — one browser-side LLM client for every provider.
// generate({system, messages, json, stream, signal, images, ...})
//   -> { text, json, usage, provider, model }.
// Gemini is the default. Keys come from the caller (browser store);
// they are never logged, cached, or sent anywhere but the provider.
import { chatOllama, ollamaRoot } from './aiClient.js';
import { getAdapter } from './storage.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const TIMEOUT_MS = 25000;
export const MIN_SPACING_MS = 800;
export const MAX_RETRIES = 2;
export const MAX_INPUT_CHARS = 8000;
export const MAX_SYSTEM_CHARS = 2000;

export const CAPS = {
  gemini: { json: true, stream: true, vision: true },
  openai: { json: true, stream: true, vision: true },
  groq: { json: true, stream: true, vision: false },
  mistral: { json: true, stream: true, vision: false },
  custom: { json: true, stream: true, vision: false },
  anthropic: { json: false, stream: true, vision: true },
  ollama: { json: false, stream: false, vision: false },
};

const OPENAI_BASES = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
};

let geminiThinkingBroken = false;

// ---- small pure helpers (unit-tested) ----

export function hashPrompt(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

export function capText(s, max) {
  const str = String(s == null ? '' : s);
  return str.length > max ? str.slice(0, max) : str;
}

// Strip code fences and prose around the first JSON value.
export function extractJson(text) {
  const raw = String(text || '').trim();
  const tryParse = (s) => {
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch {
      return { ok: false };
    }
  };
  const direct = tryParse(raw);
  if (direct.ok) return direct;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    const p = tryParse(fenced[1].trim());
    if (p.ok) return p;
  }
  const start = raw.search(/[{[]/);
  const endObj = raw.lastIndexOf('}');
  const endArr = raw.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start >= 0 && end > start) {
    // Fix trailing commas, the most common model slip.
    const slice = raw
      .slice(start, end + 1)
      .replace(/,\s*([}\]])/g, '$1');
    const p = tryParse(slice);
    if (p.ok) return p;
  }
  return { ok: false };
}

// Hand-rolled schema check: required top-level keys present.
export function hasKeys(value, keys) {
  if (!value || typeof value !== 'object') return false;
  return (keys || []).every((k) =>
    Object.prototype.hasOwnProperty.call(value, k)
  );
}

// Error taxonomy. Every failure maps to an actionable code.
export function classifyError(err) {
  const e = err || {};
  if (e.name === 'AbortError' || e.code === 'aborted') {
    return { code: 'cancelled', action: 'retry' };
  }
  if (e.code === 'timeout') {
    return { code: 'timeout', action: 'retry' };
  }
  const status = e.status || 0;
  if (status === 401 || status === 403) {
    return { code: 'bad-key', action: 'settings' };
  }
  if (status === 429) {
    return { code: 'rate-limited', action: 'wait' };
  }
  if (status >= 500 && status <= 599) {
    return { code: 'provider-error', action: 'retry' };
  }
  if (status === 400) {
    return { code: 'bad-response', action: 'retry' };
  }
  if (e.network || status === 0) {
    const msg = String(e.message || '');
    if (/cors|blocked|opaque/i.test(msg)) {
      return { code: 'blocked-cors', action: 'settings' };
    }
    return { code: 'offline', action: 'offline' };
  }
  return { code: 'bad-response', action: 'retry' };
}

export function retryAfterMs(res, attempt) {
  try {
    const v = res && res.headers && res.headers.get('retry-after');
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) return Math.min(n, 60) * 1000;
  } catch {
    /* header unreadable */
  }
  return (attempt + 1) * 1000;
}

// ---- status + error log (browser store, never keys) ----

function cacheStore() {
  try {
    return getAdapter();
  } catch {
    return null;
  }
}

export function getStatus() {
  try {
    const v = cacheStore() && cacheStore().get('ai.status');
    return (v && v.state) || 'off';
  } catch {
    return 'off';
  }
}

export function setStatus(state) {
  try {
    const ad = cacheStore();
    if (ad) ad.set('ai.status', { state, at: Date.now() });
  } catch {
    /* best effort */
  }
}

export function recordError(entry) {
  try {
    const ad = cacheStore();
    if (!ad) return;
    const rows = ad.get('ai.errors') || [];
    const safe = {
      at: new Date().toISOString(),
      provider: entry.provider || '?',
      code: entry.code || '?',
      message: String(entry.message || '').slice(0, 200),
    };
    rows.push(safe);
    ad.set('ai.errors', rows.slice(-5));
    if (entry.code === 'rate-limited') setStatus('rate-limited');
    else if (entry.code === 'offline') setStatus('offline');
  } catch {
    /* best effort */
  }
}

export function lastErrors() {
  try {
    const ad = cacheStore();
    const rows = (ad && ad.get('ai.errors')) || [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// Prompt-hash response cache (IndexedDB-ready via adapter).
export function cacheKey(cfg, system, messages, json) {
  const keys = json && json.keys ? json.keys.join(',') : '';
  return hashPrompt(
    [cfg.provider, cfg.model || '', system, JSON.stringify(messages), keys]
      .join('|')
  );
}

export function cacheGet(key) {
  try {
    const ad = cacheStore();
    const map = (ad && ad.get('llm.cache')) || {};
    return map[key] || null;
  } catch {
    return null;
  }
}

export function cacheSet(key, value) {
  try {
    const ad = cacheStore();
    if (!ad) return;
    const map = ad.get('llm.cache') || {};
    map[key] = value;
    const keys = Object.keys(map);
    if (keys.length > 100) {
      for (const k of keys.slice(0, keys.length - 100)) delete map[k];
    }
    ad.set('llm.cache', map);
  } catch {
    /* best effort */
  }
}

// ---- queue: concurrency 1, >=800ms spacing ----

let tail = Promise.resolve();
let lastAt = 0;

export function enqueue(fn) {
  const run = tail.then(async () => {
    const wait = MIN_SPACING_MS - (Date.now() - lastAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  });
  tail = run.catch(() => {});
  return run;
}

export function resetQueue() {
  tail = Promise.resolve();
  lastAt = 0;
}

// ---- fetch with timeout, merging the caller's signal ----

async function fetchTimed(url, opts, ms, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, ms || TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } catch (err) {
    if (ctrl.signal.aborted && !(signal && signal.aborted)) {
      const t = new Error('timed out');
      t.code = 'timeout';
      throw t;
    }
    if (err && err.name === 'AbortError' && signal && signal.aborted) {
      throw err;
    }
    const n = new Error(String((err && err.message) || err));
    n.network = true;
    throw n;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function httpError(status, text) {
  const e = new Error(`HTTP ${status}: ${String(text).slice(0, 160)}`);
  e.status = status;
  return e;
}

// ---- provider calls ----

function geminiParts(messages, images) {
  const parts = [];
  for (const m of messages || []) {
    parts.push({ text: capText(m.content, MAX_INPUT_CHARS) });
  }
  for (const img of images || []) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType || 'image/jpeg',
        data: img.base64,
      },
    });
  }
  return parts;
}

async function callGemini(cfg, req, attemptOpts) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com')
    .replace(/\/+$/, '');
  const model = cfg.model || DEFAULT_GEMINI_MODEL;
  const sys = capText(req.system || '', MAX_SYSTEM_CHARS);
  const body = {
    system_instruction: sys ? { parts: [{ text: sys }] } : undefined,
    contents: [{ role: 'user', parts: geminiParts(req.messages, req.images) }],
    generationConfig: {},
  };
  if (req.json) {
    body.generationConfig.responseMimeType = 'application/json';
    if (req.json.schema) {
      body.generationConfig.responseSchema = req.json.schema;
    }
  }
  if (!geminiThinkingBroken && req.json) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const url = `${base}/v1beta/models/${model}:generateContent`;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': cfg.apiKey,
  };
  let res;
  try {
    res = await fetchTimed(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, TIMEOUT_MS, req.signal);
  } catch (err) {
    if (err.network) {
      // Retry once with ?key= (some hosts strip custom headers).
      const url2 = `${url}?key=${encodeURIComponent(cfg.apiKey)}`;
      const h2 = { 'Content-Type': 'application/json' };
      res = await fetchTimed(url2, {
        method: 'POST',
        headers: h2,
        body: JSON.stringify(body),
      }, TIMEOUT_MS, req.signal);
    } else {
      throw err;
    }
  }
  if (!res.ok) {
    const { text } = await readJsonSafe(res);
    if (
      res.status === 400 &&
      !geminiThinkingBroken &&
      /thinking/i.test(text)
    ) {
      geminiThinkingBroken = true;
      return callGemini(cfg, req, attemptOpts);
    }
    throw httpError(res.status, text);
  }
  const { json } = await readJsonSafe(res);
  const parts = (json && json.candidates && json.candidates[0] &&
    json.candidates[0].content && json.candidates[0].content.parts) || [];
  const text = parts.map((p) => p.text || '').join('');
  const usage = (json && json.usageMetadata) || null;
  return { text, usage };
}

export async function discoverGeminiModels(cfg) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com')
    .replace(/\/+$/, '');
  const res = await fetchTimed(`${base}/v1beta/models`, {
    method: 'GET',
    headers: { 'x-goog-api-key': cfg.apiKey },
  }, TIMEOUT_MS, null);
  if (!res.ok) {
    const { text } = await readJsonSafe(res);
    throw httpError(res.status, text);
  }
  const { json } = await readJsonSafe(res);
  const models = ((json && json.models) || [])
    .filter((m) =>
      (m.supportedGenerationMethods || []).includes('generateContent')
    )
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
  return models;
}

async function streamGemini(cfg, req, onToken) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com')
    .replace(/\/+$/, '');
  const model = cfg.model || DEFAULT_GEMINI_MODEL;
  const url = `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  let res;
  try {
    res = await fetchTimed(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cfg.apiKey,
      },
      body: JSON.stringify({
        system_instruction: req.system
          ? { parts: [{ text: capText(req.system, MAX_SYSTEM_CHARS) }] }
          : undefined,
        contents: [{
          role: 'user',
          parts: geminiParts(req.messages, req.images),
        }],
      }),
    }, TIMEOUT_MS, req.signal);
  } catch (err) {
    // Fall back to non-streaming on any stream failure.
    return callGemini(cfg, req, {});
  }
  if (!res.ok || !res.body) {
    return callGemini(cfg, req, {});
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        const parts = (evt.candidates && evt.candidates[0] &&
          evt.candidates[0].content &&
          evt.candidates[0].content.parts) || [];
        const chunk = parts.map((p) => p.text || '').join('');
        if (chunk) {
          full += chunk;
          if (onToken) onToken(chunk);
        }
      } catch {
        /* partial SSE frame: wait for more */
      }
    }
  }
  return { text: full, usage: null };
}

function openaiBase(provider, custom) {
  if (provider === 'custom') return String(custom || '').replace(/\/+$/, '');
  return OPENAI_BASES[provider] || OPENAI_BASES.openai;
}

async function callOpenAICompatible(cfg, req) {
  const base = openaiBase(cfg.provider, cfg.baseUrl);
  if (!base) throw httpError(400, 'custom base URL required');
  const sysMsgs = req.system
    ? [{ role: 'system', content: capText(req.system, MAX_SYSTEM_CHARS) }]
    : [];
  const msgs = (req.messages || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: capText(m.content, MAX_INPUT_CHARS),
  }));
  const body = {
    model: cfg.model,
    messages: [...sysMsgs, ...msgs],
  };
  if (req.json) body.response_format = { type: 'json_object' };
  const res = await fetchTimed(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  }, TIMEOUT_MS, req.signal);
  if (!res.ok) {
    const { text } = await readJsonSafe(res);
    throw httpError(res.status, text);
  }
  const { json } = await readJsonSafe(res);
  const choice = json && json.choices && json.choices[0];
  const text = (choice && choice.message && choice.message.content) || '';
  return { text, usage: (json && json.usage) || null };
}

async function callAnthropic(cfg, req) {
  const sys = capText(req.system || '', MAX_SYSTEM_CHARS);
  const msgs = (req.messages || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: capText(m.content, MAX_INPUT_CHARS),
  }));
  const res = await fetchTimed('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      system: sys || undefined,
      messages: msgs,
    }),
  }, TIMEOUT_MS, req.signal);
  if (!res.ok) {
    const { text } = await readJsonSafe(res);
    throw httpError(res.status, text);
  }
  const { json } = await readJsonSafe(res);
  const blocks = (json && json.content) || [];
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('');
  return { text, usage: (json && json.usage) || null };
}

async function callOllama(cfg, req) {
  const msgs = [];
  if (req.system) msgs.push({ role: 'system', content: req.system });
  for (const m of req.messages || []) {
    msgs.push({ role: m.role || 'user', content: m.content });
  }
  const { text } = await chatOllama({
    baseUrl: ollamaRoot(cfg.baseUrl),
    model: cfg.model,
    messages: msgs,
  });
  return { text, usage: null };
}

// ---- aiContext: every call carries UI lang + country hint ----

const LANG_NAMES = { en: 'English', ru: 'Russian', lt: 'Lithuanian' };

export function aiContext(opts) {
  const o = opts || {};
  const lang = o.lang || 'en';
  const name = LANG_NAMES[lang] || 'English';
  if (o.tellLanguage === false) return { lang, note: '' };
  const note = `The user's interface language is ${name}. ` +
    `Reply in ${name} unless the user asks otherwise.`;
  return { lang, note };
}

// ---- generate: the single entry point ----

function needsKey(provider) {
  return provider !== 'ollama';
}

export async function generate(cfg, req) {
  const provider = (cfg && cfg.provider) || 'gemini';
  if (needsKey(provider) && !cfg.apiKey) {
    const e = new Error('no API key set');
    e.status = 401;
    throw e;
  }
  const system = req.system || '';
  const messages = req.messages || [];
  const useCache = !req.stream && !req.images && req.cache !== false;
  const key = useCache
    ? cacheKey(cfg, system, messages, req.json)
    : null;
  if (useCache) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, provider, model: cfg.model || '' };
  }
  return enqueue(async () => {
    let attempt = 0;
    let lastErr = null;
    const tries = MAX_RETRIES + 1;
    while (attempt < tries) {
      try {
        let out;
        if (provider === 'gemini') {
          if (req.stream && CAPS.gemini.stream) {
            out = await streamGemini(cfg, req, req.onToken);
          } else {
            out = await callGemini(cfg, req, {});
          }
        } else if (provider === 'anthropic') {
          out = await callAnthropic(cfg, req);
        } else if (provider === 'ollama') {
          out = await callOllama(cfg, req);
        } else {
          out = await callOpenAICompatible(cfg, req);
        }
        const text = out.text || '';
        let parsed = null;
        if (req.json) {
          const keys = req.json.keys || [];
          let r = extractJson(text);
          if ((!r.ok || !hasKeys(r.value, keys)) && !req.json.retried) {
            // One repair retry: ask for JSON only.
            const fixed = await generateInner(cfg, {
              ...req,
              messages: [
                ...messages,
                { role: 'assistant', content: text },
                {
                  role: 'user',
                  content: 'Return valid JSON only, no prose.',
                },
              ],
              json: { ...req.json, retried: true },
              stream: false,
              cache: false,
            });
            r = extractJson(fixed.text);
            if (r.ok && hasKeys(r.value, keys)) {
              parsed = r.value;
            }
          } else if (r.ok && hasKeys(r.value, keys)) {
            parsed = r.value;
          }
          if (req.json.required && !parsed) {
            const e = new Error('model did not return valid JSON');
            e.status = 400;
            throw e;
          }
        }
        const result = {
          text,
          json: parsed,
          usage: out.usage || null,
          provider,
          model: cfg.model || DEFAULT_GEMINI_MODEL,
        };
        if (useCache) cacheSet(key, result);
        setStatus('ready');
        return result;
      } catch (err) {
        lastErr = err;
        const info = classifyError(err);
        if (info.code === 'cancelled') throw err;
        const retryable = info.code === 'rate-limited' ||
          info.code === 'provider-error' ||
          info.code === 'timeout';
        if (!retryable || attempt >= MAX_RETRIES) {
          recordError({
            provider,
            code: info.code,
            message: err.message,
          });
          err.aiCode = info.code;
          err.aiAction = info.action;
          throw err;
        }
        const wait = info.code === 'rate-limited'
          ? retryAfterMs(err.response, attempt)
          : (attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
      }
    }
    throw lastErr;
  });
}

// Inner single-attempt call used by the JSON repair retry
// (bypasses the outer queue: we already hold our turn).
async function generateInner(cfg, req) {
  const provider = cfg.provider || 'gemini';
  if (provider === 'gemini') return callGemini(cfg, req, {});
  if (provider === 'anthropic') return callAnthropic(cfg, req);
  if (provider === 'ollama') return callOllama(cfg, req);
  return callOpenAICompatible(cfg, req);
}

// Convenience: test a key with one tiny call, measuring latency.
export async function testKey(cfg) {
  const started = Date.now();
  const out = await generate(cfg, {
    system: 'Reply with {} only.',
    messages: [{ role: 'user', content: 'ping' }],
    json: { keys: [], required: false },
    cache: false,
  });
  return { ok: true, ms: Date.now() - started, text: out.text };
}

// Copy-safe debug info: providers and models, never keys.
export function debugInfo(cfg) {
  return {
    provider: (cfg && cfg.provider) || 'gemini',
    model: (cfg && cfg.model) || DEFAULT_GEMINI_MODEL,
    baseUrl: cfg && cfg.provider === 'custom' ? cfg.baseUrl : '(default)',
    keySet: Boolean(cfg && cfg.apiKey),
    errors: lastErrors(),
    status: getStatus(),
  };
}
