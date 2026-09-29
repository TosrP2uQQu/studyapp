// InstallApp.jsx — "Install app" button (beforeinstallprompt)
// plus one-line iOS instructions when the event never fires.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function InstallApp() {
  const { t } = useAuth();
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBefore = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onDone = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onDone);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onDone);
    };
  }, []);

  if (installed) return null;
  if (!deferred) {
    return <p className="text-sm text-muted">{t('pwa.ios')}</p>;
  }
  return (
    <button
      onClick={() => deferred.prompt()}
      className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas"
    >
      {t('pwa.install')}
    </button>
  );
}
