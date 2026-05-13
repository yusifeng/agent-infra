export function decodeRouteThreadId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveChatRouteThreadId(pathname: string) {
  if (pathname === '/new') {
    return null;
  }

  const match = pathname.match(/^\/chat\/([^/]+)$/);
  return match?.[1] ? decodeRouteThreadId(match[1]) : null;
}
