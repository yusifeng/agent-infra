'use client';

import { ChatThemeProvider } from '@/components/chat-theme-provider';

export default function PublicShareError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ChatThemeProvider>
      <main className="flex h-dvh min-h-0 items-center justify-center bg-[var(--chat-bg)] px-6 text-[color:var(--chat-text)]">
        <div className="w-full max-w-md rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] p-6 text-center shadow-[var(--chat-shadow-card)]">
          <h1 className="text-base font-semibold">Shared conversation failed to load</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--chat-muted)]">
            The public snapshot could not be loaded.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 h-9 rounded-md bg-[var(--chat-brand-accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--chat-brand-accent-hover)]"
          >
            Retry
          </button>
        </div>
      </main>
    </ChatThemeProvider>
  );
}
