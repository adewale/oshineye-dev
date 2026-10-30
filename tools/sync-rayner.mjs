// Run after Rayner's site:export. Product copy, titles and counts come from that export.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file = new URL('../site/projects/rayner.html', import.meta.url);
const { version, product, totals, scenes } = JSON.parse(await readFile(new URL('../site/projects/rayner/catalog.json', import.meta.url), 'utf8'));
if (version !== 1 || scenes.length !== totals.explainers || scenes.reduce((n, scene) => n + scene.cases, 0) !== totals.cases)
  throw new Error('Rayner catalog version or counts are inconsistent');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const entry = product.entry;
if (!entry || !scenes.some(scene => scene.id === entry.id) || !entry.step || !entry.label)
  throw new Error('Rayner catalog needs a valid introductory entry');
const entryUrl = `/projects/rayner/${encodeURIComponent(entry.id)}?${new URLSearchParams({step: entry.step, ...entry.settings})}`;
const selected = new Set(scenes.map(scene => scene.id));
// Authoring examples are titled by what an author gets from them, in the README's terms.
const TOOL_TITLES = { 'feature-tour': 'Feature tour: recipe, then result' };
const authoring = [
  selected.has('feature-tour') && `The <a href="https://github.com/adewale/rayner/blob/main/docs/FEATURE-TOUR.md">feature guide</a> shows the code an author writes for each feature, then its result.`,
].filter(Boolean).join(' ');
const toolIntro = `These are for authors, not subject lessons. ${authoring ? authoring + ' ' : ''}For the whole path, read <a href="${escape(product.tutorial)}">the tutorial</a>, the <a href="${escape(product.reference)}">authoring reference</a> or the <a href="${escape(product.skill)}">agent authoring skill</a>.`;
let html = await readFile(file, 'utf8');
// Retired examples may remain in an old exported page; remove them on every sync.
html = html.replace(/<section class="section reveal" aria-labelledby="by-example">[\s\S]*?<\/section>\s*/, '');
html = html.replace(/^\s*\.by-example-[^\n]*\n/gm, '');
html = html.replace(/(<meta name="description" content=")[^"]*/, '$1' + escape(product.summary + ' ' + product.audience));
const copy = `<div class="project-copy">
                    <p class="project-lede">${escape(product.summary)} ${escape(product.audience)}</p>
                    <p>${escape(product.description)}</p>
                    <p class="project-actions"><a class="github-cta" href="${escape(entryUrl)}">${escape(entry.label)}</a></p>
                    <p><a href="${escape(product.tutorial)}">Write your first explainer</a></p>
                </div>`;
html = html.replace(/<div class="project-copy">[\s\S]*?<\/div>(?=\s*<aside)/, copy);
// The panel follows the other project pages: the project's artwork, then facts an author can
// act on. The explainers themselves are one scroll down, so the panel does not repeat one.
const art = '/img/repo/generated/vfinal-approved-stills/rayner';
const panel = `<aside class="project-panel" aria-labelledby="project-facts-title">
                    <a class="project-motion-frame" href="https://github.com/adewale/rayner" target="_blank" rel="noopener" aria-label="View Rayner on GitHub">
                        <img class="project-panel-image" src="${art}/colour.jpg" alt="Generated project artwork for Rayner" loading="lazy" width="400" height="300">
                        <video class="project-motion-media" muted loop playsinline preload="none" poster="${art}/colour.jpg" aria-hidden="true" width="400" height="300">
                            <source src="${art}/animation.mp4" type="video/mp4">
                        </video>
                    </a>
                    <h3 id="project-facts-title">Project facts</h3>
                    <dl class="project-facts">
                        <div><dt>Package</dt><dd><code>npm install --save-dev rayner</code></dd></div>
                        <div><dt>Requires</dt><dd>${escape(product.requirements)}</dd></div>
                        <div><dt>Publishes</dt><dd>A portable HTML page with a transcript</dd></div>
                        <div><dt>Repository</dt><dd><a href="https://github.com/adewale/rayner" target="_blank" rel="noopener"><code>adewale/rayner</code></a></dd></div>
                        <div><dt>License</dt><dd>MIT</dd></div>
                    </dl>
                </aside>`;
const besideCopy = /(<div class="project-copy">[\s\S]*?<\/div>\s*)<aside[\s\S]*?<\/aside>/;
if (!besideCopy.test(html)) throw new Error('Cannot place the Rayner project panel: no aside beside the copy');
html = html.replace(besideCopy, (_, copyBlock) => copyBlock + panel);
html = html.replace(/(<script src="\/projects\/rayner\/loader\.js" data-src=")[^"]*(" data-target="rayner-embed" data-title=")[^"]*("><\/script>)/,
  (_, before, middle, after) => `${before}/projects/rayner/${escape(entry.id)}${middle}${escape(scenes.find(s => s.id === entry.id).title)}${after}`);
const hasToolchain = scenes.some(s => s.group === 'toolchain');
const toolchain = /<section class="section reveal" aria-labelledby="toolchain">[\s\S]*?<\/section>/;
if (hasToolchain && !toolchain.test(html)) {
  const install = '<section class="section reveal" aria-labelledby="install">';
  if (!html.includes(install)) throw new Error('Cannot restore the toolchain section: install section missing');
  html = html.replace(install, `<section class="section reveal" aria-labelledby="toolchain">
            <div class="section-head"><h2 id="toolchain">How to write one</h2></div>
            <div class="example-grid"></div>
        </section>\n\n        ${install}`);
}
// Inside the toolchain section only: replace its intro, or add one before its tiles.
if (hasToolchain)
  html = html.replace(toolchain, section => /<p class="section-intro">/.test(section)
    ? section.replace(/(<p class="section-intro">)[\s\S]*?(<\/p>)/, (_, open, close) => open + toolIntro + close)
    : section.replace('<div class="example-grid">', `<p class="section-intro">${toolIntro}</p>\n            <div class="example-grid">`));
if (!hasToolchain) html = html.replace(/\s*<section class="section reveal" aria-labelledby="toolchain">[\s\S]*?<\/section>/, '');
let group = 0;
html = html.replace(/<div class="example-grid">[\s\S]*?<\/div>/g, () => {
  const category = ['topic', 'toolchain'][group++];
  return '<div class="example-grid">\n' + scenes.filter(s => s.group === category).map(s =>
    `                <article class="example-card explainer-tile"><a href="/projects/rayner/${escape(s.id)}"><img src="/projects/rayner/${escape(s.id)}.png" alt="" loading="lazy" width="960" height="540"><h3${s.lang === 'en' ? '' : ` lang="${escape(s.lang)}"`}>${escape(TOOL_TITLES[s.id] ?? s.title)}</h3></a></article>`
  ).join('\n') + '\n            </div>';
});
if (group !== (hasToolchain ? 2 : 1)) throw new Error('Expected the gallery sections for the selected groups');
html = html.replace(/<pre><code>(?:npm ci|git clone https:\/\/github\.com\/adewale\/rayner)[\s\S]*?<\/code><\/pre>/, `<pre><code>git clone https://github.com/adewale/rayner &amp;&amp; cd rayner
npm ci
npx playwright-core install chromium
npm run demos:build
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
