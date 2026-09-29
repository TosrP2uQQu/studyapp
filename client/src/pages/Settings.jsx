import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { ACCENTS, BODY_FONTS, FONT_STACKS, HEADING_FONTS, useAuth } from '../context/AuthContext';
import { LANGS_UI } from '../lib/i18n';
import { Segmented, Toggle } from '../components/controls';
import Combobox from '../components/Combobox';
import FlashCard from '../components/FlashCard';
import Spinner from '../components/Spinner';
import { OLLAMA_SUGGESTION, testOllama } from '../lib/aiClient';
import AiDiagnostics from '../components/AiDiagnostics';
import { getBrowserKey, setBrowserKey } from '../lib/keys';
import { getAdapter } from '../lib/storage';

function loadWellbeing() {
  try {
    return getAdapter().get('wellbeing') || {};
  } catch {
    return {};
  }
}
import { cardWord } from '../lib/i18n';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-primary focus:border-ink focus:outline-none';

const PRIVACY_NOTE =
  'If you use Anthropic or OpenAI here, requests go straight from your own computer to their API using your own key — never through any server we run. Both companies\' standard API terms say they don\'t use API requests to train their models by default, and both keep a copy of requests for about 30 days for abuse monitoring before deleting it, unless a business has separately arranged otherwise with them. That\'s different from their free consumer chat apps, which can have different defaults. If you\'d rather nothing leave your computer at all, use the Local (Ollama) option instead — it needs no key and no internet connection.';

const SHORTCUTS = [
  ['Space or Enter', 'set.scFlip'],
  ['1 or H', 'set.scHard'],
  ['2 or O', 'set.scOk'],
  ['3', 'set.scEasy'],
  ['Z or Ctrl+Z', 'set.scUndo'],
  ['E', 'set.scEdit'],
  ['T', 'set.scTutor'],
  ['V', 'set.scVideo'],
  ['?', 'set.scSheet'],
  ['Ctrl+K', 'set.scPalette'],
];

const CLOUD = ['anthropic', 'openai', 'gemini', 'mistral', 'groq'];

function Section({ title, children }) {
  return (
    <section className="mt-6 rounded-2xl bg-surface p-6 shadow-md">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <div className="mt-2 divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

function Row({ children }) {
  return <div className="row-divider py-1">{children}</div>;
}

export default function Settings({ notify }) {
  const { refreshMe, t, lang } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('simple');

  const [appearance, setAppearance] = useState(null);
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(15);
  const [cap, setCap] = useState('none');
  const [reminder, setReminder] = useState(true);
  const [defaults, setDefaults] = useState({ typedRecall: false, pretest: false, elaborativePrompts: false });

  const [aiProvider, setAiProvider] = useState('none');
  const [apiKey, setApiKey] = useState('');
  const [keyLast4, setKeyLast4] = useState('');
  const [baseUrl, setBaseUrl] = useState(OLLAMA_SUGGESTION);
  const [model, setModel] = useState('');
  const [gradingTiming, setGradingTiming] = useState('immediate');
  const [gradingStrictness, setGradingStrictness] = useState('standard');
  const [configured, setConfigured] = useState(false);
  const [aiLog, setAiLog] = useState(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [delPw, setDelPw] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [wb, setWb] = useState(loadWellbeing);

  const setWellbeing = (patch) => {
    setWb((prev) => {
      const next = { ...prev, ...patch };
      try {
        getAdapter().set('wellbeing', next);
      } catch {
        /* best effort */
      }
      return next;
    });
  };
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewFlipped, setPreviewFlipped] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users/me');
      setMode(data.settingsMode || 'simple');
      setAppearance(data.appearance);
      setDays(data.studyPrefs?.daysPerWeek ?? 4);
      setMinutes(data.studyPrefs?.minutesPerSession ?? 15);
      setCap(data.studyPrefs?.sessionCardCap == null ? 'none' : String(data.studyPrefs.sessionCardCap));
      setReminder(data.studyPrefs?.reminderBannerEnabled !== false);
      setDefaults({ typedRecall: false, pretest: false, elaborativePrompts: false, ...(data.defaultStudyModes || {}) });
      setAiProvider(data.ai?.provider || 'none');
      setKeyLast4(data.ai?.keyLast4 || '');
      setBaseUrl(data.ai?.baseUrl || OLLAMA_SUGGESTION);
      setModel(data.ai?.model || '');
      setGradingTiming(data.ai?.gradingTiming === 'end' ? 'end' : 'immediate');
      setGradingStrictness(['lenient', 'standard', 'strict'].includes(data.ai?.gradingStrictness) ? data.ai.gradingStrictness : 'standard');
      setConfigured(Boolean(data.ai?.configured));
    } catch (err) {
      notify(err.response?.data?.error || t('set.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipMode = async (m) => {
    setMode(m);
    try {
      await api.put('/users/me/settings-mode', { settingsMode: m });
      await refreshMe();
    } catch (err) {
      notify(err.response?.data?.error || t('set.modeFailed'), 'error');
    }
  };

  const saveAppearance = async () => {
    setSaving(true);
    try {
      await api.put('/users/me/appearance', appearance);
      await refreshMe();
      notify(t('set.appearanceSaved'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // UI language saves instantly (no separate save click): partial PUT so
  // one unrelated invalid draft value can never block a language change.
  const saveLang = async (v) => {
    const prev = appearance;
    setAppearance({ ...appearance, uiLang: v });
    try {
      await api.put('/users/me/appearance', { uiLang: v });
      await refreshMe();
      notify(t('set.langSaved'), 'success');
    } catch (err) {
      setAppearance(prev);
      notify(err.response?.data?.error || t('set.saveFailed'), 'error');
    }
  };

  const saveStudy = async () => {
    setSaving(true);
    try {
      await api.put('/users/me/study-prefs', {
        daysPerWeek: days,
        minutesPerSession: minutes,
        sessionCardCap: cap === 'none' ? null : Number(cap),
        reminderBannerEnabled: reminder,
      });
      await api.put('/users/me/default-study-modes', defaults);
      await refreshMe();
      notify(t('set.studySaved'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async () => {
    setSaving(true);
    try {
      const body = { provider: aiProvider, gradingTiming, gradingStrictness };
      if (CLOUD.includes(aiProvider) || aiProvider === 'custom') {
        if (apiKey.trim()) body.apiKey = apiKey.trim();
      }
      if (aiProvider === 'ollama' || aiProvider === 'custom') {
        body.baseUrl = baseUrl.trim();
      }
      if (model.trim()) body.model = model.trim();
      const { data } = await api.put('/users/me/ai-settings', body);
      setKeyLast4(data.ai?.keyLast4 || '');
      setConfigured(Boolean(data.ai?.configured));
      // Browser copy for the tutor/diagnostics: session-only unless
      // "Remember on this device" is checked. Never logged.
      if ((CLOUD.includes(aiProvider) || aiProvider === 'custom') && apiKey.trim()) {
        setBrowserKey(aiProvider, apiKey.trim(), rememberKey);
      }
      setApiKey('');
      await refreshMe();
      notify(t('set.aiSaved'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const testAi = async () => {
    setTesting(true);
    try {
      // Local is tested from this browser against the person's own base
      // URL — never through the server.
      if (aiProvider === 'ollama') {
        const r = await testOllama({ baseUrl: baseUrl.trim() });
        notify(
          r.models.length > 0
            ? `Reachable. Models on your machine: ${r.models.slice(0, 5).join(', ')}`
            : 'Reachable, but no models listed. Pull one first (e.g. ollama pull llama3.1).',
          'success'
        );
        return;
      }
      const body = { provider: aiProvider };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (aiProvider === 'custom') {
        body.baseUrl = baseUrl.trim();
        if (model.trim()) body.model = model.trim();
      } else if (model.trim()) {
        body.model = model.trim();
      }
      const { data } = await api.post('/users/me/ai-settings/test', body);
      notify(data.ok ? `${t('set.keyWorks')}${data.sample}` : t('set.keyFails'), data.ok ? 'success' : 'error');
    } catch (err) {
      notify(err.response?.data?.error || err.message || t('set.testFailed'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const disconnectAi = async () => {
    try {
      await api.put('/users/me/ai-settings', { provider: 'none' });
      setBrowserKey(aiProvider, '', false);
      setAiProvider('none');
      setApiKey('');
      setKeyLast4('');
      setConfigured(false);
      await refreshMe();
      notify(t('set.disconnected'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.disconnectFailed'), 'error');
    }
  };

  const loadLog = async () => {
    try {
      const { data } = await api.get('/users/me/ai-log');
      setAiLog(data.entries || []);
    } catch (err) {
      notify(err.response?.data?.error || t('set.logFailed'), 'error');
    }
  };

  const changePassword = async () => {
    if (newPw !== newPw2) {
      notify(t('set.pwMismatch'), 'error');
      return;
    }
    try {
      await api.put('/users/me/password', { currentPassword: curPw, newPassword: newPw });
      setCurPw('');
      setNewPw('');
      setNewPw2('');
      notify(t('set.pwChanged'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.pwFailed'), 'error');
    }
  };

  const exportAll = async () => {
    try {
      const { data } = await api.post('/users/me/export-all', {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studyapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      notify(t('set.exported'), 'success');
    } catch (err) {
      notify(err.response?.data?.error || t('set.exportFailed'), 'error');
    }
  };

  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      notify(t('set.importBadJson'), 'error');
      return;
    }
    const replace = window.confirm(
      t('set.importAsk')
    );
    if (replace && !window.confirm(t('set.importAsk2'))) return;
    try {
      const { data } = await api.post('/users/me/import', { backup, mode: replace ? 'replace' : 'merge' });
      await refreshMe();
      notify(t('set.imported', { n: `${data.decks} ${cardWord(lang, data.decks)}` }), 'success');
    } catch (err) {
      notify(t('set.importFailed'), 'error');
    }
  };

  const deleteAccount = async () => {
    if (!delPw) {
      notify(t('set.needDelPw'), 'error');
      return;
    }
    try {
      await api.delete('/users/me', { data: { currentPassword: delPw } });
      window.location.href = '/login';
    } catch (err) {
      notify(err.response?.data?.error || t('set.deleteFailed'), 'error');
    }
  };

  if (loading || !appearance) return <Spinner />;

  const providers = [
    { value: 'off', label: t('set.pOff'), description: t('set.pOffD') },
    { value: 'anthropic', label: 'Anthropic (Claude)', description: t('set.pAnthropicD') },
    { value: 'openai', label: 'OpenAI', description: t('set.pOpenaiD') },
    { value: 'gemini', label: 'Google (Gemini)', description: t('set.pGeminiD') },
    { value: 'mistral', label: 'Mistral', description: t('set.pMistralD') },
    { value: 'groq', label: 'Groq', description: t('set.pGroqD') },
    { value: 'ollama', label: t('set.pLocal'), description: t('set.pLocalD') },
    { value: 'custom', label: t('set.pCustom'), description: t('set.pCustomD') },
  ];

  const setA = (patch) => setAppearance({ ...appearance, ...patch });
  const isDark = document.documentElement.classList.contains('dark');
  const draftAccent = (ACCENTS[appearance.accentColor] || ACCENTS.ink)[isDark ? 'dark' : 'light'];

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">{t('set.title')}</h1>

      <div className="mt-4 rounded-2xl bg-surface p-6 shadow-md">
        <Segmented
          name="settings-mode"
          label={t('set.modeLabel')}
          options={[
            { value: 'simple', label: t('set.simple') },
            { value: 'advanced', label: t('set.advanced') },
          ]}
          value={mode}
          onChange={flipMode}
        />
      </div>

      <Section title={t('set.appearance')}>
        <Row>
          <Segmented
            name="theme"
            label={t('set.theme')}
            options={[
              { value: 'light', label: t('set.light') },
              { value: 'dark', label: t('set.dark') },
              { value: 'system', label: t('set.system') },
            ]}
            value={appearance.theme}
            onChange={(v) => setA({ theme: v })}
          />
        </Row>
        <Row>
          <Segmented
            name="app-lang"
            label={t('set.appLang')}
            options={LANGS_UI}
            value={appearance.uiLang || 'en'}
            onChange={saveLang}
          />
        </Row>
        <Row>
          <Segmented
            name="font-size"
            label={t('set.fontSize')}
            hint={t('set.fontHint')}
            options={[
              { value: 'small', label: t('set.small') },
              { value: 'medium', label: t('set.medium') },
              { value: 'large', label: t('set.large') },
              { value: 'xlarge', label: t('set.xlarge') },
            ]}
            value={appearance.fontSizeStep}
            onChange={(v) => setA({ fontSizeStep: v })}
          />
        </Row>
        {mode === 'advanced' && (
          <>
            <Row>
              <Combobox
                id="heading-font"
                label={t('set.headingFont')}
                hint={t('set.fontHint')}
                options={HEADING_FONTS}
                value={appearance.headingFont}
                onChange={(v) => setA({ headingFont: v })}
              />
            </Row>
            <Row>
              <Combobox
                id="body-font"
                label={t('set.bodyFont')}
                hint={t('set.fontHint')}
                options={BODY_FONTS}
                value={appearance.bodyFont}
                onChange={(v) => setA({ bodyFont: v })}
              />
            </Row>
            <Row>
              <Segmented
                name="accent"
                label={t('set.accent')}
                hint={t('set.accentHint')}
                options={[
                  { value: 'ink', label: t('set.ink') },
                  { value: 'plum', label: t('set.plum') },
                  { value: 'teal', label: t('set.teal') },
                ]}
                value={appearance.accentColor}
                onChange={(v) => setA({ accentColor: v })}
              />
            </Row>
            <Row>
              <Segmented
                name="density"
                label={t('set.density')}
                options={[
                  { value: 'compact', label: t('set.compact') },
                  { value: 'comfortable', label: t('set.comfortable') },
                  { value: 'spacious', label: t('set.spacious') },
                ]}
                value={appearance.density}
                onChange={(v) => setA({ density: v })}
              />
            </Row>
            <Row>
              <Segmented
                name="flip"
                label={t('set.flipStyle')}
                options={[
                  { value: 'flip', label: t('set.flip') },
                  { value: 'fade', label: t('set.fade') },
                  { value: 'slide', label: t('set.slide') },
                ]}
                value={appearance.flipStyle}
                onChange={(v) => setA({ flipStyle: v })}
              />
            </Row>
            <Row>
              <Segmented
                name="motion"
                label={t('set.motion')}
                options={[
                  { value: 'system', label: t('set.matchSystem') },
                  { value: 'always', label: t('set.alwaysReduce') },
                  { value: 'never', label: t('set.neverReduce') },
                ]}
                value={appearance.reduceMotion}
                onChange={(v) => setA({ reduceMotion: v })}
              />
            </Row>
          </>
        )}
        <div className="pt-4">
          <p className="mb-2 text-sm font-medium">{t('set.preview')}</p>
          <div
            style={{
              '--ink': draftAccent,
              '--font-head': FONT_STACKS[appearance.headingFont] || FONT_STACKS['source-serif-4'],
            }}
          >
            <FlashCard
              front="la biblioteca"
              back="library"
              flipped={previewFlipped}
              flipStyle={appearance.flipStyle}
              onFlip={() => setPreviewFlipped((f) => !f)}
            />
          </div>
          <button
            onClick={saveAppearance}
            disabled={saving}
            className="mt-4 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('set.saving') : t('set.saveAppearance')}
          </button>
        </div>
      </Section>

      <Section title={t('set.study')}>
        <Row>
          <Segmented
            name="cap"
            label={t('set.cap')}
            hint={t('set.capHint')}
            options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '40', label: '40' },
              { value: 'none', label: t('set.noLimit') },
            ]}
            value={cap}
            onChange={setCap}
          />
        </Row>
        <Row>
          <div className="grid grid-cols-2 gap-4 py-3">
            <div>
              <label htmlFor="set-days" className="mb-1 block text-sm font-medium">{t('set.days')}</label>
              <input id="set-days" type="number" min={1} max={7} value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label htmlFor="set-minutes" className="mb-1 block text-sm font-medium">{t('set.minutes')}</label>
              <input id="set-minutes" type="number" min={5} max={180} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted">{t('set.studyHint')}</p>
        </Row>
        <Row>
          <Toggle
            id="set-reminder"
            label={t('set.reminder')}
            hint={t('set.reminderHint')}
            checked={reminder}
            onChange={setReminder}
          />
        </Row>
        {mode === 'advanced' && (
          <Row>
            <div className="py-3">
              <p className="text-sm font-semibold">{t('set.newDecksStart')}</p>
              <p className="mt-0.5 text-sm text-muted">{t('set.defaultsHint')}</p>
              <Toggle id="def-typed" label={t('set.typedD')} checked={defaults.typedRecall} onChange={(v) => setDefaults({ ...defaults, typedRecall: v })} />
              <Toggle id="def-pretest" label={t('set.pretestD')} checked={defaults.pretest} onChange={(v) => setDefaults({ ...defaults, pretest: v })} />
              <Toggle id="def-elab" label={t('set.elabD')} checked={defaults.elaborativePrompts} onChange={(v) => setDefaults({ ...defaults, elaborativePrompts: v })} />
            </div>
          </Row>
        )}
        {mode === 'advanced' && (
          <Row>
            <div className="py-3">
              <p className="text-sm font-semibold">{t('set.shortcuts')}</p>
              <div className="mt-2 divide-y divide-[var(--border)]">
                {SHORTCUTS.map(([keys, key]) => (
                  <div key={keys} className="row-divider flex items-baseline justify-between gap-4 py-1.5 text-sm">
                    <span className="text-muted">{t(key)}</span>
                    <span className="font-medium">{keys}</span>
                  </div>
                ))}
              </div>
            </div>
          </Row>
        )}
        <div className="pt-3">
          <button
            onClick={saveStudy}
            disabled={saving}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('set.saving') : t('set.saveStudy')}
          </button>
          <p className="mt-4 text-sm text-muted">
            {t('set.retake')} <Link to="/onboarding" className="font-semibold text-ink hover:underline">{t('set.retakeLink')}</Link>
          </p>
          <p className="mt-2 text-sm text-muted">
            {t('set.replayHelp')} <Link to="/tutorial" className="font-semibold text-ink hover:underline">{t('set.replayLink')}</Link>
          </p>
        </div>
      </Section>

      <Section title={t('set.ai')}>
        <Row>
          <Combobox
            id="ai-provider"
            label={t('set.provider')}
            hint={t('set.aiHint')}
            options={providers}
            value={aiProvider === 'none' ? 'off' : aiProvider}
            onChange={(v) => setAiProvider(v === 'off' ? 'none' : v)}
          />
        </Row>
        <Row>
          <Segmented
            name="grading-timing"
            label={t('set.timing')}
            hint={t('set.timingHint')}
            options={[
              { value: 'immediate', label: t('set.timingNow') },
              { value: 'end', label: t('set.timingEnd') },
            ]}
            value={gradingTiming}
            onChange={setGradingTiming}
          />
        </Row>
        {(CLOUD.includes(aiProvider) || aiProvider === 'custom') && (
          <Row>
            <div className="py-3">
              <label htmlFor="set-apikey" className="mb-1 block text-sm font-medium">
                {t('set.apikey')}{keyLast4 ? ` (${t('set.keySaved')} ${keyLast4})` : ''}
              </label>
              <input
                id="set-apikey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyLast4 ? t('set.keyBlank') : t('set.keyPaste')}
                autoComplete="off"
                className={inputCls}
              />
              <p className="mt-2 text-sm text-muted">{t('set.browserKeyHint')}</p>
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                {t('set.rememberKey')}
              </label>
            </div>
          </Row>
        )}
        {(aiProvider === 'ollama' || aiProvider === 'custom') && (
          <Row>
            <div className="py-3">
              {aiProvider === 'ollama' && (
                <>
                  <p className="mb-2 text-sm text-muted">
                    {t('set.ollamaPrivate')}
                  </p>
                  <p className="mb-2 text-sm text-muted">
                    {t('set.ollamaOrigins')}
                  </p>
                </>
              )}
              <label htmlFor="set-baseurl" className="mb-1 block text-sm font-medium">{t('set.baseUrl')}</label>
              <input
                id="set-baseurl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={aiProvider === 'ollama' ? OLLAMA_SUGGESTION : t('set.urlPh')}
                className={inputCls}
              />
            </div>
          </Row>
        )}
        {mode === 'advanced' && aiProvider !== 'none' && aiProvider !== 'ollama' && (
          <Row>
            <div className="py-3">
              <label htmlFor="set-model" className="mb-1 block text-sm font-medium">{t('set.model')}</label>
              <input id="set-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('set.noModel')} className={inputCls} />
            </div>
          </Row>
        )}
        {mode === 'advanced' && aiProvider === 'ollama' && (
          <Row>
            <div className="py-3">
              <label htmlFor="set-model" className="mb-1 block text-sm font-medium">{t('set.modelName')}</label>
              <input id="set-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3.1" className={inputCls} />
            </div>
          </Row>
        )}
        {mode === 'advanced' && (
          <Row>
            <Segmented
              name="grading-strictness"
              label="Grading strictness"
              hint="How forgiving the AI is about near-misses when grading written answers."
              options={[
                { value: 'lenient', label: 'Lenient' },
                { value: 'standard', label: 'Standard' },
                { value: 'strict', label: 'Strict' },
              ]}
              value={gradingStrictness}
              onChange={setGradingStrictness}
            />
          </Row>
        )}
        <Row>
          <p className="py-3 text-sm leading-relaxed text-muted">{PRIVACY_NOTE}</p>
        </Row>
        {aiProvider !== 'none' && (
          <Row>
            <div className="flex gap-2 py-3">
              <button onClick={saveAi} disabled={saving} className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {saving ? t('set.saving') : t('set.saveAi')}
              </button>
              <button onClick={testAi} disabled={testing} className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas disabled:opacity-50">
                {testing ? t('set.testing') : t('set.test')}
              </button>
            </div>
          </Row>
        )}
        {aiProvider === 'none' && (
          <Row>
            <div className="py-3">
              <button onClick={saveAi} disabled={saving} className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {configured ? t('set.turnOff') : t('set.save')}
              </button>
            </div>
          </Row>
        )}
        {mode === 'advanced' && (
          <>
            <Row>
              <div className="py-3">
                <p className="text-sm font-semibold">{t('set.logTitle')}</p>
                <p className="mt-0.5 text-sm text-muted">{t('set.logHint')}</p>
                {!aiLog ? (
                  <button onClick={loadLog} className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
                    {t('set.showLog')}
                  </button>
                ) : aiLog.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t('set.logEmpty')}</p>
                ) : (
                  <div className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-line">
                    {aiLog.map((e, i) => (
                      <div key={i} className="row-divider flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
                        <span className="font-medium">{e.feature}</span>
                        <span className="text-muted">{e.provider}, {e.bytesSent} {t('set.bytesUnit')}, {e.timestamp.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Row>
            {configured && (
              <Row>
                <div className="py-3">
                  <button onClick={disconnectAi} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-clay hover:bg-canvas">
                    {t('set.disconnect')}
                  </button>
                </div>
              </Row>
            )}
            <Row>
              <AiDiagnostics
                provider={aiProvider}
                apiKey={apiKey.trim() || getBrowserKey(aiProvider)}
                baseUrl={baseUrl.trim()}
                model={model.trim()}
              />
            </Row>
          </>
        )}
      </Section>

      <Section title={t('set.wellbeing')}>
        <Row>
          <Toggle
            id="wb-break"
            label={t('well.breakNudge')}
            hint={t('well.breakHint')}
            checked={wb.breakNudge !== false}
            onChange={(v) => setWellbeing({ breakNudge: v })}
          />
        </Row>
        <Row>
          <div className="py-3">
            <label htmlFor="wb-break-min" className="mb-1 block text-sm font-medium">
              {t('well.breakAfter')}
            </label>
            <input
              id="wb-break-min"
              type="number"
              min={15}
              max={180}
              step={5}
              value={wb.breakAfterMin == null ? 45 : wb.breakAfterMin}
              onChange={(e) => setWellbeing({ breakAfterMin: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        </Row>
        <Row>
          <Toggle
            id="wb-late"
            label={t('well.lateNudge')}
            hint={t('well.lateHint')}
            checked={wb.lateNudge !== false}
            onChange={(v) => setWellbeing({ lateNudge: v })}
          />
        </Row>
        <Row>
          <Toggle
            id="wb-celeb"
            label={t('well.celebrations')}
            hint={t('well.celebrationsHint')}
            checked={wb.celebrations !== false}
            onChange={(v) => setWellbeing({ celebrations: v })}
          />
        </Row>
        <Row>
          <Toggle
            id="wb-sounds"
            label={t('well.sounds')}
            hint={t('well.soundsHint')}
            checked={wb.sounds === true}
            onChange={(v) => setWellbeing({ sounds: v })}
          />
        </Row>
        <Row>
          <Toggle
            id="wb-remind"
            label={t('well.reminders')}
            hint={t('well.remindersHint')}
            checked={wb.reminders === true}
            onChange={(v) => setWellbeing({ reminders: v })}
          />
        </Row>
        <Row>
          <Toggle
            id="wb-streak"
            label={t('well.hideStreak')}
            hint={t('well.hideStreakHint')}
            checked={wb.hideStreak === true}
            onChange={(v) => setWellbeing({ hideStreak: v })}
          />
        </Row>
      </Section>

      <Section title={t('set.account')}>
        <Row>
          <div className="grid gap-3 py-3">
            <p className="text-sm font-semibold">{t('set.changePw')}</p>
            <div>
              <label htmlFor="pw-current" className="mb-1 block text-sm font-medium">{t('set.currentPw')}</label>
              <input id="pw-current" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" className={inputCls} />
            </div>
            <div>
              <label htmlFor="pw-new" className="mb-1 block text-sm font-medium">{t('set.newPw')}</label>
              <input id="pw-new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label htmlFor="pw-new2" className="mb-1 block text-sm font-medium">{t('set.newPw2')}</label>
              <input id="pw-new2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <button onClick={changePassword} className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas">
                {t('set.changePw')}
              </button>
            </div>
          </div>
        </Row>
        {mode === 'advanced' && (
          <>
            <Row>
              <div className="py-3">
                <p className="text-sm font-semibold">{t('set.export')}</p>
                <p className="mt-0.5 text-sm text-muted">{t('set.exportHint')}</p>
                <button onClick={exportAll} className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
                  {t('set.export')}
                </button>
              </div>
            </Row>
            <Row>
              <div className="py-3">
                <p className="text-sm font-semibold">{t('set.import')}</p>
                <p className="mt-0.5 text-sm text-muted">{t('set.importHint')}</p>
                <label htmlFor="import-file" className="mt-2 inline-block cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
                  {t('set.chooseFile')}
                </label>
                <input id="import-file" type="file" accept="application/json" onChange={importBackup} className="sr-only" />
              </div>
            </Row>
            <Row>
              <div className="py-3">
                <p className="text-sm font-semibold">{t('set.delete')}</p>
                <p className="mt-0.5 text-sm text-muted">{t('set.deleteHint')}</p>
                {!confirmingDelete ? (
                  <button onClick={() => setConfirmingDelete(true)} className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-clay hover:bg-canvas">
                    {t('set.delete')}
                  </button>
                ) : (
                  <div className="mt-2 grid gap-2">
                    <label htmlFor="del-password" className="text-sm font-medium">{t('set.delConfirm')}</label>
                    <input id="del-password" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" className={inputCls} />
                    <div className="flex gap-2">
                      <button onClick={deleteAccount} className="rounded-lg bg-clay px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                        {t('set.confirmDelete')}
                      </button>
                      <button onClick={() => { setConfirmingDelete(false); setDelPw(''); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
                        {t('set.keepAccount')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Row>
          </>
        )}
      </Section>

      <Section title={t('set.highlighter')}>
        <p className="py-3 text-sm leading-relaxed text-muted">
          {t('set.highlighterBody')}
        </p>
      </Section>

      {mode === 'simple' && (
        <p className="mt-6 text-sm text-muted">
          {t('set.moreInAdvanced')} <button onClick={() => flipMode('advanced')} className="font-semibold text-ink hover:underline">{t('set.advanced')}</button>.
        </p>
      )}
    </div>
  );
}
