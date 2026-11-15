// Run after Rayner's site:export with --index none:
//   npm run site:export -- <this repo>/site --path /projects/rayner --origin https://oshineye.dev --index none --only <ids> --from out/main
// Product copy, facts, titles and counts come from that export. The export pins its own files and its
// sections of _headers and llms.txt in deployment.json; this page lives outside its subtree, so the
// export never touches it and this script never touches the manifest.
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../site/projects/rayner.html', import.meta.url);
const { version, product, totals, scenes, facts } = JSON.parse(await readFile(new URL('../site/projects/rayner/catalog.json', import.meta.url), 'utf8'));
if (version !== 2 || scenes.length !== totals.explainers || scenes.reduce((n, scene) => n + scene.scenarios, 0) !== totals.scenarios)
  throw new Error('Rayner catalog version or counts are inconsistent');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const entry = product.entry;
if (!entry || !scenes.some(scene => scene.id === entry.id) || !entry.step || !entry.label)
  throw new Error('Rayner catalog needs a valid introductory entry');
const entryUrl = `/projects/rayner/${encodeURIComponent(entry.id)}?${new URLSearchParams({step: entry.step, ...entry.settings})}`;
const visible = scenes.filter(scene => scene.tier !== 'coverage');
const subjects = visible.filter(scene => scene.group === 'topic');
// Older exports had no tiers. Preserve their gallery while using the source
// catalog's selection for new exports, rather than maintaining a host-side list.
const leaders = subjects.filter(scene => (scene.tier ?? 'showcase') === 'showcase');
const more = subjects.filter(scene => scene.tier === 'gallery');
const toolIntro = `These are for authors, not subject lessons. For the whole path, read <a href="${escape(product.tutorial)}">the tutorial</a>, the <a href="${escape(product.reference)}">authoring reference</a> or the <a href="${escape(product.skill)}">agent authoring skill</a>.`;
let html = await readFile(file, 'utf8');
// Retired examples may remain in an old exported page; remove them on every sync.
html = html.replace(/<section class="section reveal" aria-labelledby="by-example">[\s\S]*?<\/section>\s*/, '');
html = html.replace(/\s*<details class="rayner-more">[\s\S]*?<\/details>/g, '');
html = html.replace(/(<h2 id="examples">)[\s\S]*?(<\/h2>)/, '$1Selected explanations$2');
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
// Exports from Rayner #107 on carry every fact the panel shows in catalog.json's facts, taken from
// Rayner's package.json and PRODUCT. An older catalog has none, so each fact falls back to the
// product copy or to what this page said before: npm has rayner 0.1.0, an older single-package
// release, so the install fact points at the quick start, which builds both packages from a clone.
const installGuide = facts?.installGuide ?? product.installGuide ?? 'https://github.com/adewale/rayner#quick-start';
const install = facts?.install ?? product.install ?? 'Rayner 0.2.0 is not on npm yet: npm’s rayner 0.1.0 is an earlier, single-package release. Build both packages from a clone of the repository.';
const requirements = facts?.requirements ?? product.requirements;
const publishes = facts?.publishes ?? 'A portable HTML page with a transcript';
const repository = facts?.repository ?? 'https://github.com/adewale/rayner';
const license = facts?.license ?? 'MIT';
const repositoryName = new URL(repository).pathname.replace(/^\//, '');
const panel = `<aside class="project-panel" aria-labelledby="project-facts-title">
                    <a class="project-motion-frame" href="https://github.com/adewale/rayner" target="_blank" rel="noopener" aria-label="View Rayner on GitHub">
                        <img class="project-panel-image" src="${art}/colour.jpg" alt="Generated project artwork for Rayner" loading="lazy" width="400" height="300">
                        <video class="project-motion-media" muted loop playsinline preload="none" poster="${art}/colour.jpg" aria-hidden="true" width="400" height="300">
                            <source src="${art}/animation.mp4" type="video/mp4">
                        </video>
                    </a>
                    <h3 id="project-facts-title">Project facts</h3>
                    <dl class="project-facts">
                        <div><dt>Install</dt><dd>${escape(install)} <a href="${escape(installGuide)}">See the quick start</a>.</dd></div>
                        <div><dt>Requires</dt><dd>${escape(requirements)}</dd></div>
                        <div><dt>Publishes</dt><dd>${escape(publishes)}</dd></div>
                        <div><dt>Repository</dt><dd><a href="${escape(repository)}" target="_blank" rel="noopener"><code>${escape(repositoryName)}</code></a></dd></div>
                        <div><dt>License</dt><dd>${escape(license)}</dd></div>
                    </dl>
                </aside>`;
const besideCopy = /(<div class="project-copy">[\s\S]*?<\/div>\s*)<aside[\s\S]*?<\/aside>/;
if (!besideCopy.test(html)) throw new Error('Cannot place the Rayner project panel: no aside beside the copy');
html = html.replace(besideCopy, (_, copyBlock) => copyBlock + panel);
html = html.replace(/(<script src="\/projects\/rayner\/loader\.js" data-src=")[^"]*(" data-target="rayner-embed" data-title=")[^"]*("><\/script>)/,
  (_, before, middle, after) => `${before}/projects/rayner/${escape(entry.id)}${middle}${escape(scenes.find(s => s.id === entry.id).title)}${after}`);
const hasToolchain = visible.some(s => s.group === 'toolchain');
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
const cards = entries => entries.map(s =>
  `                <article class="example-card explainer-tile"><a href="/projects/rayner/${escape(s.id)}"><img src="/projects/rayner/${escape(s.id)}.png" alt="" loading="lazy" width="960" height="540"><h3${s.lang === 'en' ? '' : ` lang="${escape(s.lang)}"`}>${escape(s.title)}</h3></a></article>`
).join('\n');
html = html.replace(/<div class="example-grid">[\s\S]*?<\/div>/g, () => {
  const category = ['topic', 'toolchain'][group++];
  const entries = category === 'topic' ? leaders : visible.filter(s => s.group === category);
  const grid = '<div class="example-grid">\n' + cards(entries) + '\n            </div>';
  return category === 'topic' && more.length
    ? grid + '\n            <details class="rayner-more"><summary>More subject explanations</summary><div class="example-grid more-example-grid">\n' + cards(more) + '\n            </div></details>'
    : grid;
});
if (group !== (hasToolchain ? 2 : 1)) throw new Error('Expected the gallery sections for the selected groups');
html = html.replace(/<pre><code>(?:npm ci|git clone https:\/\/github\.com\/adewale\/rayner)[\s\S]*?<\/code><\/pre>/, `<pre><code>git clone https://github.com/adewale/rayner &amp;&amp; cd rayner
npm ci
npx playwright-core install chromium
npm run demos:build
npm run demos:serve</code></pre>`);
html = html.replace(/<p class="section-intro">You need Node[^<]+<\/p>/, `<p class="section-intro">${escape(requirements)} Diagrams are captured at build time with <a href="https://github.com/adewale/agentic-mermaid">Agentic Mermaid</a>; the engine is forked from Ivar Vong’s <a href="https://github.com/ivarvong/lantern">Lantern</a>.</p>`);
await writeFile(file, html);

const index = new URL('../site/index.html', import.meta.url);
let home = await readFile(index, 'utf8');
home = home.replace(/(<a href="\/projects\/rayner" class="repo-title">rayner<\/a>[\s\S]*?<p class="repo-desc">)[\s\S]*?(<\/p>)/, '$1' + escape(product.summary) + '$2');
await writeFile(index, home);
console.log(`Updated Rayner landing page from the exported catalog: ${totals.explainers} explainers, ${totals.scenarios} scenarios.`);
