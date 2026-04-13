'use client';

import clsx from 'clsx';
import type { ComponentType } from 'react';

import { LOBE_AVATAR_URL, WAVING_HAND_EMOJI_URL } from './ui';

type IconButtonProps = {
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  title: string;
  size?: 'default' | 'small';
  disabled?: boolean;
  className?: string;
};

export function IconButton({
  icon: Icon,
  onClick,
  title,
  size = 'default',
  disabled = false,
  className
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
      className={clsx(
        'flex items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50',
        frameClass,
        className
      )}
    >
      <Icon className={iconClass} />
    </button>
  );
}

export function ChatAvatar({ title, size = 28 }: { title: string; size?: number }) {
  return (
    <img
      alt={title}
      className="rounded-full object-cover"
      height={size}
      loading="lazy"
      src={LOBE_AVATAR_URL}
      width={size}
    />
  );
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
    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold uppercase text-slate-500">
      {provider.slice(0, 1)}
    </span>
  );
}
