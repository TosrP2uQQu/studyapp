// ai-smoke.mjs — one tiny JSON call + one streamed call against
// Gemini. Reads GEMINI_API_KEY from the environment, never prints it.
// Run: npm run ai-smoke (reads process.env, no key in repo/args).
// Prints PASS/FAIL lines and exits non-zero on failure.
import { generate } from '../src/lib/llm.js';

const key = process.env.GEMINI_API_KEY || '';
if (!key) {
  console.log('FAIL: GEMINI_API_KEY is not set');
  process.exit(2);
}

const cfg = {
  provider: 'gemini',
  apiKey: key,
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};

let failed = false;

try {
  const out = await generate(cfg, {
    system: 'Return JSON only.',
    messages: [{ role: 'user', content: 'ping' }],
    json: { keys: [], required: false },
    cache: false,
  });
  if (typeof out.text === 'string' && out.text.length > 0) {
    console.log('PASS: json call ok');
  } else {
    console.log('FAIL: json call returned no text');
    failed = true;
  }
} catch (err) {
  console.log(`FAIL: json call (${err.aiCode || err.message})`);
  failed = true;
}

try {
  let streamed = '';
  const out = await generate(cfg, {
    system: 'Reply with the word ok.',
    messages: [{ role: 'user', content: 'ping' }],
    stream: true,
    cache: false,
    onToken: (t) => {
      streamed += t;
    },
  });
  if ((streamed + out.text).length > 0) {
    console.log('PASS: stream call ok');
  } else {
    console.log('FAIL: stream call returned no text');
    failed = true;
  }
} catch (err) {
  console.log(`FAIL: stream call (${err.aiCode || err.message})`);
  failed = true;
}

process.exit(failed ? 1 : 0);
