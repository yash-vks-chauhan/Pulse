import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
  { href: '/data', label: 'Data' },
  { href: '/docs', label: 'API Docs' },
];

const UPCOMING = [{ label: 'Insights', phase: 'Phase 3' }];

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
              <div className="pt-4">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Coming up
                </p>
                {UPCOMING.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3 py-2 text-sm text-slate-400"
                  >
                    <span>{item.label}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium">
                      {item.phase}
                    </span>
                  </div>
                ))}
              </div>
            </nav>
          </aside>
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
