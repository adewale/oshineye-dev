import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRaynerExport } from '../tools/verify-rayner-export.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');

test('a deployed Rayner export has exactly the recorded bytes, including branded pages', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'rayner-export-'));
  const root = join(repo, 'site');
  try {
    mkdirSync(join(root, 'projects/rayner'), { recursive: true });
    const page = join(root, 'projects/rayner.html');
    const tile = join(root, 'projects/rayner/cache.html');
    writeFileSync(page, 'host');
    writeFileSync(join(root, 'projects/rayner/index.html'), 'host');
    writeFileSync(tile, 'scene');
    const manifest = {
      version: 1,
      files: [
        { path: '/projects/rayner.html', sha256: hash('host') },
        { path: '/projects/rayner/index.html', sha256: hash('host') },
        { path: '/projects/rayner/cache.html', sha256: hash('scene') },
      ],
      host: { generator: 'tools/sync-rayner.mjs', sha256: hash('sync') },
    };
    mkdirSync(join(repo, 'tools'));
    writeFileSync(join(repo, 'tools/sync-rayner.mjs'), 'sync');
    writeFileSync(join(root, 'projects/rayner/deployment.json'), JSON.stringify(manifest));
    await verifyRaynerExport(root);
    writeFileSync(tile, 'tampered');
    await expect(verifyRaynerExport(root)).rejects.toThrow(/cache\.html.*digest/);
    writeFileSync(tile, 'scene');
    writeFileSync(join(root, 'projects/rayner/old.html'), 'orphan');
    await expect(verifyRaynerExport(root)).rejects.toThrow(/unlisted.*old\.html/);
    unlinkSync(join(root, 'projects/rayner/old.html'));
    unlinkSync(tile);
    await expect(verifyRaynerExport(root)).rejects.toThrow(/cache\.html.*missing/);
    writeFileSync(tile, 'scene');
    writeFileSync(join(repo, 'tools/sync-rayner.mjs'), 'modified');
    await expect(verifyRaynerExport(root)).rejects.toThrow(/generator.*digest/);
    writeFileSync(join(repo, 'tools/sync-rayner.mjs'), 'sync');
    manifest.files.push({ path: '/../outside', sha256: hash('x') });
    writeFileSync(join(root, 'projects/rayner/deployment.json'), JSON.stringify(manifest));
    await expect(verifyRaynerExport(root)).rejects.toThrow(/invalid manifest path/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
