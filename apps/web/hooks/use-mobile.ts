'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * True when the viewport is below the md breakpoint. Used by the sidebar to
 * switch between the desktop rail and the mobile Sheet drawer. Starts
 * `undefined` on the server and resolves after mount, so callers should treat
 * the first render as "unknown" (the coerced `!!` below makes that desktop).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
