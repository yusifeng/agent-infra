import type { Metadata } from 'next';
import 'nextra-theme-docs/style.css';

export const metadata: Metadata = {
  title: {
    default: 'agent-infra Docs',
    template: '%s | agent-infra Docs'
  },
  description: 'Official documentation for agent-infra durable backend packages and runtime adapters.',
  icons: {
    icon: '/favicon.svg'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
