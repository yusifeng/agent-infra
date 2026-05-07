import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SiteIconBadge } from './site-icon-badge';

describe('SiteIconBadge', () => {
  it('renders a site icon image when hostname is available', () => {
    const markup = renderToStaticMarkup(
      <SiteIconBadge hostname="example.com" label="Example" className="h-4 w-4" />
    );

    expect(markup).toContain('src="/site-icons/example.com"');
    expect(markup).toContain('alt="Example"');
  });

  it('renders a text fallback when hostname is unavailable', () => {
    const markup = renderToStaticMarkup(
      <SiteIconBadge hostname="" label="Example" className="h-4 w-4" fallbackClassName="bg-indigo-100" />
    );

    expect(markup).toContain('<span');
    expect(markup).toContain('Example');
    expect(markup).toContain('>E<');
  });
});
