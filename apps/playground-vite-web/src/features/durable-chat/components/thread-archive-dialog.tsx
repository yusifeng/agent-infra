import clsx from 'clsx';
import { Archive, Loader2, X } from 'lucide-react';

type ThreadArchiveDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ThreadArchiveDialog(props: ThreadArchiveDialogProps) {
  const { open, loading, error, onClose, onConfirm } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--chat-overlay)] px-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="删除会话"
        className="w-full max-w-md rounded-[28px] bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">删除会话</h2>
            <p className="mt-3 text-[14px] leading-7 text-slate-700">
              这个操作会把会话从侧边栏中移除，但不会自动撤销已经创建的分享链接。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭删除确认弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-white transition',
              loading ? 'bg-red-300' : 'bg-red-500 hover:bg-red-600'
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            <span>确认删除</span>
          </button>
        </div>
      </div>
    </div>
  );
}
