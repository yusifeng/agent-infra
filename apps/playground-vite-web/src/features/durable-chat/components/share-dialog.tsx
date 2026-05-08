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

export function ShareDialog(props: ShareDialogProps) {
  const {
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
  } = props;

  if (!open) {
    return null;
  }

  const hasShare = Boolean(shareUrl);
  const primaryBusy = creatingShare || loadingCurrentShare;
  const primaryLabel = hasShare ? (copied ? '已复制' : '复制链接') : '创建并复制';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--chat-overlay)] px-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="创建分享链接"
        className="w-full max-w-xl rounded-[28px] bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">创建分享链接</h2>
            <p className="mt-3 text-[14px] leading-8 text-slate-700">
              任何获得链接的人都可以查看你分享的对话，请确认其中不包含敏感或隐私内容。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭分享弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {shareUrl ? (
          <div className="mt-6 flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 pl-5 pr-1.5">
            <div className="min-w-0 flex-1 truncate text-[14px] text-slate-900">{shareUrl}</div>
            <button
              type="button"
              onClick={onCreateOrCopy}
              disabled={primaryBusy}
              className={clsx(
                'ml-3 inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium text-white transition',
                primaryBusy ? 'bg-blue-300' : 'bg-blue-500 hover:bg-blue-600'
              )}
            >
              {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              <span>{primaryLabel}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onCreateOrCopy}
            disabled={primaryBusy}
            className={clsx(
              'mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition',
              primaryBusy ? 'bg-blue-300' : 'bg-blue-500 hover:bg-blue-600'
            )}
          >
            {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            <span>{primaryLabel}</span>
          </button>
        )}

        {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {hasShare ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onRevoke}
              disabled={revokingShare}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {revokingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>取消分享</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
