import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { cardWord } from '../lib/i18n';
import DeckCard from '../components/DeckCard';
import Spinner from '../components/Spinner';
import { getAdapter } from '../lib/storage';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Dashboard({ notify }) {
  const { user, t, lang } = useAuth();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [selected, setSelected] = useState([]);
  const [showReminder, setShowReminder] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/decks');
      setDecks(data);
      setSelected(data.filter((d) => d.dueCount > 0).map((d) => d.id));
    } catch (err) {
      notify(err.response?.data?.error || t('dash.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (e) => {
    e.preventDefault();
    if (joinCode.trim().length !== 6) {
      notify(t('dash.needCode'), 'error');
      return;
    }
    setJoining(true);
    try {
      const { data } = await api.post('/decks/join', { shareCode: joinCode.trim() });
      notify(data.alreadyMember ? t('dash.alreadyIn') : t('dash.joined'), 'success');
      setJoinCode('');
      load();
    } catch (err) {
      notify(err.response?.data?.error || t('dash.joinFailed'), 'error');
    } finally {
      setJoining(false);
    }
  };

  const remove = async (deck) => {
    if (!window.confirm(`Delete "${deck.name}"? ${t('dash.deleteConfirm')}`)) return;
    try {
      await api.delete(`/decks/${deck.id}`);
      notify(t('dash.deleted'), 'success');
      load();
    } catch (err) {
      notify(err.response?.data?.error || t('dash.deleteFailed'), 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const totalDue = decks.reduce((a, d) => a + d.dueCount, 0);
  const dueLine =
    totalDue === 0
      ? t('dash.dueNone')
      : lang === 'ru'
        ? `К повторению: ${totalDue}.`
        : `${totalDue} ${totalDue === 1 ? 'card' : 'cards'} due today.`;

  // Honest reminder: no push infrastructure exists, so this is a banner
  // shown when opening the app on a later day with cards due. First visit
  // just records the date; dismissal lasts until tomorrow.
  useEffect(() => {
    if (!user || loading || decks.length === 0) return;
    if (user.studyPrefs?.reminderBannerEnabled === false) return;
    const key = `studyapp_lastvisit_${user.id}`;
    const last = localStorage.getItem(key);
    const today = todayStr();
    if (!last) {
      localStorage.setItem(key, today);
      return;
    }
    setShowReminder(last < today && totalDue > 0);
  }, [user, loading, decks, totalDue]);

  const dismissReminder = () => {
    if (user) localStorage.setItem(`studyapp_lastvisit_${user.id}`, todayStr());
    setShowReminder(false);
  };

  // Late-night sleep nudge: gentle, dismissible, off-switch in
  // Settings → Wellbeing. Never blocks studying.
  const [showLate, setShowLate] = useState(false);
  useEffect(() => {
    let wb = {};
    try {
      wb = getAdapter().get('wellbeing') || {};
    } catch {
      wb = {};
    }
    if (wb.lateNudge === false) return;
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (!(h >= 23.5 || h < 4)) return;
    let dismissed = null;
    try {
      dismissed = JSON.parse(localStorage.getItem('studyapp_late') || 'null');
    } catch {
      dismissed = null;
    }
    if (dismissed !== todayStr()) setShowLate(true);
  }, []);

  const dismissLate = () => {
    try {
      localStorage.setItem('studyapp_late', JSON.stringify(todayStr()));
    } catch {
      /* ignore */
    }
    setShowLate(false);
  };

  return (
    <div>
      {showLate && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-3">
          <p className="text-sm font-medium">{t('well.lateBanner')}</p>
          <button onClick={dismissLate} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-canvas hover:text-primary">
            {t('dash.reminderDismiss')}
          </button>
        </div>
      )}
      {showReminder && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-3">
          <p className="text-sm font-medium">
            {lang === 'ru'
              ? `У вас ${totalDue} ${cardWord(lang, totalDue)} к повторению.`
              : `You have ${totalDue} card${totalDue === 1 ? '' : 's'} due.`}
          </p>
          <button onClick={dismissReminder} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-canvas hover:text-primary">
            {t('dash.reminderDismiss')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{t('dash.title')}</h1>
          <p className="mt-1 text-base text-muted">{dueLine}</p>
        </div>
        <Link to="/decks/new" className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          {t('dash.new')}
        </Link>
      </div>

      <form onSubmit={join} className="mt-6 flex max-w-xl items-center gap-3 border-y border-line py-4">
        <label htmlFor="join-code" className="shrink-0 text-sm font-medium">
          {t('dash.joinLabel')}
        </label>
        <input
          id="join-code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC123"
          className="w-36 rounded-lg border border-line bg-surface px-3 py-2 font-mono uppercase tracking-widest focus:border-ink focus:outline-none"
        />
        <button type="submit" disabled={joining} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-50">
          {joining ? t('dash.joining') : t('dash.join')}
        </button>
      </form>

      {loading ? (
        <Spinner />
      ) : decks.length === 0 ? (
        <div className="mt-8 max-w-xl rounded-2xl bg-surface p-8 shadow-md">
          <h2 className="font-serif text-2xl font-semibold">{t('dash.emptyTitle')}</h2>
          <p className="mt-2 text-base text-muted">{t('dash.emptyBody')}</p>
          <Link to="/decks/new" className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            {t('dash.createFirst')}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {decks.map((d) => (
              <DeckCard key={d.id} deck={d} onDelete={remove} />
            ))}
          </div>

          <div className="mt-10 max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold">{t('dash.mixedTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('dash.mixedBody')}</p>
            <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-line bg-surface">
              {decks.map((d) => (
                <label key={d.id} className="row-divider flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    className="h-4 w-4 accent-[var(--ink)]"
                  />
                  <span className="flex-1 text-sm font-medium">{d.name}</span>
                  <span className="text-sm text-muted">{d.dueCount} {t('dash.dueWord')}</span>
                </label>
              ))}
            </div>
            <Link
              to={`/mixed?decks=${selected.join(',')}`}
              className={`mt-3 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white ${
                selected.length < 1 ? 'pointer-events-none bg-muted opacity-60' : 'bg-ink hover:opacity-90'
              }`}
            >
              {t('dash.startMixed')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
