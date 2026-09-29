import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import FlashCard from './FlashCard';
import RatingButtons from './RatingButtons';
import {
  buildFeedbackMessages,
  buildWrittenRecallMessages,
  chatOllama,
  parseTier,
} from '../lib/aiClient';
import { cardWord } from '../lib/i18n';
import {
  logReview,
  popUndo,
} from '../lib/reviews';
import {
  clearCursor,
  loadCursor,
  saveCursor,
} from '../lib/storage';
import { toNFC } from '../lib/text';
import HistoryStrip from './HistoryStrip';
import { getAdapter } from '../lib/storage';
import { awardReviewXp } from '../lib/habit';
import { studyDayString } from '../lib/day';
import MultipleChoice from './MultipleChoice';
import { pickVoice, speechSupported } from '../lib/modes';

// Tier colors reuse the rating palette's meaning: correct reads like Easy,
// almost like OK, incorrect like Hard.
function TierBadge({ tier }) {
  const { t } = useAuth();
  if (tier === 'correct') {
    return <p className="mt-2 text-sm font-bold text-leaf">{t('study.tierCorrect')}</p>;
  }
  if (tier === 'almost') {
    // Sand body text fails AA on light surfaces, so the text tier uses a
    // darker amber in light mode (dark mode keeps the sand token).
    return <p className="mt-2 text-sm font-bold text-[#7A6420] dark:text-sand">{t('study.tierAlmost')}</p>;
  }
  if (tier === 'incorrect') {
    return <p className="mt-2 text-sm font-bold text-clay">{t('study.tierIncorrect')}</p>;
  }
  return null;
}

// Shared study runner used by single-deck Study and Mixed Review.
// modes: { typedRecall, pretest } for this session.
// written: offer the AI-graded written-recall flow for this session.
// ai: { configured, provider, baseUrl, model, gradingTiming, gradingStrictness }.
// gradeDeckId: deck id used for server-side grading calls.
// elaboration: null, or { deckType, aiConfigured } to show Explain/Why boxes.
// cursorKey: sessionStorage key for the resume cursor (deck id or 'mixed').
// mode: label written into the review log ('flip', 'mixed', ...).
// deckReviews: server rating history for this deck (history strip).
// mc: { enabled, pool } for multiple-choice distractors.
// blitz: 60-second cram round (never schedules).
// speakLang: BCP-47 hint for the Listening voice.
export default function StudySession({
  cards: initialCards,
  reviewEndpoint,
  emptyTitle,
  emptyHint,
  modes,
  written,
  ai,
  gradeDeckId,
  elaboration,
  budgetMinutes,
  cardMeta,
  cursorKey,
  mode,
  deckReviews,
  mc,
  blitz,
  speakLang,
  notify,
}) {
  const [cards, setCards] = useState(initialCards);
  const [cram, setCram] = useState(false);
  const noSchedule = cram || blitz;
  // Multiple choice replaces the typed step when enabled.
  const [suggested, setSuggested] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [blitzLeft, setBlitzLeft] = useState(60);
  const [voices, setVoices] = useState([]);
  // Full session record for the summary grid (never removed by undo).
  const [sessionLog, setSessionLog] = useState([]);
  const startIndex = () => {
    if (!cursorKey) return 0;
    const at = loadCursor(cursorKey);
    return at < initialCards.length ? at : 0;
  };
  const [index, setIndex] = useState(startIndex);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [guess, setGuess] = useState('');
  const [guessed, setGuessed] = useState(false);
  const [rating, setRating] = useState(false);
  const [explain, setExplain] = useState('');
  const [why, setWhy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  // Written Recall state. Grading is informational only: progress.json is
  // written exclusively by rate() below, never by any grading call.
  const [writtenText, setWrittenText] = useState('');
  const [grade, setGrade] = useState(null);
  const [grading, setGrading] = useState(false);
  const [collected, setCollected] = useState([]);
  const [phase, setPhase] = useState('study');
  const [rateIdx, setRateIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [budgetPrompted, setBudgetPrompted] = useState(false);
  const [stopping, setStopping] = useState(false);
  // Undo: LIFO stack of { card, reviewId, prevIndex }, cap 10.
  const [undoStack, setUndoStack] = useState([]);
  const [undoing, setUndoing] = useState(false);
  const startRef = useRef(Date.now());
  const shownAtRef = useRef(Date.now());
  const gradeAllStarted = useRef(false);
  const navigate = useNavigate();
  const { user: sessionUser, t, lang } = useAuth();
  const flipStyle = sessionUser?.appearance?.flipStyle || 'flip';

  const card = cards[index];
  const isNew = card && (!card.progress || !card.progress.lastReviewedAt);
  const needGuess = modes?.pretest && isNew && !guessed;
  // Written Recall takes over the answer step once AI is available; without
  // AI it degrades to the normal flip flow with an honest notice.
  const aiReady = Boolean(ai?.configured);
  const writtenActive = Boolean(written && aiReady);
  const writtenFallback = Boolean(written && !aiReady);
  const endTiming = (ai?.gradingTiming || 'immediate') === 'end';
  const needType = modes?.typedRecall && !writtenActive && !flipped;
  // Multiple choice replaces the typed step when enabled with options.
  const mcOn = Boolean(
    mc && mc.enabled && (mc.pool || []).length >= 2 && !writtenActive
  );

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 10 * 1000);
    return () => clearInterval(t);
  }, []);

  // Response-time clock + resume cursor follow the card cursor.
  useEffect(() => {
    shownAtRef.current = Date.now();
    if (cursorKey) saveCursor(cursorKey, index);
  }, [index, cursorKey]);

  // Session finished: drop the resume cursor.
  useEffect(() => {
    if (cursorKey && index >= cards.length) clearCursor(cursorKey);
  }, [index, cards.length, cursorKey]);

  // Blitz countdown: 60 seconds, then the round ends.
  useEffect(() => {
    if (!blitz || index >= cards.length) return;
    if (blitzLeft <= 0) {
      setIndex(cards.length);
      return;
    }
    const id = setTimeout(() => setBlitzLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [blitz, blitzLeft, index, cards.length]);

  // Listening voices arrive asynchronously in every browser.
  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => {
      try {
        setVoices(window.speechSynthesis.getVoices() || []);
      } catch {
        /* no voices */
      }
    };
    load();
    try {
      window.speechSynthesis.onvoiceschanged = load;
    } catch {
      /* older browsers */
    }
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (budgetMinutes && elapsed >= budgetMinutes * 60 && !budgetPrompted && index < cards.length) {
      setBudgetPrompted(true);
    }
  }, [elapsed, budgetMinutes, budgetPrompted, index, cards.length]);

  // Break nudge (Settings → Wellbeing, default after 45 min):
  // separate from the session time budget above, dismissible.
  const [breakShown, setBreakShown] = useState(false);
  useEffect(() => {
    let wb = null;
    try {
      wb = getAdapter().get('wellbeing') || {};
    } catch {
      wb = {};
    }
    if (wb.breakNudge === false || breakShown) return;
    const afterMin = wb.breakAfterMin == null ? 45 : wb.breakAfterMin;
    if (elapsed >= afterMin * 60 && index < cards.length) {
      setBreakShown(true);
      notify(t('well.breakHint'), 'success');
    }
  }, [elapsed, index, cards.length, breakShown, notify, t]);

  const resetForNext = useCallback(() => {
    setFlipped(false);
    setTyped('');
    setGuess('');
    setGuessed(false);
    setExplain('');
    setWhy('');
    setFeedback('');
    setWrittenText('');
    setGrade(null);
    setSuggested(null);
  }, []);

  // Grade one written answer. Returns { tier, explanation, aiGraded }.
  // Never touches progress — the caller still rates manually afterwards.
  const gradeOne = useCallback(
    async (targetCard, answer) => {
      if (ai?.provider === 'ollama') {
        const { text } = await chatOllama({
          baseUrl: ai.baseUrl,
          model: ai.model,
          messages: buildWrittenRecallMessages({
            front: targetCard.front,
            back: targetCard.back,
            answer,
            strictness: ai.gradingStrictness,
          }),
        });
        return { ...parseTier(text), aiGraded: true, local: true };
      }
      const { data } = await api.post('/ai/grade', {
        deckId: gradeDeckId || targetCard.deckId,
        cardId: targetCard.id,
        front: targetCard.front,
        back: targetCard.back,
        answer,
      });
      return data;
    },
    [ai, gradeDeckId]
  );

  const submitWritten = useCallback(async () => {
    if (!card || grading || !writtenText.trim()) return;
    if (endTiming) {
      // Collect now, grade everything at the end of the session.
      setCollected((c) => [...c, { card, answer: writtenText.trim() }]);
      resetForNext();
      setIndex((i) => i + 1);
      return;
    }
    setGrading(true);
    try {
      const g = await gradeOne(card, writtenText.trim());
      setGrade(g);
      setFlipped(true);
    } catch (err) {
      notify(err.response?.data?.error || err.message || t('study.gradeFailed'), 'error');
    } finally {
      setGrading(false);
    }
  }, [card, grading, writtenText, endTiming, gradeOne, resetForNext, notify]);

  // End-of-session grading: grade everything collected, then summarize.
  useEffect(() => {
    if (phase !== 'study' || !endTiming || !writtenActive || index < cards.length || gradeAllStarted.current) {
      return;
    }
    gradeAllStarted.current = true;
    setPhase('grading');
    (async () => {
      const done = [];
      for (const item of collected) {
        try {
          const g = await gradeOne(item.card, item.answer);
          done.push({ ...item, grade: g });
        } catch {
          done.push({
            ...item,
            grade: { tier: 'incorrect', explanation: t('study.gradeFallback'), aiGraded: false },
          });
        }
      }
      setCollected(done);
      setPhase('summary');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, cards.length]);

  const rate = useCallback(
    async (value) => {
      if (!card || rating) return;
      const ms = Date.now() - shownAtRef.current;
      const who = (sessionUser && sessionUser.username) || 'guest';
      const overdue = Boolean(
        card.progress &&
        card.progress.nextReviewDate &&
        String(card.progress.nextReviewDate).slice(0, 10) <
          studyDayString(Date.now())
      );
      // Cram re-drill (and Blitz): practice only, never schedules.
      if (noSchedule) {
        try {
          logReview({
            cardId: card.id,
            deckId: card.deckId || gradeDeckId || null,
            rating: value,
            mode: 'cram',
            ms,
          });
        } catch {
          /* mirror best-effort */
        }
        try {
          awardReviewXp(who, { rating: value, ms, cram: true });
        } catch {
          /* xp best-effort */
        }
        setSessionLog((s) => [...s, { card, rating: value, ms }]);
        resetForNext();
        setIndex((i) => i + 1);
        return;
      }
      setRating(true);
      try {
        const { data } = await api.post(reviewEndpoint(card), {
          rating: value,
          mode: mode || 'flip',
          ms,
        });
        // Local mirror of the append-only log (instant UI, offline-safe).
        try {
          logReview({
            id: data && data.reviewId,
            cardId: card.id,
            deckId: card.deckId || gradeDeckId || null,
            rating: value,
            mode: mode || 'flip',
            ms,
            newInterval:
              data && typeof data.interval === 'number'
                ? data.interval
                : null,
          });
        } catch {
          /* mirror is best-effort; server is the truth */
        }
        setUndoStack((s) => [
          ...s.slice(-9),
          {
            card,
            reviewId: data && data.reviewId,
            prevIndex: index,
            rating: value,
            ms,
          },
        ]);
        setSessionLog((s) => [...s, { card, rating: value, ms }]);
        try {
          awardReviewXp(who, { rating: value, ms, overdue });
        } catch {
          /* xp best-effort */
        }
        resetForNext();
        setIndex((i) => i + 1);
      } catch (err) {
        notify(err.response?.data?.error || t('study.rateFailed'), 'error');
      } finally {
        setRating(false);
      }
    },
    [card, rating, reviewEndpoint, resetForNext, notify, mode, gradeDeckId, index, noSchedule, t]
  );

  // Undo the last rating: server restores the SM-2 snapshot, the local
  // mirror marks the row undone, and the cursor steps back to the card.
  const undoLast = useCallback(async () => {
    const top = undoStack[undoStack.length - 1];
    if (!top || rating || undoing) return;
    // Cram/Blitz undo is local-only (nothing was scheduled).
    if (noSchedule) {
      try {
        popUndo();
      } catch {
        /* mirror best-effort */
      }
      setUndoStack((s) => s.slice(0, -1));
      resetForNext();
      setIndex(top.prevIndex);
      return;
    }
    if (!top.reviewId) {
      notify(t('study.rateFailed'), 'error');
      return;
    }
    setUndoing(true);
    try {
      const url = reviewEndpoint(top.card).replace(/\/review$/, '/undo');
      await api.post(url, { reviewId: top.reviewId });
      try {
        popUndo();
      } catch {
        /* mirror best-effort */
      }
      setUndoStack((s) => s.slice(0, -1));
      resetForNext();
      setIndex(top.prevIndex);
      notify(t('study.undone'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('study.rateFailed'), 'error');
    } finally {
      setUndoing(false);
    }
  }, [undoStack, rating, undoing, reviewEndpoint, resetForNext, notify, noSchedule, t]);

  // "Ask tutor" handoff: stash card context, Tutor picks it up.
  const askTutor = useCallback((list, tab) => {
    try {
      getAdapter().set('tutor.context', {
        cards: (list || [card]).filter(Boolean).map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
        })),
        deckId: gradeDeckId || (card && card.deckId) || null,
      });
    } catch {
      /* Tutor still opens, without context */
    }
    const did = gradeDeckId || (card && card.deckId);
    const base = did ? `/tutor?deck=${did}&card=${card.id}` : '/tutor';
    navigate(tab ? `${base}${did ? '&' : '?'}tab=${tab}` : base);
  }, [card, gradeDeckId, navigate]);

  // Edit the current card in the deck editor (E). The resume cursor
  // survives, so the session picks up where it stopped.
  const editSession = useCallback(() => {
    const did = gradeDeckId || (card && card.deckId);
    if (did) navigate(`/decks/${did}/edit`);
  }, [card, gradeDeckId, navigate]);

  // Listening: read the front aloud in a matching voice, if any.
  const speak = useCallback(() => {
    if (!speechSupported() || !card) return;
    try {
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(card.front);
      const voice = pickVoice(voices, speakLang || 'en');
      if (voice) u.voice = voice;
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      notify(t('study.noVoice'), 'error');
    }
  }, [card, voices, speakLang, notify, t]);

  // Re-drill the Hard ones: cram over the hard-rated cards only.
  // Scheduling untouched (rate() takes the cram branch above).
  const redrillHard = useCallback(() => {
    const hardCards = sessionLog
      .filter((e) => e.rating === 'hard')
      .map((e) => e.card);
    if (hardCards.length === 0) return;
    setCards(hardCards);
    setSessionLog([]);
    setUndoStack([]);
    setCram(true);
    resetForNext();
    setIndex(0);
  }, [sessionLog, resetForNext]);

  const flip = useCallback(() => {
    if (!card || flipped || needGuess) return;
    setFlipped(true);
  }, [card, flipped, needGuess]);

  useEffect(() => {
    const onKey = (e) => {
      // IME composition (e.g. Lithuanian accents via dead keys): never
      // rate or flip mid-composition.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false);
        return;
      }
      // Ctrl/Cmd+Z undoes the last rating from anywhere in the session.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast();
        return;
      }
      // Ctrl/Cmd+K opens the command palette (handled in App shell).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return;
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target && e.target.isContentEditable) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        flip();
      } else if (e.key === '?') {
        setShowShortcuts(true);
      } else if (flipped) {
        const k = e.key.toLowerCase();
        if (k === '1' || k === 'h') rate('hard');
        else if (k === '2' || k === 'o') rate('ok');
        else if (k === '3') rate('easy');
        else if (k === 'z') undoLast();
        else if (k === 'e') editSession();
        else if (k === 't') askTutor();
        else if (k === 'v') askTutor(null, 'videos');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flip, flipped, rate, undoLast, editSession, askTutor, showShortcuts]);

  const requestFeedback = async () => {
    if (!explain.trim()) {
      notify(t('study.needExplain'), 'error');
      return;
    }
    setFeedbackLoading(true);
    try {
      // Local feedback runs in this browser, straight to the person's own
      // Ollama — never through the server.
      if (ai?.provider === 'ollama' && aiReady) {
        const { text } = await chatOllama({
          baseUrl: ai.baseUrl,
          model: ai.model,
          messages: buildFeedbackMessages({
            cardFront: card.front,
            cardBack: card.back,
            kind: 'explain',
            text: explain.trim(),
          }),
        });
        setFeedback(text);
        return;
      }
      const { data } = await api.post('/ai/feedback', {
        cardFront: card.front,
        cardBack: card.back,
        kind: 'explain',
        text: explain.trim(),
      });
      setFeedback(data.feedback);
    } catch (err) {
      if (err.response?.data?.needsKey) {
        notify(t('study.needKey'), 'error');
      } else {
        notify(err.response?.data?.error || err.message || t('study.feedbackFailed'), 'error');
      }
    } finally {
      setFeedbackLoading(false);
    }
  };

  const rateCollected = useCallback(
    async (value) => {
      const item = collected[rateIdx];
      if (!item || rating) return;
      setRating(true);
      try {
        const { data } = await api.post(reviewEndpoint(item.card), {
          rating: value,
          mode: mode || 'flip',
          ms: null,
        });
        try {
          logReview({
            id: data && data.reviewId,
            cardId: item.card.id,
            deckId: item.card.deckId || gradeDeckId || null,
            rating: value,
            mode: mode || 'flip',
            ms: null,
          });
        } catch {
          /* mirror best-effort */
        }
        if (rateIdx + 1 >= collected.length) {
          setPhase('done');
        } else {
          setRateIdx((i) => i + 1);
        }
      } catch (err) {
        notify(err.response?.data?.error || t('study.rateFailed'), 'error');
      } finally {
        setRating(false);
      }
    },
    [collected, rateIdx, rating, reviewEndpoint, notify, mode, gradeDeckId, t]
  );

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-10 text-center shadow-md">
        <h1 className="font-serif text-3xl font-semibold">{emptyTitle}</h1>
        <p className="mt-2 text-base text-muted">{emptyHint}</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (index >= cards.length) {
    // End-of-session timing: grade everything, summarize, then rate back.
    if (endTiming && writtenActive) {
      if (phase === 'grading' || (phase === 'study' && collected.length > 0)) {
        return (
          <div className="rounded-2xl bg-surface p-10 text-center shadow-md">
            <h1 className="font-serif text-3xl font-semibold">{t('study.gradingTitle')}</h1>
            <div className="mt-6 flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-ink" />
            </div>
          </div>
        );
      }
      if (phase === 'summary') {
        return (
          <div className="mx-auto max-w-2xl">
            <h1 className="font-serif text-3xl font-semibold">{t('study.summaryTitle')}</h1>
            <p className="mt-1 text-base text-muted">
              {t('study.summaryHint')}
            </p>
            <div className="mt-5 space-y-4">
              {collected.map((item, i) => (
                <div key={i} className="rounded-xl border border-line bg-surface p-5">
                  <p className="font-serif text-xl font-semibold">{item.card.front}</p>
                  <p className="mt-2 text-sm">{t('study.youWrote')} {item.answer}</p>
                  <p className="mt-1 text-sm text-muted">{t('study.answerIs')} {item.card.back}</p>
                  <TierBadge tier={item.grade?.tier} />
                  {item.grade?.explanation && (
                    <p className="mt-1 text-sm text-muted">{item.grade.explanation}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setRateIdx(0);
                setPhase('rateback');
              }}
              className="mt-5 rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('study.rateAnswers')}
            </button>
          </div>
        );
      }
      if (phase === 'rateback') {
        const item = collected[rateIdx];
        if (!item) {
          setPhase('done');
          return null;
        }
        return (
          <div className="mx-auto max-w-2xl">
            <p className="mb-4 text-sm text-muted">
              {t('study.ratingOf', { i: rateIdx + 1, n: collected.length })}
            </p>
            <div className="rounded-2xl bg-surface p-8 shadow-md">
              <p className="font-serif text-3xl font-semibold leading-snug">{item.card.front}</p>
              <p className="mt-3 text-base">{t('study.youWrote')} {item.answer}</p>
              <p className="mt-1 text-base text-muted">{t('study.answerIs')} {item.card.back}</p>
              <TierBadge tier={item.grade?.tier} />
              {item.grade?.explanation && (
                <p className="mt-1 text-sm text-muted">{item.grade.explanation}</p>
              )}
              <RatingButtons onRate={rateCollected} disabled={rating} />
            </div>
          </div>
        );
      }
    }
    const mins = Math.floor(elapsed / 60);
    const hardCount = sessionLog.filter((e) => e.rating === 'hard').length;
    return (
      <div className="rounded-2xl bg-surface p-10 text-center shadow-md">
        <h1 className="font-serif text-3xl font-semibold">{t('study.completeTitle')}</h1>
        <p className="mt-2 text-base text-muted">
          {t('study.completeBody', { n: `${cards.length} ${cardWord(lang, cards.length)}` })}
          {mins > 0 ? ` ${t('study.completeMins', { m: mins })}` : ''} {t('study.completeGood')}
        </p>
        {cram && (
          <p className="mt-2 text-sm text-muted">{t('session.cramNote')}</p>
        )}
        {sessionLog.length > 0 && (
          <div className="mx-auto mt-6 max-w-2xl text-left">
            <h2 className="font-serif text-xl font-semibold">{t('session.summary')}</h2>
            <ul className="mt-3 space-y-2">
              {sessionLog.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-2.5"
                >
                  <span className="truncate font-medium">{e.card.front}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2.5 w-2.5 ${
                        e.rating === 'hard'
                          ? 'bg-clay'
                          : e.rating === 'ok'
                            ? 'bg-sand'
                            : 'bg-leaf'
                      } rounded-full`}
                    />
                    {t('rate.' + e.rating)}
                    {typeof e.ms === 'number' && (
                      <span>{(e.ms / 1000).toFixed(0)}s</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!cram && hardCount > 0 && (
              <button
                onClick={redrillHard}
                className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas"
              >
                {t('session.redrill')}
              </button>
            )}
            {!cram && sessionLog.length > 0 && (
              <button
                onClick={() => {
                  const hard = sessionLog.filter((e) => e.rating === 'hard');
                  const rest = sessionLog.filter((e) => e.rating !== 'hard');
                  askTutor([...hard, ...rest].slice(0, 3).map((e) => e.card));
                }}
                className="mt-2 block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas"
              >
                {t('tutor.hardest3')}
              </button>
            )}
          </div>
        )}
        <Link to="/" className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90">
          {t('mixed.back')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-muted">
        <span>
          {t('study.cardOf', { i: index + 1, n: cards.length })}
          {cardMeta ? `, ${cardMeta(card)}` : ''}
          {cram ? ` · ${t('session.cramNote')}` : ''}
          {blitz ? ` · ${t('study.blitzLeft', { s: blitzLeft })}` : ''}
        </span>
        <span className="flex items-center gap-4">
          {undoStack.length > 0 && (
            <button
              onClick={undoLast}
              disabled={undoing || rating}
              title="Ctrl+Z"
              className="min-h-[44px] font-medium text-ink hover:underline disabled:opacity-50"
            >
              {t('study.undo')}
            </button>
          )}
          <Link to="/" className="font-medium text-ink hover:underline">
            {t('study.end')}
          </Link>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-valuenow={Math.min(index, cards.length)}
      >
        <div className="h-full bg-ink transition-all" style={{ width: `${(index / cards.length) * 100}%` }} />
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        {needGuess ? (
          <div className="rounded-2xl bg-surface p-8 shadow-md">
            <p className="font-serif text-3xl font-semibold leading-snug">{card.front}</p>
            <p className="mt-4 text-base text-muted">
              {t('study.guessBody')}
            </p>
            <input
              value={guess}
              aria-label={t('study.guessPh')}
              onChange={(e) => setGuess(toNFC(e.target.value))}
              onKeyDown={(e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter') setGuessed(true);
              }}
              placeholder={t('study.guessPh')}
              className="mt-4 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-lg focus:border-ink focus:outline-none"
            />
            <button
              onClick={() => setGuessed(true)}
              className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('study.guessCta')}
            </button>
          </div>
        ) : writtenActive ? (
          <div className="rounded-2xl bg-surface p-8 shadow-md">
            <p className="font-serif text-3xl font-semibold leading-snug">{card.front}</p>
            {!grade ? (
              <>
                <label htmlFor="study-written" className="mb-1 mt-4 block text-sm font-medium">
                  {t('study.writtenLabel')}
                </label>
                <p className="mb-2 text-sm text-muted">
                  {t('study.writtenHint')}
                </p>
                <textarea
                  id="study-written"
                  value={writtenText}
                  onChange={(e) => setWrittenText(toNFC(e.target.value))}
                  rows={5}
                  placeholder={t('study.writtenPh')}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
                />
                <button
                  onClick={submitWritten}
                  disabled={grading || !writtenText.trim()}
                  className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {grading ? t('study.grading') : endTiming ? t('study.writtenSave') : t('study.writtenCta')}
                </button>
              </>
            ) : (
              <>
                <TierBadge tier={grade.tier} />
                {grade.explanation && <p className="mt-1 text-base text-muted">{grade.explanation}</p>}
                {grade.local && (
                  <p className="mt-1 text-xs text-muted">{t('study.localNote')}</p>
                )}
                <div className="mt-4 rounded-xl border border-line bg-canvas p-4 text-sm">
                  <p className="font-medium">{t('study.youWrote')} {writtenText.trim()}</p>
                  <p className="mt-1 text-muted">{t('study.answerIs')} {card.back}</p>
                </div>
                <RatingButtons onRate={rate} disabled={rating} />
                <HistoryStrip
                  cardId={card.id}
                  serverRows={deckReviews}
                  nextDue={card.progress && card.progress.nextReviewDate}
                />
              </>
            )}
          </div>
        ) : (
          <>
            {writtenFallback && (
              <div className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
                {t('study.fallbackNotice')}{' '}
                <Link to="/settings" className="font-semibold text-ink hover:underline">
                  {t('study.openSettings')}
                </Link>
              </div>
            )}
            <FlashCard front={card.front} back={card.back} flipped={flipped} flipStyle={flipStyle} onFlip={() => setFlipped((f) => !f)} />
            {speechSupported() && !needGuess && (
              <button
                onClick={speak}
                className="mt-3 min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface"
              >
                {t('study.listen')}
              </button>
            )}
            {mcOn && !flipped && (
              <div className="mt-4 rounded-2xl bg-surface p-6 shadow-md">
                <p className="text-sm text-muted">{t('study.mcHint')}</p>
                <MultipleChoice
                  card={card}
                  pool={mc.pool}
                  onAnswer={(correct, sug) => {
                    setFlipped(true);
                    setSuggested(sug);
                  }}
                />
              </div>
            )}
            {needType && !mcOn && (
              <div className="mt-4 rounded-2xl bg-surface p-6 shadow-md">
                <label htmlFor="study-typed" className="mb-1 block text-sm font-medium">
                  {t('study.typedLabel')}
                </label>
                <p className="mb-2 text-sm text-muted">
                  {t('study.typedHint')}
                </p>
                <input
                  id="study-typed"
                  value={typed}
                  onChange={(e) => setTyped(toNFC(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.isComposing) return;
                    if (e.key === 'Enter') setFlipped(true);
                  }}
                  placeholder={t('study.typedPh')}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-lg focus:border-ink focus:outline-none"
                />
                <button
                  onClick={() => setFlipped(true)}
                  className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
                >
                  {t('study.showAnswer')}
                </button>
              </div>
            )}
            {flipped && (
              <>
                {suggested && (
                  <p className="mt-4 text-sm text-muted" role="status">
                    {t('study.suggest', { r: t('rate.' + suggested) })}
                  </p>
                )}
                {modes?.typedRecall && typed.trim() && (
                  <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">
                    <p className="font-medium">{t('study.youTyped')} {typed.trim()}</p>
                    <p className="mt-1 text-muted">{t('study.answerIs')} {card.back}</p>
                  </div>
                )}
                <RatingButtons onRate={rate} disabled={rating} suggested={suggested} />
                <HistoryStrip
                  cardId={card.id}
                  serverRows={deckReviews}
                  nextDue={card.progress && card.progress.nextReviewDate}
                />
                <button
                  onClick={() => askTutor()}
                  className="mt-3 min-h-[44px] text-sm font-medium text-ink hover:underline"
                >
                  {t('tutor.askTutor')}
                </button>
                {elaboration && (
                  <div className="mt-6 rounded-2xl bg-surface p-6 shadow-md">
                    <label htmlFor="study-explain" className="mb-1 block text-sm font-medium">
                      {t('study.explainLabel')}
                    </label>
                    <p className="mb-2 text-sm text-muted">
                      {t('study.explainHint')}
                    </p>
                    <textarea
                      id="study-explain"
                      value={explain}
                      onChange={(e) => setExplain(toNFC(e.target.value))}
                      rows={3}
                      className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
                    />
                    {elaboration.deckType === 'general' && (
                      <>
                        <label htmlFor="study-why" className="mb-1 mt-4 block text-sm font-medium">{t('study.whyLabel')}</label>
                        <textarea
                          id="study-why"
                          value={why}
                          onChange={(e) => setWhy(toNFC(e.target.value))}
                          rows={2}
                          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
                        />
                      </>
                    )}
                    {elaboration.aiConfigured ? (
                      <>
                        <button
                          onClick={requestFeedback}
                          disabled={feedbackLoading}
                          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
                        >
                          {feedbackLoading ? t('study.reading') : t('study.feedbackCta')}
                        </button>
                        {feedback && <p className="mt-2 text-sm text-muted">{feedback}</p>}
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted">
                        {t('study.aiNeedKey')}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {!flipped && !needType && (
              <p className="mt-4 text-center text-sm text-muted">
                {t('study.flipHint')}
              </p>
            )}
          </>
        )}
      </div>

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg">
            <h2 className="font-serif text-2xl font-semibold">{t('study.shortcuts')}</h2>
            <ul className="mt-4 space-y-2 text-base">
              <li><b>Space</b> — {t('set.scFlip')}</li>
              <li><b>1 / H</b> — {t('set.scHard')}</li>
              <li><b>2 / O</b> — {t('set.scOk')}</li>
              <li><b>3</b> — {t('set.scEasy')}</li>
              <li><b>Z / Ctrl+Z</b> — {t('set.scUndo')}</li>
              <li><b>E</b> — {t('set.scEdit')}</li>
              <li><b>T</b> — {t('set.scTutor')}</li>
              <li><b>V</b> — {t('set.scVideo')}</li>
              <li><b>?</b> — {t('study.shortcuts')}</li>
            </ul>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-5 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('study.close')}
            </button>
          </div>
        </div>
      )}

      {budgetPrompted && !stopping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg">
            <h2 className="font-serif text-2xl font-semibold">{t('study.budgetTitle')}</h2>
            <p className="mt-2 text-base text-muted">
              {t('study.budgetBody', { m: budgetMinutes })}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setBudgetPrompted(false);
                  setStopping(true);
                }}
                className="flex-1 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
              >
                {t('study.keepGoing')}
              </button>
              <Link
                to="/"
                className="flex-1 rounded-lg border border-line px-4 py-2.5 text-center font-semibold hover:bg-canvas"
              >
                {t('study.stopHere')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
