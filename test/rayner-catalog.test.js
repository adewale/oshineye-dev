import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('the site derives Rayner copy, cards and counts from the export, repeats cleanly and refuses contradictory counts', () => {
  const root = mkdtempSync(join(tmpdir(), 'rayner-gallery-'));
  try {
    mkdirSync(join(root, 'tools'));
    mkdirSync(join(root, 'site/projects/rayner'), { recursive: true });
    copyFileSync(new URL('../tools/sync-rayner.mjs', import.meta.url), join(root, 'tools/sync-rayner.mjs'));
    const page = join(root, 'site/projects/rayner.html'), catalog = join(root, 'site/projects/rayner/catalog.json');
    writeFileSync(page, '<meta name="description" content="Old"><div class="project-copy">Old copy</div><aside></aside><dt>Explainers</dt><dd>26</dd><dt>Cases</dt><dd>140</dd><div class="example-grid">Old topics</div><div class="example-grid">Old tools</div><pre><code>npm ci\nold</code></pre><p class="section-intro">You need Node 26.</p>');
    writeFileSync(join(root, 'site/index.html'), '<a href="/projects/rayner" class="repo-title">rayner</a><p class="repo-desc">Old copy</p>');
    writeFileSync(join(root, 'site/projects/rayner/deployment.json'), JSON.stringify({ files: [] }));
    const data = { version: 1, product: { summary: 'Model-led explanations.', audience: 'For TypeScript authors.', description: 'Follow another case.', requirements: 'Node 24 and Chromium.', tutorial: 'https://example.org/tutorial', reference: 'https://example.org/reference', skill: 'https://example.org/skill' }, totals: { explainers: 2, cases: 5 }, scenes: [{ id: 'cache', title: 'Cache hit & miss', step: 'request', lang: 'en', group: 'topic', cases: 2 }, { id: 'engine', title: 'How it works', step: 'start', lang: 'en', group: 'toolchain', cases: 3 }] };
    writeFileSync(catalog, JSON.stringify(data));
    const run = () => spawnSync('node', [join(root, 'tools/sync-rayner.mjs')], { encoding: 'utf8' });
    expect(run().status).toBe(0);
    const once = readFileSync(page, 'utf8');
    expect(once).toContain('<dt>Explainers</dt><dd>2</dd>');
    expect(once).toContain('<dt>Cases</dt><dd>5</dd>');
    expect(once).toContain('Cache hit &amp; miss');
    expect(once).toContain('/projects/rayner/engine"><img src="/projects/rayner/engine.png"');
    expect(once).toContain('/projects/rayner/cache"><img src="/projects/rayner/cache.png"');
    expect(once).not.toContain('/projects/rayner/engine?step=');
    expect(once).toContain('/projects/rayner/mr-cache?request=hit');
    expect(once).not.toContain('/projects/rayner/mr-cache?step=request');
    expect(once).toContain('https://example.org/tutorial');
    expect(once).toContain('Node 24 and Chromium');
    expect(once).not.toContain('Old topics');
    expect(readFileSync(join(root, 'site/index.html'), 'utf8')).toContain('<p class="repo-desc">Model-led explanations.</p>');
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(once);
    expect(readFileSync(join(root, 'site/projects/rayner/index.html'), 'utf8')).toBe(once);
    data.totals.cases = 6;
    writeFileSync(catalog, JSON.stringify(data));
    expect(run().status).not.toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(once);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
