import { expect, test } from '@playwright/test';

/**
 * Create Check, UI Test: the first click on "Create and open Studio" right after picking a System (CSI)
 * must submit. The click is a raw mouse click at the button's coordinates (no actionability wait), so a
 * select menu whose backdrop is still mounted during its exit transition would swallow it.
 * Runs in the `msw` project; proves the page against the mocks only.
 */
test('the first click right after picking a system creates the test', async ({ page }) => {
  await page.goto('/checks/create?type=UI_TEST');
  const button = page.getByRole('button', { name: 'Create and open Studio' });
  await expect(button).toBeVisible();
  await page.getByRole('textbox', { name: /^Name/ }).fill('First click test');
  await expect(page.getByText('Loading available systems…')).toHaveCount(0);

  // The button starts below the fold; scroll first so the raw click's coordinates are in the viewport.
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('the Create and open Studio button has no box');

  await page.getByRole('combobox', { name: /System \(CSI\)/ }).click();
  await page.getByRole('option').first().click();
  // One raw click, immediately: no waiting for the menu to leave.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.waitForURL(/\/checks\/ui-tests\/[0-9a-f-]{36}\/studio$/i, { timeout: 5_000 });
});
