#!/usr/bin/env node
// The Rayner homepage card, drawn by the engine it advertises: one scene,
// stepped by a reader pressing Next, motion between steps and rest on each.
//   node tools/rayner-card.mts <lantern-checkout>
// Needs Node 26 or later, the checkout's `npm ci`, and FFmpeg. Writes colour.jpg (800 x 600)
// and animation.mp4 (1440 x 1080, a seamless 4.4 s loop) to the card's folder.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const lantern = resolve(process.argv[2] ?? '../lantern');
const { Scene, Circle, Polygon, Rectangle, Dot, Text, Group, Transform, Indicate, StringSink, loadFonts, smooth } =
  await import(pathToFileURL(join(lantern, 'src/index.ts')).href);
const { rasterize } = await import(pathToFileURL(join(lantern, 'tools/lib/explain-video.ts')).href);
const OUT = resolve(import.meta.dirname, '../site/img/repo/generated/vfinal-approved-stills/rayner');
const FPS = 24;
const PAPER = '#f7f5ef', INK = '#1d1b19', SOFT = '#b9b2a6';
const COLOURS = ['#7f0000', '#c4892b', '#2e5b78'];
const look = (i: number) => ({ stroke: INK, strokeWidth: 0.09, fill: COLOURS[i]!, fillOpacity: 1 });
const AT: [number, number] = [0, 0.75];
// Every outline starts at 3 o'clock and runs clockwise through four anchors, as Circle does,
// so each morph moves anchor to anchor instead of twisting.
const shapes = () => [
  new Circle({ radius: 1.75, ...look(0) }).moveTo(AT),
  new Polygon([[1.85, 0], [0, -1.85], [-1.85, 0], [0, 1.85]], look(1)).moveTo(AT),
  new Polygon([[1.95, -1.4], [0, -1.4], [-1.95, -1.4], [0, 1.95]], look(2)).moveTo(AT),
];
const DOT_Y = -2.75, DOT_X = [-2.3, -1.45, -0.6];

class Card extends Scene {
  override async construct() {
    const [first, ...rest] = shapes();
    const pips = DOT_X.map((x) => new Dot({ radius: 0.13, color: SOFT }).moveTo([x, DOT_Y]));
    const cursor = new Dot({ radius: 0.2, color: COLOURS[0] }).moveTo([DOT_X[0]!, DOT_Y]);
    const button = new Rectangle({ width: 2.1, height: 0.9, cornerRadius: 0.45, stroke: INK, strokeWidth: 0.07, fill: PAPER, fillOpacity: 1 })
      .moveTo([1.65, DOT_Y]);
    const label = new Text('Next ›', { fontSize: 0.42, color: INK, weight: 'bold' }).moveTo([1.65, DOT_Y]);
    const next = new Group(button, label);
    this.add(first, ...pips, cursor, next);
    await this.wait(0.5);
    const targets = [...rest, shapes()[0]!];
    for (let i = 0; i < targets.length; i++) {
      // The reader presses Next...
      await this.play(new Indicate(next, { scaleFactor: 0.9, color: COLOURS[i]! }), { runTime: 0.3 });
      // ...and the scene moves to the next step's picture, then rests on it.
      await this.play(
        new Transform(first, targets[i]!),
        new Transform(cursor, new Dot({ radius: 0.2, color: COLOURS[(i + 1) % 3] }).moveTo([DOT_X[(i + 1) % 3]!, DOT_Y])),
        { runTime: 0.65, rateFunc: smooth },
      );
      if (i < targets.length - 1) await this.wait(0.5);
    }
  }
}

await loadFonts();
const sink = new StringSink({ width: 1920, background: PAPER, cull: true });
await new Card(sink, { fps: FPS }).run();
const frames = await mkdtemp(join(tmpdir(), 'rayner-card-'));
let n = 0;
// The first frame is drawn before construct() adds anything.
for (const svg of sink.frames.slice(1)) await writeFile(join(frames, `f${String(n++).padStart(4, '0')}.png`), (await rasterize(svg)).asPng());
// The scene is 16:9; the card frame is 4:3, so keep the middle 1440 x 1080.
const crop = 'crop=1440:1080:240:0';
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.png'), '-vf', `${crop},format=yuv420p`,
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', '-an', join(OUT, 'animation.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(frames, 'f0000.png'), '-vf', `${crop},scale=800:600:flags=lanczos`, '-q:v', '3', join(OUT, 'colour.jpg')]);
await rm(frames, { recursive: true });
console.log(`${n} frames at ${FPS} fps to ${OUT}`);
