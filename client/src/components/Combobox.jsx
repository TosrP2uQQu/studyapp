import { useEffect, useId, useRef, useState } from 'react';

// Pure filter: case-insensitive substring match on label (and value).
// Kept outside the component so it stays unit-testable without a DOM.
export function filterOptions(options, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)
  );
}

// Searchable combobox: type to filter, ArrowUp/ArrowDown + Enter to pick,
// Escape to close. A real text input plus listbox roles, so keyboard and
// screen readers keep working — never a div with onClick.
export default function Combobox({ id, label, hint, options, value, onChange, placeholder }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputId = id || useId();

  const selected = options.find((o) => o.value === value);
  const filtered = filterOptions(options, query);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const commit = (opt) => {
    if (opt) onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !open)) {
      e.preventDefault();
      setOpen(true);
      if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      commit(filtered[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative py-3">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-primary">
        {label}
      </label>
      {hint && <p className="mb-1 text-sm text-muted">{hint}</p>}
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder || (selected ? selected.label : 'Type to search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => {
          setQuery('');
        }}
        onKeyDown={onKey}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-primary focus:border-ink focus:outline-none"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={typeof label === 'string' ? label : 'Options'}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No matches. Clear the search to see everything.</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? 'bg-canvas font-semibold' : ''
              } ${o.value === value ? 'text-ink' : 'text-primary'}`}
            >
              {o.label}
              {o.description && <span className="block text-xs text-muted">{o.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
