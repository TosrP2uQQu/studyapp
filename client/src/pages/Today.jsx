// Today.jsx — the habit home: one plan button, resume list,
// goal ring, XP + streak + freezes, exam planner, intention .ics,
// focus tools, weekly card, achievements. Kind by design: no guilt,
// no grinding incentives, every celebration subtle and optional.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import {
  ACHIEVEMENTS,
  DAILY_XP_CAP,
  buildICS,
  checkAchievements,
  examPlan,
  goalStreak,
  levelFor,
  loadHabit,
  markGoalDay,
  maybeEarnFreeze,
  saveHabit,
  sleepTipKey,
} from '../lib/habit';
import { studyDayString } from '../lib/day';
import { listCursors } from '../lib/storage';
import { getAdapter } from '../lib/storage';

function wellbeingSounds() {
  try {
    const wb = getAdapter().get('wellbeing') || {};
    return wb.sounds === true;
  } catch {
    return false;
  }
}

function Ring({ frac, label }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={label}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(f * circ).toFixed(1)} ${circ.toFixed(1)}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="text-sm text-muted">{label}</span>
    </span>
  );
}

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.65);
  } catch {
    /* audio unavailable */
  }
}

function FocusTools({ t, soundOn }) {
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [left, setLeft] = useState(25 * 60);
  const [phase, setPhase] = useState('work');
  const [running, setRunning] = useState(false);
  const [noise, setNoise] = useState('off');
  const [vol, setVol] = useState(0.2);
  const noiseRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 1;
        if (soundOn) chime();
        if (phase === 'work') {
          setPhase('break');
          return breakMin * 60;
        }
        setPhase('work');
        setRunning(false);
        return workMin * 60;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, workMin, breakMin, soundOn]);

  const stopNoise = () => {
    try {
      if (noiseRef.current) noiseRef.current.stop();
    } catch {
      /* already stopped */
    }
    noiseRef.current = null;
  };

  const startNoise = (kind) => {
    stopNoise();
    if (kind === 'off') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        if (kind === 'brown') {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        } else if (kind === 'pink') {
          last = 0.98 * last + 0.02 * white;
          data[i] = last * 8;
        } else {
          data[i] = white * 0.5;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
      noiseRef.current = src;
    } catch {
      /* audio unavailable */
    }
  };

  useEffect(() => () => stopNoise(), []);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="mt-6 rounded-2xl bg-surface p-6 shadow-md">
      <h2 className="font-serif text-2xl font-semibold">{t('today.focus')}</h2>
      <p className="mt-2 font-mono text-4xl" aria-live="polite">
        {mm}:{ss} <span className="font-sans text-base text-muted">{phase}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm">
          {t('today.workMin')}{' '}
          <input
            type="number"
            min={5}
            max={90}
            value={workMin}
            onChange={(e) => {
              setWorkMin(Number(e.target.value));
              setLeft(Number(e.target.value) * 60);
            }}
            className="w-16 rounded-lg border border-line bg-canvas px-2 py-1 text-base"
          />
        </label>
        <label className="text-sm">
          {t('today.breakMin')}{' '}
          <input
            type="number"
            min={1}
            max={30}
            value={breakMin}
            onChange={(e) => setBreakMin(Number(e.target.value))}
            className="w-16 rounded-lg border border-line bg-canvas px-2 py-1 text-base"
          />
        </label>
        <button
          onClick={() => setRunning((r) => !r)}
          className="min-h-[44px] rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {running ? t('tutor.stop') : t('today.focusStart')}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{t('today.stretchTip')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{t('today.noise')}</span>
        {['off', 'white', 'pink', 'brown'].map((k) => (
          <button
            key={k}
            onClick={() => {
              setNoise(k);
              startNoise(k);
            }}
            aria-pressed={noise === k}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm ${
              noise === k ? 'border-ink bg-ink text-white' : 'border-line'
            }`}
          >
            {t('today.noise' + k[0].toUpperCase() + k.slice(1))}
          </button>
        ))}
        <label className="text-sm">
          {t('today.volume')}{' '}
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.05}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            aria-label={t('today.volume')}
          />
        </label>
      </div>
    </div>
  );
}

export default function Today({ notify }) {
  const { user, t } = useAuth();
  const username = (user && user.username) || 'guest';
  const [decks, setDecks] = useState(null);
  const [stats, setStats] = useState(null);
  const [habit, setHabit] = useState(() => loadHabit(username));
  const [cursors, setCursors] = useState([]);
  const [examInput, setExamInput] = useState({});
  const [cue, setCue] = useState('dinner');
  const [atTime, setAtTime] = useState('19:00');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/decks');
        setDecks(data);
      } catch {
        setDecks([]);
      }
      try {
        const { data } = await api.get('/stats');
        setStats(data);
      } catch {
        setStats({});
      }
    })();
    setCursors(listCursors());
    const hb = loadHabit(username);
    setHabit(hb);
    setCue((hb.intention && hb.intention.cue) || 'dinner');
    setAtTime((hb.intention && hb.intention.time) || '19:00');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (next) => {
    setHabit(next);
    saveHabit(username, next);
  };

  const dueTotal = (decks || []).reduce((a, d) => a + (d.dueCount || 0), 0);
  const estMin = Math.round(dueTotal * 0.5 + 2);
  const today = studyDayString(Date.now());
  const reviewsToday = useMemo(() => {
    const days = (stats && stats.reviewsPerDay) || [];
    const hit = days.find((d) => d.date === today);
    return hit ? hit.count : 0;
  }, [stats, today]);
  const totalReviews = useMemo(() => {
    const days = (stats && stats.reviewsPerDay) || [];
    return days.reduce((a, d) => a + (d.count || 0), 0);
  }, [stats]);
  const pace = useMemo(() => {
    const days = ((stats && stats.reviewsPerDay) || []).slice(-7);
    if (!days.length) return 0;
    return days.reduce((a, d) => a + (d.count || 0), 0) / days.length;
  }, [stats]);

  const goalMet = reviewsToday >= (habit.goal || 20);
  useEffect(() => {
    if (goalMet && username) markGoalDay(username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalMet]);

  const streak = goalStreak(habit.goalDays, {
    freezes: habit.freezes,
    today: Date.now(),
  });
  useEffect(() => {
    if (streak.streak > 0 && maybeEarnFreeze(username, streak.streak)) {
      setHabit(loadHabit(username));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.streak]);

  const xpToday = (habit.xpDays && habit.xpDays[today]) || 0;
  const level = levelFor(habit.xpTotal || 0);

  const scheduledAhead = (decks || []).reduce(
    (a, d) => a + Math.max(0, (d.cardCount || 0) - (d.dueCount || 0)),
    0
  );

  const weakDeck = useMemo(() => {
    const ds = (decks || []).filter((d) => (d.dueCount || 0) > 0);
    ds.sort((a, b) => (b.dueCount || 0) - (a.dueCount || 0));
    return ds[0] || null;
  }, [decks]);

  const longest = useMemo(() => {
    const uniq = [...new Set(
      ((stats && stats.reviewsPerDay) || []).map((d) => d.date)
    )].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const day of uniq) {
      if (prev) {
        const diff = Math.round(
          (new Date(day + 'T12:00:00') - new Date(prev + 'T12:00:00')) / 86400000
        );
        run = diff === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prev = day;
    }
    return best;
  }, [stats]);

  const ach = checkAchievements({
    totalReviews,
    goalStreak: streak.streak,
    imported: habit.ach.imported,
    tutorChats: habit.ach.tutorChats,
    videosAttached: habit.ach.videosAttached,
    welcomeBackSeen: habit.ach.welcomeBack,
    finishedBefore22: habit.ach.finishedBefore22,
    restDaysTaken: 0,
    goalDays7: habit.goalDays.slice(-7).length,
  });

  const saveWeeklyImage = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = 600;
      cv.height = 320;
      const g = cv.getContext('2d');
      g.fillStyle = '#f7f3ea';
      g.fillRect(0, 0, 600, 320);
      g.fillStyle = '#1c2321';
      g.font = 'bold 34px sans-serif';
      g.fillText(username, 40, 70);
      g.font = '24px sans-serif';
      g.fillText(`${t('nav.streakWord')}: ${streak.streak}`, 40, 130);
      g.fillText(`${t('stats.quizzes')}: ${totalReviews}`, 40, 170);
      g.fillText(`Level ${level} · ${habit.xpTotal || 0} XP`, 40, 210);
      g.fillText(`${t('today.doneMastery')}: ${scheduledAhead}`, 40, 250);
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = 'study-week.png';
      a.click();
    } catch {
      notify(t('set.exportFailed'), 'error');
    }
  };

  const downloadICS = () => {
    const ics = buildICS({ time: atTime, cue });
    persist({ ...habit, intention: { time: atTime, cue } });
    const blob = new Blob([ics], { text: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'study-habit.ics';
    a.click();
  };

  if (!decks) return <Spinner />;

  const done = dueTotal === 0 && reviewsToday > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">{t('today.title')}</h1>

      {!done ? (
        <div className="mt-4 rounded-2xl bg-surface p-6 shadow-md">
          <p className="text-lg">
            {t('today.planLine', { n: dueTotal, m: estMin })}
          </p>
          {weakDeck && (
            <p className="mt-1 text-sm text-muted">
              {t('today.weakLine', { name: weakDeck.name })}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {weakDeck && (
              <Link
                to={`/decks/${weakDeck.id}/study`}
                className="min-h-[44px] rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                {t('today.startPlan')}
              </Link>
            )}
            <Link
              to="/tutor"
              className="min-h-[44px] rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas"
            >
              {t('today.microLesson')}
            </Link>
          </div>
          <div className="mt-4">
            <Ring
              frac={reviewsToday / Math.max(1, habit.goal || 20)}
              label={`${reviewsToday} / ${habit.goal || 20}`}
            />
            <label className="ml-3 text-sm">
              {t('today.goalTarget')}{' '}
              <input
                type="number"
                min={1}
                max={500}
                value={habit.goal || 20}
                onChange={(e) =>
                  persist({ ...habit, goal: Number(e.target.value) || 20 })
                }
                className="w-16 rounded-lg border border-line bg-canvas px-2 py-1 text-base"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-surface p-6 text-center shadow-md">
          <h2 className="font-serif text-2xl font-semibold">
            {t('today.doneTitle')}
          </h2>
          <p className="mt-2 text-base text-muted">
            {t('today.doneBody', { n: reviewsToday })}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t(sleepTipKey())} · {t('today.forecast', { n: scheduledAhead })}
          </p>
          <p className="mt-2 text-sm text-muted">
            XP {xpToday} · {t('nav.streakWord')} {streak.streak}
          </p>
          <Link
            to="/mixed"
            className="mt-4 inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas"
          >
            {t('today.studyExtra')}
          </Link>
        </div>
      )}

      {streak.welcomeBack && (
        <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
          <p className="text-base">{t('today.welcomeBack')}</p>
          {weakDeck && (
            <Link
              to={`/decks/${weakDeck.id}/study`}
              className="mt-2 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('today.restart3')}
            </Link>
          )}
        </div>
      )}

      {cursors.length > 0 && (
        <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
          <h2 className="font-serif text-xl font-semibold">{t('today.resume')}</h2>
          <div className="mt-2 space-y-1">
            {cursors.map((c) => {
              const d = (decks || []).find((x) => x.id === c.deckId);
              if (!d) return null;
              return (
                <Link
                  key={c.deckId}
                  to={`/decks/${c.deckId}/study`}
                  className="block rounded-lg px-2 py-2 text-sm font-medium hover:bg-canvas"
                >
                  {d.name} · {t('study.cardOf', { i: c.index + 1, n: d.dueCount || '?' })}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-base">
          <span>
            Level {level} · {habit.xpTotal || 0} XP
          </span>
          <span>
            {t('today.xpToday')}: {xpToday} / {DAILY_XP_CAP}
          </span>
          <span>
            {t('nav.streakWord')}: {streak.streak} · {t('today.freezes')}:{' '}
            {streak.freezes} · {t('today.longest')}: {longest}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">{t('today.exam')}</h2>
        {(decks || []).slice(0, 6).map((d) => {
          const date = examInput[d.id] ?? habit.examDates[d.id] ?? '';
          const plan = date
            ? examPlan({
              examDate: date,
              totalCards: d.cardCount || 0,
              matureCards: 0,
              reviewsPerDay: pace,
            })
            : null;
          return (
            <div key={d.id} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{d.name}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  setExamInput((s) => ({ ...s, [d.id]: v }));
                  persist({
                    ...habit,
                    examDates: { ...habit.examDates, [d.id]: v },
                  });
                }}
                className="rounded-lg border border-line bg-canvas px-2 py-1 text-base"
                aria-label={d.name}
              />
              {plan && (
                <span className="text-muted">
                  {t('today.examReq', { n: plan.required, d: plan.daysLeft })} ·{' '}
                  {t('today.exam' + plan.status[0].toUpperCase() + plan.status.slice(1).replace('-', ''))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">{t('today.intention')}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label>
            {t('today.atTime')}{' '}
            <input
              type="time"
              value={atTime}
              onChange={(e) => setAtTime(e.target.value)}
              className="rounded-lg border border-line bg-canvas px-2 py-1 text-base"
            />
          </label>
          <label>
            {t('today.afterCue')}{' '}
            <input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              maxLength={40}
              className="w-32 rounded-lg border border-line bg-canvas px-2 py-1 text-base"
            />
          </label>
          <button
            onClick={downloadICS}
            className="min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas"
          >
            {t('today.dlIcs')}
          </button>
        </div>
      </div>

      <FocusTools t={t} soundOn={wellbeingSounds()} />

      <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">{t('today.weekly')}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('today.weeklyLine', { n: totalReviews })}
        </p>
        <button
          onClick={saveWeeklyImage}
          className="mt-2 min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas"
        >
          {t('today.weeklySave')}
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-5 shadow-md">
        <h2 className="font-serif text-xl font-semibold">{t('today.ach')}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-3 text-sm ${
                ach[a.id] ? 'border-ink' : 'border-line opacity-60'
              }`}
            >
              <span aria-hidden="true" className="mr-2 text-xl">
                {a.icon}
              </span>
              {t('ach.' + a.id)}
            </div>
          ))}
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
