import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

// Tied for first at 23/24 in Rayner's 2026-10-30 editorial scorecard.
const topRank = ['ext4-space', 'isdigit', 'mr-cache', 'oauth-pkce', 'pg-page', 'trust-proxy'];
const site = new URL('../site/', import.meta.url);
const read = path => readFileSync(new URL(path, site), 'utf8');
const ids = paths => paths.sort((a, b) => a.localeCompare(b));

test('only the six top-ranked explainers are listed, exported and linked', () => {
  const catalog = JSON.parse(read('projects/rayner/catalog.json'));
  const evidence = JSON.parse(read('projects/rayner/evidence.json'));
  const manifest = JSON.parse(read('projects/rayner/deployment.json'));
  const landing = read('projects/rayner.html');
  const llms = read('llms.txt');
  expect(ids(catalog.scenes.map(s => s.id))).toEqual(ids([...topRank]));
  expect(ids(evidence.scenes.map(s => s.id))).toEqual(ids([...topRank]));
  expect(catalog.totals).toEqual(evidence.totals);
  expect(catalog.totals.explainers).toBe(6);
  expect(catalog.totals.cases).toBe(46);
  expect(landing).toContain('<dt>Explainers</dt><dd>6</dd>');
  expect(landing).toContain('<dt>Cases</dt><dd>46</dd>');
  expect(landing).not.toContain('aria-labelledby="toolchain"');
  expect(landing).toContain('data-src="/projects/rayner/mr-cache"');
  expect(landing).toBe(read('projects/rayner/index.html'));
  const tiles = [...landing.matchAll(/class="example-card explainer-tile"><a href="\/projects\/rayner\/([a-z0-9-]+)"/g)].map(m => m[1]);
  expect(ids(tiles)).toEqual(ids([...topRank]));
  const listed = [...llms.matchAll(/^[-] \[[^\n]+\]\(https:\/\/oshineye\.dev\/projects\/rayner\/([a-z0-9-]+)\)/gm)].map(m => m[1]);
  expect(ids(listed)).toEqual(ids([...topRank]));
  const allowedFile = new RegExp(`^/projects/rayner/(?:${topRank.join('|')})(?:[./]|$)`);
  const common = new Set(['/_headers', '/projects/rayner.html', '/projects/rayner/index.html', '/projects/rayner/loader.js', '/projects/rayner/catalog.json', '/projects/rayner/evidence.json']);
  for (const { path } of manifest.files)
    expect(common.has(path) || allowedFile.test(path)).toBe(true);
  const allowed = [...topRank.flatMap(id => [id, `${id}.html`, `${id}.png`, `${id}.json`]), 'index.html', 'loader.js', 'catalog.json', 'evidence.json', 'deployment.json'];
  expect(ids(readdirSync(new URL('projects/rayner/', site)))).toEqual(ids(allowed));
  for (const path of read('_headers').matchAll(/^\/projects\/rayner\/([a-z0-9-]+)(?:\.html)?$/gm))
    expect(topRank).toContain(path[1]);
});
