'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronsLeft,
  Code2,
  Database,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { PulseLogo, PulseMark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Application sidebar. Defined client-side so nav links can carry lucide icon
 * components (which cannot cross the server→client prop boundary) and so the
 * desktop rail can collapse to an icon-only mode.
 *
 * Collapse is flash-free: the chosen width is applied to html[data-sidebar] by
 * a pre-paint inline script in the root layout, and all collapse visuals are
 * driven from that attribute in CSS (see globals.css). React state only mirrors
 * it so tooltips/aria stay correct after hydration.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
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

const STORAGE_KEY = 'pulse-sidebar-collapsed';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U';
}

/** A single navigation row: active indicator + icon + (collapsible) label. */
function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-active={active}
      className={cn(
        'sb-row group/item flex h-10 items-center gap-3 rounded-lg px-3 text-sm',
        active
          ? 'bg-sidebar-active-surface font-semibold text-sidebar-active'
          : 'font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active
            ? 'text-sidebar-active'
            : 'text-sidebar-muted group-hover/item:text-sidebar-accent-foreground',
        )}
      />
      <span className="sb-collapsible min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );

  return (
    <li>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={10}
            className="border border-sidebar-border bg-sidebar-primary font-medium text-sidebar-primary-foreground"
          >
            {item.label}
          </TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

/** Grouped navigation, shared by the desktop rail and the mobile drawer. */
function NavGroups({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group.label} className="sb-group">
          <p className="sb-group-label px-3 pb-1.5 text-xs font-medium text-sidebar-muted">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Persistent desktop rail (hidden below md — mobile uses MobileSidebar). */
export function AppSidebar({
  sessionName,
  showLogout,
}: {
  sessionName?: string;
  showLogout: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const name = sessionName ?? 'Reviewer';

  // Mirror the pre-paint html attribute into state once mounted. Width itself
  // is already correct (CSS-driven), so this only governs tooltip/aria.
  React.useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === 'collapsed');
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded';
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // private mode etc. — toggle still works for this view
      }
      return next;
    });
  }, []);

  // Cmd/Ctrl+B toggles the rail, matching the shadcn sidebar convention.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="sb-aside sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {/* Header: brand (collapses smoothly) + icon-only collapse toggle */}
        <div className="flex h-16 shrink-0 items-center px-3">
          <Link
            href="/"
            aria-label="Pulse home"
            className="sb-brand flex min-w-0 items-center gap-2.5"
          >
            <PulseMark className="bg-sidebar-primary text-sidebar-primary-foreground" />
            <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-sidebar-foreground">
              Pulse
            </span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
            className="sb-toggle ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <ChevronsLeft className="sb-chevron h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Scrollable navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          <NavGroups collapsed={collapsed} />
        </div>

        {/* Footer: identity, sign out */}
        <div className="mt-auto flex shrink-0 flex-col gap-1 border-t border-sidebar-border p-3">
          <div className="sb-identity flex items-center gap-2.5 px-1.5 py-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
              {initials(name)}
            </span>
            <span
              className="sb-name min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground"
              title={name}
            >
              {name}
            </span>
            <ThemeToggle className="shrink-0" />
          </div>

          {showLogout && (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="sb-row flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                <span className="sb-collapsible">Sign out</span>
              </button>
            </form>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Mobile navigation — a real left slide-over drawer (replaces the dropdown). */
export function MobileSidebar({
  sessionName,
  showLogout,
}: {
  sessionName?: string;
  showLogout: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const name = sessionName ?? 'Reviewer';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left-full data-[state=open]:slide-in-from-left-full"
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-4">
            <Dialog.Title asChild>
              <Link href="/" onClick={close} aria-label="Pulse home">
                <PulseLogo markClassName="bg-sidebar-primary text-sidebar-primary-foreground" />
              </Link>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close navigation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <NavGroups onNavigate={close} />
          </div>

          <div className="mt-auto flex shrink-0 flex-col gap-1 border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 px-1.5 py-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
                {initials(name)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground"
                title={name}
              >
                {name}
              </span>
              <ThemeToggle className="shrink-0" />
            </div>
            {showLogout && (
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <LogOut className="h-[18px] w-[18px] shrink-0" />
                  Sign out
                </button>
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
