'use client';

import { usePathname } from 'next/navigation';
import { GROUPS, isActiveRoute } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/** Longest nav href that matches the current path → its label (else "Pulse"). */
function currentLabel(pathname: string): string {
  const match = GROUPS.flatMap((group) => group.items)
    .filter((item) => isActiveRoute(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? 'Pulse';
}

/**
 * Slim top chrome: sidebar toggle (☰, opens the Sheet on mobile) + current-page
 * label, with the theme toggle on the right. Sticky, and tinted with the
 * sidebar surface so it reads as one continuous chrome with the rail rather
 * than a separate bar floating over the content.
 */
export function AppHeader() {
  const pathname = usePathname();
  // On the copilot page a full-bleed grainient sits behind the whole shell, so
  // the header drops to lighter frosted glass to let that ambient show through.
  const onCopilot = pathname.startsWith('/copilot');
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3 text-sidebar-foreground sm:px-4',
        onCopilot
          ? 'bg-sidebar/50 shadow-[0_4px_16px_-8px_rgb(30_41_82_/_0.10)] backdrop-blur-xl dark:bg-sidebar/55 dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]'
          : 'bg-sidebar/85 backdrop-blur',
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4 bg-sidebar-border" />
      <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
        {currentLabel(pathname)}
      </span>
      <ThemeToggle className="ml-auto" />
    </header>
  );
}
