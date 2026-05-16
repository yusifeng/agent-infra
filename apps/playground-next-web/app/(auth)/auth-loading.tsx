export function AuthLoading() {
  return (
    <main className="min-h-screen px-6 py-10 text-[color:var(--auth-text)] [background:var(--auth-page-bg)]">
      <div className="pointer-events-none absolute inset-0 [background:var(--auth-page-ambient-bg)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-[420px] flex-col justify-center">
        <div className="space-y-6 rounded-lg border border-[color:var(--auth-field-border)] bg-[rgba(255,255,255,0.74)] p-6 shadow-[0_20px_60px_rgba(148,163,184,0.16)]">
          <div className="space-y-3">
            <div className="h-5 w-40 rounded-md bg-[rgba(148,163,184,0.18)]" />
            <div className="h-3 w-56 rounded-md bg-[rgba(148,163,184,0.14)]" />
          </div>
          <div className="space-y-3">
            <div className="h-[42px] rounded-full bg-[rgba(148,163,184,0.12)]" />
            <div className="h-[42px] rounded-full bg-[rgba(148,163,184,0.12)]" />
            <div className="h-[42px] rounded-full bg-[rgba(66,99,235,0.18)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
