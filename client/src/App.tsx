import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor } from './api/client';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoadingScreen } from './components/LoadingScreen';
import { CustomerLayout } from './components/customer/CustomerLayout';
import { OperatorLayout } from './components/operator/OperatorLayout';
import { CustomerHomePage } from './pages/CustomerHomePage';
import { EntryDetailPage } from './pages/EntryDetailPage';
import { LoginPage } from './pages/LoginPage';
import { OperatorHomePage } from './pages/OperatorHomePage';
import { OperatorQueueDetailPage } from './pages/OperatorQueueDetailPage';

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

      {/* ui-spec §3. */}
      <Route path="/customer" element={<ProtectedRoute allowedRoles={['CUSTOMER']} />}>
        <Route element={<CustomerLayout />}>
          <Route index element={<CustomerHomePage />} />
          <Route path="entries/:id" element={<EntryDetailPage />} />
        </Route>
      </Route>
      <Route path="/operator" element={<ProtectedRoute allowedRoles={['OPERATOR']} />}>
        <Route element={<OperatorLayout />}>
          <Route index element={<OperatorHomePage />} />
          <Route path="queues/:id" element={<OperatorQueueDetailPage />} />
        </Route>
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
