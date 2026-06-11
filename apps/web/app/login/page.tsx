import { Suspense } from 'react';
import { accessCode } from '../../lib/auth';
import { LoginForm } from './login-form';

/**
 * Server component: with PULSE_SHOW_ACCESS_CODE=true (the judged demo deploy),
 * the access code is displayed on the login screen itself — zero friction for
 * reviewers. The gate still requires completing login for a signed session
 * cookie, so crawlers and bots never reach the proxy routes or burn LLM
 * quota. Unset the flag to make the gate a real secret again.
 */
// Render per request so the flag/code are read from live env, not baked into
// static HTML at build time.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const reviewerCode =
    process.env.PULSE_SHOW_ACCESS_CODE === 'true' ? accessCode() : undefined;
  return (
    <Suspense>
      <LoginForm reviewerCode={reviewerCode} />
    </Suspense>
  );
}
