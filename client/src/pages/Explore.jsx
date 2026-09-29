// Explore.jsx — bundled starter decks (static JSON in the repo,
// one-click add, attribution visible) plus Wikipedia "Learn more".
import { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import STARTER_DECKS from '../data/starter-decks.json';
import { fetchSummary } from '../lib/wiki';
import { decodeDeck } from '../lib/share';

export default function Explore({ notify }) {
  const { t, lang } = useAuth();
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState([]);
  const [topic, setTopic] = useState('');
  const [wiki, setWiki] = useState(null);
  const [wikiBusy, setWikiBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);

  const addDeck = async (bundle) => {
    setAdding(bundle.id);
    try {
      const { data: deck } = await api.post('/decks', {
        name: bundle.name,
        subject: bundle.subject,
        type: bundle.type,
        sourceLang: bundle.sourceLang,
        targetLang: bundle.targetLang,
      });
      await api.post(`/decks/${deck.id}/cards`, {
        cards: bundle.cards.map((c) => ({
          front: c.front,
          back: c.back,
        })),
      });
      setAdded((a) => [...a, bundle.id]);
      notify(t('explore.added', { n: bundle.cards.length }), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.saveFailed'), 'error');
    } finally {
      setAdding(null);
    }
  };

  const importCode = async () => {
    if (!code.trim() || codeBusy) return;
    setCodeBusy(true);
    try {
      const parsed = await decodeDeck(code.trim());
      const { data: deck } = await api.post('/decks', {
        name: parsed.name,
        subject: '',
        type: 'general',
      });
      await api.post(`/decks/${deck.id}/cards`, { cards: parsed.cards });
      setCode('');
      notify(t('share.imported', { n: parsed.cards.length }), 'success');
    } catch (err) {
      notify(
        err.message === 'bad-code' || err.message === 'empty'
          ? t('share.badCode')
          : t('set.saveFailed'),
        'error'
      );
    } finally {
      setCodeBusy(false);
    }
  };

  const learnMore = async () => {
    if (!topic.trim() || wikiBusy) return;
    setWikiBusy(true);
    setWiki(null);
    try {
      setWiki(await fetchSummary(topic.trim(), lang));
    } catch (err) {
      notify(
        err.code === 'not-found' ? t('explore.wikiMissing') : t('set.testFailed'),
        'error'
      );
    } finally {
      setWikiBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">{t('explore.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('explore.hint')}</p>

      <div className="mt-4 space-y-3">
        {STARTER_DECKS.map((d) => (
          <div key={d.id} className="rounded-2xl bg-surface p-5 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl font-semibold">{d.name}</h2>
                <p className="text-sm text-muted">
                  {d.cards.length} · {d.subject}
                </p>
              </div>
              <button
                onClick={() => addDeck(d)}
                disabled={adding === d.id || added.includes(d.id)}
                className="min-h-[44px] shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {added.includes(d.id)
                  ? t('explore.addedShort')
                  : adding === d.id
                    ? t('common.loading')
                    : t('explore.add')}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">{d.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">{t('explore.wiki')}</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.isComposing) return;
              if (e.key === 'Enter') learnMore();
            }}
            placeholder={t('explore.wikiPh')}
            aria-label={t('explore.wikiPh')}
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
          />
          <button
            onClick={learnMore}
            disabled={wikiBusy || !topic.trim()}
            className="min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
          >
            {t('explore.wikiGo')}
          </button>
        </div>
        {wiki && (
          <div className="mt-3 rounded-xl border border-line p-4">
            <p className="font-semibold">{wiki.title}</p>
            <p className="mt-1 text-sm text-muted">{wiki.extract}</p>
            <p className="mt-2 text-sm">
              <a
                href={wiki.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink hover:underline"
              >
                {t('explore.wikiOpen')}
              </a>{' '}
              <span className="text-muted">· {wiki.license}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">
          {t('share.importTitle')}
        </h2>
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('share.importPh')}
            aria-label={t('share.importPh')}
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm focus:border-ink focus:outline-none"
          />
          <button
            onClick={importCode}
            disabled={codeBusy || !code.trim()}
            className="min-h-[44px] rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {t('share.importGo')}
          </button>
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
