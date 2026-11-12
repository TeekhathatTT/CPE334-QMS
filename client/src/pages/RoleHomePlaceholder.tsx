import { useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';

/**
 * Temporary signed-in landing page for Issue #3. The real `/customer` screen is delivered by
 * Issue #5 and the real `/operator` screen by Issue #6.
 */
export function RoleHomePlaceholder({ title, replacedBy }: { title: string; replacedBy: string }) {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (err) {
      // A 401 is handled globally (session-expired redirect); anything else stays on this page.
      if (!(err instanceof ApiError && err.status === 401)) {
        setError('Sign out failed. Please try again.');
        setPending(false);
      }
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
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
          <button
            type="button"
            onClick={handleLogout}
            disabled={pending}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <>
                <Spinner />
                Signing out...
              </>
            ) : (
              'Logout'
            )}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}

        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
          Placeholder page. It will be replaced by {replacedBy}.
        </p>
      </div>
    </main>
  );
}
