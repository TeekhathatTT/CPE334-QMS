import React, { useEffect, useState } from 'react';

export const App: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<string>('checking...');
  const [dbStatus, setDbStatus] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data?.data) {
          setHealthStatus(data.data.status);
          setDbStatus(data.data.db);
        } else {
          setHealthStatus('unavailable');
        }
      })
      .catch(() => {
        setHealthStatus('disconnected');
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-xl p-8 border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">QMS Foundation</h1>
        <p className="text-slate-600 mb-6 text-sm">
          Queue and Service Management System
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-sm font-medium text-slate-700">API Health</span>
            <span className="text-sm font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              {healthStatus}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-sm font-medium text-slate-700">Database</span>
            <span
              className={`text-sm font-mono px-2 py-0.5 rounded ${
                dbStatus === true
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {dbStatus === null ? 'unknown' : dbStatus ? 'connected' : 'offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

