import { test, expect } from '@playwright/test';

test('sign-in page renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/auth/sign-in');
  await expect(page.locator('body')).toBeVisible();
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});
