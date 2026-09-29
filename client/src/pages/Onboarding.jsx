import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { LANGS_UI, uiLangOf } from '../lib/i18n';
import { LANGS } from './DeckEditor';
import { getAdapter } from '../lib/storage';
import { tutorialDone } from './Tutorial';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base focus:border-ink focus:outline-none';

// Goal presets: only set defaults + suggest starter decks.
const GOALS = {
  exam: { days: 6, minutes: 30 },
  language: { days: 7, minutes: 15 },
  knowledge: { days: 3, minutes: 15 },
  work: { days: 4, minutes: 20 },
};

function Dots({ step, total }) {
  return (
    <div className="mb-4 flex gap-2" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
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

export default function Onboarding({ notify }) {
  const { user, refreshMe, t, lang } = useAuth();
  const navigate = useNavigate();
  // Steps: 0 = language, 1 = goal + study prefs, 2 = first deck
  // (+ examples), 3 = guessing note + AI choice.
  const [step, setStep] = useState(0);
  const [uiLang, setUiLang] = useState(lang || 'en');
  const [goal, setGoal] = useState('knowledge');
  const [learnLangs, setLearnLangs] = useState([]);
  const [aiChoice, setAiChoice] = useState('skip');
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(15);
  const [deckName, setDeckName] = useState('');
  const [pretest, setPretest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesLoaded, setExamplesLoaded] = useState(0);

  const username = (user && user.username) || 'guest';

  const pickGoal = (g) => {
    setGoal(g);
    const p = GOALS[g];
    if (p) {
      setDays(p.days);
      setMinutes(p.minutes);
    }
  };

  const toggleLearn = (code) => {
    setLearnLangs((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code].slice(0, 6)
    );
  };

  const pickLang = async (v) => {
    setUiLang(v);
    try {
      await api.put('/users/me/appearance', { uiLang: v });
      await refreshMe();
    } catch (err) {
      notify(err.response?.data?.error || t('onboard.saveFailed'), 'error');
    }
  };

  const loadExamples = async () => {
    setExamplesLoading(true);
    try {
      const { data } = await api.post('/examples/lithuanian');
      setExamplesLoaded(data.created);
      notify(t('onboard.examplesDone', { n: data.created }), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('onboard.examplesFailed'), 'error');
    } finally {
      setExamplesLoading(false);
    }
  };

  const savePrefs = async (onboarded) => {
    setSaving(true);
    try {
      await api.put('/users/me/prefs', { daysPerWeek: days, minutesPerSession: minutes, onboarded });
      await refreshMe();
      return true;
    } catch (err) {
      notify(err.response?.data?.error || t('onboard.saveFailed'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    let deckId = null;
    if (deckName.trim()) {
      try {
        const { data } = await api.post('/decks', { name: deckName.trim(), subject: '', type: 'general' });
        deckId = data.id;
        if (pretest) {
          await api.patch(`/decks/${data.id}/study-modes`, { pretest: true });
        }
      } catch (err) {
        notify(err.response?.data?.error || t('onboard.createFailed'), 'error');
        return;
      }
    }
    // Browser-side profile: goal, learning languages, AI choice.
    try {
      getAdapter().set('profile.' + username, {
        displayName: '',
        avatar: '🦊',
        learningLangs: learnLangs,
        goal,
        aiChoice,
      });
    } catch {
      /* profile is best-effort */
    }
    if (await savePrefs(true)) {
      notify(t('onboard.done'), 'success');
      if (tutorialDone()) {
        navigate(deckId ? `/decks/${deckId}/edit` : '/');
      } else {
        navigate('/tutorial');
      }
    }
  };

  const titles = [t('onboard.langTitle'), t('onboard.s0title'), t('onboard.s1title'), t('onboard.s2title')];

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <p className="font-serif text-3xl font-bold">StudyApp</p>
      <p className="mt-1 text-base text-muted">{titles[step]}</p>

      <div className="mt-6 rounded-2xl bg-surface p-8 shadow-md">
        <Dots step={step} total={titles.length} />
        {step === 0 && (
          <>
            <p className="text-base">{t('onboard.langBody')}</p>
            <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label={t('onboard.langTitle')}>
              {LANGS_UI.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={uiLangOf(uiLang) === l.value}
                  onClick={() => pickLang(l.value)}
                  className={`rounded-lg border px-5 py-2.5 text-base font-semibold transition-colors ${
                    uiLangOf(uiLang) === l.value
                      ? 'border-ink bg-ink text-white'
                      : 'border-line hover:bg-canvas'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="mb-1 mt-6 text-sm font-medium">
              {t('onboard.learnLangsTitle')}
            </p>
            <p className="mb-2 text-sm text-muted">
              {t('onboard.learnLangsHint')}
            </p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={learnLangs.includes(l.code)}
                  onClick={() => toggleLearn(l.code)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    learnLangs.includes(l.code)
                      ? 'border-ink bg-ink text-white'
                      : 'border-line hover:bg-canvas'
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-6 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
            >
              {t('onboard.continue')}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <p className="mb-3 text-sm font-medium">
              {t('onboard.goalTitle')}
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {['exam', 'language', 'knowledge', 'work'].map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={goal === g}
                  onClick={() => pickGoal(g)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                    goal === g
                      ? 'border-ink bg-ink text-white'
                      : 'border-line hover:bg-canvas'
                  }`}
                >
                  {t('onboard.goal' + g[0].toUpperCase() + g.slice(1))}
                </button>
              ))}
            </div>
            <p className="mt-5 text-base">{t('onboard.s0body')}</p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ob-days" className="mb-1 block text-sm font-medium">{t('onboard.days')}</label>
                <input id="ob-days" type="number" min={1} max={7} value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ob-minutes" className="mb-1 block text-sm font-medium">{t('onboard.minutes')}</label>
                <input id="ob-minutes" type="number" min={5} max={180} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputCls} />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-canvas">
                {t('onboard.back')}
              </button>
              <button
                onClick={async () => {
                  if (await savePrefs(false)) setStep(2);
                }}
                disabled={saving}
                className="flex-1 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {t('onboard.continue')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-base">{t('onboard.s1body')}</p>
            <label htmlFor="ob-deck" className="mb-1 mt-5 block text-sm font-medium">{t('onboard.deckOptional')}</label>
            <input id="ob-deck" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder={t('onboard.deckPh')} className={inputCls} />
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={pretest} onChange={(e) => setPretest(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--ink)]" />
              <span>
                <span className="block text-sm font-semibold">{t('onboard.pretestT')}</span>
                <span className="block text-sm text-muted">
                  {t('onboard.pretestB')}
                </span>
              </span>
            </label>
            {uiLangOf(uiLang) === 'lt' && (
              <div className="mt-5 rounded-xl border border-line p-4">
                <p className="text-base font-semibold">{t('onboard.examplesAsk')}</p>
                <p className="mt-1 text-sm text-muted">{t('onboard.examplesBody')}</p>
                <button
                  onClick={loadExamples}
                  disabled={examplesLoading || examplesLoaded > 0}
                  className="mt-3 w-full rounded-lg border border-ink px-4 py-2.5 font-semibold text-ink hover:bg-canvas disabled:opacity-50"
                >
                  {examplesLoading
                    ? t('common.loading')
                    : examplesLoaded > 0
                      ? t('onboard.examplesDone', { n: examplesLoaded })
                      : t('onboard.loadExamples')}
                </button>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-canvas">
                {t('onboard.back')}
              </button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90">
                {t('onboard.continue')}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-base">{t('onboard.s2body')}</p>
            <p className="mb-1 mt-6 text-sm font-medium">
              {t('onboard.aiTitle')}
            </p>
            <div className="space-y-2" role="radiogroup">
              {['add', 'skip', 'offline'].map((c) => (
                <label
                  key={c}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    aiChoice === c ? 'border-ink' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="ob-ai"
                    checked={aiChoice === c}
                    onChange={() => setAiChoice(c)}
                    className="mt-1 h-4 w-4 accent-[var(--ink)]"
                  />
                  <span className="text-sm">
                    {t('onboard.ai' + c[0].toUpperCase() + c.slice(1))}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-canvas">
                {t('onboard.back')}
              </button>
              <button onClick={finish} disabled={saving} className="flex-1 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {saving ? t('onboard.saving') : t('onboard.start')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
