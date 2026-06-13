import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppHeader } from '../components/app-header';
import { AppSidebar } from '../components/app-sidebar';
import { PageTransition } from '../components/page-transition';
import { SidebarProvider } from '../components/ui/sidebar';
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Logged-out visitors get a bare page (landing or login card), not the app
  // chrome: showing the workspace nav to someone without a session is
  // misleading even though the middleware blocks every page behind it.
  const cookieStore = await cookies();
  let sessionName: string | undefined;
  if (authEnabled()) {
    const session = await readSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
    if (!session.valid) {
      return <Shell>{children}</Shell>;
    }
    sessionName = session.name;
  }

  const showLogout = authEnabled();
  // Flash-free collapse: the official sidebar persists open/closed to this
  // cookie, read here so the rail renders at the right width on first paint.
  const sidebarDefaultOpen = cookieStore.get('sidebar:state')?.value !== 'false';

  return (
    <Shell>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <AppSidebar sessionName={sessionName} showLogout={showLogout} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 p-4 sm:p-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </SidebarProvider>
    </Shell>
  );
}
