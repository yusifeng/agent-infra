export type SearchParamReader = {
  get(name: string): string | null;
};

export function resolveSafeNextPath(searchParams: SearchParamReader) {
  const value = searchParams.get('next') ?? '/new';
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/new';
  }

  return value;
}

export function buildAuthHref(path: string, searchParams: SearchParamReader, extraParams: Record<string, string> = {}) {
  const params = new URLSearchParams();
  const next = searchParams.get('next');

  if (next) {
    params.set('next', next);
  }

  for (const [key, value] of Object.entries(extraParams)) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
