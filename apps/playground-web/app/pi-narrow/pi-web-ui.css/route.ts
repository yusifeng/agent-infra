import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const piWebUiCssPath = path.resolve(process.cwd(), 'node_modules/@mariozechner/pi-web-ui/dist/app.css');

export async function GET() {
  const css = await readFile(piWebUiCssPath, 'utf8');

  return new Response(css, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
