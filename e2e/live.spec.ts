import { expect, test } from '@playwright/test';

/**
 * Runs only with LIVE=1. Requests go through the preview proxy to the real Worker, so these
 * tests accept either real results or the site's own error panel: an upstream being down must
 * not fail the build, but a blank page, a script error or a leaked key must.
 */
test.skip(!process.env.LIVE, 'set LIVE=1 to run against the real Worker');
test.describe.configure({ mode: 'serial' });

const SECRET_IN_URL = /[?&](?:api[-_]?key|key|token)=(?!REDACTED)[^&\s"'<]+/i;

test('home shows today’s painting or says why it cannot', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.feature img, .feature--failed')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Harvard search returns works or an explained failure', async ({ page }) => {
  await page.goto('./harvard.html?q=hokusai');
  await expect(page.locator('button.card, .error-panel').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.content()).not.toMatch(SECRET_IN_URL);
});

test('unified search answers from every source without leaking a key', async ({ page }) => {
  await page.goto('./?q=landscape');
  await expect(page.locator('.rail__item.is-loading')).toHaveCount(0, { timeout: 45_000 });
  await expect(page.locator('button.card, button.row, .empty').first()).toBeVisible();
  const failures = page.locator('.disclosure--alert > summary');
  if (await failures.count()) await failures.click();
  expect(await page.content()).not.toMatch(SECRET_IN_URL);
});

test('the Worker reports itself healthy', async ({ request }) => {
  const response = await request.get('./diag');
  expect(response.ok()).toBe(true);
  expect(((await response.json()) as { ok?: boolean }).ok).toBe(true);
});
