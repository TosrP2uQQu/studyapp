import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { dayWord } from '../lib/i18n';
import Spinner from '../components/Spinner';

export default function Stats({ notify }) {
  const { t, lang } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/stats');
        setStats(data);
      } catch (err) {
        notify(err.response?.data?.error || t('stats.loadFailed'), 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) return <Spinner />;

  const max = Math.max(1, ...stats.reviewsPerDay.map((d) => d.count));
  const totals = stats.total;

  const cells = [
    { label: t('stats.cards'), value: totals.cards },
    { label: t('stats.new'), value: totals.new },
    { label: t('stats.learning'), value: totals.learning },
    { label: t('stats.due'), value: totals.due },
    { label: t('stats.mastered'), value: totals.mastered },
    { label: t('stats.quizzes'), value: stats.quizSessions },
  ];

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">{t('stats.title')}</h1>
      <p className="mt-1 text-base text-muted">
        {stats.streak === 0
          ? t('nav.streakNone')
          : t('stats.streakLine', { n: stats.streak, days: dayWord(lang, stats.streak) })}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="bg-surface px-4 py-5">
            <p className="font-serif text-3xl font-semibold">{c.value}</p>
            <p className="mt-1 text-sm text-muted">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        {t('stats.buckets')}
      </p>

      <h2 className="mt-10 font-serif text-2xl font-semibold">{t('stats.chart')}</h2>
      <div className="mt-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex h-32 items-end gap-1">
          {stats.reviewsPerDay.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}`}
              className="min-w-0 flex-1 rounded-sm bg-ink"
              style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count > 0 ? 1 : 0.25 }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>{stats.reviewsPerDay[0]?.date}</span>
          <span>{stats.reviewsPerDay[stats.reviewsPerDay.length - 1]?.date}</span>
        </div>
      </div>

      <h2 className="mt-10 font-serif text-2xl font-semibold">{t('stats.perDeck')}</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-4 py-2.5 font-medium">{t('stats.deck')}</th>
              <th className="px-4 py-2.5 font-medium">{t('stats.cards')}</th>
              <th className="px-4 py-2.5 font-medium">{t('stats.new')}</th>
              <th className="px-4 py-2.5 font-medium">{t('stats.learning')}</th>
              <th className="px-4 py-2.5 font-medium">{t('stats.dueCol')}</th>
              <th className="px-4 py-2.5 font-medium">{t('stats.mastered')}</th>
            </tr>
          </thead>
          <tbody>
            {stats.perDeck.map((d) => (
              <tr key={d.deckId} className="row-divider">
                <td className="px-4 py-2.5 font-medium">{d.name}</td>
                <td className="px-4 py-2.5">{d.total}</td>
                <td className="px-4 py-2.5">{d.new}</td>
                <td className="px-4 py-2.5">{d.learning}</td>
                <td className="px-4 py-2.5">{d.due}</td>
                <td className="px-4 py-2.5">{d.mastered}</td>
              </tr>
            ))}
            {stats.perDeck.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-muted">{t('stats.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
