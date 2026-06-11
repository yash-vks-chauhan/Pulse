'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (response.ok) {
      const payload = (await response.json()) as { disabled?: boolean };
      if (payload.disabled) {
        setDisabled(true);
        return;
      }
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/') ? next : '/');
      router.refresh();
      return;
    }
    setError(
      response.status === 429
        ? 'Too many attempts — wait 15 minutes.'
        : 'That access code is not right.',
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <div className="flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse-600 text-lg font-bold text-white">
          P
        </span>
        <span className="text-xl font-semibold tracking-tight">Pulse</span>
      </div>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="font-medium">Workspace access</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the access code from the submission notes.
        </p>
        <form onSubmit={(event) => void submit(event)} className="mt-4">
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Access code"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-pulse-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || code.length === 0}
            className="mt-3 w-full rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Enter workspace'}
          </button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {disabled && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Access control is disabled on this deployment —{' '}
            <a href="/" className="font-medium underline">go to the dashboard</a>.
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
