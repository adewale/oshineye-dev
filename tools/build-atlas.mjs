/**
 * build-atlas.mjs — generates the data + page for the interactive /atlas graph.
 *
 * The force simulation runs CLIENT-SIDE in the browser (vasturiano's force-graph,
 * vendored into site/vendor). This script only prepares the data: it reads the
 * curated repos.json, applies the exclude flag, derives node colour/size and the
 * lineage links, and injects the payload + an accessible data-table fallback into
 * the page template. The library is vendored here too, like garten.js.
 *
 * Channels: category -> clustering force (client), lineage -> directed links,
 * language -> node colour, descendants -> node size, profile signals -> featured
 * fill + Cloudflare spotlight.
 *
 * Usage: bun tools/build-atlas.mjs   (also runs as part of `bun run build`)
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "tools/atlas/repos.json"), "utf8"));

// --- OKLCH -> sRGB hex (the colour space the rest of oshineye.dev is authored in) ---
function oklchToHex(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  const ch = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0");
  return "#" + ch(gam(r)) + ch(gam(g)) + ch(gam(bl));
}

// Muted, warm "printer's-ink" language family pinned to the brand's register.
const HUE_OKLCH = {
  TS:     [0.355, 0.130, 28],   // brand maroon (matches --brand)
  HTML:   [0.470, 0.105, 48],   // terracotta / rust
  JS:     [0.560, 0.102, 80],   // ochre
  Python: [0.520, 0.085, 152],  // olive drab
  Go:     [0.505, 0.062, 232],  // dusty slate (desaturated)
  Skill:  [0.480, 0.024, 65],   // warm taupe-grey (neutral / meta)
};
const HUE = Object.fromEntries(Object.entries(HUE_OKLCH).map(([k, v]) => [k, oklchToHex(...v)]));

// Site tokens as hex, for the canvas (derived from styles.css :root OKLCH values).
const PAPER = oklchToHex(0.984, 0.002, 35);
const INK = oklchToHex(0.21, 0.012, 35);
const BRAND = HUE.TS;

const catLabel = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));
const langLabel = Object.fromEntries(data.languages.map((l) => [l.id, l.label]));

// Ring order (cloudflare is the centre hub the rest ring around).
const CENTER_CAT = "cloudflare";
const RING = [
  "skills", "feeds", "cloudflare", "playful", "workflow",
  "photo", "thought", "reading", "site", "systems",
];

// --- nodes + lineage links (excluded repos drop out entirely) ---
const repos = data.repos.filter((r) => !r.exclude);
const excludedCount = data.repos.length - repos.length;
const idset = new Set(repos.map((r) => r.id));

const deg = {};
const links = [];
for (const r of repos) {
  for (const p of r.parents) {
    if (idset.has(p)) {
      links.push({ source: p, target: r.id });
      deg[p] = (deg[p] || 0) + 1;
      deg[r.id] = (deg[r.id] || 0) + 1;
    }
  }
}

const nodes = repos.map((r) => ({
  id: r.id,
  lang: r.lang,
  cat: r.cat,
  color: HUE[r.lang] || HUE.TS,
  val: 1 + (deg[r.id] || 0) * 1.7, // size = descendants
  featured: !!r.featured,
  cloudflare: !!r.cloudflare,
}));

const presentCats = RING.filter((c) => nodes.some((n) => n.cat === c));

const payload = {
  nodes,
  links,
  cats: presentCats,
  center: CENTER_CAT,
  catLabel: Object.fromEntries(presentCats.map((c) => [c, catLabel[c]])),
  colors: { paper: PAPER, ink: INK, brand: BRAND },
};

// --- accessible data table (canonical fallback) ---
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function table() {
  const rows = repos
    .map((r) => {
      const url = `https://github.com/adewale/${r.id}`;
      const from = r.parents.filter((p) => idset.has(p)).map(esc).join(", ") || "—";
      const tags = [r.cloudflare ? "Cloudflare" : null, r.featured ? "Featured" : null].filter(Boolean).join(", ") || "—";
      return (
        `<tr><td><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.id)}</a></td>` +
        `<td>${esc(catLabel[r.cat])}</td><td>${esc(langLabel[r.lang] || r.lang)}</td>` +
        `<td>${from}</td><td>${tags}</td></tr>`
      );
    })
    .join("\n");
  return (
    `<table class="atlas-table">` +
    `<caption>Every repository in the atlas, with its category, language, lineage, and signals.</caption>` +
    `<thead><tr><th scope="col">Repository</th><th scope="col">Category</th><th scope="col">Language</th><th scope="col">Descends from</th><th scope="col">Signals</th></tr></thead>` +
    `<tbody>\n${rows}\n</tbody></table>`
  );
}
function legend() {
  const langs = data.languages
    .filter((l) => nodes.some((n) => n.lang === l.id))
    .map((l) => `<li><span class="swatch" style="background:${HUE[l.id]}"></span>${esc(l.label)}</li>`)
    .join("");
  return `<ul class="atlas-legend" aria-label="Languages by colour">${langs}</ul>`;
}

// --- emit ---
const template = readFileSync(join(ROOT, "tools/atlas/atlas.template.html"), "utf8");
const page = template
  .replace("<!-- ATLAS:DATA -->", `<script>window.__ATLAS__ = ${JSON.stringify(payload)};</script>`)
  .replace("<!-- ATLAS:LEGEND -->", legend())
  .replace("<!-- ATLAS:TABLE -->", table());
writeFileSync(join(ROOT, "site/atlas.html"), page);

// vendor the force-graph library (served as a static asset by the Worker)
mkdirSync(join(ROOT, "site/vendor"), { recursive: true });
copyFileSync(
  join(ROOT, "node_modules/force-graph/dist/force-graph.min.js"),
  join(ROOT, "site/vendor/force-graph.min.js")
);

const featuredN = nodes.filter((n) => n.featured).length;
const cfN = nodes.filter((n) => n.cloudflare).length;
console.log(
  `atlas: ${nodes.length} nodes (${featuredN} featured, ${cfN} on Cloudflare, ${excludedCount} excluded), ` +
    `${links.length} lineage links, ${presentCats.length} categories — wrote site/atlas.html + vendored force-graph`
);
