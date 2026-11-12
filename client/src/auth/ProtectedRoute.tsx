import { Navigate, Outlet } from 'react-router-dom';
import { homePathFor, type Role } from '../api/client';
import { useAuth } from './AuthContext';
import { LoadingScreen } from '../components/LoadingScreen';

/**
 * Client-side route guard. It only mirrors server authorization for navigation; the API
 * remains the authorization boundary (SDS §2.1).
 */
export function ProtectedRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <Outlet />;
}
