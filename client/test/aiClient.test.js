import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  OLLAMA_SUGGESTION,
  ollamaRoot,
  testOllama,
  chatOllama,
  parseTier,
  STRICTNESS,
} from '../src/lib/aiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ollamaRoot', () => {
  it('keeps an explicit /v1 root and appends it when missing', () => {
    expect(ollamaRoot('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(ollamaRoot('http://localhost:11434')).toBe('http://localhost:11434/v1');
    expect(ollamaRoot('http://localhost:11434/')).toBe('http://localhost:11434/v1');
  });

  it('exposes the documented default suggestion', () => {
    expect(OLLAMA_SUGGESTION).toBe('http://localhost:11434/v1');
  });
});

describe('chatOllama', () => {
  it('posts OpenAI-compatible chat shape to the person\'s own URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'hi' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { text } = await chatOllama({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(JSON.parse(opts.body)).toEqual({
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('requires a model name before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatOllama({ baseUrl: 'http://x', model: '', messages: [] })).rejects.toThrow(
      /model name is required/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('testOllama', () => {
  it('lists models via GET on the same root', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'llama3.1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await testOllama({ baseUrl: 'http://localhost:11434/v1' });
    expect(r.ok).toBe(true);
    expect(r.models).toEqual(['llama3.1']);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
  });
});

describe('parseTier', () => {
  it('accepts the three tiers and rejects anything else', () => {
    expect(parseTier('{"tier": "correct", "explanation": "x"}')).toEqual({
      tier: 'correct',
      explanation: 'x',
    });
    expect(() => parseTier('{"tier": "maybe"}')).toThrow(/unknown tier/);
    expect(() => parseTier('no json here')).toThrow(/did not return JSON/);
  });

  it('mirrors the server rubric keys', () => {
    expect(Object.keys(STRICTNESS).sort()).toEqual(['lenient', 'standard', 'strict']);
  });
});
