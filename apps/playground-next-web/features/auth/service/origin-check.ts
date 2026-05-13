export function assertAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>) {
  if (!origin?.trim()) {
    throw new Error('Origin header is required');
  }

  if (!allowedOrigins.has(origin)) {
    throw new Error(`Origin not allowed: ${origin}`);
  }
}
