'use client';

export default function AuthPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen px-6 py-10 text-[color:var(--auth-text)] [background:var(--auth-page-bg)]">
      <div className="pointer-events-none absolute inset-0 [background:var(--auth-page-ambient-bg)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-[420px] flex-col justify-center">
        <div className="rounded-lg border border-[color:var(--auth-field-border)] bg-[rgba(255,255,255,0.8)] p-6 text-center shadow-[0_20px_60px_rgba(148,163,184,0.16)]">
          <h1 className="text-base font-semibold">Authentication page failed to load</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--auth-muted-text)]">
            Retry loading the form before submitting credentials.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 h-9 rounded-md bg-[var(--auth-accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--auth-accent-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
