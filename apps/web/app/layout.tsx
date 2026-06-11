import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { authEnabled } from '../lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulse — Campaign Copilot',
  description: 'AI-native mini CRM for reaching shoppers',
};

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/copilot', label: 'Copilot' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/segments', label: 'Segments' },
  { href: '/simulator', label: 'Chaos panel' },
  { href: '/data', label: 'Data' },
  { href: '/docs', label: 'API Docs' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 border-r border-slate-200 bg-white px-4 py-6">
            <Link href="/" className="flex items-center gap-2 px-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pulse-600 font-bold text-white">
                P
              </span>
              <span className="text-lg font-semibold tracking-tight">Pulse</span>
            </Link>
            <nav className="mt-8 space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-pulse-50 hover:text-pulse-700"
                >
                  {item.label}
                </Link>
              ))}
              {authEnabled() && (
                <form action="/api/auth/logout" method="post" className="pt-4">
                  <button
                    type="submit"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  >
                    Sign out
                  </button>
                </form>
              )}
            </nav>
          </aside>
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
