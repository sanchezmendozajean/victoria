import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

let ctx: Launched;
test.beforeAll(async () => {
  ctx = await launchApp();
});
test.afterAll(async () => {
  await ctx.app.close();
});

const height = async (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => Math.round(el.getBoundingClientRect().height));
const width = async (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => Math.round(el.getBoundingClientRect().width));

test('smoke: the window opens with the full layout of mockup screen 3', async () => {
  const { page } = ctx;
  for (const id of ['titlebar', 'control-bar', 'toolbar', 'doc-tabs', 'spaces-bar', 'canvas', 'panel-dock', 'status-bar']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/shell-dark.png' });
});

test('loads without console errors or CSP violations', async () => {
  const { page } = ctx;
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(msg.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.reload();
  await page.waitForSelector('[data-testid="status-bar"]');
  // Fonts are bundled: nothing may be fetched from the network.
  expect(await page.evaluate(() => document.fonts.check('12px "Inter Variable"'))).toBe(true);
  expect(problems).toEqual([]);
});

test('regions have the measures of specs/10', async () => {
  const { page } = ctx;
  expect(await height(page, 'titlebar')).toBe(32);
  expect(await height(page, 'control-bar')).toBe(36);
  expect(await height(page, 'doc-tabs')).toBe(30);
  expect(await height(page, 'spaces-bar')).toBe(28);
  expect(await height(page, 'status-bar')).toBe(24);
  expect(await width(page, 'toolbar')).toBe(48);
  expect(await width(page, 'panel-strip')).toBe(36);
  expect(await width(page, 'panel-column')).toBe(280);
});

test('the renderer is sandboxed and only sees the typed API', async () => {
  const { page } = ctx;
  const exposed = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    api: Object.keys(window.victoria).sort(),
  }));
  expect(exposed.require).toBe('undefined');
  expect(exposed.process).toBe('undefined');
  expect(exposed.api).toEqual([
    'autosaveDiscard',
    'autosaveList',
    'autosaveRead',
    'autosaveWrite',
    'closeWindow',
    'getPlatformInfo',
    'minimizeWindow',
    'onBeforeClose',
    'onWindowStateChange',
    'openFile',
    'saveFile',
    'setOverlayColors',
    'toggleMaximizeWindow',
  ]);
});

test('the Pen is the active tool and the status bar says so', async () => {
  const { page } = ctx;
  await expect(page.locator('[data-tool="tool-pen"]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('status-tool')).toContainText('Pluma');
});

test('tools change by click and by shortcut', async () => {
  const { page } = ctx;
  await page.locator('.vc-toolbar__tool[data-tool="tool-lasso"]').click();
  await expect(page.getByTestId('status-tool')).toContainText('Lazo');
  await page.keyboard.press('v');
  await expect(page.getByTestId('status-tool')).toContainText('Selección');
  await page.keyboard.press('Shift+M');
  await expect(page.getByTestId('status-tool')).toContainText('Creador de formas');
  await page.keyboard.press('l');
  await expect(page.getByTestId('status-tool')).toContainText('Elipse');
  await page.keyboard.press('p');
  await expect(page.getByTestId('status-tool')).toContainText('Pluma');
});

test('holding a grouped tool opens its flyout and picking one swaps the slot', async () => {
  const { page } = ctx;
  const pen = page.locator('.vc-toolbar__tool[data-tool="tool-pen"]');
  const box = await pen.boundingBox();
  if (!box) throw new Error('pen button not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  const flyout = page.getByTestId('tool-flyout');
  await expect(flyout).toBeVisible();
  await expect(flyout.locator('.vc-flyout__item')).toHaveCount(4);
  // The flyout must be the topmost element at its own centre (not hidden behind the document tabs).
  const covered = await flyout.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.vc-flyout') === null;
  });
  expect(covered).toBe(false);
  await flyout.locator('[data-tool="tool-anchor-add"]').click();
  await expect(flyout).toHaveCount(0);
  await expect(page.getByTestId('status-tool')).toContainText('Añadir ancla');
  // The slot now shows the last-used tool of the group.
  await expect(page.locator('.vc-toolbar__tool[data-tool="tool-anchor-add"]')).toHaveCount(1);
  await page.keyboard.press('p');
  await expect(page.getByTestId('status-tool')).toContainText('Pluma');
});

test('Alt+click rotates through the tools of a group', async () => {
  const { page } = ctx;
  await page.locator('.vc-toolbar__tool[data-tool="tool-pen"]').click({ modifiers: ['Alt'] });
  await expect(page.getByTestId('status-tool')).toContainText('Añadir ancla');
  await page.keyboard.press('p');
});

test('the toolbar toggles between one and two columns', async () => {
  const { page } = ctx;
  await page.locator('.vc-toolbar__collapse').click();
  expect(await width(page, 'toolbar')).toBe(72);
  const xs = await page.locator('.vc-toolbar__section').first().locator('.vc-toolbar__tool').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(2); // buttons flow into two columns
  await page.locator('.vc-toolbar__collapse').click();
  expect(await width(page, 'toolbar')).toBe(48);
});

test('menus open, switch on hover, show icons and shortcuts, and close with Escape', async () => {
  const { page } = ctx;
  await page.getByTestId('menu-file').click();
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Guardar como/ })).toContainText('Mayús+Ctrl+S');
  // Every row carries an icon.
  const rows = await menu.getByRole('menuitem').count();
  expect(await menu.locator('.vc-menu__icon svg').count()).toBe(rows);
  await page.getByTestId('menu-edit').hover();
  await expect(page.getByRole('menuitem', { name: /Deshacer/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('clicking the menu label again closes the menu instead of reopening it', async () => {
  const { page } = ctx;
  await page.getByTestId('menu-file').click();
  await expect(page.getByRole('menu')).toHaveCount(1);
  await page.getByTestId('menu-file').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('workspace-selector').click();
  await page.getByTestId('workspace-selector').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('submenus open to the side', async () => {
  const { page } = ctx;
  await page.getByTestId('menu-modifier').click();
  await page.getByRole('menuitem', { name: 'Distorsionar y transformar' }).hover();
  await expect(page.getByRole('menuitem', { name: /Zigzag/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the theme switches to light and back through Ventana > Tema', async () => {
  const { page } = ctx;
  const html = page.locator('html');
  await page.getByTestId('menu-window').click();
  await page.getByRole('menuitem', { name: 'Tema' }).hover();
  await page.getByRole('menuitem', { name: 'Claro' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const panel = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg-panel').trim());
  expect(panel.toLowerCase()).toBe('#f3f4f5');
  await page.screenshot({ path: 'test-results/shell-light.png' });
  await page.getByTestId('menu-window').click();
  await page.getByRole('menuitem', { name: 'Tema' }).hover();
  await page.getByRole('menuitem', { name: 'Oscuro' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('panel groups: tabs select, groups collapse and expand', async () => {
  const { page } = ctx;
  const group = page.locator('[data-group="g2"]');
  await expect(group.getByTestId('panel-body-fill')).toHaveCount(0); // closed by default
  await group.locator('[data-panel="swatches"]').click();
  await expect(group.getByTestId('panel-body-swatches')).toBeVisible();
  await group.getByTestId('group-toggle').click();
  await expect(group.getByTestId('panel-body-swatches')).toHaveCount(0);
  await page.locator('[data-group="g2"] [data-panel="fill"]').dblclick();
  await expect(group.getByTestId('panel-body-fill')).toBeVisible();
  await group.getByTestId('group-toggle').click();
});

test('panels open from their shortcuts and from the Ventana menu', async () => {
  const { page } = ctx;
  await page.keyboard.press('Control+F9');
  await expect(page.locator('[data-group="g2"]').getByTestId('panel-body-gradient')).toBeVisible();
  await page.getByTestId('menu-window').click();
  await page.getByRole('menuitem', { name: /^Apariencia/ }).click();
  await expect(page.locator('[data-group="g3"]').getByTestId('panel-body-appearance')).toBeVisible();
  await page.locator('[data-group="g2"]').getByTestId('group-toggle').click();
});

test('a panel tab can be dragged to another group and back', async () => {
  const { page } = ctx;
  const tab = page.locator('[data-panel="pathfinder"]').first();
  const target = page.locator('[data-group="g4"] .vc-group__tabs');
  await tab.dragTo(target);
  await expect(page.locator('[data-group="g4"] [data-panel="pathfinder"]')).toHaveCount(1);
  await expect(page.locator('[data-group="g5"] [data-panel="pathfinder"]')).toHaveCount(0);
  await page.locator('[data-group="g4"] [data-panel="pathfinder"]').dragTo(page.locator('[data-group="g5"] .vc-group__tabs'));
  await expect(page.locator('[data-group="g5"] [data-panel="pathfinder"]')).toHaveCount(1);
});

test('collapsed panels open as a floating window from the strip', async () => {
  const { page } = ctx;
  await page.locator('.vc-dock__stripbutton[data-panel="trace"]').click();
  const floating = page.getByTestId('panel-float');
  await expect(floating).toBeVisible();
  await expect(floating).toContainText('Calco de imagen');
  await page.getByTestId('canvas').click({ position: { x: 300, y: 300 } });
  await expect(floating).toHaveCount(0);
});

test('tooltips show name and shortcut after 500 ms', async () => {
  const { page } = ctx;
  await page.locator('.vc-toolbar__tool[data-tool="tool-pen"]').hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toContainText('Pluma');
  await expect(page.getByRole('tooltip')).toContainText('P');
  const box = await page.getByRole('tooltip').boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0); // never clipped by the window edge
});

test('the dark theme is restored for the final reference screenshot', async () => {
  const { page } = ctx;
  await page.mouse.move(700, 500);
  await page.screenshot({ path: 'test-results/shell-dark-final.png' });
});
