import clsx from 'clsx';
import { memo, type ComponentType } from 'react';

export const MessageActions = memo(function MessageActions({
  available = true,
  items,
  align = 'start',
  onActionClick
}: {
  available?: boolean;
  items: Array<{
    active?: boolean;
    disabled?: boolean;
    icon: ComponentType<{ className?: string }>;
    key: string;
    label: string;
  }>;
  align?: 'start' | 'end';
  onActionClick: (key: string) => void;
}) {
  return (
    <div
      className={clsx(
        'absolute inset-x-0 bottom-0 flex w-full px-4',
        available
          ? 'pointer-events-none translate-y-1 opacity-0 transition duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'
          : 'pointer-events-none invisible',
        align === 'end' ? 'justify-end' : 'justify-start'
      )}
      data-message-actions="true"
      data-message-actions-available={available ? 'true' : 'false'}
    >
      <div className="flex items-center gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={!available || item.disabled}
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              if (available && !item.disabled) {
                onActionClick(item.key);
              }
            }}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)] disabled:cursor-not-allowed disabled:opacity-40',
              item.active
                ? 'bg-[var(--chat-accent)] text-white hover:bg-[var(--chat-accent)] hover:text-white'
                : 'text-[color:var(--chat-icon-muted)]'
            )}
          >
            <item.icon className="h-[15px] w-[15px]" />
          </button>
        ))}
      </div>
    </div>
  );
});
