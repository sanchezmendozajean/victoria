import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { launchApp, type Launched } from './launch';

function crc32(data: Buffer): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([head, Buffer.from(type), body, tail]);
}

/** A solid red RGBA PNG of `size` × `size` pixels. */
function redPng(size: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) row.set([255, 0, 0, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('placing images (Phase 11)', () => {
  let ctx: Launched;
  let file: string;
  test.beforeAll(async () => {
    file = path.join(mkdtempSync(path.join(tmpdir(), 'victoria-img-')), 'rojo.png');
    writeFileSync(file, redPng(200));
    ctx = await launchApp();
  });
  test.afterAll(async () => {
    await ctx.app.close();
  });

  test('Archivo › Colocar puts the picture on the artboard, paints it, selects it and is undoable', async () => {
    const { app, page } = ctx;
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, file);

    const redPixels = () =>
      page.getByTestId('canvas-content').evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 40 && (data[i + 2] ?? 255) < 40) n++;
        return n;
      });

    expect(await redPixels()).toBe(0);
    await page.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } }); // focus the canvas
    await page.keyboard.press('Control+Shift+p');
    await expect.poll(redPixels).toBeGreaterThan(500);
    await expect(page.getByTestId('doc-dirty')).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await expect.poll(redPixels).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(redPixels).toBeGreaterThan(500);
  });
});
