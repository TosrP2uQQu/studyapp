// RecallSheet.jsx — deck view with rating-history columns:
// last rating chip, H/O/E counts, trend, difficulty 0-100,
// next due, leech flag. Filter chips + hardest-first sort.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { isDueSoon } from '../lib/reviews-ui';

const FILTERS = ['all', 'lastHard', 'hard3', 'never', 'leeches', 'due'];

function Chip({ rating, t }) {
  if (!rating) {
    return (
      <span className="text-sm text-muted">{t('recall.neverRated')}</span>
    );
  }
  const dot =
    rating === 'hard'
      ? 'bg-clay'
      : rating === 'ok'
        ? 'bg-sand'
        : 'bg-leaf';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`}
      />
      {t('rate.' + rating)}
    </span>
  );
}

function Trend({ value, t }) {
  const label =
    value === 'improving'
      ? t('recall.trendImproving')
      : value === 'worsening'
        ? t('recall.trendWorsening')
        : t('recall.trendFlat');
  const arrow =
    value === 'improving' ? '▲' : value === 'worsening' ? '▼' : '●';
  return (
    <span className="text-sm text-muted">
      <span aria-hidden="true">{arrow}</span> {label}
    </span>
  );
}

export default function RecallSheet({ notify }) {
  const { id } = useParams();
  const { t } = useAuth();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [hardestFirst, setHardestFirst] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/decks/${id}/recall-sheet`);
        setData(data);
      } catch (err) {
        notify(err.response?.data?.error || t('recall.loadFailed'), 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cards = useMemo(() => {
    const all = (data && data.all) || [];
    let out = all;
    if (filter === 'lastHard') {
      out = all.filter((c) => c.lastRating === 'hard');
    } else if (filter === 'hard3') {
      out = all.filter((c) => (c.stats?.counts?.hard || 0) >= 3);
    } else if (filter === 'never') {
      out = all.filter((c) => (c.stats?.total || 0) === 0);
    } else if (filter === 'leeches') {
      out = all.filter((c) => c.stats?.leech);
    } else if (filter === 'due') {
      out = all.filter((c) => isDueSoon(c.nextReviewDate));
    }
    if (hardestFirst) {
      out = [...out].sort(
        (a, b) => (b.stats?.difficulty || 0) - (a.stats?.difficulty || 0)
      );
    }
    return out;
  }, [data, filter, hardestFirst]);

  if (!data) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">{t('recall.title')}</h1>
        <Link to={`/decks/${id}/study`} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          {t('recall.study')}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-medium ${
              filter === f
                ? 'border-ink bg-ink text-white'
                : 'border-line hover:bg-surface'
            }`}
          >
            {t('recall.filter' + f[0].toUpperCase() + f.slice(1))}
          </button>
        ))}
        <button
          onClick={() => setHardestFirst((v) => !v)}
          aria-pressed={hardestFirst}
          className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-medium ${
            hardestFirst
              ? 'border-ink bg-ink text-white'
              : 'border-line hover:bg-surface'
          }`}
        >
          {t('recall.sortHardest')}
        </button>
      </div>

      <div className="mt-4 divide-y divide-[var(--border)] border-y border-line">
        {cards.map((c) => (
          <div key={c.id} className="row-divider py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-base font-medium">{c.front}</span>
              <Chip rating={c.lastRating} t={t} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>
                H {c.stats?.counts?.hard || 0} · O{' '}
                {c.stats?.counts?.ok || 0} · E {c.stats?.counts?.easy || 0}
              </span>
              <Trend value={c.stats?.trend || 'flat'} t={t} />
              <span>
                {t('recall.difficulty')}: {c.stats?.difficulty || 0}
              </span>
              {c.nextReviewDate && (
                <span>
                  {t('recall.due')}: {String(c.nextReviewDate).slice(0, 10)}
                </span>
              )}
              {c.stats?.leech && (
                <span className="inline-flex items-center gap-1 font-medium text-clay">
                  <span aria-hidden="true">●</span> {t('recall.leech')}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-right text-sm text-muted">{c.back}</p>
          </div>
        ))}
        {cards.length === 0 && (
          <p className="py-3 text-sm text-muted">
            {(data.all || []).length === 0
              ? t('recall.empty')
              : t('recall.noMatch')}
          </p>
        )}
      </div>
    </div>
  );
}
