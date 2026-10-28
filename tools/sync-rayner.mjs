// Run after Rayner's site:export. Product copy, titles and counts come from that export.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file = new URL('../site/projects/rayner.html', import.meta.url);
const { version, product, totals, scenes } = JSON.parse(await readFile(new URL('../site/projects/rayner/catalog.json', import.meta.url), 'utf8'));
if (version !== 1 || scenes.length !== totals.explainers || scenes.reduce((n, scene) => n + scene.cases, 0) !== totals.cases)
  throw new Error('Rayner catalog version or counts are inconsistent');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let html = await readFile(file, 'utf8');
html = html.replace(/(<meta name="description" content=")[^"]*/, '$1' + escape(product.summary + ' ' + product.audience));
const copy = `<div class="project-copy">
                    <p class="project-lede">${escape(product.summary)} ${escape(product.audience)}</p>
                    <p>${escape(product.description)}</p>
                    <p class="project-actions"><a class="github-cta" href="/projects/rayner/mr-cache?step=request&amp;request=hit">Step through a cache request</a></p>
                    <p><a href="${escape(product.tutorial)}">Write your first explainer</a> · <a href="${escape(product.reference)}">Authoring reference</a> · <a href="${escape(product.skill)}">Agent authoring skill</a></p>
                    <p><a href="https://github.com/adewale/rayner">Rayner on GitHub</a></p>
                </div>`;
html = html.replace(/<div class="project-copy">[\s\S]*?<\/div>(?=\s*<aside)/, copy);
html = html.replace(/(<dt>Explainers<\/dt><dd>)[^<]+/, '$1' + totals.explainers);
html = html.replace(/(<dt>Cases<\/dt><dd>)[^<]+/, '$1' + totals.cases);
let group = 0;
html = html.replace(/<div class="example-grid">[\s\S]*?<\/div>/g, () => {
  const category = ['topic', 'toolchain'][group++];
  return '<div class="example-grid">\n' + scenes.filter(s => s.group === category).map(s =>
    `                <article class="example-card explainer-tile"><a href="/projects/rayner/${escape(s.id)}?step=${encodeURIComponent(s.step)}"><img src="/projects/rayner/${escape(s.id)}.png" alt="" loading="lazy" width="960" height="540"><h3${s.lang === 'en' ? '' : ` lang="${escape(s.lang)}"`}>${escape(s.title)}</h3></a></article>`
  ).join('\n') + '\n            </div>';
});
if (group !== 2) throw new Error('Expected the topic and toolchain gallery sections');
html = html.replace(/<pre><code>npm ci[\s\S]*?<\/code><\/pre>/, `<pre><code>git clone https://github.com/adewale/rayner &amp;&amp; cd rayner
npm ci
npx playwright-core install chromium
npm run demos:check
npm run demos:serve</code></pre>`);
html = html.replace(/<p class="section-intro">You need Node[^<]+<\/p>/, `<p class="section-intro">${escape(product.requirements)} Diagrams are captured at build time with <a href="https://github.com/adewale/agentic-mermaid">Agentic Mermaid</a>; the engine is forked from Ivar Vong’s <a href="https://github.com/ivarvong/lantern">Lantern</a>.</p>`);
await writeFile(file, html);
// Both clean-URL spellings must serve the branded page, not competing indexes.
await copyFile(file, new URL('../site/projects/rayner/index.html', import.meta.url));
const manifestFile = new URL('../site/projects/rayner/deployment.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const paths = ['/projects/rayner.html', '/projects/rayner/index.html'];
manifest.files = manifest.files.filter(entry => !paths.includes(entry.path));
const digest = value => createHash('sha256').update(value).digest('hex');
manifest.files.push(...paths.map(path => ({ path, sha256: digest(html) })));
manifest.files.sort((a, b) => a.path.localeCompare(b.path));
manifest.host = { generator: 'tools/sync-rayner.mjs', sha256: digest(await readFile(new URL('./sync-rayner.mjs', import.meta.url))) };
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

const index = new URL('../site/index.html', import.meta.url);
let home = await readFile(index, 'utf8');
home = home.replace(/(<a href="\/projects\/rayner" class="repo-title">rayner<\/a>[\s\S]*?<p class="repo-desc">)[\s\S]*?(<\/p>)/, '$1' + escape(product.summary) + '$2');
await writeFile(index, home);
console.log(`Updated Rayner landing page from the exported catalog: ${totals.explainers} explainers, ${totals.cases} cases.`);
