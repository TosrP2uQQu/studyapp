import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { token } = useAuth();
  const stored = token || localStorage.getItem('studyapp_token');
  if (!stored) return <Navigate to="/login" replace />;
  return children;
}
