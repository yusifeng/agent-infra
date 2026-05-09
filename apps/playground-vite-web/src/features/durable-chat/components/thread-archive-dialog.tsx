import { Archive, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

type ThreadArchiveDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ThreadArchiveDialog(props: ThreadArchiveDialogProps) {
  const { open, loading, error, onClose, onConfirm } = props;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <AlertDialogContent aria-label="删除会话" className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>删除会话</AlertDialogTitle>
          <AlertDialogDescription>
            这个操作会把会话从侧边栏中移除，但不会自动撤销已经创建的分享链接。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={onClose}>
              取消
            </Button>
          </AlertDialogCancel>
          <Button type="button" variant="destructive" className="h-11 rounded-full px-5" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            <span>确认删除</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
