'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * NumberTicker — rolls between values whenever `value` changes (eased rAF,
 * ~600ms). Unlike CountUp (one-shot, on scroll into view) this re-animates on
 * every change, so live counts feel alive as rules are edited. Starts from 0
 * on mount so the first result also rolls in. Reduced-motion users see values
 * snap instantly.
 */
export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    fromRef.current = to;
    if (from === to) {
      setDisplay(to);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const duration = 600;
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
