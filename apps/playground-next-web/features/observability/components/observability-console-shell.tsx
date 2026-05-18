'use client';

import type { ReactNode } from 'react';
import { BarChart3, Database, LogOut, RefreshCw, ScrollText } from 'lucide-react';

import { usePlaygroundLogout } from '@/components/chat-shell/use-playground-logout';
import { Button } from '@/components/ui/button';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

type ObservabilitySection = 'runs' | 'datasets' | 'evals';

type ObservabilityConsoleShellProps = {
  activeSection: ObservabilitySection;
  currentUser: AuthUserDto;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onRefresh: () => void;
  sectionHrefs?: Partial<Record<ObservabilitySection, string>>;
  children: ReactNode;
};

const SECTIONS: Array<{
  id: ObservabilitySection;
  label: string;
  href: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: 'runs',
    label: 'Runs',
    href: '/observability',
    description: 'Run inspection',
    icon: <BarChart3 className="size-4" />
  },
  {
    id: 'datasets',
    label: 'Datasets',
    href: '/observability/datasets',
    description: 'Example curation',
    icon: <Database className="size-4" />
  },
  {
    id: 'evals',
    label: 'Evals',
    href: '/observability/evals',
    description: 'Result review',
    icon: <ScrollText className="size-4" />
  }
];

export function ObservabilityConsoleShell({
  activeSection,
  currentUser,
  title,
  subtitle,
  icon,
  onRefresh,
  sectionHrefs,
  children
}: ObservabilityConsoleShellProps) {
  const logout = usePlaygroundLogout();

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--chat-border-strong)] bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]">
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--chat-text)]">{title}</h1>
            <p className="truncate text-sm text-[var(--chat-muted)]">{subtitle}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 max-w-[260px] truncate rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-1.5 text-xs text-[var(--chat-muted)] md:block">
            {currentUser.email}
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[176px_minmax(0,1fr)] lg:grid-rows-1">
        <nav
          aria-label="Observability sections"
          className="min-h-0 border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 lg:border-b-0 lg:border-r lg:py-4"
        >
          <div className="mb-2 hidden px-2 text-xs font-semibold uppercase tracking-wide text-[var(--chat-muted)] lg:block">Observability</div>
          <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">
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
                  <span className="mt-0.5 hidden truncate text-xs text-[var(--chat-muted)] lg:block">{section.description}</span>
                </a>
              );
            })}
          </div>
        </nav>

        <section className="min-h-0 overflow-hidden">{children}</section>
      </div>
    </main>
  );
}
