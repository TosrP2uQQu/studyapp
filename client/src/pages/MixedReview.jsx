import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StudySession from '../components/StudySession';
import Spinner from '../components/Spinner';

export default function MixedReview({ notify }) {
  const { user, t } = useAuth();
  const [params] = useSearchParams();
  const [cards, setCards] = useState(null);

  useEffect(() => {
    const ids = (params.get('decks') || '').split(',').filter(Boolean);
    if (ids.length === 0) {
      setCards([]);
      return;
    }
    (async () => {
      try {
        const { data } = await api.post('/decks/mixed-review', { deckIds: ids });
        setCards(data.cards || []);
      } catch (err) {
        notify(err.response?.data?.error || t('mixed.loadFailed'), 'error');
        setCards([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cards === null) return <Spinner />;

  const cap = user?.studyPrefs?.sessionCardCap || null;
  const sessionCards = cap ? cards.slice(0, cap) : cards;

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">{t('mixed.title')}</h1>
      <p className="mb-6 mt-1 text-base text-muted">
        {t('mixed.hint')}
      </p>
      {cards.length === 0 ? (
        <div className="rounded-2xl bg-surface p-10 text-center shadow-md">
          <p className="font-serif text-2xl font-semibold">{t('mixed.emptyTitle')}</p>
          <p className="mt-2 text-base text-muted">
            {t('mixed.emptyHint')}
          </p>
          <Link to="/" className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90">
            {t('mixed.back')}
          </Link>
        </div>
      ) : (
        <StudySession
          cards={sessionCards.map((c) => ({ ...c, front: `${c.front}`, deckLabel: c.deckName }))}
          reviewEndpoint={(card) => `/decks/${card.deckId}/cards/${card.id}/review`}
          emptyTitle={t('study.nothingTitle')}
          emptyHint={t('study.nothingHint')}
          modes={{ typedRecall: false, pretest: false }}
          elaboration={null}
          budgetMinutes={undefined}
          cardMeta={(c) => t('mixed.fromDeck', { name: c.deckName })}
          cursorKey="mixed"
          mode="mixed"
          notify={notify}
        />
      )}
    </div>
  );
}
