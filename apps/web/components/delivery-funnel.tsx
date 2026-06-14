import { cn } from '@/lib/utils';

/**
 * DeliveryFunnel — the single source of truth for the "sent → delivered →
 * opened → clicked" visual that appears in three places: the public landing
 * hero, the signed-in overview console, and the live campaign detail page.
 *
 * It renders a stepped horizontal funnel: each stage's bar is drawn to scale
 * against the audience total, so the bars narrow stage to stage and the shape
 * itself tells the drop-off story. Behind each fill, a faint "ghost" extends to
 * the *previous* stage's width — the gap you see is exactly what was lost at
 * that step, so retention reads at a glance without extra chart chrome.
 *
 * One component, three entrance behaviours via `variant`:
 *  - `reveal`  bars grow when a `<Reveal>` ancestor scrolls into view (landing).
 *  - `mount`   bars grow on mount / re-mount (overview console).
 *  - `live`    width animates whenever the value changes (detail page polling).
 */

export interface FunnelStage {
  label: string;
  value: number;
  /** Tailwind bg-* class — drives both the bar and its stage dot. */
  color: string;
}

/** Shared stage labels + colours so all three surfaces stay identical. */
export const FUNNEL_META: { key: string; label: string; color: string }[] = [
  { key: 'sent', label: 'Sent', color: 'bg-foreground/70' },
  { key: 'delivered', label: 'Delivered', color: 'bg-accent' },
  { key: 'engaged', label: 'Opened / read', color: 'bg-violet-500' },
  { key: 'clicked', label: 'Clicked', color: 'bg-success' },
];

/** Build stages from a `{ sent, delivered, engaged, clicked }` count map. */
export function funnelStages(values: Record<string, number>): FunnelStage[] {
  return FUNNEL_META.map((meta) => ({
    label: meta.label,
    color: meta.color,
    value: values[meta.key] ?? 0,
  }));
}

type Variant = 'reveal' | 'mount' | 'live';

function fillProps(variant: Variant, widthPct: number, delay: number) {
  const width = `${Math.min(100, widthPct)}%`;
  if (variant === 'live') {
    return {
      className: 'transition-[width] duration-700 ease-out',
      style: { width } as React.CSSProperties,
    };
  }
  const animationClass = variant === 'mount' ? 'bar-grow' : 'funnel-fill';
  return {
    className: animationClass,
    style: {
      ['--bar-w' as string]: width,
      ['--bar-delay' as string]: `${delay}ms`,
    } as React.CSSProperties,
  };
}

export function DeliveryFunnel({
  stages,
  total,
  variant = 'reveal',
  className,
}: {
  stages: FunnelStage[];
  total: number;
  variant?: Variant;
  className?: string;
}) {
  const base = Math.max(total, 1);

  return (
    <div className={cn('space-y-3.5', className)}>
      {stages.map((stage, index) => {
        const widthPct = (stage.value / base) * 100;
        const totalPct = Math.round(widthPct);
        const prevPct = index > 0 ? Math.min(100, (stages[index - 1].value / base) * 100) : 0;
        const fill = fillProps(variant, widthPct, 200 + index * 130);

        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', stage.color)} />
                {stage.label}
              </span>
              <span className="font-medium tabular-nums">
                {stage.value.toLocaleString()}{' '}
                <span className="text-muted-foreground">({totalPct}%)</span>
              </span>
            </div>
            <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              {index > 0 && (
                <div
                  aria-hidden
                  className={cn('absolute inset-y-0 left-0 rounded-full opacity-[0.18]', stage.color)}
                  style={{ width: `${prevPct}%` }}
                />
              )}
              <div
                className={cn('absolute inset-y-0 left-0 rounded-full', stage.color, fill.className)}
                style={fill.style}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
