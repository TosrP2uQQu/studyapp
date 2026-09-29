import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-primary focus:border-ink focus:outline-none';

export default function Register({ notify }) {
  const { register, t } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const me = await register(username.trim(), password);
      notify(t('auth.accountCreated'), 'success');
      navigate(me && me.onboarded === false ? '/onboarding' : '/');
    } catch (err) {
      notify(err.response?.data?.error || t('auth.registerFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="font-serif text-3xl font-bold">StudyApp</p>
      <p className="mt-1 text-base text-muted">{t('brand.tagline')}</p>
      <div className="mt-6 rounded-2xl bg-surface p-8 shadow-md">
        <h1 className="text-2xl font-semibold">{t('auth.registerTitle')}</h1>
        <p className="mt-1 text-base text-muted">{t('register.welcome')}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="register-username" className="mb-1 block text-sm font-medium">{t('auth.username')}</label>
            <input id="register-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="register-password" className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input id="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="new-password" required />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {loading ? t('auth.registering') : t('auth.register')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {t('auth.haveAccount')} <Link to="/login" className="font-semibold text-ink hover:underline">{t('auth.login')}</Link>
        </p>
      </div>
    </div>
  );
}
