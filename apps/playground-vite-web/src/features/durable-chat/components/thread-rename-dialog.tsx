import clsx from 'clsx';
import { Loader2, PencilLine, X } from 'lucide-react';

type ThreadRenameDialogProps = {
  open: boolean;
  title: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onConfirm: () => void;
};

export function ThreadRenameDialog(props: ThreadRenameDialogProps) {
  const { open, title, loading, error, onClose, onTitleChange, onConfirm } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--chat-overlay)] px-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="重命名会话"
        className="w-full max-w-md rounded-[28px] bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">重命名</h2>
            <p className="mt-3 text-[14px] leading-7 text-slate-700">更新这个会话在侧边栏中的显示名称。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭重命名弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 block">
          <span className="sr-only">会话标题</span>
          <input
            autoFocus
            type="text"
            value={title}
            maxLength={120}
            onChange={(event) => onTitleChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="输入会话标题"
          />
        </label>

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
              loading ? 'bg-blue-300' : 'bg-blue-500 hover:bg-blue-600'
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            <span>保存</span>
          </button>
        </div>
      </div>
    </div>
  );
}
