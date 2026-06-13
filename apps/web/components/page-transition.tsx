'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Replays a soft fade-in on every route change. Keyed by pathname so the
 * wrapper remounts and the animation restarts on navigation.
 *
 * Opacity only by design — a transform/filter here would establish a
 * containing block and break position:fixed page backgrounds (the copilot
 * ambient grainient is fixed to the viewport).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
