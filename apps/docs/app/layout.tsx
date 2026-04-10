import type { Metadata } from 'next';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Banner, Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
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

const navbar = (
  <Navbar
    logo={<strong>agent-infra</strong>}
    projectLink="https://github.com/yusifeng/agent-infra"
  />
);

const footer = <Footer>MIT {new Date().getFullYear()} © agent-infra.</Footer>;

const banner = (
  <Banner storageKey="agent-infra-docs-banner">
    `playground-web` is the first consumer and experiment harness, not the product boundary.
  </Banner>
);

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="theme-color" content="#0b1020" />
      </Head>
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/yusifeng/agent-infra/tree/main/apps/docs/content"
          sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
          toc={{ backToTop: true }}
          editLink="Edit this page"
          feedback={{ content: null }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
