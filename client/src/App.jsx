import { useCallback, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Toast from './components/Toast';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Tutorial from './pages/Tutorial';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import DeckEditor from './pages/DeckEditor';
import Study from './pages/Study';
import MixedReview from './pages/MixedReview';
import Quiz from './pages/Quiz';
import RecallSheet from './pages/RecallSheet';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

function Shell() {
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const wrap = (el, narrow) => (
    <ProtectedRoute>
      <Layout narrow={narrow}>{el}</Layout>
    </ProtectedRoute>
  );

  return (
    <div
      className="min-h-screen bg-canvas font-sans text-primary"
      style={{ minHeight: '100dvh' }}
    >
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
        <Route path="/" element={wrap(<Dashboard notify={notify} />)} />
        <Route path="/decks/new" element={wrap(<DeckEditor notify={notify} />, true)} />
        <Route path="/decks/:id/edit" element={wrap(<DeckEditor notify={notify} />)} />
        <Route path="/decks/:id/study" element={wrap(<Study notify={notify} />, true)} />
        <Route path="/mixed" element={wrap(<MixedReview notify={notify} />, true)} />
        <Route path="/decks/:id/quiz" element={wrap(<Quiz notify={notify} />, true)} />
        <Route path="/decks/:id/recall" element={wrap(<RecallSheet notify={notify} />, true)} />
        <Route path="/stats" element={wrap(<Stats notify={notify} />)} />
        <Route path="/settings" element={wrap(<Settings notify={notify} />, true)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast key={toast?.key} toast={toast} onClose={() => setToast(null)} />
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
