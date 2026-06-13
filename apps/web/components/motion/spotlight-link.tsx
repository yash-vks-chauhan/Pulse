'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * SpotlightLink — a Link whose surface lights up with a soft accent glow that
 * tracks the cursor (react port of the vue-bits "Spotlight Card" / "Magic
 * Bento" idea). The glow is a token-driven `::before` painted above the card
 * background but under its content, so text stays crisp. Pointer position is
 * written to CSS variables on the element itself — no React state, so moving
 * the cursor never triggers a re-render. CSS-only falloff; reduced-motion users
 * get a plain card (the glow is disabled in globals.css).
 */
export function SpotlightLink({
  className,
  onPointerMove,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn('spotlight', className)}
      onPointerMove={(event) => {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        target.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
        onPointerMove?.(event);
      }}
      {...props}
    />
  );
}
