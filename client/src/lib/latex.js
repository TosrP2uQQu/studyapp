// latex.js — minimal $…$ maths renderer (KaTeX loads lazily in
// T9; until then formulae render as distinct inline code so they
// are readable and never executed). HTML-escapes everything first.
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Split text into [{ math: bool, text }] runs on $…$ spans.
export function mathRuns(s) {
  const out = [];
  const re = /\$([^$\n]+)\$/g;
  let last = 0;
  let m;
  const str = String(s == null ? '' : s);
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) {
      out.push({ math: false, text: str.slice(last, m.index) });
    }
    out.push({ math: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ math: false, text: str.slice(last) });
  return out;
}

// HTML string: prose escaped, maths wrapped for styling.
export function renderMathHtml(s) {
  return mathRuns(s)
    .map((r) =>
      r.math
        ? `<code class="math">${escapeHtml(r.text)}</code>`
        : escapeHtml(r.text)
    )
    .join('');
}
