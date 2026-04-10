export const locales = ['en', 'zh'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const i18nOptions: { locale: Locale; name: string }[] = [
  { locale: 'en', name: 'English' },
  { locale: 'zh', name: '中文' }
];

export function isValidLocale(lang: string): lang is Locale {
  return locales.includes(lang as Locale);
}

export const localeLabels: Record<
  Locale,
  {
    banner: string;
    editThisPage: string;
    onThisPage: string;
    backToTop: string;
  }
> = {
  en: {
    banner: '`playground-web` is the first consumer and experiment harness, not the product boundary.',
    editThisPage: 'Edit this page',
    onThisPage: 'On This Page',
    backToTop: 'Scroll to top'
  },
  zh: {
    banner: '`playground-web` 是第一个使用方与实验载体，而不是产品边界。',
    editThisPage: '编辑此页',
    onThisPage: '本页目录',
    backToTop: '返回顶部'
  }
};
