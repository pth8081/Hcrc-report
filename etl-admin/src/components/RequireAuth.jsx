import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function RequireAuth({ children }) {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!me) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
