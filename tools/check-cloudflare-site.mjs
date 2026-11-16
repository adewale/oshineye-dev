// Exercise Cloudflare's real static-assets handler locally, or attest a live origin.
// The .html rules can only be omitted if these URLs redirect to the exact clean
// readers, which must retain their original CSP, cache policy and exported bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRaynerExport, verifyPoppyExport } from './verify-rayner-export.mjs';

const site = new URL('../site/', import.meta.url);
const read = path => readFile(new URL(path, site));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const redirect = status => [301, 302, 303, 307, 308].includes(status);

export async function checkCloudflareSite(origin) {
  await verifyRaynerExport(fileURLToPath(site));
  await verifyPoppyExport(fileURLToPath(site));
  const get = (path, follow = true) => fetch(new URL(path, origin), {
    redirect: follow ? 'follow' : 'manual', signal: AbortSignal.timeout(30000),
  });
  const headers = (await read('_headers')).toString();
  let readers = 0;
  for (const [, path, body] of headers.matchAll(/^(\/projects\/(?:rayner|poppy)\/[a-z0-9-]+)\n((?: +[^\n]*\n)+)/gm)) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    for (const line of body.trim().split('\n')) {
      const [, name, value] = line.match(/^\s*([^:]+): (.*)$/);
      assert.equal(response.headers.get(name), value, `${path}: ${name}`);
    }
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(await read(path.slice(1) + '.html')), `${path}: reader bytes`);
    for (const alias of [path + '.html', path + '/', path + '.html?step=question&example=1']) {
      const response = await get(alias, false);
      assert.ok(redirect(response.status), `${alias}: expected canonical redirect, got ${response.status}`);
      const location = new URL(response.headers.get('location'), origin);
      assert.equal(location.pathname, path, alias);
      assert.equal(location.search, new URL(alias, origin).search, `${alias}: query preserved`);
      await response.arrayBuffer();
    }
    readers++;
  }
  assert.equal(readers, 52, 'all current readers must be checked');
  for (const name of ['rayner', 'poppy']) {
    const path = `/projects/${name}`;
    const response = await get(path + '/', false);
    assert.ok(redirect(response.status), `${path}/ must redirect, got ${response.status}`);
    assert.equal(new URL(response.headers.get('location'), origin).pathname, path);
    await response.arrayBuffer();
    const page = await get(path);
    assert.equal(page.status, 200, path);
    assert.equal(digest(Buffer.from(await page.arrayBuffer())), digest(await read(`projects/${name}.html`)), `${path}: branded page bytes`);
  }
  const llms = await get('/llms.txt');
  assert.equal(llms.status, 200);
  const text = await llms.text();
  assert.equal(text, (await read('llms.txt')).toString());
  assert.equal(text.split('\n').filter(line => line === '## Poppy, explained').length, 1);
  // Check every manifest-pinned public file with bounded concurrency. _headers
  // is private and is checked above through actual responses, not an HTTP fetch.
  const files = [];
  for (const name of ['rayner', 'poppy']) {
    const manifest = JSON.parse((await read(`projects/${name}/deployment.json`)).toString());
    files.push(...manifest.files);
  }
  const queue = [...files];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const { path, sha256 } = queue.shift();
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), sha256, `${path}: exported digest`);
    }
  }));
  console.log(`Verified ${readers} readers' bytes/CSP/cache headers and canonical redirects, both branded slash redirects, one Poppy llms section, and ${files.length} exported public files at ${origin}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const originIndex = process.argv.indexOf('--origin');
  if (originIndex >= 0) {
    assert.ok(process.argv[originIndex + 1], '--origin needs a URL');
    await checkCloudflareSite(process.argv[originIndex + 1]);
  } else {
    const { unstable_startWorker, unstable_readConfig } = await import('wrangler');
    const configPath = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
    const config = unstable_readConfig({ config: configPath });
    assert.equal(config.assets.html_handling, 'auto-trailing-slash');
    assert.equal(resolve(config.assets.directory), fileURLToPath(new URL('../.cloudflare-assets', import.meta.url)));
    const worker = await unstable_startWorker({
      config: configPath, sendMetrics: false,
      dev: { remote: false, watch: false, inspector: false, logLevel: 'error', server: { port: 0 } },
    });
    try {
      await worker.ready;
      await checkCloudflareSite(await worker.url);
    } finally { await worker.dispose(); }
  }
}
