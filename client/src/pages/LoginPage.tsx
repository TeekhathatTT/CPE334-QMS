import React, { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, homePathFor } from '../api/client';
import { SESSION_EXPIRED_MESSAGE, useAuth } from '../auth/AuthContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { Spinner } from '../components/Spinner';

export const INVALID_CREDENTIALS_TEXT = 'Invalid email or password.';
const INVALID_INPUT_TEXT = 'Enter a valid email and password.';
const GENERIC_FAILURE_TEXT = 'Unable to sign in right now. Please try again.';

interface FieldErrors {
  email?: string;
  password?: string;
}

const inputClass =
  'mt-1 block w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ' +
  'aria-[invalid=true]:border-red-600';

export function LoginPage() {
  const { user, loading, sessionExpired, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  if (loading) {
    return <LoadingScreen />;
  }
  if (user) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = 'Email is required.';
    if (!password) errors.password = 'Password is required.';
    return errors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return; // ui-spec §4: no duplicate submissions

    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    inFlight.current = true;
    setPending(true);
    try {
      const signedIn = await login(email.trim(), password);
      navigate(homePathFor(signedIn.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError(INVALID_CREDENTIALS_TEXT);
      } else if (err instanceof ApiError && err.status === 400) {
        setFormError(INVALID_INPUT_TEXT);
      } else {
        setFormError(GENERIC_FAILURE_TEXT);
      }
      setPending(false);
      inFlight.current = false;
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Queue and Service Management System</p>

        {sessionExpired && (
          <p role="status" className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            <span aria-hidden="true">ⓘ </span>
            {SESSION_EXPIRED_MESSAGE}
          </p>
        )}

        {formError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">⚠ </span>
            {formError}
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-800">
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              className={inputClass}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="mt-1 text-sm text-red-700">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">
              Password <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              className={inputClass}
            />
            {fieldErrors.password && (
              <p id="login-password-error" className="mt-1 text-sm text-red-700">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <>
                <Spinner />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
