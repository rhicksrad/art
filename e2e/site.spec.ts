import { expect, test, type Page } from '@playwright/test';
import { LEAKED_KEY, mockWorker } from './worker';

test.skip(!!process.env.LIVE, 'mocked suite is skipped in live runs');

const pageErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

const overflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async ({ context }) => {
  await mockWorker(context);
});

test('home hangs the featured painting with its label and lists every source', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('open collections');

  const feature = page.locator('.feature');
  await expect(feature.locator('img')).toBeVisible();
  await expect(feature.locator('.label__maker')).not.toBeEmpty();
  await expect(feature.locator('.label__title')).not.toBeEmpty();
  await expect(feature.locator('.palette__swatch').first()).toBeVisible();

  await expect(page.locator('.directory__table tbody tr:not(.directory__group)')).toHaveCount(10);
  await expect(page.locator('.directory__size').first()).toContainText('4,647');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the featured palette sets the accent colour', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.feature img')).toBeVisible();
  const accent = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--accent-light'),
  );
  expect(accent).toMatch(/^hsl\(/);
});

test('unified search merges sources, reports the failed one and never shows a key', async ({
  page,
}) => {
  const errors = pageErrors(page);
  await page.goto('./?q=monet');

  await expect(page.locator('button.card, button.row').first()).toBeVisible();
  const rail = page.locator('.rail__item');
  await expect(rail.filter({ hasText: 'Harvard' })).toContainText('of 4,647');
  await expect(rail.filter({ hasText: 'UBC' })).toHaveClass(/is-error/);

  const failures = page.locator('.disclosure--alert');
  await expect(failures).toContainText('UBC');
  await failures.locator('> summary').click();
  await expect(failures.locator('.error-panel')).toContainText('500');
  await expect(failures.locator('.error-panel')).toContainText('key=REDACTED');

  expect(await page.content()).not.toContain(LEAKED_KEY);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('works hang on the wall and records without an image are listed beneath', async ({ page }) => {
  await page.goto('./?q=monet');
  await expect(page.locator('.masonry button.card').first()).toBeVisible();
  // Nothing without an image is hung among the works.
  await expect(page.locator('.masonry .card--text')).toHaveCount(0);
  await expect(page.locator('.unhung__head')).toContainText('without an image');
  await expect(page.locator('.unhung button.row').first()).toBeVisible();
});

test('a lookup that resolves to one record sets it on the page in full', async ({ page }) => {
  await page.goto('./stanford.html');
  const record = page.locator('article.record');
  await expect(record.locator('.detail__title')).not.toBeEmpty();
  await expect(record.locator('.facts')).toBeVisible();
  await expect(page.locator('dialog.detail[open]')).toHaveCount(0);
});

test('a facet filters the results in place', async ({ page }) => {
  await page.goto('./harvard.html?q=study');
  const cards = page.locator('button.card');
  await expect(cards).toHaveCount(24);
  // A phone shows results first and keeps the charts behind a button.
  const charts = page.locator('.filters__toggle');
  if (await charts.isVisible()) {
    await expect(page.locator('.insights')).toBeHidden();
    await charts.click();
  }
  await page.locator('.barlist__row', { hasText: 'Prints' }).first().click();
  await expect(cards).toHaveCount(12);
});

test('detail view opens, shows the record and steps to the next work', async ({ page }) => {
  await page.goto('./harvard.html?q=study');
  await page.locator('button.card').first().click();

  const dialog = page.locator('dialog.detail');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.detail__title')).toHaveText('Study number 1');
  await expect(dialog.locator('.facts')).toContainText('Oil on canvas');

  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.detail__title')).toHaveText('Study number 2');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('timeline view lays works out by date', async ({ page }) => {
  await page.goto('./harvard.html?q=study');
  await expect(page.locator('button.card').first()).toBeVisible();
  await page.locator('.segmented__option', { hasText: 'Timeline' }).click();
  await expect(page.locator('.timeline__item').first()).toBeVisible();
});

test('a failing source shows the diagnostic instead of an empty page', async ({ page }) => {
  await page.goto('./htrc.html?q=mdp.39015025315527');
  const panel = page.locator('.error-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('404');
});

test('status page probes every route', async ({ page }) => {
  await page.goto('./debug.html');
  await expect(page.locator('.status-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.pill--pending')).toHaveCount(0, { timeout: 15_000 });
  expect(await page.locator('.pill--ok').count()).toBeGreaterThan(3);
  expect(await page.locator('.pill--bad').count()).toBeGreaterThan(0);
  expect(await page.content()).not.toContain(LEAKED_KEY);
});

test('theme toggle switches and persists', async ({ page }) => {
  await page.goto('./');
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('.site-header__tools button').last().click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
});
