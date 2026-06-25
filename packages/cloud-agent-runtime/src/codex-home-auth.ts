import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export interface MaterializeCodexHomeAuthInput {
  authMode: 'api-key' | 'codex-home' | null;
  configDir: string;
  sourceHome: string | null;
}

export interface MaterializeCodexHomeAuthResult {
  copied: boolean;
  sourceAuthPath: string | null;
  targetAuthPath: string;
}

export async function materializeCodexHomeAuth(
  input: MaterializeCodexHomeAuthInput
): Promise<MaterializeCodexHomeAuthResult> {
  const targetAuthPath = path.join(input.configDir, 'auth.json');
  if (input.authMode !== 'codex-home') {
    await rm(targetAuthPath, { force: true });
    return {
      copied: false,
      sourceAuthPath: null,
      targetAuthPath
    };
  }

  if (!input.sourceHome) {
    return {
      copied: false,
      sourceAuthPath: null,
      targetAuthPath
    };
  }

  const sourceAuthPath = path.join(input.sourceHome, 'auth.json');
  const sourceStat = await stat(sourceAuthPath).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error(`CODEX_AUTH_MODE=codex-home requires an auth.json file at ${sourceAuthPath}.`);
  }

  if (path.resolve(sourceAuthPath) === path.resolve(targetAuthPath)) {
    return {
      copied: false,
      sourceAuthPath,
      targetAuthPath
    };
  }

  await mkdir(input.configDir, { recursive: true });
  await copyFile(sourceAuthPath, targetAuthPath);

  return {
    copied: true,
    sourceAuthPath,
    targetAuthPath
  };
}
