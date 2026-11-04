import { test, expect } from '@playwright/test';

test.describe('Authenticated User Console and CSP Audit', () => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPass = process.env.TEST_ADMIN_PASSWORD;

  test('signs in as admin and navigates key admin and staff pages without CSP or console errors', async ({
    page,
  }) => {
    test.skip(
      !adminEmail || !adminPass,
      'Skipping authenticated audit: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD not set in environment.',
    );

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${page.url()}] ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(`[${page.url()}] PageError: ${err.message}`);
    });

    // 1. Sign In
    await page.goto('/auth/sign-in');
    await page.fill('input[type="email"], input#email, input[name="email"]', adminEmail!);
    await page.fill('input[type="password"], input#password, input[name="password"]', adminPass!);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL((url) => !url.pathname.includes('/auth/sign-in'), {
      timeout: 15_000,
    });

    const pagesToTest = [
      // 3 Admin Pages
      '/admin/default',
      '/admin/users',
      '/admin/section-management',
      // 3 Staff Pages
      '/staff/default',
      '/staff/files',
      '/staff/request-file',
    ];

    for (const targetPath of pagesToTest) {
      await page.goto(targetPath, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();

      // Check no CSP violation messages
      const cspViolations = consoleErrors.filter((e) =>
        /Content Security Policy|violates the following Content Security Policy/i.test(e),
      );
      expect(cspViolations).toEqual([]);
    }

    expect(consoleErrors).toEqual([]);
  });
});
