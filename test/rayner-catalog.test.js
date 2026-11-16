import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
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
    writeFileSync(page, '<meta name="description" content="Old"><div class="project-copy">Old copy</div><aside><dl><dt>Explainers</dt><dd>26</dd><dt>Cases</dt><dd>140</dd></dl></aside><script src="/projects/rayner/loader.js" data-src="/projects/rayner/seasons?step=june" data-target="rayner-embed" data-title="Seasons"></script><div class="example-grid">Old topics</div><section class="section reveal" aria-labelledby="toolchain"><div class="example-grid">Old tools</div></section><section class="section reveal" aria-labelledby="install"><pre><code>npm ci\nold</code></pre><p class="section-intro">You need Node 26.</p></section>');
    writeFileSync(join(root, 'site/index.html'), '<a href="/projects/rayner" class="repo-title">rayner</a><p class="repo-desc">Old copy</p>');
    const manifest = JSON.stringify({ version: 2, path: '/projects/rayner', files: [], sections: [] });
    writeFileSync(join(root, 'site/projects/rayner/deployment.json'), manifest);
    const data = { version: 2, product: { summary: 'Model-led explanations.', audience: 'For TypeScript authors.', description: 'Follow another case.', requirements: 'Node 24 and Chromium.', tutorial: 'https://example.org/tutorial', reference: 'https://example.org/reference', skill: 'https://example.org/skill', entry: {id: 'cache', step: 'begin', settings: {request: 'hit'}, label: 'Follow from the start'} }, totals: { explainers: 2, scenarios: 5 }, scenes: [{ id: 'cache', title: 'Cache hit & miss', step: 'request', lang: 'en', group: 'topic', scenarios: 2 }, { id: 'engine', title: 'How it works', step: 'start', lang: 'en', group: 'toolchain', scenarios: 3 }] };
    writeFileSync(catalog, JSON.stringify(data));
    const run = () => spawnSync('node', [join(root, 'tools/sync-rayner.mjs')], { encoding: 'utf8' });
    expect(run().status).toBe(0);
    const once = readFileSync(page, 'utf8');
    expect(once).not.toContain('<dt>Readers</dt>');
    expect(once).not.toContain('<dt>Cases</dt>');
    expect(once).toContain('<dt>Requires</dt><dd>Node 24 and Chromium.</dd>');
    // npm's rayner is an older release, so the install fact points at the clone route, never at npm.
    expect(once).not.toContain('npm install --save-dev rayner');
    expect(once).toContain('Build both packages from a clone of the repository. <a href="https://github.com/adewale/rayner#quick-start">See the quick start</a>.');
    expect(once).toContain('Cache hit &amp; miss');
    expect(once).toContain('/projects/rayner/engine"><img src="/projects/rayner/engine.png"');
    expect(once).toContain('/projects/rayner/cache"><img src="/projects/rayner/cache.png"');
    expect(once).not.toContain('/projects/rayner/engine?step=');
    expect(once).not.toContain('?step=request');
    expect(once).toContain('https://example.org/tutorial');
    expect(once).toContain('href="/projects/rayner/cache?step=begin&amp;request=hit">Follow from the start</a>');
    expect(once).toContain('Node 24 and Chromium');
    expect(once).not.toContain('Old topics');
    expect(once).toContain('data-src="/projects/rayner/cache" data-target="rayner-embed" data-title="Cache hit &amp; miss"');
    expect(once).not.toContain('/projects/rayner/seasons');
    expect(readFileSync(join(root, 'site/index.html'), 'utf8')).toContain('<p class="repo-desc">Model-led explanations.</p>');
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(once);
    // The export runs with --index none and pins its own files: the page is served from outside its
    // subtree, so the sync neither copies it over a gallery nor rewrites the manifest.
    expect(existsSync(join(root, 'site/projects/rayner/index.html'))).toBe(false);
    expect(readFileSync(join(root, 'site/projects/rayner/deployment.json'), 'utf8')).toBe(manifest);
    // A previously curated export removed the entire toolchain section. The
    // next export must recreate it when authoring examples return.
    writeFileSync(page, once.replace(/<section class="section reveal" aria-labelledby="toolchain">[\s\S]*?<\/section>/, ''));
    data.scenes.push(
      { id: 'recipes', title: 'How do I write that?', step: 'result', lang: 'en', group: 'toolchain', scenarios: 15 },
    );
    data.totals = { explainers: 3, scenarios: 20 };
    writeFileSync(catalog, JSON.stringify(data));
    const restored = run();
    expect(restored.stderr).toBe('');
    expect(restored.status).toBe(0);
    const withAuthors = readFileSync(page, 'utf8');
    expect(withAuthors).toContain('aria-labelledby="toolchain"');
    // A toolchain lesson is titled as the export titles it; the host renames none.
    expect(withAuthors).toContain('<h3>How do I write that?</h3>');
    // The authors' intro lands in the recreated section once, never in the install section.
    expect(withAuthors.split('These are for authors').length - 1).toBe(1);
    expect(withAuthors).toMatch(/aria-labelledby="toolchain">[\s\S]*These are for authors[\s\S]*aria-labelledby="install"/);
    expect(withAuthors).toContain('href="/projects/rayner/recipes"');
    expect(withAuthors).toContain('https://example.org/tutorial');
    expect(withAuthors).not.toContain('FEATURE-TOUR');
    expect((withAuthors.match(/class="example-card explainer-tile"/g) ?? []).length).toBe(3);
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(withAuthors);
    data.scenes = data.scenes.slice(0, 1);
    data.totals = { explainers: 1, scenarios: 2 };
    writeFileSync(catalog, JSON.stringify(data));
    expect(run().status).toBe(0);
    const selected = readFileSync(page, 'utf8');
    expect(selected).not.toContain('<dt>Readers</dt>');
    expect(selected).not.toContain('/projects/rayner/engine');
    expect(selected).not.toContain('aria-labelledby="toolchain"');
    expect((selected.match(/class="example-card explainer-tile"/g) ?? []).length).toBe(1);
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(selected);
    const stalePage = selected.replace('<section class="section reveal" aria-labelledby="install">', '<section class="section reveal" aria-labelledby="by-example"><p>Retired</p></section><section class="section reveal" aria-labelledby="install">');
    writeFileSync(page, stalePage);
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(selected);
    // Catalog tiers determine placement. Coverage artifacts may remain available
    // without becoming recommendations, and promoting a lesson moves its card.
    data.scenes = [
      { id: 'cache', title: 'Cache', lang: 'en', group: 'topic', tier: 'showcase', scenarios: 2 },
      { id: 'notes', title: 'Another subject', lang: 'en', group: 'topic', tier: 'gallery', scenarios: 1 },
      { id: 'hidden', title: 'Coverage subject', lang: 'en', group: 'topic', tier: 'coverage', scenarios: 1 },
      { id: 'engine', title: 'Author recipe', lang: 'en', group: 'toolchain', tier: 'gallery', scenarios: 1 },
      { id: 'hidden-tool', title: 'Coverage tool', lang: 'en', group: 'toolchain', tier: 'coverage', scenarios: 1 },
    ];
    data.totals = { explainers: 5, scenarios: 6 };
    writeFileSync(catalog, JSON.stringify(data));
    expect(run().status).toBe(0);
    const tiered = readFileSync(page, 'utf8');
    const beforeMore = tiered.split('<details class="rayner-more">')[0];
    expect(beforeMore).toContain('/projects/rayner/cache"><img');
    expect(beforeMore).not.toContain('/projects/rayner/notes"><img');
    expect(tiered).toMatch(/<details class="rayner-more">[\s\S]*\/projects\/rayner\/notes"><img[\s\S]*<\/details>/);
    expect(tiered).toContain('/projects/rayner/engine"><img');
    expect(tiered).not.toContain('/projects/rayner/hidden');
    expect(run().status).toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(tiered);
    data.scenes[1].tier = 'showcase';
    writeFileSync(catalog, JSON.stringify(data));
    expect(run().status).toBe(0);
    const promoted = readFileSync(page, 'utf8');
    expect(promoted).not.toContain('<details class="rayner-more">');
    expect(promoted).toContain('/projects/rayner/notes"><img');
    // Restore the one-scene fixture before testing the inconsistent-count guard.
    data.scenes = data.scenes.slice(0, 1);
    data.totals = { explainers: 1, scenarios: 2 };
    writeFileSync(page, selected);
    data.totals.scenarios = 6;
    writeFileSync(catalog, JSON.stringify(data));
    expect(run().status).not.toBe(0);
    expect(readFileSync(page, 'utf8')).toBe(selected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an export that carries facts fills the whole panel from them', () => {
  const root = mkdtempSync(join(tmpdir(), 'rayner-facts-'));
  try {
    mkdirSync(join(root, 'tools'));
    mkdirSync(join(root, 'site/projects/rayner'), { recursive: true });
    copyFileSync(new URL('../tools/sync-rayner.mjs', import.meta.url), join(root, 'tools/sync-rayner.mjs'));
    const page = join(root, 'site/projects/rayner.html');
    writeFileSync(page, '<meta name="description" content="Old"><div class="project-copy">Old</div><aside></aside><div class="example-grid">Old</div><section class="section reveal" aria-labelledby="install"><p class="section-intro">You need Node 20.</p></section>');
    writeFileSync(join(root, 'site/index.html'), '<a href="/projects/rayner" class="repo-title">rayner</a><p class="repo-desc">Old</p>');
    const product = { summary: 'S.', audience: 'A.', description: 'D.', requirements: 'Node 24.', tutorial: 'https://example.org/t', reference: 'https://example.org/r', skill: 'https://example.org/s',
      install: 'Clone it.', installGuide: 'https://example.org/quick-start', entry: { id: 'cache', step: 'begin', label: 'Start' } };
    const facts = { name: 'rayner', version: '0.2.0', install: 'Clone it.', installGuide: 'https://example.org/quick-start', requirements: 'Node 24.',
      publishes: 'One HTML page & a transcript.', repository: 'https://github.com/example/explainers', license: 'Apache-2.0' };
    writeFileSync(join(root, 'site/projects/rayner/catalog.json'), JSON.stringify({ version: 2, product, facts, totals: { explainers: 1, scenarios: 1 }, scenes: [{ id: 'cache', title: 'Cache', step: 'begin', lang: 'en', group: 'topic', scenarios: 1 }] }));
    expect(spawnSync('node', [join(root, 'tools/sync-rayner.mjs')], { encoding: 'utf8' }).status).toBe(0);
    const html = readFileSync(page, 'utf8');
    expect(html).toContain('<dt>Install</dt><dd>Clone it. <a href="https://example.org/quick-start">See the quick start</a>.</dd>');
    expect(html).toContain('<dt>Requires</dt><dd>Node 24.</dd>');
    expect(html).toContain('<dt>Publishes</dt><dd>One HTML page &amp; a transcript.</dd>');
    expect(html).toContain('<dt>Repository</dt><dd><a href="https://github.com/example/explainers" target="_blank" rel="noopener"><code>example/explainers</code></a></dd>');
    expect(html).toContain('<dt>License</dt><dd>Apache-2.0</dd>');
    expect(html).toContain('<p class="section-intro">Node 24. Diagrams are captured');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an export that carries its own install line and guide is quoted, not the fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'rayner-install-'));
  try {
    mkdirSync(join(root, 'tools'));
    mkdirSync(join(root, 'site/projects/rayner'), { recursive: true });
    copyFileSync(new URL('../tools/sync-rayner.mjs', import.meta.url), join(root, 'tools/sync-rayner.mjs'));
    const page = join(root, 'site/projects/rayner.html');
    writeFileSync(page, '<meta name="description" content="Old"><div class="project-copy">Old</div><aside></aside><div class="example-grid">Old</div><section class="section reveal" aria-labelledby="install"></section>');
    writeFileSync(join(root, 'site/index.html'), '<a href="/projects/rayner" class="repo-title">rayner</a><p class="repo-desc">Old</p>');
    writeFileSync(join(root, 'site/projects/rayner/deployment.json'), JSON.stringify({ files: [] }));
    const product = { summary: 'S.', audience: 'A.', description: 'D.', requirements: 'R.', tutorial: 'https://example.org/t', reference: 'https://example.org/r', skill: 'https://example.org/s',
      install: 'Build it from a clone & install the archives.', installGuide: 'https://example.org/quick-start', entry: { id: 'cache', step: 'begin', label: 'Start' } };
    writeFileSync(join(root, 'site/projects/rayner/catalog.json'), JSON.stringify({ version: 2, product, totals: { explainers: 1, scenarios: 1 }, scenes: [{ id: 'cache', title: 'Cache', step: 'begin', lang: 'en', group: 'topic', scenarios: 1 }] }));
    expect(spawnSync('node', [join(root, 'tools/sync-rayner.mjs')], { encoding: 'utf8' }).status).toBe(0);
    expect(readFileSync(page, 'utf8')).toContain('<dt>Install</dt><dd>Build it from a clone &amp; install the archives. <a href="https://example.org/quick-start">See the quick start</a>.</dd>');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
