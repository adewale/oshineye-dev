/**
 * build-atlas.mjs — generates the /atlas force-directed project map.
 *
 * Dependency-free: a seeded force simulation bakes the layout at build time,
 * then we emit two inline SVG "skins" (engraved + sketchy) into a page template.
 * Static-first by construction — no runtime graph library, no client-side
 * simulation, so it is reduced-motion-safe and works with zero JavaScript.
 *
 * Channels: category -> spatial region, lineage -> maroon directed backbone,
 * language -> node hue, lineage degree -> node size.
 *
 * Usage: bun tools/build-atlas.mjs   (also run as part of `bun run build`)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "tools/atlas/repos.json"), "utf8"));

// ---------------------------------------------------------------------------
// Geometry / tuning
// ---------------------------------------------------------------------------
const W = 1360;
const H = 1000;
const CX = W / 2;
const CY = H / 2;
const RX = 545; // category ring radii
const RY = 410;
const TICKS = 600;
const LBL_CHARW = 6.2; // approx label width per character at 11px

// Muted, paper-friendly language hues. TypeScript (the dominant tongue) takes
// the brand maroon; the rest are low-saturation accents so the plate stays
// engraved rather than turning into a rainbow.
const HUE = {
  TS: "#7f0000",
  Python: "#1d6f6a",
  JS: "#9a7400",
  Go: "#2b5d86",
  HTML: "#6b4a86",
  Skill: "#3f6b3f",
};

// Order the category ring so the two largest clusters (skills, cloudflare) are
// kept apart, smaller ones buffer between them, and lineage-linked clusters stay
// adjacent (cloudflare's Durable-Object demos feed the playful builds).
const RING = [
  "skills", "feeds", "cloudflare", "playful", "workflow",
  "photo", "thought", "reading", "site", "systems",
];

const catLabel = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));
const langLabel = Object.fromEntries(data.languages.map((l) => [l.id, l.label]));

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic layout across builds.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rng = mulberry32(0x05_05_19_84);

// ---------------------------------------------------------------------------
// Nodes + links
// ---------------------------------------------------------------------------
// The Cloudflare-platform cluster is the hub the rest of the work radiates from,
// so it anchors the centre; the other nine themes ring around it. This fills the
// composition and makes the lineage backbone fan outward from the core.
const CENTER_CAT = "cloudflare";
const ringCats = RING.filter((c) => c !== CENTER_CAT);
const anchor = { [CENTER_CAT]: { x: CX, y: CY } };
ringCats.forEach((cat, i) => {
  const a = (i / ringCats.length) * Math.PI * 2 - Math.PI / 2;
  anchor[cat] = { x: CX + Math.cos(a) * RX, y: CY + Math.sin(a) * RY };
});

const nodes = data.repos.map((r) => {
  const a = anchor[r.cat] || { x: CX, y: CY };
  // seed each node near its category anchor with a little deterministic scatter
  return {
    ...r,
    x: a.x + (rng() - 0.5) * 90,
    y: a.y + (rng() - 0.5) * 90,
    vx: 0,
    vy: 0,
    deg: 0,
  };
});
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

const links = [];
for (const n of nodes) {
  for (const p of n.parents) {
    if (byId[p]) {
      links.push({ source: byId[p], target: n });
      byId[p].deg++;
      n.deg++;
    }
  }
}

const radius = (n) => 7.5 + Math.sqrt(n.deg) * 4.2;

// ---------------------------------------------------------------------------
// Force simulation
// ---------------------------------------------------------------------------
const CHARGE = -1500; // node-node repulsion
const ANCHOR_K = 0.026; // pull toward category anchor
const LINK_DIST = 86;
const LINK_K = 0.05;
const CENTER_K = 0.006;
const DAMP = 0.86;

for (let t = 0; t < TICKS; t++) {
  const cool = 1 - t / TICKS;

  // repulsion (O(n^2), trivial at this scale)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const f = (CHARGE / d2) * cool;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // category anchor + centering
  for (const n of nodes) {
    const a = anchor[n.cat];
    n.vx += (a.x - n.x) * ANCHOR_K;
    n.vy += (a.y - n.y) * ANCHOR_K;
    n.vx += (CX - n.x) * CENTER_K;
    n.vy += (CY - n.y) * CENTER_K;
  }

  // lineage springs
  for (const l of links) {
    let dx = l.target.x - l.source.x;
    let dy = l.target.y - l.source.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - LINK_DIST) * LINK_K;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    l.source.vx += fx;
    l.source.vy += fy;
    l.target.vx -= fx;
    l.target.vy -= fy;
  }

  // collision (resolve overlaps directly)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const min = radius(a) + radius(b) + 10;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (d < min) {
        const push = (min - d) / 2;
        const ox = (dx / d) * push;
        const oy = (dy / d) * push;
        a.x -= ox;
        a.y -= oy;
        b.x += ox;
        b.y += oy;
      }
    }
  }

  // integrate
  for (const n of nodes) {
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x += n.vx;
    n.y += n.vy;
  }
}

// normalise into the viewBox with a margin
const pad = 64;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const n of nodes) {
  minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
  minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
}
const sx = (W - pad * 2) / (maxX - minX);
const sy = (H - pad * 2) / (maxY - minY);
const s = Math.min(sx, sy);
for (const n of nodes) {
  n.x = pad + (n.x - minX) * s;
  n.y = pad + (n.y - minY) * s;
}

// Label-box de-overlap, in final pixel coordinates. Each node owns an AABB that
// includes its right-hand label; we relax overlaps along the axis of least
// penetration while a weak home-spring keeps it near its cluster. This is the
// difference between a legible atlas and a pile of overlapping names.
for (const n of nodes) {
  n.lw = n.id.length * LBL_CHARW + 10;
  n.hx = n.x;
  n.hy = n.y;
}
const halfH = (n) => Math.max(radius(n), 7.5) + 3.5;
const GAP = 8;
for (let it = 0; it < 460; it++) {
  for (const n of nodes) {
    n.x += (n.hx - n.x) * 0.022;
    n.y += (n.hy - n.y) * 0.022;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const ar = radius(a), br = radius(b);
      const aL = a.x - ar - 2, aR = a.x + ar + 7 + a.lw, aT = a.y - halfH(a), aB = a.y + halfH(a);
      const bL = b.x - br - 2, bR = b.x + br + 7 + b.lw, bT = b.y - halfH(b), bB = b.y + halfH(b);
      const penX = Math.min(aR - bL, bR - aL);
      const penY = Math.min(aB - bT, bB - aT);
      if (penX > 0 && penY > 0) {
        if (penX < penY) {
          const push = (penX + GAP) / 2;
          const sgn = a.x <= b.x ? -1 : 1;
          a.x += sgn * push; b.x -= sgn * push;
        } else {
          const push = (penY + GAP) / 2;
          const sgn = a.y <= b.y ? -1 : 1;
          a.y += sgn * push; b.y -= sgn * push;
        }
      }
    }
  }
  for (const n of nodes) {
    const r = radius(n);
    n.x = Math.max(pad * 0.5 + r, Math.min(n.x, W - 6 - r - 7 - n.lw));
    n.y = Math.max(pad * 0.5 + r, Math.min(n.y, H - pad * 0.5 - r));
  }
}

// category centroids + spread (for territory blobs and labels)
const cats = {};
for (const n of nodes) {
  (cats[n.cat] ||= { xs: 0, ys: 0, n: 0, nodes: [] });
  cats[n.cat].xs += n.x;
  cats[n.cat].ys += n.y;
  cats[n.cat].n++;
  cats[n.cat].nodes.push(n);
}
for (const c of Object.values(cats)) {
  c.cx = c.xs / c.n;
  c.cy = c.ys / c.n;
  c.r = 0;
  for (const n of c.nodes) {
    c.r = Math.max(c.r, Math.hypot(n.x - c.cx, n.y - c.cy) + radius(n));
  }
  c.r += 22;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const f = (n) => Math.round(n * 10) / 10;

// a slightly wobbly closed ring approximated from points (for the sketchy skin)
function roughRing(cx, cy, r, jitter, seed) {
  const rr = mulberry32(seed);
  const N = 16;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rad = r + (rr() - 0.5) * jitter * 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    d += (i === 0 ? "M" : "L") + f(x) + " " + f(y) + " ";
  }
  return d.trim();
}

// quadratic edge path, backed off the node radii; bows perpendicular to the line
function edgePath(sx, sy, tx, ty, sr, tr, bow, headBack) {
  let dx = tx - sx, dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const x1 = sx + ux * sr;
  const y1 = sy + uy * sr;
  const x2 = tx - ux * (tr + headBack);
  const y2 = ty - uy * (tr + headBack);
  const mx = (x1 + x2) / 2 + -uy * bow;
  const my = (y1 + y2) / 2 + ux * bow;
  return { d: `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`, x2, y2, ux, uy };
}

function arrowHead(x, y, ux, uy, size, jitter, seed) {
  const rr = seed != null ? mulberry32(seed) : () => 0.5;
  const ang = Math.atan2(uy, ux);
  const a1 = ang + Math.PI - 0.42;
  const a2 = ang + Math.PI + 0.42;
  const j = () => (rr() - 0.5) * jitter;
  const p1x = x + Math.cos(a1) * size + j();
  const p1y = y + Math.sin(a1) * size + j();
  const p2x = x + Math.cos(a2) * size + j();
  const p2y = y + Math.sin(a2) * size + j();
  return `M${f(p1x)} ${f(p1y)} L${f(x)} ${f(y)} L${f(p2x)} ${f(p2y)}`;
}

// ---------------------------------------------------------------------------
// SVG content
// ---------------------------------------------------------------------------
function territories() {
  let out = `<g class="layer-territories" aria-hidden="true">`;
  for (const id of RING) {
    const c = cats[id];
    if (!c) continue;
    out += `<circle class="territory" cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(c.r)}"/>`;
    const ly = Math.max(17, c.cy - c.r - 9);
    out += `<text class="territory-label" x="${f(c.cx)}" y="${f(ly)}" text-anchor="middle">${esc(catLabel[id])}</text>`;
  }
  out += `</g>`;
  return out;
}

function linkLayer(skin) {
  const sketchy = skin === "sketchy";
  let out = `<g class="layer-lineage skin-${skin}" aria-hidden="true">`;
  for (const l of links) {
    const s = l.source, t = l.target;
    const sr = radius(s), tr = radius(t);
    const seed = hashStr(s.id + ">" + t.id);
    const g = `<g class="edge-group" data-source="${esc(s.id)}" data-target="${esc(t.id)}">`;
    if (!sketchy) {
      const e = edgePath(s.x, s.y, t.x, t.y, sr, tr, 16, 9);
      out += g + `<path class="edge" d="${e.d}"/>` +
        `<path class="edge-head" d="${arrowHead(e.x2, e.y2, e.ux, e.uy, 8, 0, null)}"/></g>`;
    } else {
      const e1 = edgePath(s.x, s.y, t.x, t.y, sr, tr, 16, 9);
      const e2 = edgePath(s.x, s.y, t.x, t.y, sr, tr, 21, 9);
      out += g + `<path class="edge" d="${e1.d}"/>` +
        `<path class="edge" d="${e2.d}"/>` +
        `<path class="edge-head" d="${arrowHead(e1.x2, e1.y2, e1.ux, e1.uy, 9, 3, seed)}"/></g>`;
    }
  }
  out += `</g>`;
  return out;
}

function nodeSkin(n, skin) {
  const r = radius(n);
  const hue = HUE[n.lang] || "#7f0000";
  if (skin === "engraved") {
    return (
      `<g class="skin-engraved">` +
      `<circle class="node-disc" cx="${f(n.x)}" cy="${f(n.y)}" r="${f(r)}"/>` +
      `<circle class="node-ring" cx="${f(n.x)}" cy="${f(n.y)}" r="${f(r)}" style="stroke:${hue}"/>` +
      `<circle class="node-core" cx="${f(n.x)}" cy="${f(n.y)}" r="${f(Math.max(1.6, r * 0.22))}" style="fill:${hue}"/>` +
      `</g>`
    );
  }
  const seed = hashStr(n.id);
  let hatch = "";
  const rr = mulberry32(seed ^ 0x9e37);
  for (let k = -1; k <= 1; k++) {
    const off = k * r * 0.5;
    const hx1 = n.x - r * 0.62 + (rr() - 0.5) * 2;
    const hy1 = n.y + off - r * 0.62 + (rr() - 0.5) * 2;
    const hx2 = n.x + r * 0.62 + (rr() - 0.5) * 2;
    const hy2 = n.y + off + r * 0.62 + (rr() - 0.5) * 2;
    hatch += `<path class="node-hatch" d="M${f(hx1)} ${f(hy1)} L${f(hx2)} ${f(hy2)}" style="stroke:${hue}"/>`;
  }
  return (
    `<g class="skin-sketchy">` +
    hatch +
    `<path class="node-ring-rough" d="${roughRing(n.x, n.y, r, 1.6, seed)}" style="stroke:${hue}"/>` +
    `<path class="node-ring-rough" d="${roughRing(n.x, n.y, r, 2.1, seed ^ 0x55)}" style="stroke:${hue}"/>` +
    `<circle class="node-core" cx="${f(n.x)}" cy="${f(n.y)}" r="${f(Math.max(1.6, r * 0.2))}" style="fill:${hue}"/>` +
    `</g>`
  );
}

function nodeLayer() {
  const adj = {};
  for (const l of links) {
    (adj[l.source.id] ||= new Set()).add(l.target.id);
    (adj[l.target.id] ||= new Set()).add(l.source.id);
  }
  let out = `<g class="layer-nodes">`;
  for (const n of nodes) {
    const r = radius(n);
    const url = `https://github.com/adewale/${n.id}`;
    const nbrs = adj[n.id] ? [...adj[n.id]].join(" ") : "";
    const labelX = f(n.x + r + 5);
    const labelY = f(n.y + 3.5);
    out +=
      `<a class="node" href="${esc(url)}" target="_blank" rel="noopener" ` +
      `data-id="${esc(n.id)}" data-adj="${esc(nbrs)}" ` +
      `aria-label="${esc(n.id)} — ${esc(langLabel[n.lang] || n.lang)}, ${esc(catLabel[n.cat])}. ${esc(n.blurb)}">` +
      `<title>${esc(n.id)} — ${esc(catLabel[n.cat])} · ${esc(langLabel[n.lang] || n.lang)}\n${esc(n.blurb)}</title>` +
      nodeSkin(n, "engraved") +
      nodeSkin(n, "sketchy") +
      `<text class="node-label" x="${labelX}" y="${labelY}">${esc(n.id)}</text>` +
      `</a>`;
  }
  out += `</g>`;
  return out;
}

function svgInner() {
  return territories() + linkLayer("engraved") + linkLayer("sketchy") + nodeLayer();
}

function svgEl(extraAttrs = "") {
  return (
    `<svg class="atlas-svg" viewBox="0 0 ${W} ${H}" role="group" ` +
    `aria-labelledby="atlas-title atlas-note" preserveAspectRatio="xMidYMid meet" ${extraAttrs}>` +
    svgInner() +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Data table (canonical accessible alternative)
// ---------------------------------------------------------------------------
function table() {
  const rows = data.repos
    .map((r) => {
      const url = `https://github.com/adewale/${r.id}`;
      const from = r.parents.length ? r.parents.map(esc).join(", ") : "—";
      return (
        `<tr>` +
        `<td><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.id)}</a></td>` +
        `<td>${esc(catLabel[r.cat])}</td>` +
        `<td>${esc(langLabel[r.lang] || r.lang)}</td>` +
        `<td>${from}</td>` +
        `</tr>`
      );
    })
    .join("\n");
  return (
    `<table class="atlas-table">` +
    `<caption>Every repository in the atlas, with its category, language, and lineage.</caption>` +
    `<thead><tr><th scope="col">Repository</th><th scope="col">Category</th><th scope="col">Language</th><th scope="col">Descends from</th></tr></thead>` +
    `<tbody>\n${rows}\n</tbody></table>`
  );
}

// language + category legends
function legend() {
  const langs = data.languages
    .filter((l) => nodes.some((n) => n.lang === l.id))
    .map(
      (l) =>
        `<li><span class="swatch" style="background:${HUE[l.id]}"></span>${esc(l.label)}</li>`
    )
    .join("");
  return `<ul class="atlas-legend" aria-label="Languages by colour">${langs}</ul>`;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const template = readFileSync(join(ROOT, "tools/atlas/atlas.template.html"), "utf8");
const page = template
  .replace("<!-- ATLAS:GRAPH -->", svgEl())
  .replace("<!-- ATLAS:LEGEND -->", legend())
  .replace("<!-- ATLAS:TABLE -->", table());
writeFileSync(join(ROOT, "site/atlas.html"), page);

// standalone preview SVG (engraved, self-contained colours) for quick viewing
const standalone =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
  `<style>` +
  `:root{--brand:#7f0000;--ink:#231f1b;--ink-muted:#6f655c;}` +
  `.atlas-svg{font-family:Georgia,serif}` +
  `.territory{fill:#7f0000;opacity:.045;stroke:#7f0000;stroke-opacity:.14;stroke-dasharray:3 5}` +
  `.territory-label{fill:#6f655c;font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;paint-order:stroke;stroke:#fbf7ef;stroke-width:4px;stroke-linejoin:round}` +
  `.edge{fill:none;stroke:#7f0000;stroke-width:1.6;opacity:.62}` +
  `.edge-head{fill:none;stroke:#7f0000;stroke-width:1.6;opacity:.62}` +
  `.node-disc{fill:#fbf7ef}.node-ring{fill:none;stroke-width:1.7}` +
  `.node-ring-rough{fill:none;stroke-width:1.3;stroke-linecap:round}` +
  `.node-hatch{fill:none;stroke-width:1;opacity:.45;stroke-linecap:round}` +
  `.node-core{}` +
  `.node-label{fill:#231f1b;font-size:11px;paint-order:stroke;stroke:#fbf7ef;stroke-width:2.5px;stroke-linejoin:round}.skin-sketchy{display:none}` +
  `</style>` +
  `<rect width="${W}" height="${H}" fill="#fbf7ef"/>` +
  svgInner() +
  `</svg>`;
mkdirSync(join(ROOT, "site/atlas"), { recursive: true });
writeFileSync(join(ROOT, "site/atlas/preview.svg"), standalone);

// quick build stats to stderr
const span = `${f(maxX - minX)}×${f(maxY - minY)}`;
console.log(
  `atlas: ${nodes.length} nodes, ${links.length} lineage edges, ` +
    `${Object.keys(cats).length} categories — layout span ${span} → wrote site/atlas.html + site/atlas/preview.svg`
);
