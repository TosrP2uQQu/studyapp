// ReloadPrompt.jsx — "New version — reload" toast for PWA updates.
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../context/AuthContext';

export default function ReloadPrompt() {
  const { t } = useAuth();
  const { needRefresh, updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
      role="status"
    >
      {t('pwa.update')}
      <button
        onClick={() => updateServiceWorker(true)}
        className="ml-3 rounded-lg bg-white/20 px-3 py-1.5 font-semibold hover:bg-white/30"
      >
        {t('pwa.reload')}
      </button>
    </div>
  );
}
