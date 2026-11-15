// Run after Rayner's site:export of the Poppy chapters into /projects/poppy:
//   npm run site:export -- <this repo>/site --path /projects/poppy --origin https://oshineye.dev \
//     --only poppy,poppy-discovery,poppy-sessions,poppy-sign-in,poppy-browser,poppy-refusals,poppy-conversations,poppy-coverage \
//     --entry poppy --llms-heading "Poppy, explained" --index none --from out/main
// Fills site/projects/poppy.html's chapter list from the export. The export writes its own section of
// llms.txt and _headers and pins them in its deployment.json; this page lives outside its subtree, so
// the export never touches it and this script never touches the manifest. Titles and answers come
// from the export, not from this file.
import { readFile, writeFile } from 'node:fs/promises';

const site = new URL('../site/', import.meta.url);
const at = path => new URL(path, site);
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
console.log(`Updated the Poppy page from the exported catalog: ${totals.explainers} explainers, ${totals.scenarios} scenarios.`);
