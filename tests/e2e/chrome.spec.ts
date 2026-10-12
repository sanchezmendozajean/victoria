import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

// The three title-bar variants of specs/10 §1, forced through VICTORIA_CHROME so each can be checked on any OS.

test('custom chrome (Linux default) draws three round buttons that drive the window', async () => {
  const { app, page } = await launchApp({ VICTORIA_CHROME: 'custom' });
  try {
    const controls = page.locator('.vc-titlebar__control');
    await expect(controls).toHaveCount(3);
    const box = await controls.first().boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(20);
    expect(Math.round(box?.height ?? 0)).toBe(20);

    const win = await app.browserWindow(page);
    await page.locator('.vc-titlebar__control').nth(1).click();
    await expect.poll(() => win.evaluate((w) => w.isMaximized())).toBe(true);
    await page.locator('.vc-titlebar__control').nth(1).click();
    await expect.poll(() => win.evaluate((w) => w.isMaximized())).toBe(false);
    await page.screenshot({ path: 'test-results/chrome-custom.png' });
  } finally {
    await app.close();
  }
});

test('system chrome keeps only menus and workspace selector in our bar', async () => {
  const { app, page } = await launchApp({ VICTORIA_CHROME: 'system' });
  try {
    await expect(page.locator('.vc-titlebar__control')).toHaveCount(0);
    await expect(page.getByTestId('menu-file')).toBeVisible();
    await expect(page.getByTestId('workspace-selector')).toBeVisible();
    await page.screenshot({ path: 'test-results/chrome-system.png' });
  } finally {
    await app.close();
  }
});

test('native-overlay chrome (Windows) reserves room for the OS buttons instead of drawing them', async () => {
  test.skip(process.platform !== 'win32', 'Native caption buttons exist on Windows only');
  const { app, page } = await launchApp({ VICTORIA_CHROME: 'native-overlay' });
  try {
    await expect(page.locator('.vc-titlebar__control')).toHaveCount(0);
    const bar = await page.getByTestId('titlebar').evaluate((el) => Math.round(el.getBoundingClientRect().width));
    const viewport = await page.evaluate(() => window.innerWidth);
    expect(bar).toBeLessThan(viewport); // env(titlebar-area-width) leaves the right end to Windows
  } finally {
    await app.close();
  }
});
