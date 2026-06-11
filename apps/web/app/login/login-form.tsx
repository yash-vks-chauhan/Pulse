'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function LoginForm({
  authDisabled = false,
  reviewerCode,
}: {
  authDisabled?: boolean;
  reviewerCode?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — humans never see it
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(authDisabled);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name: name.trim() || undefined, website }),
    });
    setBusy(false);
    if (response.ok) {
      const payload = (await response.json()) as { disabled?: boolean };
      if (payload.disabled) {
        setDisabled(true);
        return;
      }
      setSuccess(true);
      const next = searchParams.get('next');
      // Same-origin paths only: browsers treat //host and /\host as
      // cross-origin URLs, so a bare startsWith('/') is an open redirect.
      const safeNext = next && /^\/(?![/\\])/.test(next) ? next : '/';
      router.push(safeNext);
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
        {!disabled && (
          <>
            <p className="mt-1 text-sm text-slate-500">
              {reviewerCode
                ? 'Reviewing Pulse? Use the access code below.'
                : 'Enter the access code from the submission notes.'}
            </p>
            {reviewerCode && (
              <button
                type="button"
                onClick={() => setCode(reviewerCode)}
                className="mt-3 w-full rounded-lg border border-pulse-200 bg-pulse-50 px-3 py-2 text-left text-sm text-pulse-800 hover:bg-pulse-100"
              >
                Reviewer access code:{' '}
                <code className="font-mono font-semibold">{reviewerCode}</code>
                <span className="mt-0.5 block text-xs text-pulse-600">Click to fill</span>
              </button>
            )}
            <form onSubmit={(event) => void submit(event)} className="mt-4">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name (optional — for the greeting)"
                maxLength={60}
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-pulse-500 focus:outline-none"
              />
              {/* Honeypot: hidden from humans (and screen readers); bots that
                  auto-fill every field reveal themselves. */}
              <input
                type="text"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Access code"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-pulse-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || success || code.length === 0}
                className="mt-3 w-full rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
              >
                {success ? 'Access granted ✓' : busy ? 'Checking…' : 'Enter workspace'}
              </button>
            </form>
            {success && (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                Access granted{name.trim() ? ` — welcome, ${name.trim()}` : ''} — opening your
                workspace…
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}
          </>
        )}
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
