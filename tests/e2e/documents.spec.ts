import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchApp, type Launched } from './launch';

const pills = (page: Page) => page.getByTestId('space-tab');
const docTabs = (page: Page) => page.locator('[data-testid="doc-tabs"] [role="tab"]');

test.describe('documents, Spaces and history (Phase 2)', () => {
  let ctx: Launched;
  test.beforeAll(async () => {
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('starts with one untitled document: one Space, one artboard', async () => {
    const { page } = ctx;
    await expect(docTabs(page)).toHaveCount(1);
    await expect(docTabs(page).first()).toContainText('Sin título-1.vict');
    await expect(pills(page)).toHaveCount(1);
    await expect(pills(page).first()).toContainText('Espacio 1');
    await expect(page.getByTestId('status-artboard')).toContainText('Mesa 1');
    await expect(page.getByTestId('doc-dirty')).toHaveCount(0);
    await expect(page.getByTestId('status-saved')).toContainText('Sin cambios');
  });

  test('Undo is disabled until there is something to undo', async () => {
    const { page } = ctx;
    await page.getByTestId('menu-edit').click();
    await expect(page.getByRole('menuitem', { name: /^Deshacer/ })).toHaveClass(/vc-menu__item--disabled/);
    await page.keyboard.press('Escape');
  });

  test('a new Space (button or Ctrl+Alt+N) is added, activated, undoable and marks the document dirty', async () => {
    const { page } = ctx;
    await page.getByTestId('space-add').click();
    await expect(pills(page)).toHaveCount(2);
    await expect(pills(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('status-space')).toContainText('Espacio 2');
    await expect(page.getByTestId('doc-dirty')).toHaveCount(1);
    await expect(page.getByTestId('status-saved')).toContainText('Cambios sin guardar');

    await page.keyboard.press('Control+Alt+n');
    await expect(pills(page)).toHaveCount(3);

    await page.getByTestId('menu-edit').click();
    await expect(page.getByRole('menuitem', { name: 'Deshacer Nuevo Espacio' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+z');
    await expect(pills(page)).toHaveCount(2);
    await page.keyboard.press('Control+Shift+z');
    await expect(pills(page)).toHaveCount(3);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(pills(page)).toHaveCount(1);
    await expect(page.getByTestId('doc-dirty')).toHaveCount(0); // back to the opened state
  });

  test('Spaces: select, rename inline, recolor, exclude from export, duplicate, delete', async () => {
    const { page } = ctx;
    await page.getByTestId('space-add').click();
    await pills(page).first().click();
    await expect(page.getByTestId('status-space')).toContainText('Espacio 1');

    await pills(page).nth(1).dblclick();
    await page.getByTestId('space-rename').fill('Íconos');
    await page.keyboard.press('Enter');
    await expect(pills(page).nth(1)).toContainText('Íconos');

    await pills(page).nth(1).click({ button: 'right' });
    const menu = page.getByRole('menu');
    for (const label of ['Renombrar…', 'Color de etiqueta', 'Duplicar Espacio', 'Excluir de exportación', 'Mover selección aquí', 'Propiedades…', 'Eliminar Espacio…']) {
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    }
    await menu.getByRole('menuitem', { name: 'Color de etiqueta' }).hover();
    await page.getByRole('menuitem', { name: 'Violeta' }).click();
    await expect(pills(page).nth(1)).toHaveCSS('--space', '#A77BFF');

    await pills(page).nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Excluir de exportación' }).click();
    await expect(pills(page).nth(1).locator('.vc-spacetab__excluded')).toHaveCount(1);

    await pills(page).nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicar Espacio' }).click();
    await expect(pills(page)).toHaveCount(3);
    await expect(pills(page).nth(2)).toContainText('Íconos copia');

    await pills(page).nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Eliminar Espacio…' }).click(); // empty Space: no confirmation
    await expect(pills(page)).toHaveCount(2);
  });

  test('undo reaches back across Spaces and brings the right Space forward', async () => {
    const { page } = ctx;
    await pills(page).first().click();
    await page.keyboard.press('Control+z'); // undoes the delete (in Space 3)
    await expect(pills(page)).toHaveCount(3);
    await expect(page.getByTestId('status-space')).toContainText('Íconos copia');
  });

  test('document tabs: new, switch, close with the unsaved-changes dialog', async () => {
    const { page } = ctx;
    await page.getByTestId('doc-new').click();
    await expect(docTabs(page)).toHaveCount(2);
    await expect(docTabs(page).nth(1)).toContainText('Sin título-2.vict');
    await expect(pills(page)).toHaveCount(1);
    await docTabs(page).first().click();
    await expect(pills(page)).toHaveCount(3);

    await docTabs(page).first().getByTestId('doc-close').click(); // dirty: asks
    await expect(page.getByTestId('dialog')).toContainText('Sin título-1.vict');
    await page.getByTestId('dialog-cancel').click();
    await expect(docTabs(page)).toHaveCount(2);

    await docTabs(page).first().getByTestId('doc-close').click();
    await page.getByTestId('dialog-discard').click();
    await expect(docTabs(page)).toHaveCount(1);
    await expect(docTabs(page).first()).toContainText('Sin título-2.vict');
  });

  test('every document tab shows its close button, active or not', async () => {
    const { page } = ctx;
    await page.getByTestId('doc-new').click();
    for (const close of await page.getByTestId('doc-close').all()) await expect(close).toBeVisible();
    await expect(page.getByTestId('doc-close')).toHaveCount(2);
    await docTabs(page).nth(1).getByTestId('doc-close').click();
  });

  test('closing the last document shows the start screen, which can make a fresh one', async () => {
    const { page } = ctx;
    await docTabs(page).first().getByTestId('doc-close').click();
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(docTabs(page)).toHaveCount(0);
    await page.getByTestId('start-new-A4').click();
    await expect(docTabs(page)).toHaveCount(1);
    await expect(docTabs(page).first()).toContainText('Sin título-1.vict');
  });
});

test.describe('saving and opening', () => {
  test('Save writes a .vict, clears the dirty mark, and Open brings it back', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'victoria-files-'));
    const target = path.join(dir, 'prueba.vict');
    const { app, page } = await launchApp();
    try {
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, target);

      await page.getByTestId('space-add').click();
      await pills(page).nth(1).dblclick();
      await page.getByTestId('space-rename').fill('Guardado');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('doc-dirty')).toHaveCount(1);

      await page.keyboard.press('Control+s');
      await expect(page.getByTestId('doc-dirty')).toHaveCount(0);
      await expect(docTabs(page).first()).toContainText('prueba.vict');
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(target).subarray(0, 2).toString()).toBe('PK'); // a ZIP
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]); // atomic write left no temp file

      // Ctrl+O on an already-open file just activates it.
      await page.keyboard.press('Control+o');
      await expect(docTabs(page)).toHaveCount(1);

      // Close it (the start screen takes over), then open it again from disk.
      await docTabs(page).first().getByTestId('doc-close').click();
      await expect(page.getByTestId('start-screen')).toBeVisible();
      await page.keyboard.press('Control+o');
      await expect(docTabs(page)).toHaveCount(1);
      await expect(docTabs(page).first()).toContainText('prueba.vict');
      await expect(pills(page)).toHaveCount(2);
      await expect(pills(page).nth(1)).toContainText('Guardado');
    } finally {
      await app.close();
    }
  });

  test('a file that is not a .vict is rejected with an error dialog', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'victoria-bad-'));
    const bad = path.join(dir, 'roto.vict');
    writeFileSync(bad, 'not a zip');
    const { app, page } = await launchApp();
    try {
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, bad);
      await page.keyboard.press('Control+o');
      await expect(page.getByTestId('dialog')).toContainText('No se pudo abrir');
      await page.getByTestId('dialog-ok').click();
      await expect(docTabs(page)).toHaveCount(1);
    } finally {
      await app.close();
    }
  });
});

test.describe('autosave and recovery', () => {
  test('unsaved work survives closing the window and is offered back on the next start', async () => {
    const userData = mkdtempSync(path.join(tmpdir(), 'victoria-recovery-'));
    const first = await launchApp({ VICTORIA_USER_DATA: userData });
    await first.page.getByTestId('space-add').click();
    await first.page.getByTestId('space-add').click();
    await expect(pills(first.page)).toHaveCount(3);
    // Close the window the way a user does: main asks the renderer to flush before closing.
    const win = await first.app.browserWindow(first.page);
    await win.evaluate((w) => w.close());
    await first.app.waitForEvent('close');
    const saved = readdirSync(path.join(userData, 'autosave')).filter((f) => f.endsWith('.vict'));
    expect(saved).toHaveLength(1);

    const second = await launchApp({ VICTORIA_USER_DATA: userData });
    try {
      await expect(second.page.getByTestId('dialog')).toContainText('Documentos sin guardar');
      await expect(second.page.getByTestId('dialog')).toContainText('Sin título-1');
      await second.page.getByTestId('dialog-recover').click();
      await expect(docTabs(second.page)).toHaveCount(1);
      await expect(pills(second.page)).toHaveCount(3);
      await expect(second.page.getByTestId('doc-dirty')).toHaveCount(1); // recovered work is unsaved
    } finally {
      await second.app.close();
    }
  });

  test('discarding recovery removes the files and starts clean; a clean close leaves nothing', async () => {
    const userData = mkdtempSync(path.join(tmpdir(), 'victoria-discard-'));
    const first = await launchApp({ VICTORIA_USER_DATA: userData });
    await first.page.getByTestId('space-add').click();
    await (await first.app.browserWindow(first.page)).evaluate((w) => w.close());
    await first.app.waitForEvent('close');

    const second = await launchApp({ VICTORIA_USER_DATA: userData });
    await second.page.getByTestId('dialog-discard').click();
    await expect(pills(second.page)).toHaveCount(1);
    await expect.poll(() => readdirSync(path.join(userData, 'autosave')).length).toBe(0);
    await (await second.app.browserWindow(second.page)).evaluate((w) => w.close());
    await second.app.waitForEvent('close');
    expect(readdirSync(path.join(userData, 'autosave'))).toEqual([]);
  });
});
