export function ConsolePanelState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-sm text-[var(--chat-muted)]">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-[var(--chat-muted)]">{description}</div> : null}
      </div>
    </div>
  );
}
