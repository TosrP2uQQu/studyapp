// svg.js — AI diagram sanitiser. AI returns raw SVG; we strip it
// to a strict allow-list, then render ONLY via <img src="data:…">
// so embedded scripts can never run. No script, foreignObject,
// event handlers, hrefs, or external references survive.
const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'title',
  'desc',
]);

const ALLOWED_ATTRS = new Set([
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'opacity',
  'font-size',
  'font-family',
  'text-anchor',
  'transform',
]);

function cleanAttrs(tag, attrStr) {
  const out = [];
  const re = /([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;
    const raw = m[2];
    const val = raw.slice(1, -1);
    // No URLs, no JS, no data exfiltration in attribute values.
    if (/^\s*javascript:/i.test(val)) continue;
    if (/url\s*\(/i.test(val)) continue;
    if (/[<>]/.test(val)) continue;
    // viewBox is case-sensitive in SVG; restore the capital B.
    const canon = name === 'viewbox' ? 'viewBox' : name;
    out.push(`${canon}="${val}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

export function sanitizeSvg(raw) {
  let svg = String(raw || '');
  // Drop code fences the model may wrap around the SVG.
  const fenced = svg.match(/```(?:svg|xml)?\s*([\s\S]*?)\s*```/);
  if (fenced) svg = fenced[1];
  // Remove comments and CDATA-wrapped tricks.
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');
  // Keep only the outer <svg>…</svg>.
  const m = svg.match(/<svg\b([\s\S]*)<\/svg\s*>/i);
  if (!m) return null;
  let inner = m[0];
  // Strip whole dangerous subtrees first.
  inner = inner.replace(
    /<(script|foreignObject|use|image|iframe|audio|video|style|link|meta)\b[\s\S]*?<\/\1\s*>/gi,
    ''
  );
  inner = inner.replace(
    /<(script|foreignObject|use|image|iframe|audio|video|style|link|meta)\b[^>]*\/?>/gi,
    ''
  );
  // Rebuild tag by tag from the allow-list.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)(\/?)>/g;
  let out = '';
  let last = 0;
  let mm;
  while ((mm = tagRe.exec(inner)) !== null) {
    out += inner.slice(last, mm.index);
    last = tagRe.lastIndex;
    const name = mm[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    const closing = mm[0].startsWith('</');
    if (closing) {
      out += `</${name}>`;
    } else {
      const selfClose = mm[3] === '/' || /\/\s*$/.test(mm[2]);
      out += `<${name}${cleanAttrs(name, mm[2])}${selfClose ? '/' : ''}>`;
    }
  }
  out += inner.slice(last);
  // Must still be a single svg root with a viewBox.
  if (!/^<svg\b/i.test(out.trim())) return null;
  if (!/viewBox\s*=/i.test(out)) return null;
  return out.trim();
}

export function svgDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
