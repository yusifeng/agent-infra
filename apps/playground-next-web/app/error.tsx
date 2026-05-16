'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--chat-bg)] px-6 text-[color:var(--chat-text)]">
      <div className="w-full max-w-md rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] p-6 text-center shadow-[var(--chat-shadow-card)]">
        <h1 className="text-base font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--chat-muted)]">
          The playground could not render this page. Retry the request or return to a known chat route.
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
  );
}
