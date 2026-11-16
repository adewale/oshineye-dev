// Keep Rayner's exported bytes and manifests untouched in site/. Cloudflare's
// auto-trailing-slash handler redirects reader.html to reader before serving it,
// so the duplicate .html header recipes are unnecessary in the upload artifact.
// Never merge CSPs, broaden path matches, or rewrite the source manifest pins.
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRaynerExport, verifyPoppyExport } from './verify-rayner-export.mjs';

export function compactCloudflareHeaders(text) {
  const pattern = /^(\/[^\n]*)\n((?:[ \t]+[^\n]*(?:\n|$))*)\n?/gm;
  const rules = new Map();
  for (const [, path, body] of text.matchAll(pattern)) {
    if (rules.has(path)) throw new Error(`duplicate _headers rule: ${path}`);
    rules.set(path, body);
  }
  const result = text.replace(pattern, (block, path, body) => {
    if (!/^\/projects\/(?:rayner|poppy)\/[a-z0-9-]+\.html$/.test(path)) return block;
    const clean = path.slice(0, -5);
    if (rules.get(clean) !== body) throw new Error(`${path} must have an identical clean URL rule`);
    return '';
  });
  const count = [...result.matchAll(pattern)].length;
  if (count > 100) throw new Error(`Cloudflare _headers has ${count} rules; maximum is 100`);
  for (const line of result.split('\n')) {
    if (Buffer.byteLength(line) > 2000) throw new Error('Cloudflare _headers line exceeds 2000 bytes');
  }
  return result;
}

export async function prepareCloudflareAssets(source, destination) {
  source = source instanceof URL ? fileURLToPath(source) : resolve(source);
  destination = resolve(destination);
  // Refuse overlapping trees: the destination is removed before copying.
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
  };
  if (inside(source, destination) || inside(destination, source)) throw new Error('source and deployment directories must not overlap');
  await verifyRaynerExport(source);
  await verifyPoppyExport(source);
  const headers = compactCloudflareHeaders(await readFile(join(source, '_headers'), 'utf8'));
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  await writeFile(join(destination, '_headers'), headers);
  return [...headers.matchAll(/^\//gm)].length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const count = await prepareCloudflareAssets(join(root, 'site'), join(root, '.cloudflare-assets'));
  console.log(`Prepared Cloudflare assets with ${count}/100 header rules; source exports unchanged.`);
}
