import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every navigation href is a plain string, so a typo compiles fine and only
 * shows up as a 404 when someone clicks the logo or a menu item. These checks
 * compare the strings against the routes that actually exist on disk.
 */

const APP_DIR = join('src', 'app');

function pageRoutes(dir = APP_DIR, prefix = ''): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'api' || entry.startsWith('(')) continue;
    if (statSync(full).isDirectory()) {
      routes.push(...pageRoutes(full, `${prefix}/${entry}`));
      continue;
    }
    if (entry === 'page.tsx') routes.push(prefix === '' ? '/' : prefix);
  }
  return routes;
}

const ROUTES = new Set(pageRoutes());

function readSource(...relative: string[]) {
  return readFileSync(join(...relative), 'utf8').replace(/\\/g, '/');
}

/** The brand link wrapping the SPID logo at the top of a sidebar. */
function brandHref(source: string) {
  const match = source.match(/<Link\s+href="(\/[^"]+)"/);
  if (!match) throw new Error('No brand <Link href> found');
  return match[1];
}

/** `layout` + `path` pairs from a sidebar route config. */
function menuHrefs(source: string) {
  const layouts = [...source.matchAll(/layout:\s*'([^']+)'/g)].map((m) => m[1]);
  const paths = [...source.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
  return paths.map((path, index) => `${layouts[index]}/${path}`);
}

describe('sidebar navigation routes', () => {
  it('builds the route list from the pages on disk', () => {
    expect(ROUTES.has('/admin/dashboard')).toBe(true);
    expect(ROUTES.has('/staff/default')).toBe(true);
    expect(ROUTES.has('/staff/dashboard')).toBe(false);
  });

  it('points the admin brand at the admin dashboard', () => {
    expect(brandHref(readSource('src', 'components', 'sidebar', 'index.tsx'))).toBe('/admin/dashboard');
  });

  it('points the staff brand at the staff dashboard', () => {
    expect(brandHref(readSource('src', 'components', 'staffSidebar', 'index.tsx'))).toBe('/staff/default');
  });

  it('resolves every admin menu href to a real page', () => {
    const hrefs = menuHrefs(readSource('src', 'routes.tsx'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => !ROUTES.has(href))).toEqual([]);
  });

  it('resolves every staff menu href to a real page', () => {
    const hrefs = menuHrefs(readSource('src', 'staffRoutes.tsx'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => !ROUTES.has(href))).toEqual([]);
  });

  it('sends each role to an existing page after sign-in', () => {
    const signIn = readSource('src', 'app', 'auth', 'sign-in', 'page.tsx');
    const match = signIn.match(/isStaff\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/);
    expect(match).not.toBeNull();
    expect(ROUTES.has(match![1])).toBe(true);
    expect(ROUTES.has(match![2])).toBe(true);
  });
});
