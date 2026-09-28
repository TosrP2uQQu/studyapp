import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const distPath = new URL(dist).pathname.replace(/^\/([A-Za-z]:)/, '$1');
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));

function fail(msg) {
  console.error(`check-dist FAILED: ${msg}`);
  process.exit(1);
}
if (!existsSync(join(root, 'index.html'))) fail('dist/index.html missing — did vite build run?');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const bad = refs.filter((u) => u.startsWith('/') && !u.startsWith('//'));
if (bad.length) fail(`non-relative URLs in index.html: ${bad.join(', ')}`);

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|json|map)$/.test(e)) {
      const s = readFileSync(p, 'utf8');
      const m = s.match(/AIza[0-9A-Za-z_-]{10,}|AQ\.[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|gsk_[A-Za-z0-9]{10,}|api[_-]?key["']?\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/);
      if (m) fail(`possible secret in ${p}: ${m[0].slice(0, 12)}…`);
    }
  }
}
walk(root);
console.log(`check-dist OK (${refs.length} refs, all relative, no secrets)`);
