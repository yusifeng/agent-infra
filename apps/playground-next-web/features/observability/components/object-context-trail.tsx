import type { ReactNode } from 'react';

type ObjectContextTrailItem = {
  label: string;
  value: ReactNode;
  href?: string | null;
};

export function ObjectContextTrail({ items }: { items: ObjectContextTrailItem[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-[var(--chat-muted)]" aria-label="Object context">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 ? <span className="text-[var(--chat-muted)]">-&gt;</span> : null}
          <span>{item.label}</span>
          {item.href ? (
            <a className="min-w-0 truncate font-mono font-medium text-[var(--chat-accent)] hover:underline" href={item.href}>
              {item.value}
            </a>
          ) : (
            <span className="min-w-0 truncate font-mono font-medium text-[var(--chat-text)]">{item.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}
