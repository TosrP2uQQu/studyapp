import { useAuth } from '../context/AuthContext';

export default function RatingButtons({ onRate, disabled, suggested }) {
  const { t } = useAuth();
  // White text on the sand (OK) button fails WCAG AA, so that one button
  // uses near-black text in both modes. Same hue, same system, readable.
  // A pre-suggested rating (graded modes) gets a ring, never auto-applied.
  const base =
    'flex-1 rounded-lg px-4 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50';
  const ring = (v) =>
    suggested === v ? ' ring-2 ring-offset-2 ring-[var(--ink)]' : '';
  return (
    <div className="mt-6 flex gap-3">
      <button disabled={disabled} onClick={() => onRate('hard')} className={`${base} bg-clay text-white hover:opacity-90${ring('hard')}`}>
        {t('rate.hard')} <span className="ml-1 text-xs font-normal opacity-80">1</span>
      </button>
      <button disabled={disabled} onClick={() => onRate('ok')} className={`${base} bg-sand text-[#1c2321] hover:opacity-90 dark:text-[#14181a]${ring('ok')}`}>
        {t('rate.ok')} <span className="ml-1 text-xs font-normal opacity-80">2</span>
      </button>
      <button disabled={disabled} onClick={() => onRate('easy')} className={`${base} bg-leaf text-white hover:opacity-90${ring('easy')}`}>
        {t('rate.easy')} <span className="ml-1 text-xs font-normal opacity-80">3</span>
      </button>
    </div>
  );
}
