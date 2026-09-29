// llm.test.js — T3: provider shapes, JSON repair, retry,
// stream parser, abort. fetch is fully mocked; no network.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  aiContext,
  cacheKey,
  classifyError,
  enqueue,
  extractJson,
  generate,
  hasKeys,
  hashPrompt,
  resetQueue,
} from '../src/lib/llm';

function jsonRes(obj, status) {
  const code = status || 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    headers: { get: () => null },
    text: async () => JSON.stringify(obj),
  };
}

function httpRes(status, text, retryAfter) {
  return {
    ok: false,
    status,
    headers: {
      get: (k) => (k === 'retry-after' ? retryAfter || null : null),
    },
    text: async () => text,
  };
}

function geminiText(t) {
  return jsonRes({
    candidates: [{ content: { parts: [{ text: t }] } }],
    usageMetadata: { promptTokenCount: 3 },
  });
}

const CFG = {
  provider: 'gemini',
  apiKey: 'test-key',
  model: 'gemini-2.5-flash',
};

beforeEach(() => {
  resetQueue();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pure helpers', () => {
  it('hashPrompt is stable and short', () => {
    expect(hashPrompt('abc')).toBe(hashPrompt('abc'));
    expect(hashPrompt('abc')).not.toBe(hashPrompt('abd'));
    expect(hashPrompt('abc')).toHaveLength(8);
  });
  it('extractJson handles fences, prose, trailing commas', () => {
    expect(extractJson('{"a":1}').value).toEqual({ a: 1 });
    const fenced = extractJson('```json\n{"a":1,}\n```');
    expect(fenced.ok).toBe(true);
    expect(fenced.value).toEqual({ a: 1 });
    const prose = extractJson('Here: {"a": 2} bye');
    expect(prose.value).toEqual({ a: 2 });
    expect(extractJson('no json here').ok).toBe(false);
  });
  it('hasKeys checks required keys', () => {
    expect(hasKeys({ a: 1 }, ['a'])).toBe(true);
    expect(hasKeys({ a: 1 }, ['a', 'b'])).toBe(false);
    expect(hasKeys(null, ['a'])).toBe(false);
  });
  it('classifyError taxonomy', () => {
    expect(classifyError({ status: 401 }).code).toBe('bad-key');
    expect(classifyError({ status: 429 }).code).toBe(
      'rate-limited'
    );
    expect(classifyError({ status: 500 }).code).toBe(
      'provider-error'
    );
    expect(classifyError({ network: true }).code).toBe('offline');
    expect(classifyError({ code: 'timeout' }).code).toBe('timeout');
    expect(classifyError({ name: 'AbortError' }).code).toBe(
      'cancelled'
    );
  });
  it('aiContext names the UI language', () => {
    expect(aiContext({ lang: 'lt' }).note).toMatch(/Lithuanian/);
    expect(aiContext({ tellLanguage: false }).note).toBe('');
  });
  it('cacheKey differs per provider', () => {
    const a = cacheKey(CFG, 's', [{ role: 'user' }], null);
    const b = cacheKey({ ...CFG }, 's', [{ role: 'user' }], null);
    expect(a).toBe(b);
    const c = cacheKey({ provider: 'x' }, 's', [], null);
    expect(c).not.toBe(a);
  });
});

describe('provider request shapes', () => {
  it('gemini uses x-goog-api-key + JSON mode', async () => {
    fetch.mockResolvedValue(geminiText('{"cards":[]}'));
    const out = await generate(CFG, {
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      json: { keys: ['cards'], required: true },
      cache: false,
    });
    expect(out.json).toEqual({ cards: [] });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toMatch(/generateContent$/);
    expect(opts.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(opts.body);
    expect(body.generationConfig.responseMimeType).toBe(
      'application/json'
    );
    expect(
      body.generationConfig.thinkingConfig.thinkingBudget
    ).toBe(0);
  });
  it('openai-compatible uses Bearer + base URL', async () => {
    fetch.mockResolvedValue(
      jsonRes({ choices: [{ message: { content: 'yo' } }] })
    );
    const out = await generate(
      { provider: 'groq', apiKey: 'g', model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], cache: false }
    );
    expect(out.text).toBe('yo');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer g');
  });
  it('anthropic uses versioned headers', async () => {
    fetch.mockResolvedValue(
      jsonRes({ content: [{ type: 'text', text: 'bonjour' }] })
    );
    const out = await generate(
      { provider: 'anthropic', apiKey: 'a', model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], cache: false }
    );
    expect(out.text).toBe('bonjour');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    expect(opts.headers['x-api-key']).toBe('a');
  });
});

describe('reliability', () => {
  it('retries 429 once, honoring Retry-After', async () => {
    fetch
      .mockResolvedValueOnce(httpRes(429, 'slow', '0'))
      .mockResolvedValueOnce(geminiText('ok'));
    const out = await generate(CFG, {
      messages: [{ role: 'user', content: 'hi' }],
      cache: false,
    });
    expect(out.text).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('gives up after retries with an actionable code', async () => {
    fetch.mockResolvedValue(httpRes(500, 'boom'));
    await expect(
      generate(CFG, {
        messages: [{ role: 'user', content: 'hi' }],
        cache: false,
      })
    ).rejects.toMatchObject({ aiCode: 'provider-error' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('bad key maps to settings action', async () => {
    fetch.mockResolvedValue(httpRes(401, 'nope'));
    await expect(
      generate(CFG, {
        messages: [{ role: 'user', content: 'hi' }],
        cache: false,
      })
    ).rejects.toMatchObject({
      aiCode: 'bad-key',
      aiAction: 'settings',
    });
  });
  it('abort propagates without retries', async () => {
    const ctrl = new AbortController();
    fetch.mockImplementation(
      (url, opts) =>
        new Promise((resolve, reject) => {
          const onA = () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          };
          if (opts.signal.aborted) onA();
          else opts.signal.addEventListener('abort', onA);
        })
    );
    const p = generate(
      CFG,
      {
        messages: [{ role: 'user', content: 'hi' }],
        cache: false,
        signal: ctrl.signal,
      }
    );
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('streaming', () => {
  it('parses SSE chunks and calls onToken', async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n',
    ];
    const enc = new TextEncoder();
    let i = 0;
    const stream = new ReadableStream({
      pull(c) {
        if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
        else c.close();
      },
    });
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          const r = stream.getReader();
          return r;
        },
      },
    });
    const seen = [];
    const out = await generate(CFG, {
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      cache: false,
      onToken: (t) => seen.push(t),
    });
    expect(out.text).toBe('Hello');
    expect(seen.join('')).toBe('Hello');
  });
  it('falls back to non-streaming without a body', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: null })
      .mockResolvedValueOnce(geminiText('fallback'));
    const out = await generate(CFG, {
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      cache: false,
    });
    expect(out.text).toBe('fallback');
  });
});

describe('queue', () => {
  it('serializes concurrent calls', async () => {
    fetch.mockResolvedValue(geminiText('x'));
    const a = generate(CFG, {
      messages: [{ role: 'user', content: 'a' }],
      cache: false,
    });
    const b = generate(CFG, {
      messages: [{ role: 'user', content: 'b' }],
      cache: false,
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.text).toBe('x');
    expect(rb.text).toBe('x');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
