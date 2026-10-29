// Verify the bytes that the host will deploy, rather than trusting a regenerated manifest.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const owned = path => path === '/projects/rayner.html' || /^\/projects\/rayner\/(?!\.)[a-zA-Z0-9_.\/-]+$/.test(path);

export async function verifyRaynerExport(root) {
  root = resolve(root);
  const subtree = join(root, 'projects/rayner');
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
  if (!listed.has('/projects/rayner.html') || !listed.has('/projects/rayner/index.html'))
    throw new Error('Rayner branded pages are missing from the manifest');
  for (const entry of await readdir(subtree, { recursive: true, withFileTypes: true })) {
    const path = '/projects/rayner/' + relative(subtree, join(entry.parentPath, entry.name)).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) throw new Error(`unlisted symlink: ${path}`);
    if (entry.isFile() && entry.name !== 'deployment.json' && !listed.has(path)) throw new Error(`unlisted Rayner file: ${path}`);
  }
  const generator = manifest.host?.generator;
  if (generator !== 'tools/sync-rayner.mjs' || !validDigest(manifest.host.sha256)) throw new Error('Invalid Rayner host generator');
  if (digest(await readFile(join(dirname(root), generator))) !== manifest.host.sha256) throw new Error('Rayner generator has a different digest');
  return listed.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../site');
  console.log(`Verified ${await verifyRaynerExport(root)} Rayner deployment files`);
}
