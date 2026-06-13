import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppSidebar, MobileSidebar } from '../components/app-sidebar';
import { PulseLogo } from '../components/logo';
import { PageTransition } from '../components/page-transition';
import { ThemeToggle } from '../components/theme-toggle';
import { authEnabled, readSessionCookie, SESSION_COOKIE } from '../lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Pulse — AI-native campaign copilot',
    template: '%s · Pulse',
  },
  description:
    'Describe the customers you want to win back — Pulse proposes the audience, drafts the message, executes across channels with automatic failover, and learns from the results.',
};

// Runs before first paint: saved choice wins, otherwise follow the OS.
// Inline (not a module) so there is never a flash of the wrong theme.
const THEME_INIT = `try{var t=localStorage.getItem('pulse-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

// Applies the saved sidebar collapse state before paint so the rail renders at
// the right width immediately (no expand→collapse flash on reload).
const SIDEBAR_INIT = `try{var c=localStorage.getItem('pulse-sidebar-collapsed');document.documentElement.dataset.sidebar=c==='1'?'collapsed':'expanded'}catch(e){}`;

function Shell({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Logged-out visitors get a bare page (landing or login card), not the app
  // chrome: showing the workspace nav to someone without a session is
  // misleading even though the middleware blocks every page behind it.
  let sessionName: string | undefined;
  if (authEnabled()) {
    const session = await readSessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
    if (!session.valid) {
      return <Shell>{children}</Shell>;
    }
    sessionName = session.name;
  }

  const showLogout = authEnabled();

  return (
    <Shell>
      <div className="flex min-h-screen">
        <AppSidebar sessionName={sessionName} showLogout={showLogout} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden">
            <Link href="/">
              <PulseLogo markClassName="h-7 w-7" wordClassName="text-base" />
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <MobileSidebar sessionName={sessionName} showLogout={showLogout} />
            </div>
          </header>
          <main className="flex-1 px-5 py-8 sm:px-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </Shell>
  );
}
