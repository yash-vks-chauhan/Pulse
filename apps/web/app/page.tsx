import { cookies } from 'next/headers';
import { authEnabled, readSessionCookie, SESSION_COOKIE } from '../lib/auth';
import { LandingPage } from './landing-page';
import { OverviewDashboard } from './overview-dashboard';

/**
 * Root route plays two parts:
 *  - logged-out visitors see the public product landing page (no app chrome —
 *    the layout already renders a bare shell without a session);
 *  - signed-in users see the workspace overview inside the sidebar shell.
 */

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  if (authEnabled()) {
    const session = await readSessionCookie(
      (await cookies()).get(SESSION_COOKIE)?.value,
    );
    if (!session.valid) return <LandingPage />;
  }
  return <OverviewDashboard />;
}
