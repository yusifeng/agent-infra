'use client';

import clsx from 'clsx';
import { Check, Link2, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

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

  const hasShare = Boolean(shareUrl);
  const primaryBusy = creatingShare || loadingCurrentShare;
  const primaryLabel = hasShare ? (copied ? '已复制' : '复制链接') : '创建并复制';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent aria-label="创建分享链接" className="max-w-xl" showClose={false}>
        <DialogClose
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭分享弹窗"
        >
          <X className="h-5 w-5" />
        </DialogClose>
        <DialogHeader className="pr-10">
          <DialogTitle>创建分享链接</DialogTitle>
          <DialogDescription className="leading-8">
            任何获得链接的人都可以查看你分享的对话，请确认其中不包含敏感或隐私内容。
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="mt-6 flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 pl-5 pr-1.5">
            <div className="min-w-0 flex-1 truncate text-[14px] text-slate-900">{shareUrl}</div>
            <Button
              type="button"
              onClick={onCreateOrCopy}
              disabled={primaryBusy}
              className={clsx('ml-3 h-11 shrink-0 rounded-full px-5', primaryBusy && 'pointer-events-none')}
            >
              {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              <span>{primaryLabel}</span>
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={onCreateOrCopy}
            disabled={primaryBusy}
            className={clsx('mt-6 h-12 w-full rounded-full', primaryBusy && 'pointer-events-none')}
          >
            {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            <span>{primaryLabel}</span>
          </Button>
        )}

        {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {hasShare ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onRevoke} disabled={revokingShare} className="rounded-full px-4">
              {revokingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>取消分享</span>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
