// ai.js — the ONE server-side module where outbound AI calls happen.
// Every server-side AI-touching feature (quiz drafting/grading, Explain/Why
// feedback, key testing, written-recall grading) routes through callAI(),
// so it is easy to audit exactly what leaves the app. Core features never
// touch this module.
//
// Local (Ollama) is deliberately NOT here: it runs client-side, straight
// from the person's browser to their own base URL (see client/src/lib/
// aiClient.js). A shared server must never proxy localhost on behalf of
// visitors — localhost on the server is the server's own machine.
//
// Each call appends one line to data/ai-calls.log: timestamp, user,
// feature, provider, and byte-count of what was sent — never content.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'data', 'ai-calls.log');

function logCall(feature, provider, bytesSent, userId) {
  const line = `${new Date().toISOString()} user=${userId || 'unknown'} feature=${feature} provider=${provider} bytes_sent=${bytesSent}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {
    // Logging must never break the feature itself.
  }
}

// API keys are stored encrypted (AES-256-GCM) with a server-side key
// derived from JWT_SECRET. The plaintext key is never logged and never
// sent to any client.
function serverKey() {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  return crypto.createHash('sha256').update('studyapp-ai:' + secret).digest();
}

function encryptKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', serverKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptKey(stored) {
  const buf = Buffer.from(String(stored), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', serverKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const DEFAULT_MODELS = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.8-flash',
  mistral: 'mistral-small-latest',
  groq: 'llama-3.1-8b-instant',
  // ollama and custom have no server-side default: ollama is client-side,
  // custom requires the person's own model name.
};

// Fixed server-side base URLs. Only `custom` takes a user-supplied URL;
// only `ollama` is client-side (see header note).
const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
};

async function fetchJson(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('Anthropic API key is not set');
  const system = (messages || []).filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = (messages || [])
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: String(m.content) }));
  const r = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: rest.length ? rest : [{ role: 'user', content: 'Reply with the word ok.' }],
    }),
  });
  if (!r.ok) throw new Error('Anthropic error ' + r.status + ': ' + String(r.text).slice(0, 200));
  const block = r.json && r.json.content && r.json.content.find((b) => b.type === 'text');
  return { text: (block && block.text) || '' };
}

// Shared by OpenAI, Mistral, Groq, and Custom: all speak the OpenAI
// chat-completions shape closely enough for one adapter, differing only
// in base URL (and whose key). Maintainability note, not user-facing.
async function callOpenAICompatible({ baseUrl, apiKey, model, messages, label }) {
  if (!apiKey) throw new Error(label + ' API key is not set');
  if (!baseUrl) throw new Error(label + ' base URL is not set');
  if (!model) throw new Error(label + ' model is not set');
  const normalized = (messages || []).map((m) => ({ role: m.role, content: String(m.content) }));
  const r = await fetchJson(String(baseUrl).replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages: normalized }),
  });
  if (!r.ok) throw new Error(label + ' error ' + r.status + ': ' + String(r.text).slice(0, 200));
  const msg = r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message;
  return { text: (msg && msg.content) || '' };
}

async function callGemini({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('Gemini API key is not set');
  if (!model) throw new Error('Gemini model is not set');
  const parts = (messages || []).map((m) => ({ text: `${m.role}: ${m.content}` }));
  const r = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts.length ? parts : [{ text: 'Reply with the word ok.' }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!r.ok) throw new Error('Gemini error ' + r.status + ': ' + String(r.text).slice(0, 200));
  const cands = (r.json && r.json.candidates) || [];
  const found = cands
    .flatMap((c) => (c.content && c.content.parts) || [])
    .find((p) => typeof p.text === 'string');
  return { text: (found && found.text) || '' };
}

// messages: [{ role: 'user'|'assistant'|'system', content: string }]
// config: { provider, apiKey, baseUrl (custom only), model, feature, userId }
// Returns { text }. Throws on failure. 'ollama' always throws here — it is
// client-side only (client/src/lib/aiClient.js); reaching this function
// with ollama means a wiring bug, and failing loudly beats silently
// hitting the server's own localhost on someone else's behalf.
async function callAI({ provider, apiKey, baseUrl, model, messages, feature = 'unknown', userId = null }) {
  const normalized = (messages || []).map((m) => ({ role: m.role, content: String(m.content) }));
  const finalModel = model || DEFAULT_MODELS[provider] || '';
  const bytesSent = Buffer.byteLength(
    JSON.stringify({ model: finalModel, messages: normalized }), 'utf8'
  );
  logCall(feature, provider, bytesSent, userId);

  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model: finalModel, messages });
  }
  if (provider === 'gemini') {
    return callGemini({ apiKey, model: finalModel, messages });
  }
  if (provider === 'openai' || provider === 'mistral' || provider === 'groq') {
    const label = provider === 'openai' ? 'OpenAI' : provider === 'mistral' ? 'Mistral' : 'Groq';
    return callOpenAICompatible({
      baseUrl: PROVIDER_BASE_URLS[provider],
      apiKey,
      model: finalModel,
      messages,
      label,
    });
  }
  if (provider === 'custom') {
    return callOpenAICompatible({ baseUrl, apiKey, model: finalModel, messages, label: 'Custom provider' });
  }
  if (provider === 'ollama' || provider === 'none') {
    throw new Error(
      'Local (Ollama) runs client-side only: the request must go straight from the browser to the person\'s own base URL, never through this server.'
    );
  }
  throw new Error('Unknown provider: ' + provider);
}

module.exports = { callAI, encryptKey, decryptKey, DEFAULT_MODELS, PROVIDER_BASE_URLS };
