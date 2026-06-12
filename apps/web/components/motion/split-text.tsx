import { cn } from '@/lib/utils';

/**
 * SplitText — staggered word-by-word rise/blur reveal (react port of the
 * vue-bits "Split Text" effect). Pure CSS keyframes with per-word delays, so
 * it server-renders and never flashes; prefers-reduced-motion shows the text
 * immediately (handled in globals.css).
 */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 70,
  as: Tag = 'span',
}: {
  text: string;
  className?: string;
  /** ms before the first word starts */
  delay?: number;
  /** ms between words */
  stagger?: number;
  as?: 'span' | 'h1' | 'h2' | 'p' | 'div';
}) {
  const words = text.split(' ');
  return (
    <Tag className={cn(className)} aria-label={text}>
      {words.map((word, index) => (
        <span
          key={index}
          aria-hidden
          className="split-word"
          style={{ ['--word-delay' as string]: `${delay + index * stagger}ms` }}
        >
          {word}
          {index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}
