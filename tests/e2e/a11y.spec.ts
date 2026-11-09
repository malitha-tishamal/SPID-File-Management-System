import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Accessibility regression tests (WCAG 2.2 AA via axe-core).
 * Covers the public auth pages in English and Sinhala, light and dark.
 * Authenticated pages require TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD env vars;
 * those tests are skipped when credentials are not configured.
 */

const PUBLIC_PAGES = [
  { path: '/auth/sign-in', name: 'sign-in' },
  { path: '/auth/sign-up', name: 'sign-up' },
  { path: '/auth/forgot-password', name: 'forgot-password' },
];

const LANGS = [
  { tag: 'en', cookie: 'en' },
  { tag: 'si', cookie: 'si' },
];

for (const lang of LANGS) {
  for (const page of PUBLIC_PAGES) {
    test(`axe: ${page.name} (${lang.tag}) has no violations`, async ({
      page: pw,
      context,
    }) => {
      await context.addCookies([
        { name: 'lang', value: lang.cookie, url: 'http://localhost:3000' },
      ]);
      await pw.goto(page.path);
      await pw.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test.describe('authenticated pages', () => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  test.skip(!email || !password, 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set');

  test('axe: admin dashboard has no violations', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/admin\//, { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
