/**
 * atlas-graph.js — the interactive 3D force-directed atlas.
 *
 * Bundled by `bun build` (like oshineye-config.ts) so 3d-force-graph, three, and
 * three-spritetext share a single three instance. Reads the graph payload from
 * window.__ATLAS__ (injected by tools/build-atlas.mjs) and renders an orbitable
 * Three.js scene on an ivory ground, keeping the site's palette and signals.
 *
 * 3D-native channels: themes cluster in the XY plane (Cloudflare hub at the
 * centre) while DEPTH (z) encodes chronology — older work at the back, newer up
 * front. Lineage carries parent -> child particles; featured stars get a soft
 * halo. Language -> colour, descendants -> size.
 */

import ForceGraph3D from "3d-force-graph";
import SpriteText from "three-spritetext";
import * as THREE from "three";

const D = window.__ATLAS__;
const mount = document.getElementById("atlas-graph");

if (D && mount && ForceGraph3D) {
  const loading = mount.querySelector(".atlas-loading");
  const PAPER = D.colors.paper, INK = D.colors.ink, BRAND = D.colors.brand;
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--garden-accent").trim() || BRAND;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Category anchors in the XY plane (Cloudflare hub at centre); z is time.
  const ring = D.cats.filter((c) => c !== D.center);
  const R = 210, Z_SPAN = 660;
  const anchor = { [D.center]: { x: 0, y: 0 } };
  ring.forEach((c, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    anchor[c] = { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });
  const zTarget = (n) => ((n.t ?? 0.5) - 0.5) * Z_SPAN; // older = back, newer = front

  let showLineage = true, cfSpot = false, hoverId = null, adj = new Set();
  const radius = (n) => Math.cbrt(n.val) * 5;

  const hx = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => {
    const pa = hx(a), pb = hx(b);
    return "#" + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0")).join("");
  };
  const rgba = (h, al) => { const [r, g, b] = hx(h); return `rgba(${r},${g},${b},${al})`; };
  const dimmed = (n) => (hoverId && !adj.has(n.id)) || (cfSpot && !n.cloudflare);
  const nodeColor = (n) => (dimmed(n) ? mix(n.color, PAPER, 0.84) : n.color);
  const linkLit = (l) => {
    if (!hoverId) return false;
    const s = l.source.id || l.source, t = l.target.id || l.target;
    return s === hoverId || t === hoverId;
  };
  const linkPaint = (l) => (linkLit(l) ? accent() : BRAND);
  const linkWide = (l) => (linkLit(l) ? 1.6 : 0.6);

  // A soft radial halo sprite — a paper-friendly "bloom" that works on the ivory
  // ground (a real bloom pass would just wash out a light background).
  function halo(hue, r) {
    const S = 128, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(hue, 0.55));
    g.addColorStop(0.45, rgba(hue, 0.18));
    g.addColorStop(1, rgba(hue, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sp.scale.set(r * 7, r * 7, 1);
    sp.__halo = true;
    return sp;
  }

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
    .nodeLabel((n) => `<span class="atlas-tip">${n.id}<em>${n.year || ""}</em></span>`)
    .nodeThreeObjectExtend(true)
    .nodeThreeObject((n) => {
      // name only the major stars (featured or hubs); the rest reveal on hover
      const major = n.featured || n.val >= 4;
      if (!major) return null;
      const group = new THREE.Group();
      if (n.featured) group.add(halo(n.color, radius(n)));
      const label = new SpriteText(n.id);
      label.color = n.featured ? BRAND : INK;
      label.textHeight = n.featured ? 7 : 5.5;
      label.fontWeight = n.featured ? "700" : "400";
      label.fontFace = "Chaparral Pro, Georgia, serif";
      label.material.depthWrite = false;
      label.position.set(0, -(radius(n) + 6), 0);
      group.add(label);
      group.__node = n;
      return group;
    })
    .linkColor(linkPaint)
    .linkWidth(linkWide)
    .linkOpacity(0.75)
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalArrowColor(linkPaint)
    .linkDirectionalParticles(reduce ? 0 : 2)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleWidth(1.3)
    .linkDirectionalParticleColor(linkPaint)
    .linkVisibility(() => showLineage)
    .onNodeClick((n) => window.open("https://github.com/adewale/" + n.id, "_blank", "noopener"))
    .onNodeHover((n) => { setHover(n); refreshStyles(); mount.style.cursor = n ? "pointer" : "grab"; });

  Graph.d3Force("charge").strength(-130);
  Graph.d3Force("link").distance(34);
  const layout = (alpha) => {
    const kxy = 0.13 * alpha, kz = 0.17 * alpha;
    for (const n of Graph.graphData().nodes) {
      const a = anchor[n.cat] || { x: 0, y: 0 };
      n.vx += (a.x - n.x) * kxy;
      n.vy += (a.y - n.y) * kxy;
      n.vz += (zTarget(n) - n.z) * kz;
    }
  };
  layout.initialize = () => {};
  Graph.d3Force("cluster", layout);

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
    Graph.nodeColor(nodeColor).linkColor(linkPaint).linkWidth(linkWide).linkDirectionalArrowColor(linkPaint).linkDirectionalParticleColor(linkPaint);
    Graph.graphData().nodes.forEach((n) => {
      const o = n.__threeObj;
      if (!o) return;
      o.traverse((c) => {
        if (c.isSprite && c.material) c.material.opacity = c.__halo ? (dimmed(n) ? 0.04 : 1) : (dimmed(n) ? 0.12 : 1);
      });
    });
  }

  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener("change", (ev) => fn(ev.target)); };
  on("opt-lineage", (t) => { showLineage = t.checked; Graph.linkVisibility(() => showLineage); });
  on("opt-cf", (t) => { cfSpot = t.checked; refreshStyles(); });
  on("opt-spin", (t) => { const c = Graph.controls(); if (c) { c.autoRotate = t.checked; c.autoRotateSpeed = 0.8; } });

  Graph.cooldownTicks(reduce ? 0 : 240);
  if (reduce) Graph.warmupTicks(240);
  Graph.onEngineStop(() => {
    if (loading) loading.remove();
    Graph.zoomToFit(0, 60);
    // tilt to an oblique view so the time depth (z) reads, not just the themed plane
    const p = Graph.cameraPosition();
    const dist = Math.hypot(p.x, p.y, p.z) || 800;
    Graph.cameraPosition({ x: dist * 0.55, y: dist * 0.28, z: dist * 0.78 }, { x: 0, y: 0, z: 0 }, reduce ? 0 : 1400);
  });

  const size = () => Graph.width(mount.clientWidth).height(mount.clientHeight);
  size();
  window.addEventListener("resize", size);
  window.__atlasGraph = Graph; // handle for debugging / inspection
}
