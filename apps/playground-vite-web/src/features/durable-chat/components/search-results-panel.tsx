import clsx from 'clsx';
import { ExternalLink, X } from 'lucide-react';

import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import { SiteIconBadge } from './site-icon-badge';

type SearchResultsPanelProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  result: ActiveSearchPanelData | null;
  onClose: () => void;
};

function formatDateLabel(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function SearchResultsPanel({ open, loading, error, result, onClose }: SearchResultsPanelProps) {
  return (
    <aside
      className={clsx(
        'flex h-full min-w-0 shrink-0 flex-col border-l border-[color:var(--chat-border)] bg-[var(--chat-surface)] transition-[width,opacity] duration-200',
        open ? 'w-[360px] opacity-100' : 'pointer-events-none w-0 opacity-0'
      )}
      aria-hidden={!open}
    >
      {open ? (
        <>
          <div className="flex items-center justify-between border-b border-[color:var(--chat-border)] px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[color:var(--chat-text)]">搜索结果</div>
              {result ? (
                <div className="truncate pt-1 text-xs text-[color:var(--chat-text-tertiary)]">
                  已阅读 {result.resultCount} 个网页{result.sourceNames.length > 0 ? ` · ${result.sourceNames.join(' · ')}` : ''}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--chat-text-secondary)] transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)]"
              aria-label="关闭搜索结果"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <div className="px-4 py-4 text-sm text-[color:var(--chat-text-secondary)]">正在加载搜索结果...</div> : null}
            {!loading && error ? <div className="px-4 py-4 text-sm text-[color:var(--destructive)]">{error}</div> : null}
            {!loading && !error && result ? (
              <div className="flex flex-col gap-1 p-2">
                {result.sections.map((section) => (
                  <div key={section.toolCallId} className="space-y-1 pb-2">
                    <div className="px-3 pb-1 pt-2">
                      <div className="text-xs font-medium text-[color:var(--chat-text-tertiary)]">{section.query}</div>
                    </div>
                    {section.results.map((item) => (
                      <a
                        key={`${section.toolCallId}:${item.rank}:${item.url}`}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-transparent px-3 py-3 transition hover:border-[color:var(--chat-border)] hover:bg-[var(--chat-hover)]"
                      >
                        <div className="flex items-center gap-2 text-xs text-[color:var(--chat-text-tertiary)]">
                          <SiteIconBadge
                            hostname={item.hostname}
                            label={item.sourceName}
                            className="h-4 w-4"
                            fallbackClassName="bg-indigo-100 text-indigo-700"
                          />
                          <span className="font-medium text-[color:var(--chat-text-secondary)]">{item.sourceName}</span>
                          {formatDateLabel(item.publishedAt) ? <span>{formatDateLabel(item.publishedAt)}</span> : null}
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--chat-surface-muted)] px-1.5 text-[11px] text-[color:var(--chat-text-tertiary)]">
                            {item.rank}
                          </span>
                        </div>
                        <div className="mt-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-[15px] font-semibold leading-6 text-[color:var(--chat-text)]">{item.title}</div>
                            {item.snippet ? (
                              <div className="line-clamp-3 pt-1 text-sm leading-6 text-[color:var(--chat-text-secondary)]">{item.snippet}</div>
                            ) : null}
                          </div>
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--chat-text-tertiary)]" />
                        </div>
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}
