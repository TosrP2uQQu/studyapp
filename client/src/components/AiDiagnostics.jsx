// AiDiagnostics.jsx — Settings → AI → Diagnostics: test key,
// list models, measure latency, last 5 errors (never keys),
// "Copy debug info" (redacted). Operates on the key currently in
// the form, so nothing stored is needed to run it.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  debugInfo,
  discoverGeminiModels,
  generate,
  lastErrors,
} from '../lib/llm';

export default function AiDiagnostics({ provider, apiKey, baseUrl, model }) {
  const { t } = useAuth();
  const [busy, setBusy] = useState(false);
  const [latency, setLatency] = useState(null);
  const [models, setModels] = useState(null);
  const [errors, setErrors] = useState(() => lastErrors());
  const [failed, setFailed] = useState('');
  const [copied, setCopied] = useState(false);
  const [ctrl, setCtrl] = useState(null);

  const cfg = () => ({ provider, apiKey, baseUrl, model });

  const runTest = async () => {
    const c = new AbortController();
    setCtrl(c);
    setBusy(true);
    setFailed('');
    setLatency(null);
    const started = Date.now();
    try {
      await generate(cfg(), {
        system: 'Reply with the word ok.',
        messages: [{ role: 'user', content: 'ping' }],
        cache: false,
        signal: c.signal,
      });
      setLatency(Date.now() - started);
      setErrors(lastErrors());
    } catch (err) {
      if (err.name === 'AbortError') {
        setFailed(t('set.diagCancelled'));
      } else {
        setFailed(err.aiCode || err.message || t('set.testFailed'));
      }
      setErrors(lastErrors());
    } finally {
      setBusy(false);
      setCtrl(null);
    }
  };

  const runModels = async () => {
    setBusy(true);
    setFailed('');
    try {
      if (provider === 'gemini') {
        setModels(await discoverGeminiModels(cfg()));
      } else {
        setModels([]);
        setFailed(t('set.diagNoList'));
      }
    } catch (err) {
      setFailed(err.aiCode || err.message || t('set.testFailed'));
    } finally {
      setBusy(false);
    }
  };

  const copyDebug = async () => {
    const info = JSON.stringify(debugInfo(cfg()), null, 2);
    try {
      await navigator.clipboard.writeText(info);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(t('set.testFailed'));
    }
  };

  return (
    <div className="py-3">
      <p className="text-sm font-semibold">{t('set.diagTitle')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={runTest}
          disabled={busy || !apiKey}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
        >
          {t('set.diagTest')}
        </button>
        <button
          onClick={runModels}
          disabled={busy || !apiKey}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
        >
          {t('set.diagModels')}
        </button>
        <button
          onClick={copyDebug}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas"
        >
          {copied ? t('set.diagCopied') : t('set.diagCopy')}
        </button>
        {ctrl && (
          <button
            onClick={() => ctrl.abort()}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas"
          >
            {t('set.diagCancel')}
          </button>
        )}
      </div>
      {latency != null && (
        <p className="mt-2 text-sm text-muted">
          {t('set.diagLatency', { ms: latency })}
        </p>
      )}
      {models && (
        <ul className="mt-2 max-h-32 overflow-y-auto text-sm text-muted">
          {models.slice(0, 20).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {failed && <p className="mt-2 text-sm text-clay">{failed}</p>}
      {errors.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-semibold">{t('set.diagErrors')}</p>
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {errors.map((e, i) => (
              <li key={i}>
                {e.at} — {e.provider} — {e.code} — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
