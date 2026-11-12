import React from 'react';

/**
 * Foundation placeholder screen (Issue #2).
 *
 * It intentionally calls no API: the Sprint 1 API specification defines no health endpoint,
 * and the login and queue screens are delivered by later Sprint 1 issues.
 */
export const App: React.FC = () => {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-xl p-8 border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">QMS</h1>
        <p className="text-slate-600 text-sm">Queue and Service Management System</p>
        <p className="text-slate-500 text-sm mt-4">
          Project foundation is running. Customer and operator workflows are added in later Sprint 1 issues.
        </p>
      </div>
    </main>
  );
};

export default App;
