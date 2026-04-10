import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Banner, Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { defaultLocale, i18nOptions, isValidLocale, localeLabels, type Locale } from '../../lib/i18n';

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang: paramLang } = await params;
  const lang: Locale = isValidLocale(paramLang) ? paramLang : defaultLocale;
  const labels = localeLabels[lang];

  const navbar = (
    <Navbar
      logo={<strong>agent-infra</strong>}
      projectLink="https://github.com/yusifeng/agent-infra"
    />
  );

  const footer = <Footer>MIT {new Date().getFullYear()} © agent-infra.</Footer>;

  const banner = (
    <Banner storageKey={`agent-infra-docs-banner-${lang}`}>
      {labels.banner}
    </Banner>
  );

  return (
    <>
      <Head>
        <meta name="theme-color" content="#0b1020" />
      </Head>
      <Layout
        banner={banner}
        navbar={navbar}
        footer={footer}
        pageMap={await getPageMap(`/${lang}`)}
        docsRepositoryBase={`https://github.com/yusifeng/agent-infra/tree/main/apps/docs/content/${lang}`}
        sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
        toc={{ backToTop: labels.backToTop, title: labels.onThisPage }}
        editLink={labels.editThisPage}
        feedback={{ content: null }}
        i18n={i18nOptions}
      >
        {children}
      </Layout>
    </>
  );
}
