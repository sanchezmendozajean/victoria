import type * as PdfJsModule from 'pdfjs-dist';
import type { IdGenerator, PdfPageImport, PdfTextItem } from '../../core';
import { importPdfPage } from '../../core';

/** The pdf.js module (the browser build in the app, the Node build in tests). */
export type PdfJs = typeof PdfJsModule;

let loaded: Promise<PdfJs> | null = null;

/** Loads pdf.js on first use (it is large) and points it at its worker file. */
export function loadPdfJs(): Promise<PdfJs> {
  loaded ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/build/pdf.mjs'), import('pdfjs-dist/build/pdf.worker.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as PdfJs;
  })();
  return loaded;
}

/** Most pages one import brings in: a page becomes a Space, and a 500-page manual is not a drawing. */
export const MAX_PDF_PAGES = 50;

const OBJECT_TIMEOUT_MS = 5000;

interface PdfObjects {
  get(id: string, callback: (data: unknown) => void): unknown;
}

/** pdf.js hands out objects through callbacks that fire once they are decoded; a stuck one must not hang the import. */
function objectOf(store: PdfObjects, id: string): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), OBJECT_TIMEOUT_MS);
    try {
      store.get(id, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** A decoded picture of pdf.js (pixels or a bitmap) as a PNG file, or null where there is no canvas to draw it on. */
async function toPng(image: unknown): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || !image || typeof image !== 'object') return null;
  const img = image as { width?: number; height?: number; data?: Uint8ClampedArray; kind?: number; bitmap?: ImageBitmap };
  const width = img.bitmap?.width ?? img.width;
  const height = img.bitmap?.height ?? img.height;
  if (!width || !height || width * height > 100_000_000) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    // ImageKind: 1 = 1 bit per pixel grey (packed rows), 2 = RGB, 3 = RGBA.
    const out = ctx.createImageData(width, height);
    const src = img.data;
    if (img.kind === 3) out.data.set(src.subarray(0, out.data.length));
    else if (img.kind === 2) for (let i = 0, j = 0; i < out.data.length && j + 2 < src.length; i += 4, j += 3) out.data.set([src[j] as number, src[j + 1] as number, src[j + 2] as number, 255], i);
    else if (img.kind === 1) {
      const rowBytes = (width + 7) >> 3;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const on = ((src[y * rowBytes + (x >> 3)] as number) >> (7 - (x & 7))) & 1;
          out.data.set([on ? 255 : 0, on ? 255 : 0, on ? 255 : 0, 255], (y * width + x) * 4);
        }
      }
    } else {
      return null;
    }
    ctx.putImageData(out, 0, 0);
  } else {
    return null;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export interface PdfRead {
  pages: PdfPageImport[];
  /** How many pages the file has (more than `pages` when it was cut at the limit). */
  pageCount: number;
}

/** Reads a PDF into one drawing per page (up to `MAX_PDF_PAGES`). Throws when pdf.js cannot open the file. */
export async function readPdf(bytes: Uint8Array, ids: IdGenerator, pdfjs: PdfJs, options: { onPage?: (done: number, total: number) => void } = {}): Promise<PdfRead> {
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const pdf = await task.promise;
  try {
    const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pages: PdfPageImport[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const list = await page.getOperatorList();
      const content = await page.getTextContent().catch(() => null);
      const text: PdfTextItem[] = [];
      for (const item of content?.items ?? []) {
        if (!('str' in item) || item.str.length === 0) continue;
        const family = content?.styles[item.fontName]?.fontFamily;
        text.push({ str: item.str, transform: item.transform as PdfTextItem['transform'], ...(family ? { fontFamily: family } : {}) });
      }
      pages.push(
        await importPdfPage(
          {
            width: viewport.width,
            height: viewport.height,
            viewTransform: viewport.transform as PdfTextItem['transform'],
            fnArray: list.fnArray,
            argsArray: list.argsArray as ReadonlyArray<ArrayLike<unknown> | null>,
          },
          {
            ops: pdfjs.OPS as unknown as Record<string, number>,
            getObject: (id) => objectOf(id.startsWith('g_') ? page.commonObjs : page.objs, id),
            getImage: async (id) => {
              const png = await toPng(await objectOf(id.startsWith('g_') ? page.commonObjs : page.objs, id));
              return png ? { bytes: png } : null;
            },
            text,
          },
          ids,
        ),
      );
      page.cleanup();
      options.onPage?.(n, total);
    }
    return { pages, pageCount: pdf.numPages };
  } finally {
    void task.destroy();
  }
}
