// share.js — SD0/SD1 deck share codes (cards only, never keys).
// SD1: deflated payload (needs CompressionStream); SD0: plain
// base64 JSON fallback for old browsers or tiny decks. Decode
// validates shape before anything is imported.
function b64encode(str) {
  if (typeof btoa !== 'undefined') {
    const utf8 = encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      (m, h) => String.fromCharCode(parseInt(h, 16))
    );
    return btoa(utf8);
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

function b64decode(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (typeof atob !== 'undefined') {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(clean, 'base64').toString('utf8');
}

export function compressionSupported() {
  try {
    return typeof CompressionStream !== 'undefined';
  } catch {
    return false;
  }
}

async function deflateText(text) {
  const stream = new Blob([text]).stream().pipeThrough(
    new CompressionStream('deflate-raw')
  );
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

async function inflateText(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('deflate-raw')
  );
  return new Response(stream).text();
}

function payload(deck) {
  return {
    v: 1,
    name: String((deck && deck.name) || 'deck').slice(0, 80),
    cards: ((deck && deck.cards) || [])
      .slice(0, 2000)
      .map((c) => ({
        front: String(c.front || '').slice(0, 2000),
        back: String(c.back || '').slice(0, 2000),
      })),
  };
}

// Encode a deck to an SD1: (compressed) or SD0: (plain) code.
export async function encodeDeck(deck) {
  const text = JSON.stringify(payload(deck));
  if (compressionSupported()) {
    try {
      return 'SD1:' + (await deflateText(text));
    } catch {
      /* fall through to SD0 */
    }
  }
  return 'SD0:' + b64encode(text);
}

export function encodeDeckSync(deck) {
  return 'SD0:' + b64encode(JSON.stringify(payload(deck)));
}

// Decode + validate. Returns { name, cards } or throws.
export async function decodeDeck(code) {
  const raw = String(code || '').trim();
  const m = raw.match(/^(SD[01]):([\s\S]+)$/);
  if (!m) throw new Error('bad-code');
  let text;
  if (m[1] === 'SD1') {
    if (!compressionSupported()) throw new Error('needs-inflate');
    text = await inflateText(m[2]);
  } else {
    try {
      text = b64decode(m[2]);
    } catch {
      throw new Error('bad-code');
    }
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('bad-code');
  }
  if (!obj || obj.v !== 1 || !Array.isArray(obj.cards)) {
    throw new Error('bad-code');
  }
  const cards = obj.cards
    .filter((c) => c && (c.front || c.back))
    .map((c) => ({
      front: String(c.front || '').slice(0, 2000),
      back: String(c.back || '').slice(0, 2000),
    }));
  if (!cards.length) throw new Error('empty');
  return { name: String(obj.name || 'deck'), cards };
}
