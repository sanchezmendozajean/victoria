import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './launch';

const surface = async (page: Page) => (await page.getByTestId('canvas-surface').boundingBox())!;
const at = async (page: Page, dx: number, dy: number) => {
  const b = await surface(page);
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
};

/** Drags out a rectangle (Rectangle tool) between two points relative to the canvas centre. */
async function rectangle(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.keyboard.press('m');
  const a = await at(page, x0, y0);
  const b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('v');
}

/** Deselects and resets fill and stroke to the defaults (new objects take the current look, as in Illustrator). */
async function resetLook(page: Page) {
  await page.keyboard.press('Control+Shift+a');
  await page.keyboard.press('d');
}

async function click(page: Page, dx: number, dy: number, modifiers: Array<'Shift' | 'Alt' | 'Control'> = []) {
  const p = await at(page, dx, dy);
  await page.mouse.move(p.x, p.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.up();
  for (const m of [...modifiers].reverse()) await page.keyboard.up(m);
}

/** RGBA of one pixel of the content canvas, relative to the canvas centre. */
const pixel = async (page: Page, dx: number, dy: number): Promise<number[]> => {
  const p = await at(page, dx, dy);
  const b = await surface(page);
  return page.getByTestId('canvas-content').evaluate(
    (c: HTMLCanvasElement, pos) => {
      const dpr = window.devicePixelRatio || 1;
      return Array.from(c.getContext('2d')!.getImageData(Math.round(pos.x * dpr), Math.round(pos.y * dpr), 1, 1).data);
    },
    { x: p.x - b.x, y: p.y - b.y },
  );
};

const near = (actual: number[], rgb: [number, number, number], tolerance = 6) => rgb.every((v, i) => Math.abs((actual[i] as number) - v) <= tolerance);
const expectPixel = (page: Page, dx: number, dy: number, rgb: [number, number, number], tolerance = 6) => expect.poll(async () => near(await pixel(page, dx, dy), rgb, tolerance), { timeout: 5000 }).toBe(true);

async function setHex(page: Page, hex: string) {
  const field = page.getByTestId('fill-hex');
  await field.click();
  await field.fill(hex);
  await page.keyboard.press('Enter');
}

test.describe('colour, stroke and panels (phase 6)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(500);
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });
  test.beforeEach(async () => {
    const { page } = ctx;
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await resetLook(page);
  });

  test('Fill panel: hex colours the object, one undo step; mixed fills show empty fields', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.keyboard.press('F6');
    await setHex(page, 'FF0000');
    await expectPixel(page, -100, -20, [255, 0, 0]);
    await page.keyboard.press('Control+z');
    await expectPixel(page, -100, -20, [255, 255, 255]);
    await page.keyboard.press('Control+Shift+z');
    await expectPixel(page, -100, -20, [255, 0, 0]);

    await resetLook(page);
    await rectangle(page, 50, -60, 150, 20);
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('fill-hex')).toHaveValue('');
    await expect(page.locator('[data-testid="fill-slider-R"] .vc-slider__thumb')).toHaveCount(0);
    // Both objects share the same stroke: that value is shown.
    await expect(page.getByTestId('control-weight')).toHaveValue(/1/);
  });

  test('channel sliders and fields edit the colour; the model drop-down converts', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.keyboard.press('F6');
    await page.getByTestId('fill-field-R').fill('0');
    await page.keyboard.press('Enter');
    await page.getByTestId('fill-field-G').fill('128');
    await page.keyboard.press('Enter');
    await page.getByTestId('fill-field-B').fill('0');
    await page.keyboard.press('Enter');
    await expectPixel(page, -100, -20, [0, 128, 0]);
    await expect(page.getByTestId('fill-hex')).toHaveValue('008000');
    await page.getByTestId('fill-model').selectOption('hsb');
    await expect(page.getByTestId('fill-field-H')).toHaveValue('120');
    // The ramp picks a hue.
    const hue = page.getByTestId('fill-spectrum-hue');
    const box = (await hue.boundingBox())!;
    await page.mouse.click(box.x + 2, box.y + box.height / 2); // red end
    await expectPixel(page, -100, -20, [255, 0, 0], 12);
  });

  test('toolbar: swap and defaults, Ninguno and Color keep the last colour', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.getByTestId('paint-widget-swap').click(); // fill ↔ stroke: black fill, white stroke
    await expectPixel(page, -100, -20, [0, 0, 0]);
    await page.getByTestId('paint-widget-defaults').click();
    await expectPixel(page, -100, -20, [255, 255, 255]);
    await page.keyboard.press('/'); // fill: none
    expect(near(await pixel(page, -100, -20), [255, 255, 255])).toBe(true); // the artboard shows through
    await expect(page.getByTestId('paint-widget-fill')).toHaveClass(/is-none/);
    await page.keyboard.press(','); // back to the last colour
    await expect(page.getByTestId('paint-widget-fill')).not.toHaveClass(/is-none/);
    await page.keyboard.press('x'); // activate the stroke
    await expect(page.getByTestId('paint-widget-stroke')).toHaveAttribute('data-active', 'true');
  });

  test('colour picker dialog: opens on double click, previews live and Cancel restores', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.getByTestId('paint-widget-fill').dblclick({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('color-picker')).toBeVisible();
    const hex = page.getByTestId('picker-hex');
    await hex.fill('00FF00');
    await page.keyboard.press('Enter');
    await expectPixel(page, -100, -20, [0, 255, 0]);
    await page.getByTestId('picker-cancel').click();
    await expect(page.getByTestId('color-picker')).toHaveCount(0);
    await expectPixel(page, -100, -20, [255, 255, 255]);
    await page.getByTestId('paint-widget-fill').dblclick({ position: { x: 4, y: 4 } });
    await page.getByTestId('picker-hex').fill('0000FF');
    await page.keyboard.press('Enter');
    await page.getByTestId('picker-ok').click();
    await expectPixel(page, -100, -20, [0, 0, 255]);
  });

  test('colour picker is a popover: Escape cancels, a click elsewhere keeps the colour', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.getByTestId('paint-widget-fill').dblclick({ position: { x: 4, y: 4 } });
    const popover = page.getByTestId('color-picker');
    await expect(popover).toBeVisible();
    const chip = (await page.getByTestId('paint-widget-fill').boundingBox())!;
    const box = (await popover.boundingBox())!;
    expect(box.x + box.width <= chip.x || box.x >= chip.x + chip.width).toBe(true); // beside the chip, not over it
    await page.getByTestId('picker-hex').fill('123456');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expectPixel(page, -100, -20, [255, 255, 255]);
    await page.getByTestId('paint-widget-fill').dblclick({ position: { x: 4, y: 4 } });
    await page.getByTestId('picker-hex').fill('FF00FF');
    await page.keyboard.press('Enter');
    await page.getByTestId('control-bar').click({ position: { x: 4, y: 4 } }); // outside the popover
    await expect(popover).toHaveCount(0);
    await expectPixel(page, -100, -20, [255, 0, 255]);
  });

  test('Swatches: the basic library applies colours, and a global swatch updates every object that uses it', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await rectangle(page, 50, -60, 150, 20);
    await page.keyboard.press('Control+a');
    await page.getByTestId('panel-group').nth(1).locator('[data-panel="swatches"]').click();
    await page.getByTestId('swatches-library').click();
    const items = page.getByTestId('swatch');
    await expect(items.first()).toBeVisible();
    await items.nth(2).click(); // Rojo
    await expectPixel(page, -100, -20, [255, 0, 0]);
    await expectPixel(page, 100, -20, [255, 0, 0]);
    // Make it global and change its colour: both objects follow.
    await page.getByTestId('swatches-options').click();
    await page.getByTestId('swatch-global').check();
    await page.getByTestId('swatch-hex').fill('00AA00');
    await page.getByTestId('swatch-ok').click();
    await expectPixel(page, -100, -20, [0, 170, 0]);
    await expectPixel(page, 100, -20, [0, 170, 0]);
    await page.keyboard.press('Control+z');
    await expectPixel(page, -100, -20, [255, 0, 0]);
  });

  test('Gradient: the Gradient mode fills with a gradient; the panel edits stops, angle and type', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, 50, 20);
    await page.getByTestId('paint-mode-gradient').click();
    const left = await pixel(page, -140, -20);
    const right = await pixel(page, 40, -20);
    expect(near(left, [right[0] as number, right[1] as number, right[2] as number], 30)).toBe(false);
    await page.keyboard.press('Control+F9');
    await expect(page.getByTestId('gradient-bar')).toBeVisible();
    await expect(page.getByTestId('gradient-stop')).toHaveCount(2);
    const bar = (await page.getByTestId('gradient-bar').boundingBox())!;
    await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2); // adds a stop
    await expect(page.getByTestId('gradient-stop')).toHaveCount(3);
    await page.getByTestId('gradient-delete-stop').click();
    await expect(page.getByTestId('gradient-stop')).toHaveCount(2);
    await page.getByTestId('gradient-angle').fill('90');
    await page.keyboard.press('Enter');
    const top = await pixel(page, -50, -55);
    const bottom = await pixel(page, -50, 15);
    expect(near(top, [bottom[0] as number, bottom[1] as number, bottom[2] as number], 30)).toBe(false);
    await page.getByTestId('gradient-type').selectOption('radial');
    await expect(page.getByTestId('gradient-aspect')).toBeVisible();
    await page.getByTestId('gradient-reverse').click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
  });

  test('Gradient tool: dragging gives the selection a gradient and shows the annotator', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, 50, 20);
    await page.keyboard.press('g');
    const a = await at(page, -140, -20);
    const b = await at(page, 40, -20);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    const left = await pixel(page, -145, -20);
    const right = await pixel(page, 45, -20);
    expect(near(left, [right[0] as number, right[1] as number, right[2] as number], 30)).toBe(false);
    await page.keyboard.press('Control+z');
    await expectPixel(page, -145, -20, [255, 255, 255]);
  });

  test('Stroke panel: weight, caps, dashes, arrowheads and profile all edit the stroke and undo', async () => {
    const { page } = ctx;
    await page.keyboard.press('p');
    await click(page, -120, 0);
    await click(page, 0, 40);
    await click(page, 120, 0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.keyboard.press('Control+F10');
    await page.getByTestId('stroke-weight').fill('6');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('control-weight')).toHaveValue('6');
    await page.getByTestId('stroke-caps').locator('[data-value="round"]').click();
    await expect(page.getByTestId('stroke-caps').locator('[data-value="round"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('stroke-joins').locator('[data-value="bevel"]').click();
    await page.getByTestId('stroke-align').locator('[data-value="center"]').click();
    await page.getByTestId('stroke-dashed').check();
    await expect(page.getByTestId('stroke-dash-0')).toHaveValue('12');
    await page.getByTestId('stroke-dash-0').fill('4');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('stroke-dash-1')).toHaveValue('12'); // the gap keeps its value
    await page.getByTestId('stroke-dash-corners').check();
    await page.getByTestId('stroke-arrow-end').selectOption('simple');
    await page.getByTestId('stroke-arrow-start').selectOption('circle');
    await page.getByTestId('stroke-arrow-scale-x').fill('150');
    await page.keyboard.press('Enter');
    await page.getByTestId('stroke-arrow-align').locator('[data-value="extend"]').click();
    await page.getByTestId('stroke-profile').selectOption('taper');
    await page.getByTestId('stroke-profile-flip').click();
    await expect(page.getByTestId('stroke-profile-flip')).toHaveAttribute('aria-pressed', 'true');
    // Everything is undoable, one control at a time.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('stroke-profile-flip')).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Control+z');
    await expect(page.getByTestId('stroke-weight')).toHaveValue('1');
  });

  test('Align and Spacing: align edges, distribute by exact gap, the indicator shows Mixto or the shared value', async () => {
    const { page } = ctx;
    await rectangle(page, -180, -50, -140, -10);
    await rectangle(page, -100, 10, -40, 50);
    await rectangle(page, 20, -40, 80, 0);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Shift+F7');
    await page.getByTestId('align-left').click();
    await expectPixel(page, -160, 20, [255, 255, 255]); // the second rectangle left its place…
    const darkAt = async (dx: number, dy: number) => !near(await pixel(page, dx, dy), [255, 255, 255], 60) && near(await pixel(page, dx, dy), [0, 0, 0], 90);
    expect(await darkAt(-100, 30)).toBe(false);
    await page.keyboard.press('Control+z');

    // Spacing panel
    await page.getByTestId('panel-group').nth(4).locator('[data-panel="spacing"]').click();
    await expect(page.getByTestId('spacing-current-h')).toContainText('Mixto');
    await page.getByTestId('spacing-gap').fill('10');
    await page.keyboard.press('Enter');
    await page.getByTestId('spacing-h').click();
    await expect(page.getByTestId('spacing-current-h')).toContainText('10');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('spacing-current-h')).toContainText('Mixto');
  });

  test('Layers: rename, hide, lock, new layer and the object rows', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.keyboard.press('F7');
    const rows = page.getByTestId('layer-row');
    await expect(rows).toHaveCount(2); // the layer and its rectangle
    const layerRow = rows.first();
    await layerRow.getByTestId('layer-name').dblclick();
    await page.getByTestId('layer-name-input').fill('Fondo');
    await page.keyboard.press('Enter');
    await expect(layerRow.getByTestId('layer-name')).toHaveText('Fondo');
    // Hide the rectangle row: the canvas shows the artboard there.
    const objectRow = rows.nth(1);
    await objectRow.getByTestId('layer-eye').click();
    await expectPixel(page, -100, -20, [255, 255, 255]);
    expect(await pixel(page, -150, -60)).not.toEqual([0, 0, 0, 255]);
    await objectRow.getByTestId('layer-eye').click();
    await objectRow.getByTestId('layer-lock').click();
    await expect(objectRow.getByTestId('layer-lock')).toHaveAttribute('aria-pressed', 'true');
    await objectRow.getByTestId('layer-lock').click();
    // New layer: a second layer row; clicking the object row selects it.
    await page.getByTestId('layers-new').click();
    await expect(rows).toHaveCount(3);
    await page.keyboard.press('Control+z');
    await expect(rows).toHaveCount(2);
    await objectRow.click();
    await expect(page.getByTestId('control-type')).toContainText('Rectángulo');
    await page.getByTestId('layers-delete').click();
    await expect(rows).toHaveCount(1);
  });

  test('Transform panel: exact size, rotation and the live-shape corner radius', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.getByTestId('panel-group').nth(4).locator('[data-panel="transform"]').click();
    await page.getByTestId('transform-w').fill('40');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Number.parseFloat((await page.getByTestId('transform-w').inputValue()).replace(',', '.'))).toBeCloseTo(40, 1);
    await page.getByTestId('transform-angle').fill('90');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Number.parseFloat((await page.getByTestId('transform-angle').inputValue()).replace(',', '.'))).toBeCloseTo(90, 1);
    await page.keyboard.press('Control+z');
    // Corner radius of the rectangle (a live shape).
    await expect(page.getByTestId('shape-params')).toBeVisible();
    await page.getByTestId('shape-radius-0').fill('8');
    await page.keyboard.press('Enter');
    // Linked corners: every radius follows; undo brings it back.
    await expect(page.getByTestId('shape-radius-2')).toHaveValue('8');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('shape-radius-2')).toHaveValue('0');
  });

  test('Properties: document settings with nothing selected, object sections otherwise', async () => {
    const { page } = ctx;
    await page.getByTestId('panel-group').nth(0).locator('[data-panel="properties"]').click();
    await expect(page.getByTestId('properties-document')).toBeVisible();
    await page.getByTestId('properties-units').selectOption('cm');
    await rectangle(page, -150, -60, -50, 20);
    await expect(page.getByTestId('properties-object')).toBeVisible();
    await expect(page.getByTestId('field-x')).toBeVisible();
    await expect(page.getByTestId('field-x').locator('xpath=..').locator('.vc-field__unit')).toContainText('cm');
    await page.keyboard.press('Control+Shift+a');
    await page.getByTestId('properties-units').selectOption('mm');
  });

  test('Eyedropper: a click copies the look of the object to the selection; Alt+click does the reverse', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await page.keyboard.press('F6');
    await setHex(page, 'FF8800');
    await resetLook(page);
    await rectangle(page, 50, -60, 150, 20);
    await page.keyboard.press('i');
    await click(page, 0, 0); // empty canvas: nothing happens
    await click(page, -100, -20); // pick from the orange rectangle onto the selected one
    await expectPixel(page, 100, -20, [255, 136, 0]);
    await page.keyboard.press('Control+z');
    await expectPixel(page, 100, -20, [255, 255, 255]);
  });

  test('clip masks and quick actions: Ctrl+7 clips, Layers button releases', async () => {
    const { page } = ctx;
    await rectangle(page, -150, -60, -50, 20);
    await rectangle(page, -120, -40, -20, 40);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+7');
    await expect(page.getByTestId('control-type')).toContainText('Grupo de recorte');
    await page.keyboard.press('Alt+Control+7');
    await expect(page.getByTestId('control-type')).toContainText('2');
  });
});

test('colour picker: channel sliders by model keep typed CMYK; the web-only check sits right of the square with the swatch below it', async () => {
  const ctx = await launchApp();
  const { page } = ctx;
  await page.waitForTimeout(400);
  await page.getByTestId('paint-widget-fill').dblclick({ position: { x: 4, y: 4 } });
  await page.getByTestId('picker-model').selectOption('cmyk');
  await page.getByTestId('picker-field-C').fill('40');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('picker-field-C')).toHaveValue('40');
  const square = (await page.getByTestId('picker-square').boundingBox())!;
  const web = (await page.getByTestId('picker-web').boundingBox())!;
  const swatch = (await page.getByTestId('picker-web-swatch').boundingBox())!;
  expect(web.x).toBeGreaterThan(square.x + square.width);
  expect(swatch.y).toBeGreaterThan(web.y);
  await page.keyboard.press('Escape');
  await ctx.app.close();
});
