import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const site = new URL('../site', import.meta.url).pathname;
const rules = readFileSync(`${site}/_redirects`, 'utf8')
  .split('\n')
  .filter(line => line.trim() && !line.startsWith('#'))
  .map(line => line.trim().split(/\s+/));
const servedAt = path => [`${site}${path}`, `${site}${path}.html`].some(existsSync);

test('every redirected Rayner step goes to a page or picture the site still serves', () => {
  expect(rules.length).toBe(42);
  for (const [from, to, status] of rules) {
    expect(status).toBe('301');
    // A file at the old path would be served instead, and the rule would do nothing.
    expect(existsSync(`${site}${from}`)).toBe(false);
    expect(servedAt(to)).toBe(true);
    expect(to.endsWith('.png')).toBe(from.endsWith('.png'));
  }
});
