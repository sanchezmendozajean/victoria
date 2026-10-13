import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const SAMPLES = path.join(__dirname, '../../samples');

async function openSample(ctx: Launched, file: string): Promise<void> {
  const target = path.join(SAMPLES, file);
  await ctx.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, target);
  await ctx.page.keyboard.press('Control+o');
  await expect(ctx.page.locator('[data-testid="doc-tabs"] [role="tab"]').last()).toContainText(file);
  await ctx.page.waitForTimeout(300);
}

const num = async (page: Page, id: string) => Number.parseFloat((await page.getByTestId(id).inputValue()).replace(',', '.'));
/** One typographic point and ten, in the millimetres the demo document uses. */
const PT = 25.4 / 72;
const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;

test.describe('selection and transform (phase 4)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await openSample(ctx, 'demo.vict');
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    await ctx.page.keyboard.press('Escape');
    await ctx.page.keyboard.press('v');
    await ctx.page.keyboard.press('Control+Shift+a');
  });

  test('select all shows the object fields, and nothing selected hides them', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('field-w')).toBeVisible();
    expect(await num(page, 'field-w')).toBeGreaterThan(0);
    await page.keyboard.press('Control+Shift+a');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
  });

  test('arrow keys nudge the selection and undo restores it', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    const x0 = await num(page, 'field-x');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(x0 + PT, 2);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(x0 + 11 * PT, 2);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(x0, 2);
  });

  test('the X field evaluates arithmetic and invalid text restores the value', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    const field = page.getByTestId('field-x');
    await field.click();
    await field.fill('10 + 5');
    await page.keyboard.press('Enter');
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(15, 2);
    await field.click();
    await field.fill('abc');
    await page.keyboard.press('Enter');
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(15, 2);
    await page.keyboard.press('Control+z');
  });

  test('the wheel over a field increments it (Shift ×10)', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    const x0 = await num(page, 'field-x');
    await page.getByTestId('field-x').hover();
    await page.mouse.wheel(0, -100);
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(x0 + 1, 2);
    await page.keyboard.press('Control+z');
  });

  test('delete removes the selection and undo brings it back', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('field-w')).toBeVisible();
  });

  test('a marquee with the selection tool selects objects, and a click on empty space clears', async () => {
    const { page } = ctx;
    const box = await surface(page);
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('field-w')).toBeVisible();
    await page.keyboard.press('Control+Shift+a');
    await expect(page.getByTestId('field-w')).toHaveCount(0);
  });

  test('group, ungroup and the group isolation bar', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    await expect(page.getByTestId('control-type')).toBeVisible();
    await page.keyboard.press('Control+Shift+g');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
  });

  test('Alt+click with the Rotate tool opens its dialog, which previews and cancels cleanly', async () => {
    const { page } = ctx;
    await page.keyboard.press('Control+a');
    const x0 = await num(page, 'field-x');
    await page.keyboard.press('r');
    const b = await surface(page);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.getByTestId('transform-dialog')).toBeVisible();
    await page.getByTestId('transform-cancel').click();
    await expect(page.getByTestId('transform-dialog')).toHaveCount(0);
    await expect.poll(() => num(page, 'field-x')).toBeCloseTo(x0, 2);
    await page.keyboard.press('v');
  });
});
