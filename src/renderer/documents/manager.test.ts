import { describe, expect, it } from 'vitest';
import { createImage, getActiveSpace, placeImage, renameSpace, sequentialIds } from '../../core';
import type { AutosaveEntry, OpenedFile, SaveRequest } from '../../shared/ipc';
import { DocumentManager, displayName, type CloseChoice, type FilesPort } from './manager';

function fakeEnv() {
  const disk = new Map<string, Uint8Array>(); // saved documents by path
  const autosaves = new Map<string, { bytes: Uint8Array; modified: number }>();
  const errors: string[] = [];
  const state = { now: 1_000_000, nextPick: null as OpenedFile | null, savePath: 'C:\\docs\\a.vict' as string | null, close: 'discard' as CloseChoice, pdfFails: false, pdfPages: 2 };

  const files: FilesPort = {
    openFile: async () => state.nextPick,
    saveFile: async (request: SaveRequest) => {
      const target = request.path ?? state.savePath;
      if (!target) return null;
      disk.set(target, request.bytes);
      return { path: target };
    },
    autosaveWrite: async (id, bytes) => void autosaves.set(id, { bytes, modified: state.now }),
    autosaveDiscard: async (id) => void autosaves.delete(id),
    autosaveList: async (): Promise<AutosaveEntry[]> => [...autosaves].map(([docId, v]) => ({ docId, modified: v.modified })),
    autosaveRead: async (id) => autosaves.get(id)?.bytes ?? null,
  };

  const manager = new DocumentManager({
    files,
    prompts: { askSaveBeforeClose: async () => state.close, reportError: async (m) => void errors.push(m) },
    names: {
      untitled: (n) => `Sin título-${n}`,
      space: (n) => `Espacio ${n}`,
      artboard: (n) => `Mesa ${n}`,
      layer: (n) => `Capa ${n}`,
      openFailed: (r) => `open failed: ${r}`,
      epsSkipped: (items) => `eps skipped: ${items}`,
      epsItem: (code) => code,
      importSkipped: (items) => `import skipped: ${items}`,
      importItem: (code) => code,
      saveFailed: 'save failed',
      openLabels: { title: 'o', filterName: 'f' },
      saveLabels: { title: 's', filterName: 'f' },
    },
    pdf: {
      read: async () => {
        if (state.pdfFails) throw new Error('bad pdf');
        const pages = [200, 50].map((w) => ({ width: w, height: 100, nodes: [], gradients: [], images: {}, warnings: [{ code: 'text' as const }] }));
        return { pages, pageCount: state.pdfPages };
      },
    },
    appVersion: '0.2.0',
    ids: sequentialIds('m'),
    clock: () => state.now,
  });
  return { manager, disk, autosaves, errors, state };
}

const edit = (m: DocumentManager, name = 'Edited') => {
  const doc = m.active!;
  doc.session.run(renameSpace(doc.session.document.activeSpaceId, name));
  return doc;
};

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

describe('DocumentManager', () => {
  it('keeps the bytes of placed images through save, reopen and autosave recovery', async () => {
    const { manager, disk, autosaves, state } = fakeEnv();
    const doc = manager.newDocument();
    const added = doc.session.images.add(PNG);
    if (!added) throw new Error('not an image');
    const space = getActiveSpace(doc.session.document);
    const node = createImage(doc.session.ids, added.hash, 64, 32);
    doc.session.run(placeImage(space.id, space.layers[0]!.id, node, { width: 64, height: 32, format: 'png' }));
    await manager.flushAutosaves();
    const [autosaveId] = [...autosaves.keys()];
    const autosaved = autosaves.get(autosaveId!)!;
    expect(autosaves.size).toBe(1);
    expect(await manager.save()).toBe(true); // saving removes the autosave file…
    autosaves.set(autosaveId!, autosaved); // …so put it back to test recovery on its own

    state.nextPick = { path: 'C:\\other\\copy.vict', bytes: disk.get('C:\\docs\\a.vict')! };
    const reopened = await manager.open();
    expect(reopened?.session.images.get(added.hash)).toEqual(PNG);

    const recovered = await manager.recover(autosaveId!);
    expect(recovered?.session.images.get(added.hash)).toEqual(PNG);
  });

  it('opens an EPS as a new unsaved document sized to its bounding box and reports what was skipped', async () => {
    const { manager, state, errors } = fakeEnv();
    const ps = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 120 80\nnewpath 0 0 moveto 50 0 lineto 50 50 lineto fill /F findfont 12 scalefont setfont (x) show\n';
    state.nextPick = { path: 'C:\\art\\logo.eps', bytes: Uint8Array.from(ps, (c) => c.charCodeAt(0)) };
    const doc = await manager.open();
    expect(doc?.path).toBeNull();
    expect(doc?.session.document.meta.name).toBe('logo');
    const space = doc!.session.document.spaces[0]!;
    expect([space.artboards[0]!.w, space.artboards[0]!.h]).toEqual([120, 80]);
    expect(space.layers[0]!.children).toHaveLength(1);
    expect(errors).toEqual(['eps skipped: text']);
  });

  it('opens an SVG as a new unsaved document with an artboard of its size, and reports what it left out', async () => {
    const { manager, state, errors } = fakeEnv();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="30" height="30" fill="red"/><rect width="9" height="9" filter="url(#f)"/></svg>';
    state.nextPick = { path: 'C:/art/logo.svg', bytes: new TextEncoder().encode(svg) };
    const doc = await manager.open();
    expect(doc?.path).toBeNull();
    expect(doc?.session.document.meta.name).toBe('logo');
    const space = doc!.session.document.spaces[0]!;
    expect([space.artboards[0]!.w, space.artboards[0]!.h]).toEqual([120, 80]);
    expect(space.layers[0]!.children).toHaveLength(2);
    expect(errors).toEqual(['import skipped: filter']);
  });

  it('refuses a damaged SVG with a message and opens nothing', async () => {
    const { manager, state, errors } = fakeEnv();
    state.nextPick = { path: 'C:/art/bad.svg', bytes: new TextEncoder().encode('<svg><g></svg>') };
    expect(await manager.open()).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^open failed:/);
    expect(manager.documents).toHaveLength(0);
  });

  it('opens a PDF with a Space per page and says when pages were left out', async () => {
    const { manager, state, errors } = fakeEnv();
    state.pdfPages = 120;
    state.nextPick = { path: 'C:/docs/manual.pdf', bytes: Uint8Array.from([37, 80, 68, 70]) };
    const doc = await manager.open();
    expect(doc?.session.document.meta.name).toBe('manual');
    expect(doc!.session.document.spaces.map((sp) => [sp.name, sp.artboards[0]!.w])).toEqual([['Espacio 1', 200], ['Espacio 2', 50]]);
    expect(errors).toEqual(['import skipped: text, pages']);
  });

  it('a PDF that cannot be read is reported, not opened', async () => {
    const { manager, state, errors } = fakeEnv();
    state.pdfFails = true;
    state.nextPick = { path: 'C:/docs/x.pdf', bytes: new Uint8Array(4) };
    expect(await manager.open()).toBeNull();
    expect(errors).toEqual(['open failed: bad pdf']);
  });

  it('creates documents with unique untitled names and a Space, artboard and layer', () => {
    const { manager } = fakeEnv();
    const a = manager.newDocument();
    const b = manager.newDocument();
    expect(displayName(a)).toBe('Sin título-1.vict');
    expect(displayName(b)).toBe('Sin título-2.vict');
    expect(manager.active).toBe(b);
    const space = a.session.document.spaces[0];
    expect(space?.name).toBe('Espacio 1');
    expect(space?.artboards[0]?.name).toBe('Mesa 1');
    expect(space?.layers[0]?.name).toBe('Capa 1');
  });

  it('notifies subscribers when documents or their content change', () => {
    const { manager } = fakeEnv();
    let calls = 0;
    manager.subscribe(() => calls++);
    manager.newDocument();
    const before = calls;
    edit(manager);
    expect(calls).toBeGreaterThan(before);
    expect(manager.version).toBeGreaterThan(0);
  });

  it('saves: first with a path from the dialog, then silently to the same path', async () => {
    const { manager, disk, state } = fakeEnv();
    manager.newDocument();
    const doc = edit(manager);
    expect(doc.session.dirty).toBe(true);
    expect(await manager.save()).toBe(true);
    expect(doc.path).toBe('C:\\docs\\a.vict');
    expect(doc.session.dirty).toBe(false);
    expect(displayName(doc)).toBe('a.vict');
    state.savePath = null; // a second dialog would now be cancelled: save must not ask again
    edit(manager, 'Again');
    expect(await manager.save()).toBe(true);
    expect(disk.size).toBe(1);
  });

  it('saves a copy without touching the document: same path, still unsaved changes', async () => {
    const { manager, disk, state } = fakeEnv();
    manager.newDocument();
    const doc = edit(manager);
    expect(await manager.save()).toBe(true);
    edit(manager, 'Changed after saving');
    state.savePath = 'C:\\docs\\copy.vict';
    expect(await manager.saveCopy()).toBe(true);
    expect(disk.has('C:\\docs\\copy.vict')).toBe(true);
    expect(doc.path).toBe('C:\\docs\\a.vict');
    expect(doc.session.dirty).toBe(true);
    state.savePath = null;
    expect(await manager.saveCopy()).toBe(false); // cancelled dialog
  });

  it('Save As always asks and can be cancelled', async () => {
    const { manager, state } = fakeEnv();
    manager.newDocument();
    await manager.save();
    state.savePath = null;
    expect(await manager.saveAs()).toBe(false);
    expect(manager.active?.path).toBe('C:\\docs\\a.vict');
  });

  it('opens what it saved, and activates instead of opening twice', async () => {
    const { manager, disk, state } = fakeEnv();
    manager.newDocument();
    edit(manager, 'Persisted');
    await manager.save();
    state.nextPick = { path: 'C:\\docs\\a.vict', bytes: disk.get('C:\\docs\\a.vict')! };
    const again = await manager.open();
    expect(manager.documents).toHaveLength(1);
    expect(again).toBe(manager.active);

    state.nextPick = { path: 'C:\\docs\\b.vict', bytes: disk.get('C:\\docs\\a.vict')! };
    const other = await manager.open();
    expect(manager.documents).toHaveLength(2);
    expect(other?.session.document.spaces[0]?.name).toBe('Persisted');
    expect(other?.session.dirty).toBe(false);
  });

  it('reports invalid files instead of opening them', async () => {
    const { manager, state, errors } = fakeEnv();
    manager.newDocument();
    state.nextPick = { path: 'C:\\x.vict', bytes: Uint8Array.from([1, 2, 3]) };
    expect(await manager.open()).toBeNull();
    expect(errors[0]).toMatch(/open failed/);
    expect(manager.documents).toHaveLength(1);
  });

  it('closing a dirty document asks; cancel keeps it, discard drops it', async () => {
    const { manager, state } = fakeEnv();
    manager.newDocument();
    manager.newDocument();
    edit(manager);
    state.close = 'cancel';
    expect(await manager.close()).toBe(false);
    expect(manager.documents).toHaveLength(2);
    state.close = 'discard';
    expect(await manager.close()).toBe(true);
    expect(manager.documents).toHaveLength(1);
  });

  it('closing with "save" saves first and aborts when the save dialog is cancelled', async () => {
    const { manager, state, disk } = fakeEnv();
    manager.newDocument();
    edit(manager);
    state.close = 'save';
    state.savePath = null;
    expect(await manager.close()).toBe(false);
    state.savePath = 'C:\\docs\\z.vict';
    expect(await manager.close()).toBe(true);
    expect(disk.has('C:\\docs\\z.vict')).toBe(true);
  });

  it('closing the last document leaves none open (the start screen takes over), and a new one still works', async () => {
    const { manager } = fakeEnv();
    manager.newDocument();
    await manager.close();
    expect(manager.documents).toHaveLength(0);
    expect(manager.active).toBeNull();
    manager.newDocument();
    expect(manager.documents).toHaveLength(1);
  });

  it('a new document takes the artboard size of the preset asked for', () => {
    const { manager } = fakeEnv();
    const doc = manager.newDocument('Instagram');
    const board = doc.session.document.spaces[0]!.artboards[0]!;
    expect([board.w, board.h, board.preset]).toEqual([1080, 1080, 'Instagram']);
  });
});

describe('autosave', () => {
  it('writes changed documents every 60 s and nothing before', async () => {
    const { manager, autosaves, state } = fakeEnv();
    manager.newDocument();
    edit(manager);
    state.now += 59_000;
    await manager.tickAutosave();
    expect(autosaves.size).toBe(0);
    state.now += 1_000;
    await manager.tickAutosave();
    expect(autosaves.size).toBe(1);
    state.now += 120_000;
    await manager.tickAutosave(); // unchanged since last autosave
    expect([...autosaves.values()][0]?.modified).toBe(state.now - 120_000);
  });

  it('is deleted on save and when the document goes back to its saved state', async () => {
    const { manager, autosaves, state } = fakeEnv();
    manager.newDocument();
    edit(manager);
    state.now += 60_000;
    await manager.tickAutosave();
    expect(autosaves.size).toBe(1);
    await manager.save();
    expect(autosaves.size).toBe(0);

    edit(manager, 'More');
    state.now += 60_000;
    await manager.tickAutosave();
    expect(autosaves.size).toBe(1);
    manager.active!.session.undo(); // back to the saved content
    await manager.tickAutosave();
    expect(autosaves.size).toBe(0);
  });

  it('flushes unsaved work when closing and leaves nothing for clean documents', async () => {
    const { manager, autosaves } = fakeEnv();
    manager.newDocument();
    manager.newDocument();
    edit(manager);
    await manager.flushAutosaves();
    expect(autosaves.size).toBe(1);
  });

  it('closing a document discards its autosave', async () => {
    const { manager, autosaves, state } = fakeEnv();
    manager.newDocument();
    manager.newDocument();
    edit(manager);
    state.now += 60_000;
    await manager.tickAutosave();
    expect(autosaves.size).toBe(1);
    await manager.close();
    expect(autosaves.size).toBe(0);
  });

  it('offers recovery after an unexpected exit and restores the work as unsaved', async () => {
    const first = fakeEnv();
    first.manager.newDocument();
    edit(first.manager, 'Unsaved work');
    await first.manager.flushAutosaves();

    // "Restart": a new manager over the same autosave folder.
    const second = fakeEnv();
    for (const [k, v] of first.autosaves) second.autosaves.set(k, v);
    const found = await second.manager.findRecoverable();
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('Sin título-1');
    const doc = await second.manager.recover(found[0]!.docId);
    expect(doc?.session.document.spaces[0]?.name).toBe('Unsaved work');
    expect(doc?.session.dirty).toBe(true);
    expect(doc?.path).toBeNull();

    await second.manager.flushAutosaves(); // still unsaved: its autosave stays
    expect(second.autosaves.size).toBe(1);
    await second.manager.save();
    expect(second.autosaves.size).toBe(0);
  });

  it('drops corrupt autosave files while listing', async () => {
    const { manager, autosaves } = fakeEnv();
    autosaves.set('bad', { bytes: Uint8Array.from([0, 1, 2]), modified: 1 });
    expect(await manager.findRecoverable()).toEqual([]);
    expect(autosaves.size).toBe(0);
  });
});
