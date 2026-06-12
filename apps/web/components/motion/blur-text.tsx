import { cn } from '@/lib/utils';

/**
 * BlurText — soft blur + rise entrance for supporting copy (react port of the
 * vue-bits "Blur Text" effect). CSS-only; respects prefers-reduced-motion.
 */
export function BlurText({
  children,
  className,
  delay = 0,
  as: Tag = 'p',
}: {
  children: React.ReactNode;
  className?: string;
  /** ms before the animation starts */
  delay?: number;
  as?: 'span' | 'p' | 'div' | 'h2' | 'h3';
}) {
  return (
    <Tag
      className={cn('blur-in', className)}
      style={{ ['--blur-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
