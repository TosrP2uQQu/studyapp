// Tutor.jsx — deck-aware AI tutor: chat with modes, chips,
// streaming + Stop, local history, videos (queries only),
// click-to-load attaches, micro-lessons, AI diagrams, explorers.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import {
  TUTOR_MODES,
  buildTutorMessages,
  trimHistory,
} from '../lib/tutorPrompt';
import { aiContext, generate } from '../lib/llm';
import { getBrowserKey, setBrowserKey } from '../lib/keys';
import { getAdapter } from '../lib/storage';
import { renderMathHtml } from '../lib/latex';
import {
  embedUrl,
  extractVideoId,
  searchVideosApi,
  videoQueries,
  youtubeSearchUrl,
} from '../lib/videos';
import { sanitizeSvg, svgDataUrl } from '../lib/svg';
import { suggestExplainer } from '../explainers/registry';
import Pythagoras from '../explainers/Pythagoras';
import LineExplainer from '../explainers/Line';

const EXPLAINER_VIEWS = { pythagoras: Pythagoras, line: LineExplainer };

function histKey(deckId) {
  return 'tutor.' + (deckId || 'general');
}

function loadTurns(deckId) {
  try {
    const v = getAdapter().get(histKey(deckId));
    return Array.isArray(v && v.turns) ? v.turns : [];
  } catch {
    return [];
  }
}

function saveTurns(deckId, turns) {
  try {
    getAdapter().set(histKey(deckId), { turns: turns.slice(-40) });
  } catch {
    /* best effort */
  }
}

function Message({ m, onCopy, t }) {
  if (m.svg) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-3">
        <img
          src={m.svg}
          alt={t('tutor.diagramAlt')}
          className="w-full max-w-md"
        />
      </div>
    );
  }
  const mine = m.role === 'user';
  return (
    <div className={mine ? 'text-right' : 'text-left'}>
      <div
        className={`inline-block max-w-full rounded-xl px-4 py-2.5 text-left text-base ${
          mine ? 'bg-ink text-white' : 'border border-line bg-canvas'
        }`}
      >
        <span
          dangerouslySetInnerHTML={{ __html: renderMathHtml(m.content) }}
        />
      </div>
      {!mine && (
        <button
          onClick={() => onCopy(m.content)}
          className="mt-1 text-sm text-muted hover:text-ink"
        >
          {t('tutor.copy')}
        </button>
      )}
    </div>
  );
}

export default function Tutor({ notify }) {
  const { user, t, lang } = useAuth();
  const [params] = useSearchParams();
  const deckId = params.get('deck') || null;
  const cardId = params.get('card') || null;
  const [deckName, setDeckName] = useState('');
  const [cards, setCards] = useState([]);
  const [turns, setTurns] = useState(() => loadTurns(deckId));
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('explain');
  const [depth, setDepth] = useState('standard');
  const [sending, setSending] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const [tab, setTab] = useState('chat');
  const [ytKey, setYtKey] = useState(() => getBrowserKey('youtube'));
  const [ytResults, setYtResults] = useState(null);
  const [ytBusy, setYtBusy] = useState(false);
  const [attachUrl, setAttachUrl] = useState('');
  const [attached, setAttached] = useState(() => {
    try {
      return getAdapter().get('videos.' + (cardId || deckId || 'general')) || [];
    } catch {
      return [];
    }
  });
  const [playing, setPlaying] = useState(null);
  const ctrlRef = useRef(null);
  const bottomRef = useRef(null);
  // Handoff from Study ("Ask tutor", "hardest 3"): cards stashed
  // in the browser store when navigating here.
  const ctxRef = useRef(null);
  if (ctxRef.current === null) {
    try {
      ctxRef.current = getAdapter().get('tutor.context') || {};
    } catch {
      ctxRef.current = {};
    }
  }

  const provider = (user && user.ai && user.ai.provider) || 'gemini';
  const apiKey = getBrowserKey(provider);
  const keyReady = provider === 'ollama' || Boolean(apiKey);

  useEffect(() => {
    const ctx = ctxRef.current || {};
    if (!deckId) {
      // No deck param: use handoff cards if present.
      if (Array.isArray(ctx.cards) && ctx.cards.length) {
        setCards(ctx.cards.slice(0, 50));
        if (ctx.deckId) setDeckName('');
      }
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/decks/${deckId}`);
        setDeckName(data.name || '');
        setCards((data.cards || []).slice(0, 50));
      } catch {
        /* context stays empty */
      }
    })();
  }, [deckId]);

  useEffect(() => {
    saveTurns(deckId, turns);
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, deckId]);

  const card = cards.find((c) => c.id === cardId) ||
    cards[0] ||
    ((ctxRef.current || {}).card) ||
    null;

  const historyLine = useCallback(() => {
    if (!card) return '';
    return '';
  }, [card]);

  const pushTurns = (next) => {
    const trimmed = trimHistory(next).slice(-40);
    setTurns(trimmed);
  };

  const send = useCallback(
    async (prompt, extra) => {
      const text = (prompt || '').trim();
      if (!text || sending) return;
      if (!keyReady) return;
      const ex = extra || {};
      const ctx = aiContext({ lang });
      const { system, messages } = buildTutorMessages({
        mode,
        depth,
        card,
        deckName,
        historyLine: historyLine(),
        history: turns,
        prompt: text,
        langNote: ctx.note,
      });
      pushTurns([...turns, { role: 'user', content: text }]);
      setInput('');
      setSending(true);
      setStreamBuf('');
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      let acc = '';
      try {
        const out = await generate(
          {
            provider,
            apiKey,
            baseUrl: (user && user.ai && user.ai.baseUrl) || '',
            model: (user && user.ai && user.ai.model) || '',
          },
          {
            system,
            messages,
            stream: true,
            cache: false,
            signal: ctrl.signal,
            onToken: (chunk) => {
              acc += chunk;
              setStreamBuf(acc);
            },
          }
        );
        const finalText = acc || out.text;
        if (ex.expectSvg) {
          const clean = sanitizeSvg(finalText);
          if (!clean) throw new Error('bad diagram');
          pushTurns([
            ...turns,
            { role: 'user', content: text },
            { role: 'assistant', svg: svgDataUrl(clean) },
          ]);
        } else {
          pushTurns([
            ...turns,
            { role: 'user', content: text },
            { role: 'assistant', content: finalText },
          ]);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          notify(err.aiCode || err.message || t('study.feedbackFailed'), 'error');
        }
        if (acc) {
          pushTurns([
            ...turns,
            { role: 'user', content: text },
            { role: 'assistant', content: acc },
          ]);
        }
      } finally {
        setSending(false);
        setStreamBuf('');
        ctrlRef.current = null;
      }
    },
    [turns, sending, keyReady, provider, apiKey, user, mode, depth,
      card, deckName, historyLine, lang, notify, t]
  );

  const stop = () => {
    if (ctrlRef.current) ctrlRef.current.abort();
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(t('set.diagCopied'), 'success');
    } catch {
      notify(t('set.testFailed'), 'error');
    }
  };

  const chips = [
    ['simpler', t('tutor.chipSimpler')],
    ['example', t('tutor.chipExample')],
    ['why', t('tutor.chipWhy')],
    ['test', t('tutor.chipTest')],
  ];

  const chipPrompt = (kind) => {
    if (kind === 'simpler') return t('tutor.chipSimpler') + ': ' + (card ? card.front : '');
    if (kind === 'example') return t('tutor.chipExample') + ': ' + (card ? card.front : '');
    if (kind === 'why') return t('tutor.chipWhy') + ' ' + (card ? `${card.front} — ${card.back}` : '');
    return t('tutor.chipTest') + ': ' + (card ? card.front : '');
  };

  const microlesson = () =>
    send(
      `Write a 90-second micro-lesson for: ${card ? card.front : deckName}. ` +
        'Hook, idea, worked example, one check question. ' +
        'Say when an SVG diagram would help, do not draw it.'
    );

  const drawIt = () =>
    send(
      `Draw one teaching diagram for: ${card ? `${card.front} = ${card.back}` : deckName}. ` +
        'Return SVG ONLY (viewBox="0 0 400 300", no script, no foreignObject, ' +
        'no external refs), no prose before or after.',
      { expectSvg: true }
    );

  const makeCards = async () => {
    const transcript = turns
      .map((x) => `${x.role}: ${x.content || ''}`)
      .join('\n')
      .slice(0, 4000);
    if (!transcript.trim()) return;
    setSending(true);
    try {
      const out = await generate(
        {
          provider,
          apiKey,
          baseUrl: (user && user.ai && user.ai.baseUrl) || '',
          model: (user && user.ai && user.ai.model) || '',
        },
        {
          system: 'Turn chat transcripts into flashcards.',
          messages: [
            {
              role: 'user',
              content:
                'Return JSON only: {"cards":[{"front":"…","back":"…"}]}.\n\n' +
                transcript,
            },
          ],
          json: { keys: ['cards'], required: true },
        }
      );
      const list = (out.json && out.json.cards) || [];
      await copyText(JSON.stringify(list, null, 2));
      notify(t('tutor.cardsCopied'), 'success');
    } catch (err) {
      notify(err.aiCode || err.message || t('study.feedbackFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const findVideos = async () => {
    if (!ytKey.trim()) return;
    setYtBusy(true);
    try {
      const topic = card ? card.front : deckName;
      const out = await searchVideosApi(ytKey.trim(), topic, lang);
      setYtResults(out);
    } catch {
      setYtResults([]);
      notify(t('tutor.ytFallback'), 'error');
    } finally {
      setYtBusy(false);
    }
  };

  const attach = () => {
    const parsed = extractVideoId(attachUrl);
    if (!parsed) {
      notify(t('tutor.badUrl'), 'error');
      return;
    }
    const next = [...attached, { ...parsed, note: '' }];
    setAttached(next);
    try {
      getAdapter().set('videos.' + (cardId || deckId || 'general'), next);
    } catch {
      /* best effort */
    }
    setAttachUrl('');
  };

  const queries = videoQueries(card || { front: deckName }, lang);
  const explainerId = suggestExplainer(card);
  const Explainer = explainerId ? EXPLAINER_VIEWS[explainerId] : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">{t('tutor.title')}</h1>
      {deckName && (
        <p className="mt-1 text-sm text-muted">{deckName}</p>
      )}
      {card && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="font-semibold">{card.front}</p>
          <p className="text-muted">{card.back}</p>
        </div>
      )}

      <div className="mt-4 flex gap-2" role="tablist">
        {['chat', 'videos', 'explore'].map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold ${
              tab === name
                ? 'border-ink bg-ink text-white'
                : 'border-line hover:bg-surface'
            }`}
          >
            {t('tutor.tab' + name[0].toUpperCase() + name.slice(1))}
          </button>
        ))}
      </div>

      {!keyReady && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">
          <p>{t('tutor.needKey')}</p>
          <Link
            to="/settings"
            className="mt-2 inline-block font-semibold text-ink hover:underline"
          >
            {t('study.openSettings')}
          </Link>
        </div>
      )}

      {tab === 'chat' && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {TUTOR_MODES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  mode === m
                    ? 'border-ink bg-ink text-white'
                    : 'border-line hover:bg-surface'
                }`}
              >
                {t('tutor.mode' + m[0].toUpperCase() + m.slice(1))}
              </button>
            ))}
          </div>
          {mode === 'explain' && (
            <div className="mt-2 flex gap-2" role="radiogroup">
              {['simple', 'standard', 'deep'].map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={depth === d}
                  onClick={() => setDepth(d)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    depth === d ? 'border-ink bg-ink text-white' : 'border-line'
                  }`}
                >
                  {t('tutor.depth' + d[0].toUpperCase() + d.slice(1))}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-3" aria-live="polite">
            {turns.map((m, i) => (
              <Message key={i} m={m} onCopy={copyText} t={t} />
            ))}
            {streamBuf && (
              <div className="rounded-xl border border-line bg-canvas px-4 py-2.5 text-base">
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderMathHtml(streamBuf),
                  }}
                />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => send(chipPrompt(kind))}
                disabled={sending || !keyReady}
                className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={microlesson}
              disabled={sending || !keyReady}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
            >
              {t('tutor.microlesson')}
            </button>
            <button
              onClick={drawIt}
              disabled={sending || !keyReady}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
            >
              {t('tutor.draw')}
            </button>
            <button
              onClick={makeCards}
              disabled={sending || !keyReady || turns.length === 0}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
            >
              {t('tutor.makeCards')}
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter') send(input);
              }}
              placeholder={t('tutor.placeholder')}
              aria-label={t('tutor.placeholder')}
              className="min-h-[44px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base focus:border-ink focus:outline-none"
            />
            {sending ? (
              <button
                onClick={stop}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface"
              >
                {t('tutor.stop')}
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || !keyReady}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {t('tutor.send')}
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-3 text-sm">
            <button
              onClick={() => send(turns.filter((x) => x.role === 'user').slice(-1)[0]?.content || '')}
              disabled={sending}
              className="font-medium text-muted hover:text-ink"
            >
              {t('tutor.retry')}
            </button>
            <button
              onClick={() => pushTurns([])}
              className="font-medium text-muted hover:text-ink"
            >
              {t('tutor.clear')}
            </button>
          </div>
        </div>
      )}

      {tab === 'videos' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-surface p-5 shadow-md">
            <h2 className="font-serif text-xl font-semibold">
              {t('tutor.findVideos')}
            </h2>
            <div className="mt-2 space-y-2">
              {queries.map((q) => (
                <a
                  key={q}
                  href={youtubeSearchUrl(q)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas"
                >
                  {q}
                </a>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={ytKey}
                onChange={(e) => setYtKey(e.target.value)}
                type="password"
                autoComplete="off"
                placeholder={t('tutor.ytKeyPh')}
                aria-label={t('tutor.ytKeyPh')}
                className="min-h-[44px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
              />
              <button
                onClick={() => {
                  setBrowserKey('youtube', ytKey.trim(), true);
                  findVideos();
                }}
                disabled={ytBusy || !ytKey.trim()}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
              >
                {t('tutor.ytSearch')}
              </button>
            </div>
            {ytResults && ytResults.length === 0 && (
              <p className="mt-2 text-sm text-muted">{t('tutor.ytFallback')}</p>
            )}
            {ytResults && ytResults.length > 0 && (
              <ul className="mt-2 space-y-2">
                {ytResults.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 rounded-xl border border-line p-2"
                  >
                    {v.thumb && (
                      <img
                        src={v.thumb}
                        alt=""
                        className="h-12 w-20 rounded object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.title}</p>
                      <p className="truncate text-sm text-muted">{v.channel}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl bg-surface p-5 shadow-md">
            <h2 className="font-serif text-xl font-semibold">
              {t('tutor.attach')}
            </h2>
            <div className="mt-2 flex gap-2">
              <input
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                aria-label={t('tutor.attach')}
                className="min-h-[44px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
              />
              <button
                onClick={attach}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {t('tutor.attachAdd')}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {attached.map((a, i) => (
                <div
                  key={`${a.id}-${i}`}
                  className="overflow-hidden rounded-xl border border-line"
                >
                  {playing === i ? (
                    <iframe
                      src={embedUrl(a.id, a.start)}
                      title={`${t('tutor.videoAlt')} ${i + 1}`}
                      className="aspect-video w-full"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <button
                      onClick={() => setPlaying(i)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 bg-canvas px-4 py-6 text-sm font-semibold hover:opacity-90"
                    >
                      <span aria-hidden="true">▶</span> {t('tutor.play')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'explore' && (
        <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
          {Explainer ? (
            <>
              <h2 className="font-serif text-xl font-semibold">
                {t('tutor.exploreTitle')}
              </h2>
              <div className="mt-3">
                <Explainer />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{t('tutor.noExplainer')}</p>
          )}
        </div>
      )}
    </div>
  );
}
