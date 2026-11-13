import { Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { LogoutButton } from '../LogoutButton';

/** Header and page frame shared by every `/operator` screen. Single column on mobile (ui-spec §8.2). */
export function OperatorLayout() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900">Queue and Service Management</p>
            <dl className="mt-1 space-y-0.5 text-sm text-slate-700">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">Signed in as:</dt>
                <dd className="break-all">{user.email}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">Role:</dt>
                <dd>{user.role}</dd>
              </div>
            </dl>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

