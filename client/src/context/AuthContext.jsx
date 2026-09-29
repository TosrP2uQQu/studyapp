import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api';
import { t as translate, uiLangOf } from '../lib/i18n';

const AuthContext = createContext(null);

export const FONT_STACKS = {
  'source-serif-4': '"Source Serif 4", Georgia, serif',
  lora: 'Lora, Georgia, serif',
  spectral: 'Spectral, Georgia, serif',
  merriweather: 'Merriweather, Georgia, serif',
  'playfair-display': '"Playfair Display", Georgia, serif',
  'crimson-pro': '"Crimson Pro", Georgia, serif',
  'libre-baskerville': '"Libre Baskerville", Georgia, serif',
  fraunces: 'Fraunces, Georgia, serif',
  'ibm-plex-sans': '"IBM Plex Sans", system-ui, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  'work-sans': '"Work Sans", system-ui, sans-serif',
  manrope: 'Manrope, system-ui, sans-serif',
  'source-sans-3': '"Source Sans 3", system-ui, sans-serif',
  karla: 'Karla, system-ui, sans-serif',
  'public-sans': '"Public Sans", system-ui, sans-serif',
  'space-grotesk': '"Space Grotesk", system-ui, sans-serif',
};

export const HEADING_FONTS = [
  { value: 'source-serif-4', label: 'Source Serif 4' },
  { value: 'lora', label: 'Lora' },
  { value: 'spectral', label: 'Spectral' },
  { value: 'merriweather', label: 'Merriweather' },
  { value: 'playfair-display', label: 'Playfair Display' },
  { value: 'crimson-pro', label: 'Crimson Pro' },
  { value: 'libre-baskerville', label: 'Libre Baskerville' },
  { value: 'fraunces', label: 'Fraunces' },
];

export const BODY_FONTS = [
  { value: 'ibm-plex-sans', label: 'IBM Plex Sans' },
  { value: 'inter', label: 'Inter' },
  { value: 'work-sans', label: 'Work Sans' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'source-sans-3', label: 'Source Sans 3' },
  { value: 'karla', label: 'Karla' },
  { value: 'public-sans', label: 'Public Sans' },
  { value: 'space-grotesk', label: 'Space Grotesk' },
];

export const ACCENTS = {
  ink: { light: '#24425F', dark: '#5C87AD' },
  plum: { light: '#5B3A5C', dark: '#8C6B8D' },
  teal: { light: '#2F5D62', dark: '#6FA0A4' },
};

const FONT_SCALES = { small: 0.9, medium: 1, large: 1.15, xlarge: 1.3 };

const DEFAULT_APPEARANCE = {
  theme: 'system',
  fontSizeStep: 'medium',
  headingFont: 'source-serif-4',
  bodyFont: 'ibm-plex-sans',
  accentColor: 'ink',
  density: 'comfortable',
  flipStyle: 'flip',
  reduceMotion: 'system',
  lineHeight: 'normal',
  letterSpacing: 'normal',
};

const LINE_HEIGHTS = { normal: 1.5, relaxed: 1.7, loose: 2 };
const LETTER_SPACING = { normal: '0', wide: '0.02em', wider: '0.05em' };

// Resolves 'system' via the OS preference; high-contrast/sepia/amoled
// are explicit themes with their own token sets in index.css.
export function resolveTheme(theme) {
  if (['dark', 'contrast', 'sepia', 'amoled'].includes(theme)) {
    return theme;
  }
  if (theme === 'light') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

// Applies the whole appearance object to the document. Rating colors
// (--mastery/--hard/--ok) are deliberately never touched here: only --ink
// is the accent, so Hard/OK/Easy keep fixed meanings under any theme.
export function applyAppearance(a = {}) {
  const ap = { ...DEFAULT_APPEARANCE, ...a };
  const root = document.documentElement;
  const resolved = resolveTheme(ap.theme);
  root.dataset.theme = resolved;
  // .dark kept for legacy selectors; dataset.theme is the source.
  root.classList.toggle('dark', resolved === 'dark' || resolved === 'amoled');
  const acc = ACCENTS[ap.accentColor] || ACCENTS.ink;
  const darkTokens = resolved === 'dark' || resolved === 'amoled';
  root.style.setProperty('--ink', darkTokens ? acc.dark : acc.light);
  root.style.setProperty('--font-head', FONT_STACKS[ap.headingFont] || FONT_STACKS['source-serif-4']);
  root.style.setProperty('--font-ui', FONT_STACKS[ap.bodyFont] || FONT_STACKS['ibm-plex-sans']);
  root.style.fontSize = `${16 * (FONT_SCALES[ap.fontSizeStep] || 1)}px`;
  root.style.setProperty('--leading', String(LINE_HEIGHTS[ap.lineHeight] || 1.5));
  root.style.setProperty('--tracking', LETTER_SPACING[ap.letterSpacing] || '0');
  document.body.style.lineHeight = 'var(--leading)';
  document.body.style.letterSpacing = 'var(--tracking)';
  root.dataset.density = ap.density || 'comfortable';
  const reduce =
    ap.reduceMotion === 'always' ||
    (ap.reduceMotion === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('reduce-motion', reduce);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('studyapp_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('studyapp_token'));
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    applyAppearance(user?.appearance || DEFAULT_APPEARANCE);
    document.documentElement.lang = uiLangOf(user?.appearance?.uiLang);
  }, [user?.appearance]);

  useEffect(() => {
    // Re-apply when the OS preference changes (matters for theme/reduce: system).
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applyAppearance(user?.appearance || DEFAULT_APPEARANCE);
    mqDark.addEventListener('change', onChange);
    mqMotion.addEventListener('change', onChange);
    return () => {
      mqDark.removeEventListener('change', onChange);
      mqMotion.removeEventListener('change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (t, u) => {
    setToken(t);
    setUser(u);
    if (t) localStorage.setItem('studyapp_token', t);
    else localStorage.removeItem('studyapp_token');
    if (u) localStorage.setItem('studyapp_user', JSON.stringify(u));
    else localStorage.removeItem('studyapp_user');
  };

  const refreshMe = useCallback(async () => {
    const stored = localStorage.getItem('studyapp_token');
    if (!stored) return null;
    try {
      const { data } = await api.get('/users/me');
      setUser((prev) => {
        const merged = { ...(prev || {}), ...data };
        localStorage.setItem('studyapp_user', JSON.stringify(merged));
        return merged;
      });
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // App boot with a stored token: refresh the user so appearance, caps,
    // and modes are never stale after a reload. Failure keeps the cached
    // copy; ProtectedRoute still gates on the token itself.
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStreak = useCallback(async () => {
    const stored = localStorage.getItem('studyapp_token');
    if (!stored) return;
    try {
      const { data } = await api.get('/stats');
      setStreak(data.streak);
    } catch {
      // Sidebar streak is quiet by design; failures stay invisible.
    }
  }, []);

  const login = useCallback(
    async (username, password) => {
      const { data } = await api.post('/auth/login', { username, password });
      persist(data.token, data.user);
      const me = await refreshMe();
      return me || data.user;
    },
    [refreshMe]
  );

  const register = useCallback(
    async (username, password) => {
      const { data } = await api.post('/auth/register', { username, password });
      persist(data.token, data.user);
      const me = await refreshMe();
      return me || data.user;
    },
    [refreshMe]
  );

  const logout = useCallback(() => {
    persist(null, null);
    setStreak(null);
    applyAppearance(DEFAULT_APPEARANCE);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        refreshMe,
        streak,
        refreshStreak,
        lang: uiLangOf(user?.appearance?.uiLang),
        t: (key, vars) => translate(uiLangOf(user?.appearance?.uiLang), key, vars),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
