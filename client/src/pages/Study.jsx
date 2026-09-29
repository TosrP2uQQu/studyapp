import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StudySession from '../components/StudySession';
import Spinner from '../components/Spinner';

export default function Study({ notify }) {
  const { id } = useParams();
  const { user, t, lang } = useAuth();
  const [deck, setDeck] = useState(null);
  const [due, setDue] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: detail }, { data: study }] = await Promise.all([
          api.get(`/decks/${id}`),
          api.get(`/decks/${id}/study`),
        ]);
        setDeck(detail);
        setDue(study.due || []);
      } catch (err) {
        notify(err.response?.data?.error || t('study.loadFailed'), 'error');
        setDue([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!deck || due === null) return <Spinner />;

  const cardCount = (deck.cards || []).length;
  const cap = user?.studyPrefs?.sessionCardCap || null;
  const sessionCards = cap ? due.slice(0, cap) : due;

  const modes = deck.studyModes || { typedRecall: false, pretest: false };
  const elaboration = deck.studyModes?.elaborativePrompts
    ? { deckType: deck.type, aiConfigured: Boolean(user?.ai?.configured) }
    : null;
  const written = deck.studyModes?.writtenRecallAI === true;

  return (
    <div>
      {cap && due.length > cap && (
        <p className="mb-4 text-sm text-muted">
          {t('study.capNote', { cap, due: due.length })}
        </p>
      )}
      <StudySession
        cards={sessionCards}
        reviewEndpoint={(card) => `/decks/${id}/cards/${card.id}/review`}
        emptyTitle={cardCount === 0 ? t('study.noCardsTitle') : t('study.nothingTitle')}
        emptyHint={
          cardCount === 0 ? t('study.noCardsHint') : t('study.nothingHint')
        }
        modes={modes}
        written={written}
        ai={user?.ai}
        gradeDeckId={id}
        elaboration={elaboration}
        budgetMinutes={user?.studyPrefs?.minutesPerSession}
        cursorKey={id}
        mode="flip"
        notify={notify}
      />
    </div>
  );
}
