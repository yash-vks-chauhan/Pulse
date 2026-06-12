import { cn } from '@/lib/utils';

/**
 * Aurora — slow-drifting colour fields behind hero sections (react port of
 * the vue-bits "Aurora" background). Three blurred blobs on long offset
 * animation cycles; tokens keep it tasteful in both themes. Rendered behind
 * a dot-grid + edge mask by the caller.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
    >
      <div
        className="aurora-blob bg-accent/25 dark:bg-accent/20"
        style={{
          width: '46rem',
          height: '46rem',
          top: '-22rem',
          left: '50%',
          marginLeft: '-30rem',
          animationDelay: '0s',
        }}
      />
      <div
        className="aurora-blob bg-violet-400/20 dark:bg-violet-500/15"
        style={{
          width: '38rem',
          height: '38rem',
          top: '-16rem',
          left: '50%',
          marginLeft: '2rem',
          animationDelay: '-6s',
        }}
      />
      <div
        className="aurora-blob bg-sky-300/20 dark:bg-sky-400/10"
        style={{
          width: '30rem',
          height: '30rem',
          top: '-6rem',
          left: '50%',
          marginLeft: '-14rem',
          animationDelay: '-12s',
        }}
      />
    </div>
  );
}
