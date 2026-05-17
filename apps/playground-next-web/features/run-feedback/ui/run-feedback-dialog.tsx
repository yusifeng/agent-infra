'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  PLAYGROUND_RUN_FEEDBACK_REASON_TAGS,
  type PlaygroundRunFeedbackDetails,
  type PlaygroundRunFeedbackReasonTag
} from '../types/playground-run-feedback-details';
import { cn } from '@/lib/utils';

const MAX_COMMENT_TEXT_LENGTH = 1000;

const REASON_TAG_LABELS: Record<PlaygroundRunFeedbackReasonTag, string> = {
  harmful_or_unsafe: '有害/不安全',
  false_or_misleading: '虚假信息',
  not_helpful: '没有帮助',
  other: '其他'
};

type RunFeedbackDialogProps = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (details: PlaygroundRunFeedbackDetails) => void;
};

export function RunFeedbackDialog({ open, loading, onClose, onSubmit }: RunFeedbackDialogProps) {
  const [selectedTags, setSelectedTags] = useState<Set<PlaygroundRunFeedbackReasonTag>>(new Set());
  const [commentText, setCommentText] = useState('');
  const normalizedCommentText = commentText.trim();
  const commentTooLong = normalizedCommentText.length > MAX_COMMENT_TEXT_LENGTH;

  useEffect(() => {
    if (!open) {
      setSelectedTags(new Set());
      setCommentText('');
    }
  }, [open]);

  function toggleTag(tag: PlaygroundRunFeedbackReasonTag) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (commentTooLong || loading) {
      return;
    }

    onSubmit({
      reasonTags: PLAYGROUND_RUN_FEEDBACK_REASON_TAGS.filter((tag) => selectedTags.has(tag)),
      commentText: normalizedCommentText || null
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !loading) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[560px]" showClose={false}>
        <DialogHeader className="gap-1">
          <DialogTitle>反馈</DialogTitle>
          <DialogDescription className="sr-only">
            选择可选原因并填写可选说明后提交点踩反馈。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="反馈原因">
          {PLAYGROUND_RUN_FEEDBACK_REASON_TAGS.map((tag) => {
            const selected = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                className={cn(
                  'rounded-full border px-3 py-1 text-[14px] leading-5 transition',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                )}
                aria-pressed={selected}
                disabled={loading}
                onClick={() => toggleTag(tag)}
              >
                {REASON_TAG_LABELS[tag]}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex flex-col gap-2">
          <span className="sr-only">反馈说明</span>
          <textarea
            value={commentText}
            rows={5}
            disabled={loading}
            aria-invalid={commentTooLong}
            className={cn(
              'min-h-[150px] resize-y rounded-2xl border border-border bg-background px-4 py-3 text-[14px] leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              commentTooLong ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20' : null
            )}
            placeholder="我们想知道你对此回答不满意的原因，你认为更好的回答是什么？"
            onChange={(event) => setCommentText(event.target.value)}
          />
        </label>
        {commentTooLong ? (
          <p className="mt-2 text-sm text-destructive">反馈说明最多 1000 个字符。</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full px-4" disabled={loading} onClick={onClose}>
            取消
          </Button>
          <Button type="button" className="rounded-full px-4" disabled={loading || commentTooLong} onClick={handleSubmit}>
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
