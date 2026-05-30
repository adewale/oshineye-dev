#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT_URL = process.env.GARTEN_TEST_URL || 'http://localhost:8787/';
const OUT_DIR = process.env.GARTEN_TEST_OUT || 'test-artifacts/garten-legibility';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222 + Math.floor(Math.random() * 1000);
const USER_DATA = join(tmpdir(), `oshineye-garten-legibility-${process.pid}`);

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForServer(url, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Server did not respond: ${url}`);
}

async function waitForJson(url, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`Chrome debugging endpoint did not respond: ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    } else if (msg.method && events.has(msg.method)) {
      for (const fn of events.get(msg.method)) fn(msg.params || {});
    }
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        },
        once(method) {
          return new Promise((resolve) => {
            const fn = (params) => {
              const list = events.get(method) || [];
              events.set(method, list.filter((item) => item !== fn));
              resolve(params);
            };
            events.set(method, [...(events.get(method) || []), fn]);
          });
        },
        close() { ws.close(); },
      });
    });
    ws.addEventListener('error', reject);
  });
}

async function screenshot(cdp, path) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path, Buffer.from(result.data, 'base64'));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let server = null;
  try {
    await waitForServer(ROOT_URL, 1_500);
  } catch {
    server = spawn('bunx', ['wrangler', 'dev', '--port', '8787'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForServer(ROOT_URL, 30_000);
  }

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page') || targets[0];
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: ROOT_URL });
    await loaded;
    await sleep(800);

    const opacityOverride = process.env.GARTEN_TEST_OPACITY ? Number(process.env.GARTEN_TEST_OPACITY) : null;
    const injection = `(() => {
      document.body.innerHTML = '<div id="garden"></div><div id="legibility-fixture"></div>';
      const style = document.createElement('style');
      style.textContent = \`
        body { margin: 0; background: var(--paper); }
        #garden { position: fixed; inset: 0; height: 100vh; z-index: 30; pointer-events: none; -webkit-mask-image: none; mask-image: none; }
        #legibility-fixture { position: fixed; left: 8vw; right: 8vw; top: 42vh; z-index: 40; color: var(--ink); font-family: Georgia, serif; font-size: 32px; line-height: 1.34; font-weight: 400; background: var(--paper); border: 2px solid var(--ink); box-shadow: 8px 8px 0 0 var(--brand); padding: 1rem 1.1rem; text-rendering: optimizeLegibility; font-synthesis: none; }
      \`;
      document.head.appendChild(style);
      const gardenEl = document.querySelector('#garden');
      const cfg = OshineyeConfig.getGartenConfig('#garden');
      cfg.autoplay = false;
      cfg.duration = 600;
      if (${JSON.stringify(opacityOverride)} !== null) cfg.opacity = ${JSON.stringify(opacityOverride)};
      cfg.zIndex = 0;
      window.__legibilityGarden = new Garten.Garten(cfg);
      window.__legibilityGarden.seek(cfg.duration);
      const fixture = document.querySelector('#legibility-fixture');
      fixture.textContent = 'Readable text over a fully grown Garten: sharp detail beats inflated significance. The comparison must remain legible even when branches and flowers reach the top of the screen.';
      const canvas = gardenEl.querySelector('canvas');
      if (canvas) {
        gardenEl.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
        gardenEl.style.backgroundSize = '100% 100%';
        gardenEl.style.backgroundRepeat = 'no-repeat';
        gardenEl.style.opacity = String(cfg.opacity);
        canvas.style.display = 'none';
      }
      const ctx = canvas && canvas.getContext('2d');
      let nonTransparent = null, minChannel = null, darkPixels = null;
      if (ctx) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        nonTransparent = 0; minChannel = 255; darkPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] !== 0) nonTransparent++;
          minChannel = Math.min(minChannel, data[i], data[i + 1], data[i + 2]);
          if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 200) darkPixels++;
        }
      }
      return { opacity: cfg.opacity, maxHeight: cfg.maxHeight, zIndex: cfg.zIndex, canvasOpacity: canvas && getComputedStyle(canvas).opacity, canvasStyleOpacity: canvas && canvas.style.opacity, canvasZIndex: canvas && getComputedStyle(canvas).zIndex, canvasWidth: canvas && canvas.width, canvasHeight: canvas && canvas.height, nonTransparent, minChannel, darkPixels, text: fixture.getBoundingClientRect().toJSON() };
    })()`;
    const evalResult = await cdp.send('Runtime.evaluate', { expression: injection, returnByValue: true });
    await sleep(500);

    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#legibility-fixture').style.color = 'transparent'` });
    await screenshot(cdp, `${OUT_DIR}/background.png`);
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#legibility-fixture').style.color = 'var(--ink)'` });
    await screenshot(cdp, `${OUT_DIR}/with-text.png`);

    await writeFile(`${OUT_DIR}/run.json`, JSON.stringify({ rootUrl: ROOT_URL, config: evalResult.result?.value }, null, 2));
    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
    if (server) server.kill('SIGTERM');
  }

  const analyzer = spawn('python3', ['-', `${OUT_DIR}/background.png`, `${OUT_DIR}/with-text.png`, `${OUT_DIR}/metrics.json`], { stdio: ['pipe', 'inherit', 'inherit'] });
  analyzer.stdin.end(String.raw`
import json, sys, math
from PIL import Image

def lum(rgb):
    vals=[]
    for c in rgb:
        c=c/255
        vals.append(c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4)
    return 0.2126*vals[0]+0.7152*vals[1]+0.0722*vals[2]

def contrast(a,b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la,lb), min(la,lb)
    return (hi+0.05)/(lo+0.05)

bg=Image.open(sys.argv[1]).convert('RGB')
tx=Image.open(sys.argv[2]).convert('RGB')
ratios=[]
for p_bg, p_tx in zip(bg.getdata(), tx.getdata()):
    delta=sum(abs(a-b) for a,b in zip(p_bg,p_tx))
    # Strong-delta pixels are text interiors, not antialias fringes.
    # Antialias edge pixels are intentionally excluded; WCAG contrast is
    # defined for the glyph color against its background, not fringe blends.
    if delta >= 400:
        ratios.append(contrast(p_tx, p_bg))
ratios.sort()
if not ratios:
    raise SystemExit('No text pixels detected')
def pct(p):
    return ratios[min(len(ratios)-1, max(0, int(len(ratios)*p)))]
metrics={
    'text_pixel_count': len(ratios),
    'min_contrast': ratios[0],
    'p05_contrast': pct(0.05),
    'p10_contrast': pct(0.10),
    'median_contrast': pct(0.50),
    'threshold': 4.5,
    'mask_delta_threshold': 400,
    'passed': pct(0.05) >= 4.5,
}
open(sys.argv[3], 'w').write(json.dumps(metrics, indent=2))
print(json.dumps(metrics, indent=2))
if not metrics['passed']:
    raise SystemExit(1)
`);
  const code = await new Promise((resolve) => analyzer.on('exit', resolve));
  if (code !== 0) process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
