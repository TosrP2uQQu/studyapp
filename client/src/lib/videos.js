// videos.js — YouTube without scraping, downloading, or autoplay.
// The model NEVER produces video URLs or IDs: "Find videos" builds
// search QUERIES only (offline templates), which open youtube.com
// results in a new tab. An optional user-supplied YouTube Data API
// key enables embedded result cards. Attached videos are click-to-load
// nocookie embeds, never fetched until clicked.
export function youtubeSearchUrl(query) {
  return (
    'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(query)
  );
}

// Three search queries for a card. May name reputable channels;
// never fabricates video URLs or IDs.
export function videoQueries(card, lang) {
  const topic = String((card && card.front) || '').slice(0, 80).trim();
  const inLang = lang && lang !== 'en';
  const suffix = inLang ? '' : ' explained';
  return [
    `${topic}${suffix}`.trim(),
    `${topic} Khan Academy`.trim(),
    `${topic} 3Blue1Brown Numberphile`.trim(),
  ];
}

// Strict 11-char ID extraction: youtu.be, watch?v=, embed, shorts,
// live, with optional t=/start=. Returns { id, start } or null.
export function extractVideoId(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
  );
  if (!m) return null;
  let start = null;
  const t = raw.match(/[?&#](?:t|start)=([^&#\s]+)/);
  if (t) {
    const v = t[1];
    if (/^\d+$/.test(v)) {
      start = parseInt(v, 10);
    } else {
      const hms = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      if (hms) {
        start = (parseInt(hms[1] || 0, 10) * 3600) +
          (parseInt(hms[2] || 0, 10) * 60) +
          parseInt(hms[3] || 0, 10);
      }
    }
  }
  return { id: m[1], start };
}

export function embedUrl(id, start) {
  const base = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  return start ? `${base}&start=${start}` : base;
}

// Optional YouTube Data API (user key, stored like AI keys).
export async function searchVideosApi(apiKey, query, lang) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    maxResults: '5',
    q: query,
  });
  if (lang) params.set('relevanceLanguage', lang);
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { headers: { 'X-Goog-Api-Key': apiKey } }
  );
  if (!res.ok) {
    const e = new Error(`YouTube API ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const json = await res.json();
  return ((json && json.items) || [])
    .filter((it) => it?.id?.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: it.snippet?.title || '',
      channel: it.snippet?.channelTitle || '',
      thumb: it.snippet?.thumbnails?.default?.url || '',
    }));
}
