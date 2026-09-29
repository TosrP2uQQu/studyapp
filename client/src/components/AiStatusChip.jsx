// AiStatusChip.jsx — header status: ready / rate-limited / off.
// Colour + icon + text, never colour alone.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getStatus } from '../lib/llm';

export default function AiStatusChip() {
  const { t } = useAuth();
  const [state, setState] = useState('off');

  useEffect(() => {
    setState(getStatus());
    const id = setInterval(() => setState(getStatus()), 5000);
    return () => clearInterval(id);
  }, []);

  const dot =
    state === 'ready'
      ? 'bg-leaf'
      : state === 'rate-limited'
        ? 'bg-sand'
        : 'bg-line';
  const label =
    state === 'ready'
      ? t('ai.ready')
      : state === 'rate-limited'
        ? t('ai.limited')
        : t('ai.off');

  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-muted"
      role="status"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${dot}`}
      />
      {label}
    </span>
  );
}
