// Profile.jsx — display name, avatar emoji (no uploads), learning
// languages, links to Settings for export/delete. Browser-only store
// (per username) so it works on static hosting too.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAdapter } from '../lib/storage';

const AVATARS = [
  '🦊', '🐸', '🦉', '🐢', '🦄', '🐝',
  '🌱', '📚', '🔭', '🎒', '⭐', '🌊',
];

export function profileKey(username) {
  return 'profile.' + username;
}

export function loadProfile(username) {
  try {
    const v = getAdapter().get(profileKey(username));
    if (v && typeof v === 'object') return v;
  } catch {
    /* fresh */
  }
  return { displayName: '', avatar: '🦊', learningLangs: [] };
}

export function saveProfile(username, profile) {
  try {
    getAdapter().set(profileKey(username), profile);
    return true;
  } catch {
    return false;
  }
}

export default function Profile({ notify }) {
  const { user, t } = useAuth();
  const username = (user && user.username) || 'guest';
  const [profile, setProfile] = useState(() => loadProfile(username));

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = () => {
    if (saveProfile(username, profile)) {
      notify(t('profile.saved'), 'success');
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-3xl font-semibold">
        {t('profile.title')}
      </h1>
      <div className="mt-5 rounded-2xl bg-surface p-8 shadow-md">
        <div className="flex items-center gap-4">
          <span className="text-5xl" aria-hidden="true">
            {profile.avatar || '🦊'}
          </span>
          <div>
            <p className="text-xl font-semibold">
              {profile.displayName || username}
            </p>
            <p className="text-sm text-muted">{username}</p>
          </div>
        </div>
        <label
          htmlFor="profile-name"
          className="mb-1 mt-6 block text-sm font-medium"
        >
          {t('profile.displayName')}
        </label>
        <input
          id="profile-name"
          value={profile.displayName || ''}
          onChange={(e) => set({ displayName: e.target.value })}
          maxLength={40}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-base focus:border-ink focus:outline-none"
        />
        <p className="mb-1 mt-5 text-sm font-medium">
          {t('profile.avatar')}
        </p>
        <div className="grid grid-cols-6 gap-2" role="radiogroup">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={profile.avatar === a}
              aria-label={a}
              onClick={() => set({ avatar: a })}
              className={
                'min-h-[44px] rounded-lg border text-2xl ' +
                (profile.avatar === a
                  ? 'border-ink bg-canvas'
                  : 'border-line hover:bg-canvas')
              }
            >
              {a}
            </button>
          ))}
        </div>
        {(profile.learningLangs || []).length > 0 && (
          <p className="mt-5 text-sm text-muted">
            {t('profile.learning')}:{' '}
            {profile.learningLangs.join(', ')}
          </p>
        )}
        <button
          onClick={save}
          className="mt-6 w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90"
        >
          {t('set.save')}
        </button>
        <Link
          to="/settings"
          className="mt-3 block text-center text-sm font-medium text-ink hover:underline"
        >
          {t('profile.openSettings')}
        </Link>
      </div>
    </div>
  );
}
