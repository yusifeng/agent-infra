import clsx from 'clsx';
import type { ButtonHTMLAttributes, ComponentType } from 'react';

import { DeepseekLogo } from './deepseek-logo';
import { WAVING_HAND_EMOJI_URL } from './ui';

type IconButtonProps = {
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  title: string;
  size?: 'default' | 'small';
  disabled?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'onClick'>;

export function IconButton({
  icon: Icon,
  onClick,
  title,
  size = 'default',
  disabled = false,
  className,
  ...buttonProps
}: IconButtonProps) {
  const frameClass = size === 'small' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-md';
  const iconClass = size === 'small' ? 'h-[14px] w-[14px]' : 'h-[18px] w-[18px]';

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      {...buttonProps}
      className={clsx(
        'flex items-center justify-center text-[color:var(--chat-text-secondary)] transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)] disabled:pointer-events-none disabled:opacity-50',
        frameClass,
        className
      )}
    >
      <Icon className={iconClass} />
    </button>
  );
}

export function ChatAvatar({ title, size }: { title: string; size?: number }) {
  return <DeepseekLogo className={size ? 'w-auto' : 'h-[23px] w-auto'} title={title} width={143} height={23} />;
}

export function AnimatedEmoji({ emoji, size = 40 }: { emoji: string; size?: number }) {
  return (
    <img
      alt={emoji}
      className="object-contain"
      height={size}
      loading="lazy"
      src={WAVING_HAND_EMOJI_URL}
      width={size}
    />
  );
}

export function ProviderMonogram({ provider }: { provider: string }) {
  return (
    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--chat-surface-muted)] text-[10px] font-semibold uppercase text-[color:var(--chat-text-secondary)]">
      {provider.slice(0, 1)}
    </span>
  );
}
