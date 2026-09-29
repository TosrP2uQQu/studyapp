// Unit tests for the ai.js provider adapters. fetch is stubbed so no
// network or key is needed; assertions pin the request shape per provider.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ai = require('../ai');

let calls;
const realFetch = global.fetch;

function stubFetch(handler) {
  calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
}

function jsonResponse(obj) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(obj),
  };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('openai-compatible adapter', () => {
  const cases = [
    ['openai', 'https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'],
    ['mistral', 'https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest'],
    ['groq', 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant'],
  ];
  for (const [provider, url, model] of cases) {
    it(`${provider} posts chat-completions shape to its own base URL`, async () => {
      stubFetch(() => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
      const { text } = await ai.callAI({
        provider,
        apiKey: 'k',
        messages: [{ role: 'user', content: 'hi' }],
        feature: 't',
      });
      assert.equal(text, 'ok');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, url);
      const body = JSON.parse(calls[0].options.body);
      assert.equal(body.model, model);
      assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
      assert.equal(calls[0].options.headers.Authorization, 'Bearer k');
    });
  }

  it('custom uses the person-supplied base URL', async () => {
    stubFetch(() => jsonResponse({ choices: [{ message: { content: 'yo' } }] }));
    const { text } = await ai.callAI({
      provider: 'custom',
      apiKey: 'k',
      baseUrl: 'https://example.com/v1/',
      model: 'mine',
      messages: [],
      feature: 't',
    });
    assert.equal(text, 'yo');
    assert.equal(calls[0].url, 'https://example.com/v1/chat/completions');
  });

  it('surfaces provider errors with the body attached', async () => {
    global.fetch = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
    await assert.rejects(
      ai.callAI({ provider: 'groq', apiKey: 'bad', model: 'm', messages: [], feature: 't' }),
      /Groq error 401: bad key/
    );
  });
});

describe('gemini adapter', () => {
  it('posts generateContent shape with the key in the query', async () => {
    stubFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'fine' }] } }] })
    );
    const { text } = await ai.callAI({
      provider: 'gemini',
      apiKey: 'gkey',
      messages: [{ role: 'user', content: 'hi' }],
      feature: 't',
    });
    assert.equal(text, 'fine');
    assert.ok(calls[0].url.includes('gemini-2.0-flash:generateContent'));
    assert.ok(calls[0].url.includes('key=gkey'));
    const body = JSON.parse(calls[0].options.body);
    assert.ok(Array.isArray(body.contents[0].parts));
  });
});

describe('provider routing', () => {
  it('ollama always throws instead of proxying', async () => {
    stubFetch(() => jsonResponse({}));
    await assert.rejects(
      ai.callAI({ provider: 'ollama', baseUrl: 'http://x', model: 'm', messages: [], feature: 't' }),
      /client-side only/
    );
    assert.equal(calls.length, 0);
  });

  it('unknown providers throw', async () => {
    stubFetch(() => jsonResponse({}));
    await assert.rejects(ai.callAI({ provider: 'nope', messages: [], feature: 't' }), /Unknown provider/);
  });

  it('every call is audit-logged with feature and byte count', async () => {    stubFetch(() => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const fs = require('fs');
    const logFile = require('path').join(__dirname, '..', 'data', 'ai-calls.log');
    const before = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').length : 0;
    await ai.callAI({ provider: 'openai', apiKey: 'k', model: 'm', messages: [], feature: 'audit-probe', userId: 'u1' });
    const after = fs.readFileSync(logFile, 'utf8');
    assert.ok(after.length > before);
    assert.match(after, /feature=audit-probe provider=openai bytes_sent=\d+/);
    assert.match(after, /user=u1/);
  });
});
