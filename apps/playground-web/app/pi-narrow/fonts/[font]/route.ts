import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const piWebUiFontsDir = path.resolve(process.cwd(), 'node_modules/@mariozechner/pi-web-ui/dist/fonts');

function getContentType(font: string): string {
  if (font.endsWith('.woff2')) return 'font/woff2';
  if (font.endsWith('.woff')) return 'font/woff';
  if (font.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

export async function GET(_request: Request, context: { params: Promise<{ font: string }> }) {
  const { font } = await context.params;
  const fontPath = path.join(piWebUiFontsDir, font);

  if (!fontPath.startsWith(piWebUiFontsDir)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const bytes = await readFile(fontPath);

    return new Response(bytes, {
      headers: {
        'content-type': getContentType(font),
        'cache-control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
