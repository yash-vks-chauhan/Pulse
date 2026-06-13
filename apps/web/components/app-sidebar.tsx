'use client';

import {
  Code2,
  Database,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { PulseMark } from '@/components/logo';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Workspace',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/copilot', label: 'Copilot', icon: Sparkles },
      { href: '/campaigns', label: 'Campaigns', icon: Send },
      { href: '/segments', label: 'Segments', icon: Users },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/simulator', label: 'Chaos panel', icon: FlaskConical },
      { href: '/data', label: 'Data ingest', icon: Database },
      { href: '/docs', label: 'API docs', icon: Code2 },
    ],
  },
];

export function isActiveRoute(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U';
}

/**
 * Application sidebar built on the official shadcn Sidebar primitives
 * (inset variant, icon-collapsible). Collapse state, the ⌘B shortcut, the
 * mobile Sheet drawer, collapsed tooltips, and flash-free SSR (via the
 * sidebar:state cookie read in the root layout) are all handled by the
 * primitives — this component only declares the brand, nav, and footer.
 */
export function AppSidebar({
  sessionName,
  showLogout,
}: {
  sessionName?: string;
  showLogout: boolean;
}) {
  const pathname = usePathname();
  const name = sessionName ?? 'Reviewer';
  // On the copilot page the shell sits over a full-bleed grainient; the rail
  // becomes frosted glass (translucent surface + blur) so that ambient reads
  // through it as one continuous field with the header and content.
  const onCopilot = pathname.startsWith('/copilot');

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className={cn(
        onCopilot &&
          '[&>[data-sidebar=sidebar]]:bg-sidebar/55 [&>[data-sidebar=sidebar]]:shadow-[4px_0_16px_-10px_rgb(30_41_82_/_0.10)] [&>[data-sidebar=sidebar]]:backdrop-blur-xl dark:[&>[data-sidebar=sidebar]]:bg-sidebar/50 dark:[&>[data-sidebar=sidebar]]:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]',
      )}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-2.5">
              <Link href="/" aria-label="Pulse home">
                <PulseMark className="bg-sidebar-primary text-sidebar-primary-foreground" />
                <span className="truncate text-lg font-semibold tracking-tight">Pulse</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.08em]">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActiveRoute(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} aria-current={active ? 'page' : undefined}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {/* Account row — avatar + name on the left, a quiet inline sign-out on
              the right, kept to one tidy line so there is a single left edge.
              Collapses to just the centered avatar. */}
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
                {initials(name)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                title={name}
              >
                {name}
              </span>
              {showLogout && (
                <form
                  action="/api/auth/logout"
                  method="post"
                  className="shrink-0 group-data-[collapsible=icon]:hidden"
                >
                  <button
                    type="submit"
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <LogOut className="size-4" />
                  </button>
                </form>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
