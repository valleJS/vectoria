import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

/** Text files worth compressing (images and fonts are compressed already). */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);

type Encoding = 'br' | 'gzip';

/**
 * Compressed copies of the built client, made once per file and kept in memory: the bundle is
 * small and fixed for the lifetime of the container.
 */
const compressed = new Map<string, Promise<Buffer>>();

function compressedFile(file: string, encoding: Encoding): Promise<Buffer> {
  const key = `${encoding}:${file}`;
  let entry = compressed.get(key);
  if (!entry) {
    entry = readFile(file).then((data) =>
      encoding === 'br'
        ? brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })
        : gzipAsync(data, { level: 9 }),
    );
    entry.catch(() => compressed.delete(key));
    compressed.set(key, entry);
  }
  return entry;
}

/** Best encoding the client accepts, or null for none. */
function pickEncoding(req: IncomingMessage): Encoding | null {
  const accepted = String(req.headers['accept-encoding'] ?? '');
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built client from `root` (production: one container for game and page). Unknown
 * paths fall back to `index.html`. Hashed `/assets/*` are cached forever, everything else is
 * revalidated so a deploy reaches open tabs on their next load.
 */
export async function serveStatic(
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const base = resolve(root);
  const urlPath = decodeURIComponent(req.url?.split('?')[0] ?? '/');
  let file = resolve(join(base, normalize(urlPath)));
  if (file !== base && !file.startsWith(base + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!(await isFile(file))) file = join(base, 'index.html');
  if (!(await isFile(file))) {
    res.writeHead(404).end();
    return;
  }
  const headers: Record<string, string> = {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': urlPath.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };
  // Text assets go out brotli/gzip-compressed (the JS bundle shrinks to about a quarter).
  const encoding = COMPRESSIBLE.has(extname(file)) ? pickEncoding(req) : null;
  if (encoding) {
    const body = await compressedFile(file, encoding);
    res.writeHead(200, {
      ...headers,
      'content-encoding': encoding,
      'content-length': String(body.length),
      vary: 'accept-encoding',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}
