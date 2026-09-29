// HistoryStrip.jsx — "show me where I picked Hard/OK/Easy".
// Last 8 ratings as icon dots (colour + shape + text, never colour
// alone), counts, and next-due line. Persisted hide toggle doubles
// as the "hide during study" setting.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { lastN } from '../lib/reviews';
import { getAdapter } from '../lib/storage';

const DOT = {
  hard: 'bg-clay rounded-sm',
  ok: 'bg-sand rounded-full',
  easy: 'bg-leaf rounded-full border border-leaf',
};

function Dot({ r }) {
  const tip = [
    new Date(r.ts).toLocaleDateString(),
    r.rating,
    r.mode || 'flip',
    r.prevInterval != null && r.newInterval != null
      ? `${r.prevInterval}d → ${r.newInterval}d`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <span
      title={tip}
      aria-label={tip}
      className={`inline-block h-3 w-3 ${DOT[r.rating] || DOT.ok}`}
    />
  );
}

export function mergeRows(serverRows, cardId, limit) {
  const seen = new Map();
  for (const r of serverRows || []) {
    if (r.cardId === cardId && r.id) seen.set(r.id, r);
  }
  for (const r of lastN(cardId, limit || 8)) {
    if (r.id) seen.set(r.id, r);
    else seen.set(`local-${r.ts}-${r.rating}`, r);
  }
  return [...seen.values()]
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .slice(-(limit || 8));
}

export default function HistoryStrip({ cardId, serverRows, nextDue }) {
  const { t } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return getAdapter().get('ui.hideHistory') === true;
    } catch {
      return false;
    }
  });

  const toggle = (v) => {
    setHidden(v);
    try {
      getAdapter().set('ui.hideHistory', v);
    } catch {
      /* best effort */
    }
  };

  if (hidden) {
    return (
      <button
        onClick={() => toggle(false)}
        className="mt-4 text-sm font-medium text-muted hover:text-ink"
      >
        {t('hist.show')}
      </button>
    );
  }

  const rows = mergeRows(serverRows, cardId, 8);
  const counts = { hard: 0, ok: 0, easy: 0 };
  for (const r of rows) {
    if (r.rating === 'hard') counts.hard++;
    else if (r.rating === 'ok') counts.ok++;
    else if (r.rating === 'easy') counts.easy++;
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {rows.map((r, i) => (
            <Dot key={r.id || i} r={r} />
          ))}
          {rows.length === 0 && (
            <span className="text-sm text-muted">{t('hist.empty')}</span>
          )}
        </div>
        <button
          onClick={() => toggle(true)}
          className="min-h-[44px] px-2 text-sm font-medium text-muted hover:text-ink"
        >
          {t('hist.hide')}
        </button>
      </div>
      {rows.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          {t('hist.summary', {
            h: counts.hard,
            o: counts.ok,
            e: counts.easy,
          })}
          {nextDue ? ` · ${t('hist.dueIn', { d: nextDue })}` : ''}
        </p>
      )}
    </div>
  );
}
