'use client';

import { Loader2, PencilLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent aria-label="重命名会话" className="max-w-md">
        <DialogHeader>
          <DialogTitle>重命名</DialogTitle>
          <DialogDescription>更新这个会话在侧边栏中的显示名称。</DialogDescription>
        </DialogHeader>

        <label className="mt-6 block">
          <span className="sr-only">会话标题</span>
          <Input
            autoFocus
            type="text"
            value={title}
            maxLength={120}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="输入会话标题"
            aria-label="会话标题"
            className="h-12 rounded-2xl px-4"
          />
        </label>

        {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={onClose}>
            取消
          </Button>
          <Button type="button" className="h-11 rounded-full px-5" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            <span>保存</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
