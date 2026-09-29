// Custom-styled but genuinely semantic form controls for Settings.
// A Toggle is a real <input type="checkbox"> (visually hidden, never
// display:none) paired with a styled track, so keyboard and screen readers
// keep working. Segmented is a radiogroup of real radio inputs.
export function Toggle({ checked, onChange, label, hint, id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-line p-0.5 transition-colors peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)]"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
      <span>
        <span className="block text-sm font-semibold text-primary">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented({ name, label, hint, options, value, onChange }) {
  // options: [{ value, label }]
  return (
    <fieldset className="py-3">
      <legend className="text-sm font-semibold text-primary">{label}</legend>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`block rounded-lg border px-4 py-2 text-sm font-semibold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)] ${
                value === o.value
                  ? 'border-ink bg-ink text-white dark:text-[#14181a]'
                  : 'border-line text-primary hover:bg-canvas'
              }`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
