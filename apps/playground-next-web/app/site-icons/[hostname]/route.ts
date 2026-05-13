function isValidSiteIconHostname(hostname: string) {
  return /^[a-z0-9.-]+$/i.test(hostname) && hostname.includes('.') && !hostname.includes('..');
}

function buildFallbackSiteIconSvg(hostname: string) {
  const label = hostname.replace(/^www\./, '').slice(0, 1).toUpperCase() || '?';
  const escapedLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#eef2ff"/>
  <text x="32" y="38" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#4f46e5">${escapedLabel}</text>
</svg>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ hostname: string }> }) {
  const { hostname: rawHostname } = await params;
  const hostname = rawHostname.trim().toLowerCase();

  if (!isValidSiteIconHostname(hostname)) {
    return new Response('Invalid hostname', {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8'
      }
    });
  }

  const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;

  try {
    const response = await fetch(googleUrl, {
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      return new Response(await response.arrayBuffer(), {
        headers: {
          'cache-control': 'public, max-age=86400',
          'content-type': response.headers.get('content-type') || 'image/png'
        }
      });
    }
  } catch {
    // Fall through to deterministic SVG fallback.
  }

  return new Response(buildFallbackSiteIconSvg(hostname), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'image/svg+xml; charset=utf-8'
    }
  });
}
