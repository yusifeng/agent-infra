'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';

import {
  prepareMarkdownRender,
  renderHighlightedMarkdown,
  scheduleLowPriorityMarkdownTask,
  touchMarkdownCache
} from './markdown-service';

type MarkdownRendererProps = Omit<HTMLAttributes<HTMLDivElement>, 'dangerouslySetInnerHTML' | 'children'> & {
  text: string;
  cacheKey?: string;
  plainTextClassName?: string;
};

export function MarkdownRenderer({
  text,
  cacheKey,
  className,
  plainTextClassName,
  ...rest
}: MarkdownRendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copyTimeoutsRef = useRef(new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>());
  const [mounted, setMounted] = useState(false);
  const prepared = useMemo(() => (mounted ? prepareMarkdownRender({ text, cacheKey }) : null), [mounted, cacheKey, text]);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!prepared) {
      setHtml(null);
      return;
    }

    setHtml((previous) => (previous === prepared.initialHtml ? previous : prepared.initialHtml));
  }, [prepared]);

  useEffect(() => {
    if (!prepared) return;

    const { cached, hasCodeBlocks, key, hash, safeBaseHtml, rawHtml } = prepared;

    if (cached) {
      touchMarkdownCache(key, cached);
      if (cached.highlightedHtml || !hasCodeBlocks) {
        return;
      }
    } else {
      touchMarkdownCache(key, {
        hash,
        sourceText: text,
        baseHtml: safeBaseHtml,
        rawHtml,
        hasCodeBlocks
      });
      if (!hasCodeBlocks) {
        return;
      }
    }

    let cancelled = false;
    const workerAbortController = new AbortController();
    const cancelScheduled = scheduleLowPriorityMarkdownTask(() => {
      void (async () => {
        let highlightedHtml = '';
        try {
          highlightedHtml = await renderHighlightedMarkdown({
            text,
            rawHtml,
            signal: workerAbortController.signal
          });
        } catch {
          if (workerAbortController.signal.aborted) return;
          return;
        }

        if (cancelled) return;

        touchMarkdownCache(key, {
          hash,
          sourceText: text,
          baseHtml: safeBaseHtml,
          rawHtml,
          highlightedHtml,
          hasCodeBlocks
        });

        setHtml((previous) => (previous === highlightedHtml ? previous : highlightedHtml));
      })();
    });

    return () => {
      cancelled = true;
      workerAbortController.abort();
      cancelScheduled();
    };
  }, [prepared, text]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest('[data-copy-code]');
      if (!(button instanceof HTMLButtonElement)) return;

      const code = button.closest('[data-component=\"markdown-code\"]')?.querySelector('pre code')?.textContent ?? '';
      if (!code || !navigator.clipboard) return;

      try {
        await navigator.clipboard.writeText(code);
      } catch {
        return;
      }

      button.dataset.copied = 'true';
      button.textContent = 'Copied';
      button.setAttribute('aria-label', 'Copied');
      button.setAttribute('title', 'Copied');

      const existing = copyTimeoutsRef.current.get(button);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        button.dataset.copied = 'false';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy code');
        button.setAttribute('title', 'Copy code');
      }, 2000);

      copyTimeoutsRef.current.set(button, timeout);
    };

    root.addEventListener('click', onClick);

    return () => {
      root.removeEventListener('click', onClick);
      for (const timeout of copyTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      copyTimeoutsRef.current.clear();
    };
  }, [html]);

  if (!text.trim()) {
    return null;
  }

  if (!prepared || html === null) {
    return (
      <div className={clsx('whitespace-pre-wrap break-words', plainTextClassName, className)} {...rest}>
        {text}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={clsx('markdown-body', className)}
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  );
}
