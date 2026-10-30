import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

// The six subject leaders stay curated; the remaining authoring demo serves a
// different purpose and does not acquire a fictional /24 lesson score.
const topRank = ['ext4-space', 'isdigit', 'mr-cache', 'oauth-pkce', 'pg-page', 'trust-proxy'];
const authoring = ['feature-tour'];
const selected = [...topRank, ...authoring];
const site = new URL('../site/', import.meta.url);
const read = path => readFileSync(new URL(path, site), 'utf8');
const ids = paths => paths.sort((a, b) => a.localeCompare(b));

test('only six subject leaders and one authoring demo are exported and linked', () => {
  const catalog = JSON.parse(read('projects/rayner/catalog.json'));
  const evidence = JSON.parse(read('projects/rayner/evidence.json'));
  const manifest = JSON.parse(read('projects/rayner/deployment.json'));
  const landing = read('projects/rayner.html');
  const llms = read('llms.txt');
  expect(ids(catalog.scenes.map(s => s.id))).toEqual(ids([...selected]));
  expect(ids(evidence.scenes.map(s => s.id))).toEqual(ids([...selected]));
  expect(ids(catalog.scenes.filter(s => s.group === 'toolchain').map(s => s.id))).toEqual(ids([...authoring]));
  expect(catalog.totals).toEqual(evidence.totals);
  expect(catalog.totals.explainers).toBe(7);
  expect(catalog.totals.cases).toBe(61);
  // The panel gives facts an author can act on, not counts of the gallery.
  expect(landing).not.toContain('<dt>Readers</dt>');
  expect(landing).not.toContain('<dt>Cases</dt>');
  expect(landing).toContain('<dt>Requires</dt><dd>' + catalog.product.requirements + '</dd>');
  expect(landing).toContain('src="/img/repo/generated/vfinal-approved-stills/rayner/colour.jpg"');
  expect(landing).not.toContain('consequential');
  expect(landing).toContain('npm run demos:build');
  expect(landing).not.toContain('demos:check');
  expect(landing).toContain('aria-labelledby="toolchain"');
  expect(landing).not.toContain('aria-labelledby="by-example"');
  expect(landing).not.toContain('Learn by example');
  expect(landing).not.toContain('docs/BY-EXAMPLE.md');
  expect(landing).not.toContain('hello-world');
  expect(landing).toContain('Feature tour: recipe, then result');
  expect(landing).toContain('href="/projects/rayner/feature-tour"');
  expect(landing).toContain('docs/TUTORIAL.md');
  expect(landing).toContain('docs/FEATURE-TOUR.md');
  expect(landing).toContain('data-src="/projects/rayner/mr-cache"');
  expect(landing).toBe(read('projects/rayner/index.html'));
  const tiles = [...landing.matchAll(/class="example-card explainer-tile"><a href="\/projects\/rayner\/([a-z0-9-]+)"/g)].map(m => m[1]);
  expect(ids(tiles)).toEqual(ids([...selected]));
  const listed = [...llms.matchAll(/^[-] \[[^\n]+\]\(https:\/\/oshineye\.dev\/projects\/rayner\/([a-z0-9-]+)\)/gm)].map(m => m[1]);
  expect(ids(listed)).toEqual(ids([...selected]));
  const allowedFile = new RegExp(`^/projects/rayner/(?:${selected.join('|')})(?:[./]|$)`);
  const common = new Set(['/_headers', '/projects/rayner.html', '/projects/rayner/index.html', '/projects/rayner/loader.js', '/projects/rayner/catalog.json', '/projects/rayner/evidence.json']);
  for (const { path } of manifest.files)
    expect(common.has(path) || allowedFile.test(path)).toBe(true);
  const allowed = [...selected.flatMap(id => [id, `${id}.html`, `${id}.png`, `${id}.json`]), 'index.html', 'loader.js', 'catalog.json', 'evidence.json', 'deployment.json'];
  expect(ids(readdirSync(new URL('projects/rayner/', site)))).toEqual(ids(allowed));
  for (const path of read('_headers').matchAll(/^\/projects\/rayner\/([a-z0-9-]+)(?:\.html)?$/gm))
    expect(selected).toContain(path[1]);
  expect(manifest.files.some(entry => entry.path.includes('hello-world'))).toBe(false);
});
