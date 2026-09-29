import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { LANG_NAMES_LT, LANG_NAMES_RU, cardWord } from '../lib/i18n';
import Combobox from '../components/Combobox';
import Spinner from '../components/Spinner';
import {
  IMPORT_JSON_KEYS,
  buildImportMessages,
  chunkText,
  offlineSort,
  summarizeResult,
} from '../lib/smartImport';
import { generate } from '../lib/llm';
import { getBrowserKey } from '../lib/keys';
import { normCardSide } from '../lib/text';
import {
  download,
  parseCsv,
  parseDelimited,
  toCsv,
  toJson,
  toTsv,
} from '../lib/importers';
import { encodeDeck } from '../lib/share';

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ro', name: 'Romanian' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'sv', name: 'Swedish' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'sk', name: 'Slovak' },
  { code: 'no', name: 'Norwegian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'be', name: 'Belarusian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ga', name: 'Irish' },
  { code: 'cy', name: 'Welsh' },
  { code: 'sq', name: 'Albanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'mt', name: 'Maltese' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'ca', name: 'Catalan' },
  { code: 'eu', name: 'Basque' },
  { code: 'gl', name: 'Galician' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'ru', name: 'Russian' },
];

export function parsePaste(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const line = raw.replace(/\r$/, '');
    let front = '';
    let back = '';
    let missing = false;
    const tabIdx = line.indexOf('\t');
    if (tabIdx >= 0) {
      front = line.slice(0, tabIdx).trim();
      back = line.slice(tabIdx + 1).trim();
    } else {
      const commaIdx = line.indexOf(',');
      if (commaIdx >= 0) {
        front = line.slice(0, commaIdx).trim();
        back = line.slice(commaIdx + 1).trim();
      } else {
        front = line.trim();
        back = '';
        missing = true;
      }
    }
    out.push({ front, back, missing });
  }
  return out;
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-primary focus:border-ink focus:outline-none';

export default function DeckEditor({ notify }) {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { user, t, lang } = useAuth();
  const advancedSettings = user?.settingsMode === 'advanced';

  const [deck, setDeck] = useState(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('general');
  const [sourceLang, setSourceLang] = useState('es');
  const [targetLang, setTargetLang] = useState('en');
  const [modes, setModes] = useState({ typedRecall: false, pretest: false, elaborativePrompts: false, writtenRecallAI: false });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState([]);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [pasteMode, setPasteMode] = useState('notes');
  const [structuring, setStructuring] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const deckLangNames = lang === 'ru' ? LANG_NAMES_RU : lang === 'lt' ? LANG_NAMES_LT : null;
  const langName = (code) =>
    deckLangNames ? deckLangNames[code] || code : LANGS.find((l) => l.code === code)?.name || code;
  const langOptions = LANGS.map((l) => ({
    value: l.code,
    label: `${deckLangNames ? deckLangNames[l.code] || l.name : l.name} (${l.code})`,
  }));
  const frontLabel = type === 'language' ? t('editor.wordIs', { lang: langName(sourceLang) }) : t('editor.front');
  const backLabel = type === 'language' ? t('editor.translationIs', { lang: langName(targetLang) }) : t('editor.back');

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const { data } = await api.get(`/decks/${id}`);
        setDeck(data);
        setName(data.name || '');
        setSubject(data.subject || '');
        setType(data.type || 'general');
        setSourceLang(data.sourceLang || 'es');
        setTargetLang(data.targetLang || 'en');
        setModes({ typedRecall: false, pretest: false, elaborativePrompts: false, writtenRecallAI: false, ...(data.studyModes || {}) });
      } catch (err) {
        notify(err.response?.data?.error || t('editor.loadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveDeckSettings = async () => {
    if (!name.trim()) {
      notify(t('editor.needName'), 'error');
      return null;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { data } = await api.post('/decks', { name: name.trim(), subject: subject.trim(), type, sourceLang, targetLang });
        notify(t('editor.created'), 'success');
        setDeck(data);
        navigate(`/decks/${data.id}/edit`, { replace: true });
        return data;
      }
      const { data } = await api.put(`/decks/${id}`, { name, subject, type, sourceLang, targetLang });
      const { data: m } = await api.patch(`/decks/${id}/study-modes`, modes);
      setDeck({ ...data, studyModes: m.studyModes });
      notify(t('editor.saved'), 'success');
      return data;
    } catch (err) {
      notify(err.response?.data?.error || t('editor.saveFailed'), 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleParse = async () => {
    setImportSummary(null);
    if (pasteMode === 'transcript') {
      // Transcript mode: chunk on timestamps, offline-sort, summarize.
      const chunks = chunkText(paste, 'transcript');
      if (chunks.length === 0) {
        notify(t('editor.nothingToParse'), 'error');
        return;
      }
      const sorted = offlineSort(chunks, (deck && deck.cards) || []);
      setPreview(sorted.cards);
      setImportSummary(summarizeResult(sorted));
      return;
    }
    // Notes mode: auto-detect delimiter (tab/comma/semicolon)
    // and card separators (blank lines vs lines), CSV-aware.
    let parsed = [];
    if (/^\s*front\s*,/im.test(paste) || /^\s*"front"\s*,/im.test(paste)) {
      parsed = parseCsv(paste).cards;
    } else {
      parsed = parseDelimited(paste).cards;
    }
    if (parsed.length === 0) {
      notify(t('editor.nothingToParse'), 'error');
      return;
    }
    // Dedupe against existing cards + within the paste (NFC, case-free).
    const seen = new Set(
      ((deck && deck.cards) || []).map((c) =>
        (normCardSide(c.front) + '||' + normCardSide(c.back)).toLowerCase()
      )
    );
    const kept = [];
    let skipped = 0;
    for (const p of parsed) {
      const sig = (
        normCardSide(p.front) +
        '||' +
        normCardSide(p.back)
      ).toLowerCase();
      if (seen.has(sig)) {
        skipped++;
        continue;
      }
      seen.add(sig);
      kept.push(p);
    }
    setPreview(kept);
    setImportSummary({
      added: kept.length,
      skippedDuplicates: skipped,
      skippedEmpty: parsed.length - kept.length - skipped,
      skippedLong: 0,
      needBack: kept.filter((p) => p.missing || !p.back).length,
    });
    if (autoTranslate && type === 'language') {
      const missingIdx = parsed.map((p, i) => (p.missing || !p.back ? i : -1)).filter((i) => i >= 0);
      if (missingIdx.length > 0) {
        setTranslating(true);
        try {
          const updated = [...parsed];
          for (const i of missingIdx) {
            try {
              const { data } = await api.post('/translate', { text: updated[i].front, sourceLang, targetLang });
              if (data.translatedText) updated[i] = { ...updated[i], back: data.translatedText };
            } catch {
              // Leave the back empty and flagged.
            }
          }
          setPreview(updated);
        } finally {
          setTranslating(false);
        }
      }
    }
  };

  // AI path: structure the paste into cards with the user's own key.
  // Same JSON shape as the offline sorter, so preview just works.
  const structureWithAi = async () => {
    if (!paste.trim() || structuring) return;
    const provider = (user && user.ai && user.ai.provider) || 'gemini';
    const apiKey = getBrowserKey(provider);
    if (!apiKey && provider !== 'ollama') {
      notify(t('editor.needKey'), 'error');
      return;
    }
    setStructuring(true);
    try {
      const out = await generate(
        {
          provider,
          apiKey,
          baseUrl: (user && user.ai && user.ai.baseUrl) || '',
          model: (user && user.ai && user.ai.model) || '',
        },
        {
          system: 'You turn study notes into flashcards.',
          messages: buildImportMessages(paste, pasteMode),
          json: { keys: IMPORT_JSON_KEYS, required: true },
        }
      );
      const list = (out.json && out.json.cards) || [];
      const clean = list
        .filter((c) => c && (c.front || c.back))
        .map((c) => ({
          front: normCardSide(c.front || ''),
          back: normCardSide(c.back || ''),
          missing: !normCardSide(c.back || ''),
        }));
      if (clean.length === 0) {
        notify(t('editor.nothingToParse'), 'error');
        return;
      }
      setPreview(clean);
      setImportSummary({
        added: clean.length,
        skippedDuplicates: 0,
        skippedEmpty: 0,
        skippedLong: 0,
        needBack: clean.filter((c) => c.missing).length,
      });
    } catch (err) {
      notify(err.aiCode || err.message || t('study.gradeFailed'), 'error');
    } finally {
      setStructuring(false);
    }
  };

  const savePreview = async () => {
    const deckId = deck?.id || id;
    if (!deckId) {
      notify(t('editor.saveFirst'), 'error');
      return;
    }
    const cards = preview.filter((p) => p.front.trim() || p.back.trim()).map((p) => ({ front: p.front.trim(), back: p.back.trim() }));
    if (cards.length === 0) {
      notify(t('editor.noCardsToSave'), 'error');
      return;
    }
    try {
      await api.post(`/decks/${deckId}/cards`, { cards });
      notify(t('editor.savedCards', { n: cards.length, cards: cardWord(lang, cards.length) }), 'success');
      setPreview([]);
      setPaste('');
      refreshCards(deckId);
    } catch (err) {
      notify(err.response?.data?.error || t('editor.saveCardsFailed'), 'error');
    }
  };

  const refreshCards = async (deckId) => {
    try {
      const { data } = await api.get(`/decks/${deckId || id}`);
      setDeck(data);
    } catch {
      // ignore
    }
  };

  const addSingle = async (e) => {
    e.preventDefault();
    const deckId = deck?.id || id;
    if (!deckId) {
      notify(t('editor.saveFirst'), 'error');
      return;
    }
    if (!front.trim() && !back.trim()) {
      notify(t('editor.needOneSide'), 'error');
      return;
    }
    try {
      await api.post(`/decks/${deckId}/cards`, { front: front.trim(), back: back.trim() });
      notify(t('editor.cardSaved'), 'success');
      setFront('');
      setBack('');
      refreshCards(deckId);
    } catch (err) {
      notify(err.response?.data?.error || t('editor.cardSaveFailed'), 'error');
    }
  };

  const deleteCard = async (cardId) => {
    if (!window.confirm(t('editor.deleteConfirm'))) return;
    try {
      await api.delete(`/decks/${id}/cards/${cardId}`);
      notify(t('editor.cardDeleted'), 'success');
      refreshCards();
    } catch (err) {
      notify(err.response?.data?.error || t('editor.cardDeleteFailed'), 'error');
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get(`/decks/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(deck?.name || 'deck').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      notify(t('editor.exportFailed'), 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">{isNew ? t('editor.createTitle') : t('editor.editTitle', { name: deck?.name || '' })}</h1>

      <div className="mt-5 max-w-2xl space-y-4 rounded-2xl bg-surface p-6 shadow-md">
        <div>
          <label htmlFor="deck-name" className="mb-1 block text-sm font-medium">{t('editor.name')}</label>
          <input id="deck-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="deck-subject" className="mb-1 block text-sm font-medium">{t('editor.subject')}</label>
          <input id="deck-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('editor.subjectPh')} className={inputCls} />
        </div>
        <div className="flex gap-2">
          {['general', 'language'].map((tg) => (
            <button
              key={tg}
              type="button"
              onClick={() => setType(tg)}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold ${type === tg ? 'bg-ink text-white' : 'border border-line hover:bg-canvas'}`}
            >
              {tg === 'general' ? t('editor.general') : t('editor.language')}
            </button>
          ))}
        </div>
        {type === 'language' && (
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              id="deck-source"
              label={t('editor.source')}
              options={langOptions}
              value={sourceLang}
              onChange={setSourceLang}
            />
            <Combobox
              id="deck-target"
              label={t('editor.target')}
              options={langOptions}
              value={targetLang}
              onChange={setTargetLang}
            />
          </div>
        )}
        <button onClick={saveDeckSettings} disabled={saving} className="w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? t('editor.saving') : isNew ? t('editor.create') : t('editor.saveSettings')}
        </button>
        {!isNew && deck && (
          <p className="text-sm text-muted">
            {t('deck.shareCode')} <span className="font-mono font-semibold tracking-widest">{deck.shareCode}</span>
          </p>
        )}
      </div>

      {!isNew && (
        <>
          {advancedSettings ? (
          <div className="mt-8 max-w-2xl rounded-2xl bg-surface p-6 shadow-md">
            <h2 className="font-serif text-2xl font-semibold">{t('editor.howStudies')}</h2>
            {[
              { key: 'typedRecall', title: t('editor.typedT'), body: t('editor.typedB') },
              { key: 'pretest', title: t('editor.pretestT'), body: t('editor.pretestB') },
              { key: 'elaborativePrompts', title: t('editor.elabT'), body: t('editor.elabB') },
              { key: 'writtenRecallAI', title: t('editor.writtenT'), body: t('editor.writtenB') },
            ].map((o) => (
              <label key={o.key} className="row-divider flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(modes[o.key])}
                  onChange={(e) => setModes({ ...modes, [o.key]: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-[var(--ink)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-sm text-muted">{o.body}</span>
                </span>
              </label>
            ))}
            <button onClick={saveDeckSettings} className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
              {t('editor.saveModes')}
            </button>
          </div>
          ) : (
            <p className="mt-8 max-w-2xl text-sm text-muted">
              {t('editor.advancedPrefix')} <Link to="/settings" className="font-semibold text-ink hover:underline">{t('editor.advancedLink')}</Link>.
            </p>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-surface p-6 shadow-md">
              <h2 className="font-serif text-2xl font-semibold">{t('editor.pasteTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('editor.pasteHint')}</p>
              <div className="mt-3 flex gap-2" role="radiogroup">
                {['notes', 'transcript'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={pasteMode === m}
                    onClick={() => setPasteMode(m)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      pasteMode === m
                        ? 'border-ink bg-ink text-white'
                        : 'border-line hover:bg-canvas'
                    }`}
                  >
                    {t(m === 'notes' ? 'editor.modeNotes' : 'editor.modeTranscript')}
                  </button>
                ))}
              </div>
              <textarea
                id="deck-paste"
                aria-label={t('editor.pasteTitle')}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={10}
                placeholder={'la biblioteca, library\nel profesor, teacher'}
                className="mt-3 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
              />
              {type === 'language' && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={autoTranslate} onChange={(e) => setAutoTranslate(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
                  {t('editor.autoTranslate')}
                </label>
              )}
              <button onClick={handleParse} disabled={translating} className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {translating ? t('editor.translating') : t('editor.parse')}
              </button>
              <button
                onClick={structureWithAi}
                disabled={structuring || !paste.trim()}
                className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
              >
                {structuring ? t('study.grading') : t('editor.structureAi')}
              </button>
              {importSummary && (
                <p className="mt-2 text-sm text-muted" role="status">
                  {t('editor.importSummary', {
                    added: importSummary.added,
                    skipped:
                      importSummary.skippedDuplicates +
                      importSummary.skippedEmpty +
                      importSummary.skippedLong,
                  })}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-surface p-6 shadow-md">
              <h2 className="font-serif text-2xl font-semibold">{t('editor.preview')}{preview.length > 0 ? ` (${preview.length})` : ''}</h2>
              {preview.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t('editor.previewEmpty')}</p>
              ) : (
                <>
                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                    {preview.map((p, i) => (
                      <div key={i} className="rounded-lg bg-canvas p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={p.front}
                            aria-label={t('editor.previewFront', { i: i + 1 })}
                            onChange={(e) => { const c = [...preview]; c[i] = { ...c[i], front: e.target.value }; setPreview(c); }}
                            placeholder={frontLabel}
                            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                          />
                          <input
                            value={p.back}
                            aria-label={t('editor.previewBack', { i: i + 1 })}
                            onChange={(e) => { const c = [...preview]; c[i] = { ...c[i], back: e.target.value, missing: false }; setPreview(c); }}
                            placeholder={backLabel}
                            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                          />
                        </div>
                        {(!p.back.trim() || p.missing) && (
                          <p className="mt-1 text-xs font-medium text-clay">{t('editor.needsBack')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={savePreview} className="mt-3 w-full rounded-lg bg-leaf px-4 py-2.5 font-semibold text-white hover:opacity-90">
                    {t('editor.saveCards')}
                  </button>
                </>
              )}

              <h3 className="mt-6 text-base font-semibold" id="add-one-card">{t('editor.addOne')}</h3>
              <form onSubmit={addSingle} className="mt-2 grid gap-2" aria-labelledby="add-one-card">
                <input value={front} aria-label={frontLabel} onChange={(e) => setFront(e.target.value)} placeholder={frontLabel} className="rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none" />
                <input value={back} aria-label={backLabel} onChange={(e) => setBack(e.target.value)} placeholder={backLabel} className="rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none" />
                <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas">
                  {t('editor.saveCard')}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h2 className="font-serif text-2xl font-semibold">{t('editor.cards')} ({deck?.cards?.length || 0})</h2>
            <button onClick={exportCsv} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas">
              {t('editor.exportCsv')}
            </button>
            <button
              onClick={() => {
                const safe = (deck?.name || 'deck').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40);
                download(`${safe}.json`, toJson(deck?.cards || [], deck?.name), 'application/json');
              }}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas"
            >
              {t('editor.exportJson')}
            </button>
            <button
              onClick={() => {
                const safe = (deck?.name || 'deck').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40);
                download(`${safe}.tsv`, toTsv(deck?.cards || []), 'text/tab-separated-values');
              }}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas"
            >
              {t('editor.exportTsv')}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas"
            >
              {t('editor.print')}
            </button>
            <button
              onClick={async () => {
                try {
                  const code = await encodeDeck(deck);
                  await navigator.clipboard.writeText(code);
                  notify(t('share.copied'), 'success');
                } catch {
                  notify(t('set.testFailed'), 'error');
                }
              }}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-canvas"
            >
              {t('share.copy')}
            </button>
            <Link to={`/decks/${id}/quiz`} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              {t('editor.quizMe')}
            </Link>
          </div>
          <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-line bg-surface">
            {(deck?.cards || []).map((c) => (
              <div key={c.id} className="row-divider flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 truncate text-sm">
                  <span className="font-semibold">{c.front}</span>
                  <span className="text-muted">, {c.back}</span>
                </p>
                <button onClick={() => deleteCard(c.id)} className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-clay hover:bg-canvas">
                  {t('editor.delete')}
                </button>
              </div>
            ))}
            {(deck?.cards || []).length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">{t('editor.noCards')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
