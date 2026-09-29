// Tutorial.jsx — interactive first-run tutorial on the real UI.
// Sandbox "Tutorial deck" (5 static cards, browser-only): the user
// flips, rates Hard/OK/Easy (written to the local review mirror, so
// the history strip is real), previews paste-sorting and the tutor,
// then sets off with "Start today's plan". Skip on every step,
// Esc skips, progress resumes, replay lives in Settings -> Help.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RatingButtons from '../components/RatingButtons';
import {
  lastN,
  logReview,
  ratingCounts,
} from '../lib/reviews';
import { getAdapter } from '../lib/storage';

export const TUTORIAL_VERSION = 1;

const SANDBOX = [
  { id: 'tut-1', front: 'labas', back: 'hello' },
  { id: 'tut-2', front: 'ačiū', back: 'thank you' },
  { id: 'tut-3', front: 'vanduo', back: 'water' },
  { id: 'tut-4', front: 'knyga', back: 'book' },
  { id: 'tut-5', front: 'draugas', back: 'friend' },
];

const TOTAL_STEPS = 6;

export function tutorialDone() {
  try {
    const v = getAdapter().get('tutorial');
    return Boolean(v && v.done === true);
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    getAdapter().set('tutorial', {
      done: true,
      version: TUTORIAL_VERSION,
    });
  } catch {
    /* best effort */
  }
}

function loadStep() {
  try {
    const v = getAdapter().get('tutorial');
    if (v && typeof v.step === 'number') {
      return Math.min(Math.max(v.step, 0), TOTAL_STEPS - 1);
    }
  } catch {
    /* fresh start */
  }
  return 0;
}

function saveStep(step) {
  try {
    const v = getAdapter().get('tutorial') || {};
    getAdapter().set('tutorial', { ...v, step });
  } catch {
    /* best effort */
  }
}

function Dots({ step }) {
  return (
    <div className="mb-4 flex gap-2" aria-hidden="true">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span
          key={i}
          className={
            'h-1.5 flex-1 rounded-full ' +
            (i <= step ? 'bg-ink' : 'bg-line')
          }
        />
      ))}
    </div>
  );
}

export default function Tutorial() {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(loadStep);
  const [flipIdx, setFlipIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(0);
  const [tick, setTick] = useState(0);

  const go = useCallback((n) => {
    const clamped = Math.min(Math.max(n, 0), TOTAL_STEPS - 1);
    setStep(clamped);
    saveStep(clamped);
  }, []);

  const skip = useCallback(() => {
    markTutorialDone();
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const card = SANDBOX[flipIdx % SANDBOX.length];
  const counts = ratingCounts(card.id);

  const rateSandbox = (value) => {
    logReview({
      cardId: card.id,
      deckId: 'tutorial',
      rating: value,
      mode: 'flip',
      ms: null,
    });
    setRated((r) => r + 1);
    setTick((x) => x + 1);
    setFlipped(false);
    setFlipIdx((i) => i + 1);
    if (rated + 1 >= 2) go(3);
  };

  const finish = () => {
    markTutorialDone();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Dots step={step} />
      <div className="rounded-2xl bg-surface p-8 shadow-md">
        {step === 0 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s1title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s1body')}
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s2title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s2body')}
            </p>
            <button
              onClick={() => setFlipped((f) => !f)}
              aria-label={t('flash.hint')}
              className="mt-5 w-full rounded-xl border border-line bg-canvas p-8 text-center"
            >
              <span className="font-serif text-3xl font-semibold">
                {flipped ? card.back : card.front}
              </span>
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s3title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s3body')}
            </p>
            <div className="mt-5 rounded-xl border border-line bg-canvas p-6 text-center">
              <p className="font-serif text-2xl font-semibold">
                {card.back}
              </p>
              <p className="mt-1 text-sm text-muted">{card.front}</p>
            </div>
            <RatingButtons onRate={rateSandbox} disabled={false} />
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s4title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s4body')}
            </p>
            <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
              <div className="flex gap-1.5" key={tick}>
                {lastN(card.id, 8).map((r, i) => (
                  <span
                    key={i}
                    title={`${r.rating} — ${r.ts}`}
                    className={
                      'inline-block h-3 w-3 rounded-full ' +
                      (r.rating === 'hard'
                        ? 'bg-clay'
                        : r.rating === 'ok'
                          ? 'bg-sand'
                          : 'bg-leaf')
                    }
                  />
                ))}
                {lastN(card.id, 8).length === 0 && (
                  <span className="text-sm text-muted">
                    {t('tut.noHistory')}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                {t('tut.historyLine', {
                  h: counts.hard,
                  o: counts.ok,
                  e: counts.easy,
                })}
              </p>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s5title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s5body')}
            </p>
          </>
        )}
        {step === 5 && (
          <>
            <h1 className="font-serif text-2xl font-bold">
              {t('tut.s6title')}
            </h1>
            <p className="mt-2 text-base text-muted">
              {t('tut.s6body')}
            </p>
            <button
              onClick={finish}
              className="mt-6 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('tut.start')}
            </button>
          </>
        )}
        <div className="mt-6 flex gap-3">
          {step > 0 && step < 5 && (
            <button
              onClick={() => go(step - 1)}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-canvas"
            >
              {t('tut.back')}
            </button>
          )}
          {step < 5 && (
            <button
              onClick={() => go(step + 1)}
              className="flex-1 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('tut.next')}
            </button>
          )}
          <button
            onClick={skip}
            className="flex-1 rounded-lg px-4 py-2.5 font-medium text-muted hover:bg-canvas"
          >
            {t('tut.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
