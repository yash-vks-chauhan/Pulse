'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * The app shell's content frame. Content is fluid: it fills the available
 * width, so it grows when the sidebar collapses and shrinks when it expands —
 * and because the sidebar's gap animates its width (transition-[width]
 * duration-200), that reflow rides the same smooth transition for free.
 *
 * Pages fill this width with real layouts (grids, tables, two-column splits);
 * individual text blocks keep their own inner max-width for readability so long
 * lines never hurt even when the column is wide.
 *
 * Full-bleed routes opt out and render edge-to-edge — currently the Copilot,
 * which paints a fixed ambient background behind the whole shell.
 */
const FULL_BLEED = ['/copilot'];

export function PageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (FULL_BLEED.some((route) => pathname.startsWith(route))) {
    return <>{children}</>;
  }
  return <div className="w-full">{children}</div>;
}
