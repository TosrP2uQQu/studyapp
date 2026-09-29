import { useAuth } from '../context/AuthContext';

export default function Spinner() {
  const { t } = useAuth();
  return (
    <div className="flex justify-center py-16" role="status" aria-label={t('common.loading')}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-ink" />
    </div>
  );
}
