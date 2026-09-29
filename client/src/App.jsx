import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import CommandPalette from './components/CommandPalette';
import ReloadPrompt from './components/ReloadPrompt';
import Login from './pages/Login';
import Register from './pages/Register';

// Route-level splitting: every other page loads on demand so the
// first paint stays small. KaTeX/pdf.js/charts were never bundled
// (latex.js renders inline; pdf import is a logged carry).
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Tutorial = lazy(() => import('./pages/Tutorial'));
const Profile = lazy(() => import('./pages/Profile'));
const Tutor = lazy(() => import('./pages/Tutor'));
const Today = lazy(() => import('./pages/Today'));
const Match = lazy(() => import('./pages/Match'));
const Explore = lazy(() => import('./pages/Explore'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DeckEditor = lazy(() => import('./pages/DeckEditor'));
const Study = lazy(() => import('./pages/Study'));
const MixedReview = lazy(() => import('./pages/MixedReview'));
const Quiz = lazy(() => import('./pages/Quiz'));
const RecallSheet = lazy(() => import('./pages/RecallSheet'));
const Stats = lazy(() => import('./pages/Stats'));
const Settings = lazy(() => import('./pages/Settings'));

function Shell() {
  const [toast, setToast] = useState(null);
  const [palOpen, setPalOpen] = useState(false);
  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  // Global command palette: Ctrl/Cmd+K, never while typing.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.target && e.target.isContentEditable) return;
        e.preventDefault();
        setPalOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const wrap = (el, narrow) => (
    <ProtectedRoute>
      <Layout narrow={narrow}>{el}</Layout>
    </ProtectedRoute>
  );

  return (
    <div className="min-h-screen bg-canvas font-sans text-primary"
      style={{ minHeight: '100dvh' }}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<Login notify={notify} />} />
        <Route path="/register" element={<Register notify={notify} />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding notify={notify} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tutorial"
          element={
            <ProtectedRoute>
              <Tutorial />
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={wrap(<Profile notify={notify} />)} />
        <Route path="/tutor" element={wrap(<Tutor notify={notify} />, true)} />
        <Route path="/" element={wrap(<Dashboard notify={notify} />)} />
        <Route path="/today" element={wrap(<Today notify={notify} />)} />
        <Route path="/explore" element={wrap(<Explore notify={notify} />)} />
        <Route path="/decks/new" element={wrap(<DeckEditor notify={notify} />, true)} />
        <Route path="/decks/:id/edit" element={wrap(<DeckEditor notify={notify} />)} />
        <Route path="/decks/:id/study" element={wrap(<Study notify={notify} />, true)} />
        <Route path="/decks/:id/match" element={wrap(<Match notify={notify} />, true)} />
        <Route path="/mixed" element={wrap(<MixedReview notify={notify} />, true)} />
        <Route path="/decks/:id/quiz" element={wrap(<Quiz notify={notify} />, true)} />
        <Route path="/decks/:id/recall" element={wrap(<RecallSheet notify={notify} />, true)} />
        <Route path="/stats" element={wrap(<Stats notify={notify} />)} />
        <Route path="/settings" element={wrap(<Settings notify={notify} />, true)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Toast key={toast?.key} toast={toast} onClose={() => setToast(null)} />
      <ReloadPrompt />
      <CommandPalette open={palOpen} onClose={() => setPalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </HashRouter>
  );
}
