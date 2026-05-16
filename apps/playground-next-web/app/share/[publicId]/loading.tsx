import { ChatThemeProvider } from '@/components/chat-theme-provider';

export default function PublicShareLoading() {
  return (
    <ChatThemeProvider>
      <main className="flex h-dvh min-h-0 items-center justify-center bg-[var(--chat-bg)] px-6 text-[color:var(--chat-muted)]">
        <div className="flex items-center gap-3 text-sm">
          <span className="size-2 rounded-full bg-[var(--chat-brand-accent)]" />
          <span>Loading shared conversation...</span>
        </div>
      </main>
    </ChatThemeProvider>
  );
}
