// Run after Rayner's site:export of the Poppy chapters into /projects/poppy:
//   npm run site:export -- <this repo>/site --path /projects/poppy --origin https://oshineye.dev \
//     --only poppy,poppy-discovery,poppy-sessions,poppy-sign-in,poppy-browser,poppy-refusals,poppy-conversations,poppy-coverage \
//     --entry poppy --from out/poppy
// Fills site/projects/poppy.html's chapter list from the export, serves it at both clean URLs, keeps
// the Rayner section's llms.txt and adds the chapters to it, and records the shared _headers in
// both deployment manifests. Titles and answers come from the export, not from this file.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const site = new URL('../site/', import.meta.url);
const at = path => new URL(path, site);
const digest = value => createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const { version, totals, scenes } = JSON.parse(await readFile(at('projects/poppy/catalog.json'), 'utf8'));
if (version !== 2 || scenes.length !== totals.explainers || scenes.reduce((n, scene) => n + scene.scenarios, 0) !== totals.scenarios)
  throw new Error('Poppy catalog version or counts are inconsistent');
if (scenes[0]?.id !== 'poppy') throw new Error('The Poppy export must start with chapter 1, poppy');
const answers = Object.fromEntries(await Promise.all(scenes.map(async scene =>
  [scene.id, JSON.parse(await readFile(at(`projects/poppy/${scene.id}.json`), 'utf8')).answer])));

const cards = scenes.map(s => `                <li class="example-card explainer-tile"><a href="/projects/poppy/${escape(s.id)}"><img src="/projects/poppy/${escape(s.id)}.png" alt="" loading="lazy" width="960" height="540"><h3>${escape(s.title)}</h3></a>${answers[s.id] ? `<p>${escape(answers[s.id])}.</p>` : ''}</li>`).join('\n');
const pageFile = at('projects/poppy.html');
let html = await readFile(pageFile, 'utf8');
const replaceBetween = (name, body) => {
  const pattern = new RegExp(`(<!-- poppy:${name} -->)[\\s\\S]*?(<!-- /poppy:${name} -->)`);
  if (!pattern.test(html)) throw new Error(`poppy.html has no poppy:${name} markers`);
  html = html.replace(pattern, (_, open, close) => open + body + close);
};
replaceBetween('chapters', `\n            <ol class="example-grid chapter-list">\n${cards}\n            </ol>\n            `);
replaceBetween('count', `${totals.explainers} explainers, ${totals.scenarios} scenarios`);
await writeFile(pageFile, html);
// Both clean-URL spellings serve the branded page, not the export's generic gallery.
await copyFile(pageFile, at('projects/poppy/index.html'));

// llms.txt belongs to the Rayner export, which rewrites it whole; keep a Poppy section at its end.
const llmsFile = at('llms.txt');
const marker = '\n## Poppy, explained\n';
let llms = (await readFile(llmsFile, 'utf8')).split(marker)[0].replace(/\s*$/, '\n');
if (!llms.startsWith('# Rayner explainers')) throw new Error('llms.txt is not the Rayner export’s; merge by hand');
llms += marker + '\nThe Personal Agent Protocol, draft 1.0, in eight chapters. Each links the page, gives its answer, and links its JSON.\n\n' +
  scenes.map(s => `- [${s.title}](https://oshineye.dev/projects/poppy/${s.id}): ${answers[s.id] ?? ''}. JSON: [${s.id}.json](https://oshineye.dev/projects/poppy/${s.id}.json)`).join('\n') + '\n';
await writeFile(llmsFile, llms);

// _headers is shared by both exports, so both manifests record its current bytes.
const headers = digest(await readFile(at('_headers')));
const generator = digest(await readFile(new URL('./sync-poppy.mjs', import.meta.url)));
const branded = ['/projects/poppy.html', '/projects/poppy/index.html'];
for (const [subtree, extra] of [['poppy', { paths: branded, sha256: digest(html), host: { generator: 'tools/sync-poppy.mjs', sha256: generator } }], ['rayner', null]]) {
  const manifestFile = at(`projects/${subtree}/deployment.json`);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.files = manifest.files.map(f => (f.path === '/_headers' ? { ...f, sha256: headers } : f));
  if (extra) {
    manifest.files = manifest.files.filter(f => !extra.paths.includes(f.path));
    manifest.files.push(...extra.paths.map(path => ({ path, sha256: extra.sha256 })));
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));
    manifest.host = extra.host;
  }
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}
console.log(`Updated the Poppy page from the exported catalog: ${totals.explainers} explainers, ${totals.scenarios} scenarios.`);
