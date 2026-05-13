'use client';

import clsx from 'clsx';
import { Check, Link2, Loader2, X } from 'lucide-react';

type ShareDialogProps = {
  open: boolean;
  loadingCurrentShare: boolean;
  creatingShare: boolean;
  revokingShare: boolean;
  copied: boolean;
  error: string | null;
  shareUrl: string | null;
  onClose: () => void;
  onCreateOrCopy: () => void;
  onRevoke: () => void;
};

function DialogButton({
  children,
  disabled = false,
  variant = 'primary',
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-60',
        variant === 'primary'
          ? 'bg-slate-900 text-white hover:bg-slate-700'
          : 'border border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:bg-[var(--chat-hover)]'
      )}
    >
      {children}
    </button>
  );
}

export function ShareDialog({
  open,
  loadingCurrentShare,
  creatingShare,
  revokingShare,
  copied,
  error,
  shareUrl,
  onClose,
  onCreateOrCopy,
  onRevoke
}: ShareDialogProps) {
  if (!open) {
    return null;
  }

  const hasShare = Boolean(shareUrl);
  const primaryBusy = creatingShare || loadingCurrentShare;
  const primaryLabel = hasShare ? (copied ? '已复制' : '复制链接') : '创建并复制';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-xl rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭分享弹窗"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-10">
          <h2 className="text-lg font-semibold text-[color:var(--chat-text)]">创建分享链接</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--chat-text-secondary)]">
            任何获得链接的人都可以查看你分享的对话，请确认其中不包含敏感或隐私内容。
          </p>
        </div>

        {shareUrl ? (
          <div className="mt-6 flex items-center overflow-hidden rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] pl-4 pr-1.5">
            <div className="min-w-0 flex-1 truncate text-sm text-[color:var(--chat-text)]">{shareUrl}</div>
            <DialogButton onClick={onCreateOrCopy} disabled={primaryBusy}>
              {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              <span>{primaryLabel}</span>
            </DialogButton>
          </div>
        ) : (
          <DialogButton onClick={onCreateOrCopy} disabled={primaryBusy}>
            {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            <span>{primaryLabel}</span>
          </DialogButton>
        )}

        {error ? <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {hasShare ? (
          <div className="mt-4 flex justify-end">
            <DialogButton variant="secondary" onClick={onRevoke} disabled={revokingShare}>
              {revokingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>取消分享</span>
            </DialogButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
