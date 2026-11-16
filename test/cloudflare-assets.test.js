import { test, expect } from 'bun:test';
import { cp, readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactCloudflareHeaders, prepareCloudflareAssets } from '../tools/prepare-cloudflare-assets.mjs';
import { verifyRaynerExport, verifyPoppyExport } from '../tools/verify-rayner-export.mjs';

const site = new URL('../site/', import.meta.url);
const rule = (path, body = '  Content-Security-Policy: strict\n  Cache-Control: no-cache\n') => `${path}\n${body}\n`;

test('only identical .html aliases of exact clean reader rules are omitted', () => {
  const host = rule('/*', '  X-Content-Type-Options: nosniff\n');
  const clean = rule('/projects/rayner/sample');
  const source = host + clean + rule('/projects/rayner/sample.html') + rule('/projects/rayner/sample/step.html') + rule('/other.html');
  const result = compactCloudflareHeaders(source);
  expect(result).toBe(host + clean + rule('/projects/rayner/sample/step.html') + rule('/other.html'));
  expect(compactCloudflareHeaders(result)).toBe(result);
  expect(() => compactCloudflareHeaders(rule('/projects/poppy/chapter.html'))).toThrow(/identical clean/);
  expect(() => compactCloudflareHeaders(clean + rule('/projects/rayner/sample.html', '  Content-Security-Policy: different\n'))).toThrow(/identical clean/);
  expect(() => compactCloudflareHeaders(clean + clean)).toThrow(/duplicate/);
});

test('Cloudflare rule and line budgets fail closed, including the 100-rule boundary', () => {
  const rules = Array.from({ length: 100 }, (_, i) => rule(`/host-${i}`)).join('');
  expect(compactCloudflareHeaders(rules)).toBe(rules);
  expect(() => compactCloudflareHeaders(rules + rule('/one-too-many'))).toThrow(/101.*100/);
  expect(() => compactCloudflareHeaders(rule('/host', `  X-Test: ${'x'.repeat(2001)}\n`))).toThrow(/2000/);
});

test('staging refuses tampered exports and overlapping directories before changing the destination', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'cloudflare-invalid-'));
  const source = join(folder, 'source');
  const destination = join(folder, 'assets');
  try {
    await cp(site, source, { recursive: true });
    await writeFile(join(source, 'projects/poppy/poppy.html'), 'tampered');
    await writeFile(destination, 'do not replace on verification failure');
    await expect(prepareCloudflareAssets(source, destination)).rejects.toThrow(/different digest/);
    expect(await readFile(destination, 'utf8')).toBe('do not replace on verification failure');
    for (const output of [source, join(source, 'nested'), join(source, '..nested'), folder]) {
      await expect(prepareCloudflareAssets(source, output)).rejects.toThrow(/must not overlap/);
    }
    expect(await readFile(join(source, 'projects/poppy/poppy.html'), 'utf8')).toBe('tampered');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('the real deployment has 55 rules and preserves every other byte and both source manifests', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'cloudflare-assets-'));
  const destination = join(folder, 'assets');
  const sourceHeaders = await readFile(new URL('_headers', site), 'utf8');
  try {
    await prepareCloudflareAssets(site, destination);
    const headers = await readFile(join(destination, '_headers'), 'utf8');
    expect(headers.match(/^\//gm).length).toBe(55);
    expect(headers).not.toMatch(/^\/projects\/(rayner|poppy)\/[^/]+\.html$/m);
    // Exhaustively compare the staged artifact, not just a few sample files.
    const files = await readdir(site, { recursive: true, withFileTypes: true });
    let compared = 0;
    for (const file of files) {
      if (!file.isFile() || file.name === '_headers') continue;
      const source = join(file.parentPath, file.name);
      expect(await readFile(join(destination, relative(fileURLToPath(site), source)))).toEqual(await readFile(source));
      compared++;
    }
    expect(compared).toBeGreaterThan(1000);
    expect(await readFile(new URL('_headers', site), 'utf8')).toBe(sourceHeaders);
    expect(await verifyRaynerExport(fileURLToPath(site))).toBe(761);
    expect(await verifyPoppyExport(fileURLToPath(site))).toBe(177);
    await writeFile(join(destination, 'stale.txt'), 'must not be deployed');
    await prepareCloudflareAssets(site, destination);
    await expect(readFile(join(destination, 'stale.txt'))).rejects.toThrow(/ENOENT/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
