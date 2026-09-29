import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-primary focus:border-ink focus:outline-none';

export default function Login({ notify }) {
  const { login, t } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const me = await login(username.trim(), password);
      navigate(me && me.onboarded === false ? '/onboarding' : '/');
    } catch (err) {
      notify(err.response?.data?.error || t('auth.loginFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="font-serif text-3xl font-bold">StudyApp</p>
      <p className="mt-1 text-base text-muted">{t('brand.tagline')}</p>
      <div className="mt-6 rounded-2xl bg-surface p-8 shadow-md">
        <h1 className="text-2xl font-semibold">{t('auth.loginTitle')}</h1>
        <p className="mt-1 text-base text-muted">{t('login.welcome')}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-sm font-medium">{t('auth.username')}</label>
            <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" required />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {t('auth.noAccount')} <Link to="/register" className="font-semibold text-ink hover:underline">{t('auth.register')}</Link>
        </p>
      </div>
    </div>
  );
}
