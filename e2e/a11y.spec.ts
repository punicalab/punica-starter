import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { heading, reset, signIn } from './support';

const axe = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** What axe finds on the page as it is now. */
const violations = async (page: Page) => {
  await page.addScriptTag({ path: axe });

  return page.evaluate(async () => {
    const { violations } = await (window as unknown as { axe: { run(): Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run();

    return violations.map((one) => `${one.id}: ${one.nodes[0].target.join(' ')}`);
  });
};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('the sign-in page, with its messages', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Email is required')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the list', async ({ page }) => {
      await reset(page);
      await signIn(page);
      await expect(page.locator('punica-table-body punica-table-row')).toHaveCount(8);
      expect(await violations(page)).toEqual([]);
    });

    test('the form of an attendee, with its messages', async ({ page }) => {
      await reset(page);
      await signIn(page);
      await page.getByRole('button', { name: 'New attendee' }).click();
      await expect(heading(page, 'New attendee')).toBeVisible();
      await expect(page.locator('punica-field[label="Country"] punica-option')).toHaveCount(4);
      await page.getByRole('button', { name: 'Create attendee' }).click();
      await expect(page.getByText('Name is required')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
