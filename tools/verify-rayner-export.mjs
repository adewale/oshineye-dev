// Verify the bytes that the host will deploy, rather than trusting a regenerated manifest.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
// Each Rayner export (the Rayner collection, and the Poppy chapters) owns one subtree, its branded
// page, and its rules in the shared _headers file.
const ownedBy = name => path => path === '/_headers' || path === `/projects/${name}.html` || new RegExp(`^/projects/${name}/(?!\\.)[a-zA-Z0-9_./-]+$`).test(path);

export const verifyRaynerExport = root => verifyExport(root, 'rayner', 'tools/sync-rayner.mjs');
export const verifyPoppyExport = root => verifyExport(root, 'poppy', 'tools/sync-poppy.mjs');

export async function verifyExport(root, name, expectedGenerator) {
  root = resolve(root);
  const owned = ownedBy(name);
  const subtree = join(root, 'projects', name);
  const manifest = JSON.parse(await readFile(join(subtree, 'deployment.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length)
    throw new Error('Invalid Rayner deployment manifest');
  const listed = new Set();
  for (const { path, sha256 } of manifest.files) {
    if (!owned(path) || path.split('/').includes('..') || path.includes('//') || path.endsWith('/'))
      throw new Error(`invalid manifest path: ${path}`);
    if (!validDigest(sha256) || listed.has(path)) throw new Error(`invalid or duplicate manifest entry: ${path}`);
    listed.add(path);
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) throw new Error(`invalid manifest path: ${path}`);
    const bytes = await readFile(file).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`${path} is missing`);
      throw error;
    });
    if (digest(bytes) !== sha256) throw new Error(`${path} has a different digest`);
  }
  if (!listed.has('/_headers') || !listed.has(`/projects/${name}.html`) || !listed.has(`/projects/${name}/index.html`))
    throw new Error('Rayner response headers or branded pages are missing from the manifest');
  for (const entry of await readdir(subtree, { recursive: true, withFileTypes: true })) {
    const path = `/projects/${name}/` + relative(subtree, join(entry.parentPath, entry.name)).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) throw new Error(`unlisted symlink: ${path}`);
    if (entry.isFile() && entry.name !== 'deployment.json' && !listed.has(path)) throw new Error(`unlisted Rayner file: ${path}`);
  }
  const generator = manifest.host?.generator;
  if (generator !== expectedGenerator || !validDigest(manifest.host.sha256)) throw new Error('Invalid Rayner host generator');
  if (digest(await readFile(join(dirname(root), generator))) !== manifest.host.sha256) throw new Error('Rayner generator has a different digest');
  return listed.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../site');
  console.log(`Verified ${await verifyRaynerExport(root)} Rayner deployment files`);
  console.log(`Verified ${await verifyPoppyExport(root)} Poppy deployment files`);
}
