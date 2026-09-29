// CommandPalette.jsx — Ctrl/Cmd+K: accent-insensitive search
// over decks and quick actions. Never fires while typing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { matchesQuery } from '../lib/text';

export default function CommandPalette({ open, onClose }) {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [decks, setDecks] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    (async () => {
      try {
        const { data } = await api.get('/decks');
        setDecks(data || []);
      } catch {
        setDecks([]);
      }
    })();
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open ]);

  const actions = useMemo(
    () => [
      { id: 'plan', label: t('pal.goPlan'), to: '/today' },
      { id: 'new', label: t('pal.newDeck'), to: '/decks/new' },
      { id: 'tutor', label: t('nav.tutor'), to: '/tutor' },
      { id: 'mixed', label: t('nav.mixed'), to: '/mixed' },
      { id: 'settings', label: t('nav.settings'), to: '/settings' },
    ],
    [t]
  );

  const items = useMemo(() => {
    const deckItems = decks
      .filter((d) => matchesQuery(`${d.name} ${d.subject || ''}`, q))
      .slice(0, 6)
      .map((d) => ({
        id: `deck-${d.id}`,
        label: d.name,
        hint: `${d.dueCount || 0}`,
        to: `/decks/${d.id}/study`,
      }));
    const actionItems = actions.filter((a) => matchesQuery(a.label, q));
    return [...actionItems.slice(0, 4), ...deckItems].slice(0, 10);
  }, [decks, actions, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 pt-24">
      <div className="mx-auto max-w-lg rounded-2xl bg-surface p-4 shadow-lg">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && items[active]) {
              go(items[active].to);
            }
          }}
          placeholder={t('pal.placeholder')}
          aria-label={t('pal.placeholder')}
          className="min-h-[44px] w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base focus:border-ink focus:outline-none"
        />
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onClick={() => go(item.to)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-base ${
                  i === active ? 'bg-canvas font-semibold' : ''
                }`}
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span className="text-sm text-muted">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">{t('recall.noMatch')}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
