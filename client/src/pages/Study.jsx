import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StudySession from '../components/StudySession';
import Spinner from '../components/Spinner';
import { applyDirection } from '../lib/modes';

export default function Study({ notify }) {
  const { id } = useParams();
  const { user, t, lang } = useAuth();
  const [deck, setDeck] = useState(null);
  const [due, setDue] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [direction, setDirection] = useState('forward');
  const [mcOn, setMcOn] = useState(false);
  const [blitz, setBlitz] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: detail }, { data: study }] = await Promise.all([
          api.get(`/decks/${id}`),
          api.get(`/decks/${id}/study`),
        ]);
        setDeck(detail);
        setDue(study.due || []);
        try {
          const { data: hist } = await api.get(`/decks/${id}/reviews`);
          setReviews(hist.reviews || []);
        } catch {
          setReviews([]);
        }
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
  const capped = cap ? due.slice(0, cap) : due;
  const sessionCards = applyDirection(capped, direction);
  const isLang = deck.type === 'language';

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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label={t('study.direction')}>
          {['forward', 'reverse', 'both'].map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={direction === d}
              onClick={() => setDirection(d)}
              className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-sm font-medium ${
                direction === d ? 'border-ink bg-ink text-white' : 'border-line'
              }`}
            >
              {t('study.dir' + d[0].toUpperCase() + d.slice(1))}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMcOn((v) => !v)}
          aria-pressed={mcOn}
          className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-sm font-medium ${
            mcOn ? 'border-ink bg-ink text-white' : 'border-line'
          }`}
        >
          {t('study.mc')}
        </button>
        <button
          onClick={() => setBlitz((v) => !v)}
          aria-pressed={blitz}
          className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-sm font-medium ${
            blitz ? 'border-ink bg-ink text-white' : 'border-line'
          }`}
        >
          {t('study.blitz')}
        </button>
        <Link
          to={`/decks/${id}/match`}
          className="min-h-[44px] rounded-lg border border-line px-3 py-1.5 text-sm font-medium leading-8 hover:bg-surface"
        >
          {t('match.title')}
        </Link>
      </div>
      <StudySession
        key={`${direction}-${mcOn}-${blitz}`}
        cards={sessionCards}
        reviewEndpoint={(card) => `/decks/${id}/cards/${card.id.replace(/__rev$/, '')}/review`}
        emptyTitle={cardCount === 0 ? t('study.noCardsTitle') : t('study.nothingTitle')}
        emptyHint={
          cardCount === 0 ? t('study.noCardsHint') : t('study.nothingHint')
        }
        modes={modes}
        written={written && !blitz}
        ai={user?.ai}
        gradeDeckId={id}
        elaboration={elaboration}
        budgetMinutes={user?.studyPrefs?.minutesPerSession}
        cursorKey={blitz ? null : id}
        mode={blitz ? 'blitz' : 'flip'}
        deckReviews={reviews}
        mc={{ enabled: mcOn && !blitz, pool: deck.cards || [] }}
        blitz={blitz}
        speakLang={isLang ? deck.sourceLang || 'en' : lang}
        notify={notify}
      />
    </div>
  );
}
