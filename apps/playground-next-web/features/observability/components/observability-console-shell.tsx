'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { BarChart3, Database, LogOut, PanelLeft, RefreshCw, ScrollText } from 'lucide-react';

import { usePlaygroundLogout } from '@/components/chat-shell/use-playground-logout';
import { Button } from '@/components/ui/button';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { cn } from '@/lib/utils';

type ObservabilitySection = 'runs' | 'datasets' | 'evals';

type ObservabilityConsoleShellProps = {
  activeSection: ObservabilitySection;
  currentUser: AuthUserDto;
  onRefresh: () => void;
  sectionHrefs?: Partial<Record<ObservabilitySection, string>>;
  children: ReactNode;
};

const SECTIONS: Array<{
  id: ObservabilitySection;
  label: string;
  href: string;
  icon: ReactNode;
}> = [
  {
    id: 'runs',
    label: 'Runs',
    href: '/observability',
    icon: <BarChart3 className="size-4" />
  },
  {
    id: 'datasets',
    label: 'Datasets',
    href: '/observability/datasets',
    icon: <Database className="size-4" />
  },
  {
    id: 'evals',
    label: 'Evals',
    href: '/observability/evals',
    icon: <ScrollText className="size-4" />
  }
];

export function ObservabilityConsoleShell({
  activeSection,
  currentUser,
  onRefresh,
  sectionHrefs,
  children
}: ObservabilityConsoleShellProps) {
  const logout = usePlaygroundLogout();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <main className="flex h-dvh min-h-0 overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <div
        className={cn(
          'relative shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
          sidebarOpen ? 'w-[176px]' : 'w-0'
        )}
      >
        {sidebarOpen ? (
          <nav
            aria-label="Observability sections"
            className="absolute inset-y-0 left-0 z-20 flex w-[176px] flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-3 py-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--chat-muted)]">Observability</div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Collapse observability sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft className="size-4" />
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {SECTIONS.map((section) => {
                const active = section.id === activeSection;
                const href = sectionHrefs?.[section.id] ?? section.href;
                return (
                  <a
                    key={section.id}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-muted)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-text)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {section.icon}
                      <span className="font-medium">{section.label}</span>
                    </span>
                  </a>
                );
              })}
            </div>
            <div className="mt-auto flex flex-col items-stretch justify-start gap-2 border-t border-[color:var(--chat-border)] pt-2">
              <div className="min-w-0 truncate px-2 text-xs text-[var(--chat-muted)]">{currentUser.email}</div>
              <Button variant="outline" size="sm" onClick={onRefresh} className="justify-start">
                <RefreshCw className="size-4" />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  void logout();
                }}
              >
                <LogOut className="size-4" />
                Log out
              </Button>
            </div>
          </nav>
        ) : null}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {!sidebarOpen ? (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Open observability sidebar"
            className="absolute left-3 top-3 z-30 bg-[var(--chat-surface)]"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
        <section className="h-full min-h-0 overflow-hidden">{children}</section>
      </div>
    </main>
  );
}
