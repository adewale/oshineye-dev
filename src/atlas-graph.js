/**
 * atlas-graph.js — the interactive 3D force-directed atlas.
 *
 * Bundled by `bun build` (like oshineye-config.ts) so 3d-force-graph, three, and
 * three-spritetext share a single three instance. Reads the graph payload from
 * window.__ATLAS__ (injected by tools/build-atlas.mjs) and renders an orbitable
 * Three.js scene on an ivory ground, keeping the site's palette and signals:
 * category -> 3D cluster, lineage -> directed links, language -> node colour,
 * descendants -> node size, featured -> brighter/labelled, Cloudflare -> spotlight.
 */

import ForceGraph3D from "3d-force-graph";
import SpriteText from "three-spritetext";

const D = window.__ATLAS__;
const mount = document.getElementById("atlas-graph");

if (D && mount && ForceGraph3D) {
  const loading = mount.querySelector(".atlas-loading");
  const PAPER = D.colors.paper, INK = D.colors.ink, BRAND = D.colors.brand;
  const accent = () =>
    getComputedStyle(document.documentElement).getPropertyValue("--garden-accent").trim() || BRAND;

  // 3D category anchors: the Cloudflare hub at the origin, the other themes
  // distributed over a sphere (fibonacci spiral) so clusters occupy 3D regions.
  const ring = D.cats.filter((c) => c !== D.center);
  const R = 230;
  const anchor = { [D.center]: { x: 0, y: 0, z: 0 } };
  ring.forEach((c, i) => {
    const t = (i + 0.5) / ring.length;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    anchor[c] = {
      x: R * Math.sin(phi) * Math.cos(theta),
      y: R * Math.sin(phi) * Math.sin(theta),
      z: R * Math.cos(phi),
    };
  });

  let showLineage = true, cfSpot = false, hoverId = null, adj = new Set();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const radius = (n) => Math.cbrt(n.val) * 4;

  const hx = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => {
    const pa = hx(a), pb = hx(b);
    return "#" + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0")).join("");
  };
  const dimmed = (n) => (hoverId && !adj.has(n.id)) || (cfSpot && !n.cloudflare);
  const nodeColor = (n) => (dimmed(n) ? mix(n.color, PAPER, 0.84) : n.color);
  const linkLit = (l) => {
    if (!hoverId) return false;
    const s = l.source.id || l.source, t = l.target.id || l.target;
    return s === hoverId || t === hoverId;
  };
  const linkPaint = (l) => (linkLit(l) ? accent() : BRAND);

  const Graph = ForceGraph3D({ controlType: "orbit" })(mount)
    .graphData({ nodes: D.nodes.map((n) => ({ ...n })), links: D.links.map((l) => ({ ...l })) })
    .backgroundColor(PAPER)
    .showNavInfo(false)
    .nodeId("id")
    .nodeVal("val")
    .nodeRelSize(5)
    .nodeColor(nodeColor)
    .nodeOpacity(0.95)
    .nodeResolution(18)
    .nodeLabel((n) => `<span class="atlas-tip">${n.id}</span>`)
    .nodeThreeObjectExtend(true)
    .nodeThreeObject((n) => {
      // name only the major stars (featured or hubs); the rest reveal on hover
      if (!n.featured && n.val < 4) return null;
      const label = new SpriteText(n.id);
      label.color = n.featured ? BRAND : INK;
      label.textHeight = n.featured ? 7 : 5.5;
      label.fontWeight = n.featured ? "700" : "400";
      label.fontFace = "Chaparral Pro, Georgia, serif";
      label.material.depthWrite = false;
      label.position.set(0, -(radius(n) + 6), 0);
      label.__node = n;
      return label;
    })
    .linkColor(linkPaint)
    .linkWidth((l) => (linkLit(l) ? 1.6 : 0.6))
    .linkOpacity(0.75)
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalArrowColor(linkPaint)
    .linkVisibility(() => showLineage)
    .onNodeClick((n) => window.open("https://github.com/adewale/" + n.id, "_blank", "noopener"))
    .onNodeHover((n) => { setHover(n); refreshStyles(); mount.style.cursor = n ? "pointer" : "grab"; });

  Graph.d3Force("charge").strength(-130);
  Graph.d3Force("link").distance(34);
  const cluster = (alpha) => {
    const k = 0.14 * alpha;
    for (const n of Graph.graphData().nodes) {
      const a = anchor[n.cat] || { x: 0, y: 0, z: 0 };
      n.vx += (a.x - n.x) * k;
      n.vy += (a.y - n.y) * k;
      n.vz += (a.z - n.z) * k;
    }
  };
  cluster.initialize = () => {};
  Graph.d3Force("cluster", cluster);

  function setHover(n) {
    hoverId = n ? n.id : null;
    adj = new Set(hoverId ? [hoverId] : []);
    if (n) for (const l of Graph.graphData().links) {
      const s = l.source.id || l.source, t = l.target.id || l.target;
      if (s === hoverId) adj.add(t);
      if (t === hoverId) adj.add(s);
    }
  }
  function refreshStyles() {
    Graph.nodeColor(nodeColor).linkColor(linkPaint).linkWidth((l) => (linkLit(l) ? 1.6 : 0.6)).linkDirectionalArrowColor(linkPaint);
    // dim the label sprites that belong to dimmed nodes
    Graph.graphData().nodes.forEach((n) => {
      const obj = n.__threeObj;
      if (!obj) return;
      obj.traverse((c) => { if (c.material && c.isSprite) c.material.opacity = dimmed(n) ? 0.12 : 1; });
    });
  }

  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("change", (e) => fn(e.target)); };
  on("opt-lineage", (t) => { showLineage = t.checked; Graph.linkVisibility(() => showLineage); });
  on("opt-cf", (t) => { cfSpot = t.checked; refreshStyles(); });
  on("opt-spin", (t) => { const c = Graph.controls(); if (c) { c.autoRotate = t.checked; c.autoRotateSpeed = 0.8; } });

  Graph.cooldownTicks(reduce ? 0 : 220);
  if (reduce) Graph.warmupTicks(220);
  Graph.onEngineStop(() => { if (loading) loading.remove(); Graph.zoomToFit(reduce ? 0 : 800, 45); });

  const size = () => Graph.width(mount.clientWidth).height(mount.clientHeight);
  size();
  window.addEventListener("resize", size);
  window.__atlasGraph = Graph; // handle for debugging / inspection
}
