import { cn } from '@/lib/utils';

/**
 * Brand mark — a pulse waveform in a rounded tile. Token-driven (primary /
 * primary-foreground) so it inverts correctly between themes.
 */
export function PulseMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[58%] w-[58%]"
        aria-hidden
      >
        <path d="M2.5 12h4l2.5-6.5 4.5 13 2.5-6.5h5.5" />
      </svg>
    </span>
  );
}

export function PulseLogo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <PulseMark className={markClassName} />
      <span
        className={cn('text-lg font-semibold tracking-tight', wordClassName)}
      >
        Pulse
      </span>
    </span>
  );
}
