import { useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dayWord } from '../lib/i18n';

export default function Sidebar() {
  const { user, logout, streak, refreshStreak, t, lang } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: '/', label: t('nav.dashboard'), end: true },
    { to: '/mixed', label: t('nav.mixed') },
    { to: '/stats', label: t('nav.stats') },
    { to: '/profile', label: t('nav.profile') },
    { to: '/settings', label: t('nav.settings') },
  ];

  useEffect(() => {
    refreshStreak();
  }, [refreshStreak]);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 pb-4 pt-6">
        <Link to="/" className="font-serif text-2xl font-bold text-primary">
          StudyApp
        </Link>
        <p className="mt-1 text-sm text-muted">{t('brand.tagline')}</p>
      </div>
      <nav className="flex-1 px-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `mb-1 block rounded-lg px-3 py-2.5 text-base font-medium ${
                isActive
                  ? 'bg-canvas font-semibold text-ink'
                  : 'text-primary hover:bg-canvas'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line px-5 py-4">
        <p className="text-sm text-muted">
          {streak === null ? (
            t('nav.streakLoading')
          ) : streak === 0 ? (
            t('nav.streakNone')
          ) : (
            `${t('nav.streakWord')}: ${streak} ${dayWord(lang, streak)}`
          )}
        </p>
        {user && (
          <div className="mt-3 flex items-center justify-between">
            <span className="truncate text-sm font-medium text-primary">{user.username}</span>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-primary"
            >
              {t('nav.logout')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
