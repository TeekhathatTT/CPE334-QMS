import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor } from './api/client';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './pages/LoginPage';
import { RoleHomePlaceholder } from './pages/RoleHomePlaceholder';

/** Sends `/` and unknown paths to the signed-in user's home, or to `/login`. */
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ui-spec §3. Later issues add /customer/entries/:id and /operator/queues/:id under these guards. */}
      <Route path="/customer" element={<ProtectedRoute allowedRoles={['CUSTOMER']} />}>
        <Route index element={<RoleHomePlaceholder title="Customer" replacedBy="Issue #5 (customer queue screens)" />} />
      </Route>
      <Route path="/operator" element={<ProtectedRoute allowedRoles={['OPERATOR']} />}>
        <Route index element={<RoleHomePlaceholder title="Operator" replacedBy="Issue #6 (operator queue screens)" />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
