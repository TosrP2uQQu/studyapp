const express = require('express');
const { authMiddleware } = require('../auth');

const router = express.Router();

// POST /api/translate — server-side proxy to MyMemory to avoid client CORS issues.
// Body: { text, sourceLang, targetLang }
router.post('/', authMiddleware, async (req, res) => {
  const { text, sourceLang, targetLang } = req.body || {};
  if (!text || !sourceLang || !targetLang) {
    return res.status(400).json({ error: 'text, sourceLang and targetLang are required' });
  }
  const langpair = `${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    String(text)
  )}&langpair=${langpair}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) {
      return res.status(502).json({ error: 'Translation service error', translatedText: '' });
    }
    const data = await r.json();
    const translatedText = data?.responseData?.translatedText ?? '';
    res.json({ translatedText });
  } catch (err) {
    // Graceful fallback: never block the parse over one failed lookup.
    res.status(502).json({ error: 'Translation lookup failed or timed out', translatedText: '' });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
