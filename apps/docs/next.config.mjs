import nextra from 'nextra';

const withNextra = nextra({
  latex: false,
  unstable_shouldAddLocaleToLinks: true
});

export default withNextra({
  reactStrictMode: true,
  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en'
  }
});
