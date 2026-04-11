import 'antd/dist/reset.css';

import { AntdRegistry } from '@ant-design/nextjs-registry';

import { ChatThemeProvider } from '@/components/chat-theme-provider';

type ChatShellLayoutProps = {
  children: React.ReactNode;
};

export default function ChatShellLayout({ children }: ChatShellLayoutProps) {
  return (
    <AntdRegistry>
      <ChatThemeProvider>{children}</ChatThemeProvider>
    </AntdRegistry>
  );
}
