import { test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';

const site = new URL('../site/', import.meta.url);
const read = path => readFileSync(new URL(path, site), 'utf8');
const ids = values => [...values].sort((a, b) => a.localeCompare(b));
const tiles = html => [...html.matchAll(/class="example-card explainer-tile"><a href="\/projects\/rayner\/([a-z0-9-]+)"/g)].map(match => match[1]);

test('the full reviewed collection is published and catalog tiers select its recommendations', () => {
  const catalog = JSON.parse(read('projects/rayner/catalog.json'));
  const evidence = JSON.parse(read('projects/rayner/evidence.json'));
  const manifest = JSON.parse(read('projects/rayner/deployment.json'));
  const landing = read('projects/rayner.html');
  const llms = read('llms.txt');
  const visible = catalog.scenes.filter(scene => scene.tier !== 'coverage');
  const coverage = catalog.scenes.filter(scene => scene.tier === 'coverage');
  const leaders = visible.filter(scene => scene.group === 'topic' && scene.tier === 'showcase');
  const more = visible.filter(scene => scene.group === 'topic' && scene.tier === 'gallery');
  const authoring = visible.filter(scene => scene.group === 'toolchain');
  expect(catalog.scenes.some(scene => scene.id === 'henge')).toBe(true);
  expect(leaders.length).toBeGreaterThan(0);
  expect(more.length).toBeGreaterThan(0);
  expect(coverage.length).toBeGreaterThan(0);
  expect(ids(catalog.scenes.map(scene => scene.id))).toEqual(ids(evidence.scenes.map(scene => scene.id)));
  expect(catalog.totals).toEqual(evidence.totals);
  expect(catalog.totals.explainers).toBe(catalog.scenes.length);
  expect(catalog.totals.cases).toBe(catalog.scenes.reduce((sum, scene) => sum + scene.cases, 0));
  const subjects = landing.match(/aria-labelledby="examples">([\s\S]*?)<\/section>/)?.[1];
  const tools = landing.match(/aria-labelledby="toolchain">([\s\S]*?)<\/section>/)?.[1];
  const moreHtml = subjects?.match(/<details class="rayner-more">([\s\S]*?)<\/details>/)?.[1];
  expect(subjects).toBeDefined();
  expect(tools).toBeDefined();
  expect(moreHtml).toBeDefined();
  expect(ids(tiles(subjects.split('<details class="rayner-more">')[0]))).toEqual(ids(leaders.map(scene => scene.id)));
  expect(ids(tiles(moreHtml))).toEqual(ids(more.map(scene => scene.id)));
  expect(ids(tiles(tools))).toEqual(ids(authoring.map(scene => scene.id)));
  expect(ids(tiles(landing))).toEqual(ids(visible.map(scene => scene.id)));
  const listed = [...llms.matchAll(/^[-] \[[^\n]+\]\(https:\/\/oshineye\.dev\/projects\/rayner\/([a-z0-9-]+)\)/gm)].map(match => match[1]);
  expect(ids(listed)).toEqual(ids(visible.map(scene => scene.id)));
  // Coverage remains available by direct link without being advertised as a lesson.
  for (const scene of catalog.scenes) {
    expect(existsSync(new URL(`projects/rayner/${scene.id}.html`, site))).toBe(true);
    expect(existsSync(new URL(`projects/rayner/${scene.id}.json`, site))).toBe(true);
    expect(existsSync(new URL(`projects/rayner/${scene.id}.png`, site))).toBe(true);
  }
  expect(landing).toBe(read('projects/rayner/index.html'));
  expect(landing).toContain('<dt>Requires</dt><dd>' + catalog.product.requirements + '</dd>');
  expect(landing).not.toContain('<dt>Readers</dt>');
  expect(landing).not.toContain('<dt>Cases</dt>');
  expect(landing).toContain(`data-src="/projects/rayner/${catalog.product.entry.id}"`);
  expect(landing).toContain('Feature tour: recipe, then result');
  expect(landing).toContain('docs/TUTORIAL.md');
  expect(landing).toContain('docs/FEATURE-TOUR.md');
  expect(landing).not.toContain('aria-labelledby="by-example"');
  expect(landing).not.toContain('hello-world');
  const allowedFile = new RegExp(`^/projects/rayner/(?:${catalog.scenes.map(scene => scene.id).join('|')})(?:[./]|$)`);
  expect(existsSync(new URL('projects/rayner/embed-lab.html', site))).toBe(true);
  const common = new Set(['/_headers', '/projects/rayner.html', '/projects/rayner/index.html', '/projects/rayner/loader.js', '/projects/rayner/catalog.json', '/projects/rayner/evidence.json', '/projects/rayner/embed-lab.html']);
  for (const { path } of manifest.files)
    expect(common.has(path) || allowedFile.test(path)).toBe(true);
});
