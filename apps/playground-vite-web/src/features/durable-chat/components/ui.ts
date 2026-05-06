export const LOBE_AVATAR_URL =
  'https://registry.npmmirror.com/@lobehub/fluent-emoji-3d/latest/files/assets/1f92f.webp';
export const WAVING_HAND_EMOJI_URL =
  'https://registry.npmmirror.com/@lobehub/fluent-emoji-anim-1/latest/files/assets/1f44b.webp';

export const maxWithTW = 'max-w-3xl';
export const composerMaxWithTW = 'max-w-[820px]';
export const messageListMinHeight = { minHeight: 'max(0px, calc(-400px + 100dvh))' };

export const ui = {
  shell: 'bg-[var(--chat-bg)]',
  secondarySurface: 'border border-[color:var(--chat-border)] bg-[var(--chat-surface)]',
  sidebar: 'border-r border-[color:var(--chat-border)] bg-[var(--chat-sidebar-bg)]',
  threadItem:
    'rounded-xl text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)]',
  threadItemActive: 'bg-[var(--chat-hover)] text-[color:var(--chat-text-secondary)]',
  navItem:
    'rounded-xl text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)]',
  chatHeaderTitle: 'overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold leading-[1.2] text-[color:var(--chat-text)]',
  chatPane: 'bg-[var(--chat-bg)]',
  messageViewport: 'bg-[var(--chat-bg)] [overscroll-behavior:contain] [scroll-padding-block-end:220px]',
  assistantBubble: 'text-[color:var(--chat-text)]',
  userBubble: 'bg-[var(--chat-user-bubble)] text-[color:var(--chat-text)]',
  subtlePanel: 'border border-[color:var(--chat-border)] bg-[var(--chat-surface)]',
  reasoning: 'border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)]',
  toolCall: 'border border-[color:var(--chat-tool-call-border)] bg-[color:var(--chat-tool-call-bg)]',
  toolResult: 'border border-[color:var(--chat-tool-result-border)] bg-[color:var(--chat-tool-result-bg)]',
  codeBlock: 'bg-[var(--chat-code-bg)] text-[var(--chat-code-text)]',
  composerDock: 'bg-[var(--chat-bg)] backdrop-blur-[8px]',
  composerCard: 'rounded-xl border border-[color:var(--chat-border)] bg-[var(--chat-surface)] shadow-[var(--chat-shadow-card)]',
  textarea: 'border-none bg-transparent text-[color:var(--chat-text)] outline-none placeholder:text-[color:var(--chat-placeholder)]',
  scrollButton: 'border border-[color:var(--chat-border)] bg-[var(--chat-surface)]',
  badge: 'border border-[color:var(--chat-border)] bg-[var(--chat-badge-bg)] text-[color:var(--chat-text-secondary)]',
  welcomeTitle: '[margin-block:0.2em_0] font-extrabold leading-none text-[color:var(--chat-text)]',
  welcomeDesc: 'text-center text-[color:var(--chat-text-secondary)]',
  warningBanner: 'chat-warning-banner',
  infoBanner: 'chat-info-banner',
  errorBanner: 'chat-error-banner',
  composerToggleButton:
    'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
  composerPrimaryButton:
    'flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] transition hover:border-[color:var(--chat-border-strong)] hover:bg-[var(--chat-hover)] disabled:cursor-default disabled:opacity-75',
  composerModelChip:
    'flex h-9 items-center gap-2 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-2.5 text-xs text-[color:var(--chat-text-secondary)] transition hover:border-[color:var(--chat-border-strong)]'
} as const;
