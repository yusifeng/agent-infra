import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { ObservabilityConsole } from '@/features/observability/components/observability-console';

export default function ObservabilityPage() {
  return (
    <ChatThemeProvider>
      <ObservabilityConsole />
    </ChatThemeProvider>
  );
}
