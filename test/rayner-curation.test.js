import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

// The six subject leaders stay curated; the two authoring examples serve a
// different purpose and do not acquire a fictional /24 lesson score.
const topRank = ['ext4-space', 'isdigit', 'mr-cache', 'oauth-pkce', 'pg-page', 'trust-proxy'];
const authoring = ['hello-world', 'feature-tour'];
const selected = [...topRank, ...authoring];
const site = new URL('../site/', import.meta.url);
const read = path => readFileSync(new URL(path, site), 'utf8');
const ids = paths => paths.sort((a, b) => a.localeCompare(b));

test('only six subject leaders and two authoring examples are exported and linked', () => {
  const catalog = JSON.parse(read('projects/rayner/catalog.json'));
  const evidence = JSON.parse(read('projects/rayner/evidence.json'));
  const manifest = JSON.parse(read('projects/rayner/deployment.json'));
  const landing = read('projects/rayner.html');
  const llms = read('llms.txt');
  expect(ids(catalog.scenes.map(s => s.id))).toEqual(ids([...selected]));
  expect(ids(evidence.scenes.map(s => s.id))).toEqual(ids([...selected]));
  expect(ids(catalog.scenes.filter(s => s.group === 'toolchain').map(s => s.id))).toEqual(ids([...authoring]));
  expect(catalog.totals).toEqual(evidence.totals);
  expect(catalog.totals.explainers).toBe(8);
  expect(catalog.totals.cases).toBe(62);
  expect(landing).toContain('<dt>Explainers</dt><dd>8</dd>');
  expect(landing).toContain('<dt>Cases</dt><dd>62</dd>');
  expect(landing).toContain('aria-labelledby="toolchain"');
  expect(landing).toContain('href="/projects/rayner/hello-world"');
  expect(landing).toContain('href="/projects/rayner/feature-tour"');
  expect(landing).toContain('docs/TUTORIAL.md#0-hello-world');
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
});
