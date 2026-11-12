import { Spinner } from './Spinner';

export function LoadingScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <p role="status" className="flex items-center gap-2 text-slate-600">
        <Spinner />
        Loading...
      </p>
    </main>
  );
}
