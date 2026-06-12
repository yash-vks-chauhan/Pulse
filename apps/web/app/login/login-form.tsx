'use client';

import { ArrowRight, Check, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PulseLogo } from '../../components/logo';
import { Aurora } from '../../components/motion/aurora';
import { BlurText } from '../../components/motion/blur-text';
import { ThemeToggle } from '../../components/theme-toggle';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';

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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* same atmosphere as the landing hero */}
      <div className="absolute inset-x-0 top-0 h-[560px]">
        <Aurora />
        <div className="bg-dot-grid mask-fade-edges absolute inset-0" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Back to the Pulse landing page">
          <PulseLogo markClassName="h-7 w-7" wordClassName="text-base" />
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative z-10 mx-auto mt-14 max-w-sm px-4 pb-16 sm:mt-20">
        <BlurText as="div">
          <Card className="frame-ring border-transparent">
            <CardHeader>
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-4 w-4 text-foreground/70" />
              </span>
              <CardTitle className="text-base">Workspace access</CardTitle>
              {!disabled && (
                <CardDescription>
                  {reviewerCode
                    ? 'Reviewing Pulse? Use the access code below.'
                    : 'Enter the access code from the submission notes.'}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!disabled && (
                <>
                  {reviewerCode && (
                    <button
                      type="button"
                      onClick={() => setCode(reviewerCode)}
                      className="mb-4 w-full rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10"
                    >
                      Reviewer access code:{' '}
                      <code className="font-mono font-semibold">{reviewerCode}</code>
                      <span className="mt-0.5 block text-xs font-medium text-accent">
                        Click to fill
                      </span>
                    </button>
                  )}
                  <form onSubmit={(event) => void submit(event)} className="space-y-2.5">
                    <Input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name (optional — for the greeting)"
                      maxLength={60}
                      autoFocus
                    />
                    {/* Honeypot: hidden from humans (and screen readers); bots
                        that auto-fill every field reveal themselves. */}
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
                    <Input
                      type="password"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Access code"
                    />
                    <Button
                      type="submit"
                      disabled={busy || success || code.length === 0}
                      className="w-full"
                    >
                      {success ? (
                        <>
                          <Check />
                          Access granted
                        </>
                      ) : busy ? (
                        'Checking…'
                      ) : (
                        <>
                          Enter workspace
                          <ArrowRight />
                        </>
                      )}
                    </Button>
                  </form>
                  {success && (
                    <Alert variant="success" className="mt-3">
                      <AlertDescription>
                        Access granted{name.trim() ? ` — welcome, ${name.trim()}` : ''} —
                        opening your workspace…
                      </AlertDescription>
                    </Alert>
                  )}
                  {error && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </>
              )}
              {disabled && (
                <Alert variant="warning">
                  <AlertDescription>
                    Access control is disabled on this deployment —{' '}
                    <a href="/" className="font-medium underline">
                      go to the dashboard
                    </a>
                    .
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </BlurText>
        <BlurText delay={250} className="mt-4 text-center text-xs text-muted-foreground">
          Sessions are signed server-side · nothing is stored in your browser
          beyond the cookie.
        </BlurText>
      </div>
    </div>
  );
}
