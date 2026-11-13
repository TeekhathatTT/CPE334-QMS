import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../components/LogoutButton';

/**
 * Temporary signed-in landing page from Issue #3. The `/customer` screen was replaced in Issue #5;
 * the `/operator` screen is replaced by Issue #6.
 */
export function RoleHomePlaceholder({ title, replacedBy }: { title: string; replacedBy: string }) {
  const { user } = useAuth();

  if (!user) return null;

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
          <LogoutButton />
        </div>

        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
          Placeholder page. It will be replaced by {replacedBy}.
        </p>
      </div>
    </main>
  );
}
