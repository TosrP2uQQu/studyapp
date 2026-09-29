// wiki.js — Wikipedia "Learn more": user-initiated MediaWiki API
// extracts (origin=*) in the deck/UI language, with CC BY-SA
// attribution. Never scraped, never copied wholesale: we show the
// extract plus a link and let the article do the teaching.
export function wikiEndpoint(lang) {
  const code = String(lang || 'en').slice(0, 12).replace(/[^a-z-]/gi, '');
  return `https://${code || 'en'}.wikipedia.org/w/api.php`;
}

export async function fetchSummary(topic, lang) {
  const title = String(topic || '').trim().slice(0, 120);
  if (!title) throw new Error('empty topic');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'extracts|pageimages',
    exintro: '1',
    explaintext: '1',
    exchars: '600',
    redirects: '1',
    titles: title,
  });
  const res = await fetch(`${wikiEndpoint(lang)}?${params}`);
  if (!res.ok) {
    const e = new Error(`Wikipedia ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const json = await res.json();
  const pages = (json && json.query && json.query.pages) || {};
  const page = Object.values(pages)[0] || {};
  if (page.missing) {
    const e = new Error('not found');
    e.code = 'not-found';
    throw e;
  }
  const pageUrl = `https://${String(lang || 'en')}.wikipedia.org/wiki/` +
    encodeURIComponent(String(page.title || title).replace(/ /g, '_'));
  return {
    title: page.title || title,
    extract: (page.extract || '').slice(0, 600),
    url: pageUrl,
    license: 'CC BY-SA',
  };
}
