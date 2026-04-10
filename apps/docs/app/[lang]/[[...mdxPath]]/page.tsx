import { Fragment } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { useMDXComponents as getMDXComponents } from '../../../mdx-components';
import { defaultLocale, isValidLocale, locales, type Locale } from '../../../lib/i18n';

export const generateStaticParams = generateStaticParamsFor('mdxPath', 'lang');

function isAssetLikePath(mdxPath?: string[]): boolean {
  return (mdxPath ?? []).some((segment) => segment.includes('.'));
}

function toLocaleHref(lang: Locale, mdxPath?: string[]): string {
  const pathname = mdxPath?.join('/');
  return pathname ? `/${lang}/${pathname}` : `/${lang}`;
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string; mdxPath?: string[] }>;
}): Promise<Metadata> {
  const { lang, mdxPath } = await props.params;

  if (!isValidLocale(lang) || isAssetLikePath(mdxPath)) {
    return {};
  }

  const { metadata } = await importPage(mdxPath, lang);

  return {
    ...metadata,
    alternates: {
      canonical: toLocaleHref(lang, mdxPath),
      languages: Object.fromEntries(
        locales.map((locale) => [locale, toLocaleHref(locale, mdxPath)])
      )
    }
  };
}

const Wrapper = getMDXComponents().wrapper ?? Fragment;

export default async function Page(props: {
  params: Promise<{ lang: string; mdxPath?: string[] }>;
}) {
  const { lang, mdxPath } = await props.params;

  if (!isValidLocale(lang) || isAssetLikePath(mdxPath)) {
    notFound();
  }

  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode
  } = await importPage(mdxPath, lang);

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={{ lang, mdxPath }} />
    </Wrapper>
  );
}
