export function readEnv(env: Record<string, string | undefined>, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean | undefined {
  const value = readEnv(env, key)?.toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (value === '0' || value === 'false' || value === 'no') return false;
  return undefined;
}

export function compactEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

export function compactConfig<T extends Record<string, unknown>>(config: T): T | undefined {
  return Object.keys(config).length > 0 ? config : undefined;
}
