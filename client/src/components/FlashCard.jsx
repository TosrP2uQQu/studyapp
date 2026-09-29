// flipStyle: 'flip' (3D rotate), 'fade' (crossfade), or 'slide' (lateral).
// Reduce-motion kills all three via the global html.reduce-motion rule.
import { useAuth } from '../context/AuthContext';

export default function FlashCard({ front, back, flipped, onFlip, flipStyle = 'flip' }) {
  const { t } = useAuth();
  const label = flipped ? t('flash.back') : t('flash.front');

  if (flipStyle === 'fade') {
    return (
      <button onClick={onFlip} className="block w-full cursor-pointer select-none" aria-label={label}>
        <div className="relative mx-auto min-h-[300px] w-full">
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-surface p-10 shadow-md transition-opacity duration-300 ${
              flipped ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <p className="text-center font-serif text-4xl font-semibold leading-snug text-primary">
              {front || <span className="text-muted">{t('flash.empty')}</span>}
            </p>
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-ink p-10 shadow-md transition-opacity duration-300 ${
              flipped ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <p className="text-center font-serif text-4xl font-semibold leading-snug text-white dark:text-[#14181a]">
              {back || <span className="opacity-70">{t('flash.empty')}</span>}
            </p>
          </div>
        </div>
        <span className="mt-3 block text-center text-sm text-muted">
          {t('flash.hint')}
        </span>
      </button>
    );
  }

  if (flipStyle === 'slide') {
    return (
      <button onClick={onFlip} className="block w-full cursor-pointer select-none" aria-label={label}>
        <div className="relative mx-auto min-h-[300px] w-full overflow-hidden">
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-surface p-10 shadow-md transition-all duration-300 ${
              flipped ? '-translate-x-10 opacity-0' : 'translate-x-0 opacity-100'
            }`}
          >
            <p className="text-center font-serif text-4xl font-semibold leading-snug text-primary">
              {front || <span className="text-muted">{t('flash.empty')}</span>}
            </p>
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-ink p-10 shadow-md transition-all duration-300 ${
              flipped ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'
            }`}
          >
            <p className="text-center font-serif text-4xl font-semibold leading-snug text-white dark:text-[#14181a]">
              {back || <span className="opacity-70">{t('flash.empty')}</span>}
            </p>
          </div>
        </div>
        <span className="mt-3 block text-center text-sm text-muted">
          {t('flash.hint')}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onFlip}
      className="perspective-1000 block w-full cursor-pointer select-none"
      aria-label={label}
    >
      <div
        className={`preserve-3d relative mx-auto min-h-[300px] w-full transition-transform duration-500 ${
          flipped ? 'rotate-y-180' : ''
        }`}
      >
        <div className="backface-hidden absolute inset-0 flex items-center justify-center rounded-2xl bg-surface p-10 shadow-md">
          <p className="text-center font-serif text-4xl font-semibold leading-snug text-primary">
            {front || <span className="text-muted">{t('flash.empty')}</span>}
          </p>
        </div>
        <div className="backface-hidden rotate-y-180 absolute inset-0 flex items-center justify-center rounded-2xl bg-ink p-10 shadow-md">
          <p className="text-center font-serif text-4xl font-semibold leading-snug text-white dark:text-[#14181a]">
            {back || <span className="opacity-70">{t('flash.empty')}</span>}
          </p>
        </div>
      </div>
      <span className="mt-3 block text-center text-sm text-muted">
        {t('flash.hint')}
      </span>
    </button>
  );
}
