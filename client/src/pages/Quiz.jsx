import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { buildQuizGradeMessages, chatOllama } from '../lib/aiClient';

export default function Quiz({ notify }) {
  const { id } = useParams();
  const { user, t } = useAuth();
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);

  const aiConfigured = Boolean(user?.ai?.configured);

  const start = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post(`/decks/${id}/quiz`, { count });
      setQuiz(data);
      setAnswers({});
    } catch (err) {
      notify(err.response?.data?.error || t('quiz.buildFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const grade = async () => {
    setGrading(true);
    try {
      const payload = quiz.questions.map((q) => ({ index: q.index, response: answers[q.index] ?? '' }));
      const { data } = await api.post(`/decks/${id}/quiz/${quiz.quizId}/grade`, { answers: payload });
      // Local upgrade: the server can't grade for Ollama users (client-side
      // only by architecture), so those self-check items get graded right
      // here in the browser instead.
      if (user?.ai?.provider === 'ollama' && user.ai.configured) {
        const upgraded = [];
        for (const r of data.results) {
          if (r.selfCheck && !r.correct && r.kind === 'short-answer') {
            try {
              const { text } = await chatOllama({
                baseUrl: user.ai.baseUrl,
                model: user.ai.model,
                messages: buildQuizGradeMessages({
                  correct: r.correctAnswer,
                  response: r.response,
                  strictness: user.ai.gradingStrictness,
                }),
              });
              const s = text.indexOf('{');
              const e = text.lastIndexOf('}');
              const parsed = JSON.parse(text.slice(s, e + 1));
              upgraded.push({
                ...r,
                correct: parsed.correct === true,
                aiGraded: true,
                local: true,
                selfCheck: false,
                note: String(parsed.note || ''),
              });
              continue;
            } catch {
              // Keep the self-check fallback below.
            }
          }
          upgraded.push(r);
        }
        data.results = upgraded;
        data.score = upgraded.filter((r) => r.correct).length;
      }
      setResult(data);
    } catch (err) {
      notify(err.response?.data?.error || t('quiz.gradeFailed'), 'error');
    } finally {
      setGrading(false);
    }
  };

  if (loading) return <Spinner />;

  if (result) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold">
          {t('quiz.scoreOf', { s: result.score, t: result.total })}
        </h1>
        <p className="mt-1 text-base text-muted">
          {t('quiz.practiceNote')}
        </p>
        <div className="mt-6 space-y-4">
          {result.results.map((r) => (
            <div key={r.index} className={`rounded-xl border bg-surface p-5 ${r.correct ? 'border-leaf' : 'border-clay'}`}>
              <p className="font-serif text-xl font-semibold">{r.prompt}</p>
              {r.kind === 'multiple-choice' && (
                <div className="mt-2 space-y-1 text-sm">
                  {r.options.map((o) => (
                    <p key={o} className={o === r.correctAnswer ? 'font-semibold text-leaf' : o === r.response ? 'text-clay' : 'text-muted'}>
                      {o === r.correctAnswer ? t('quiz.answerIs') : o === r.response ? t('quiz.youPicked') : ''}
                      {o}
                    </p>
                  ))}
                </div>
              )}
              {r.kind === 'short-answer' && (
                <div className="mt-2 text-sm">
                  <p>{t('quiz.youWrote')}{r.response || t('quiz.nothing')}</p>
                  <p className="mt-1 font-semibold text-leaf">{t('quiz.answerIs')}{r.correctAnswer}</p>
                  {r.aiGraded && r.note && <p className="mt-1 text-muted">{r.note}</p>}
                  {r.selfCheck && !r.correct && (
                    <p className="mt-1 text-muted">{t('quiz.selfCheck')}</p>
                  )}
                </div>
              )}
              <p className={`mt-2 text-sm font-semibold ${r.correct ? 'text-leaf' : 'text-clay'}`}>
                {r.correct ? t('quiz.correct') : t('quiz.notQuite')}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={() => { setQuiz(null); setResult(null); }} className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            {t('quiz.takeAnother')}
          </button>
          <Link to={`/decks/${id}/study`} className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface">
            {t('quiz.studyDeck')}
          </Link>
        </div>
      </div>
    );
  }

  if (quiz) {
    const answered = quiz.questions.filter((q) => {
      const a = answers[q.index];
      return a !== undefined && a !== '';
    }).length;
    return (
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold">{t('quiz.title')}</h1>
        {!aiConfigured && (
          <p className="mt-2 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            {t('quiz.noKeyBox')} <Link to="/settings" className="font-semibold text-ink hover:underline">{t('study.openSettings')}</Link>
          </p>
        )}
        <div className="mt-5 space-y-4">
          {quiz.questions.map((q) => (
            <div key={q.index} className="rounded-xl border border-line bg-surface p-5">
              <p className="font-serif text-xl font-semibold">{q.prompt}</p>
              {q.kind === 'multiple-choice' ? (
                <div className="mt-3 space-y-2">
                  {q.options.map((o, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-canvas">
                      <input
                        type="radio"
                        name={`q-${q.index}`}
                        checked={answers[q.index] === i}
                        onChange={() => setAnswers({ ...answers, [q.index]: i })}
                        className="h-4 w-4 accent-[var(--ink)]"
                      />
                      <span className="text-base">{o}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  value={answers[q.index] || ''}
                  aria-label={t('quiz.answerAria', { q: q.prompt })}
                  onChange={(e) => setAnswers({ ...answers, [q.index]: e.target.value })}
                  placeholder={t('quiz.typeAnswer')}
                  className="mt-3 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-base focus:border-ink focus:outline-none"
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={grade}
          disabled={grading || answered < quiz.questions.length}
          className="mt-5 rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {grading ? t('quiz.grading') : t('quiz.gradeCount', { a: answered, n: quiz.questions.length })}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">{t('quiz.title')}</h1>
      <p className="mt-2 text-base text-muted">
        {t('quiz.intro', { graded: aiConfigured ? t('quiz.introGraded') : '' })}
      </p>
      {!aiConfigured && (
        <p className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          {t('quiz.selfCheckMode')} <Link to="/settings" className="font-semibold text-ink hover:underline">{t('quiz.addKey')}</Link>
        </p>
      )}
      <div className="mt-5 rounded-2xl bg-surface p-6 shadow-md">
        <label htmlFor="quiz-count" className="mb-1 block text-sm font-medium">{t('quiz.count')}</label>
        <input
          id="quiz-count"
          type="number"
          min={5}
          max={10}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-32 rounded-lg border border-line bg-canvas px-3 py-2.5 text-base focus:border-ink focus:outline-none"
        />
        <button onClick={start} className="mt-4 block rounded-lg bg-ink px-6 py-2.5 font-semibold text-white hover:opacity-90">
          {t('quiz.build')}
        </button>
      </div>
    </div>
  );
}
