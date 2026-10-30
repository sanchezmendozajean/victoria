import { describe, expect, it } from 'vitest';
import {
  arrangeNodes,
  buildScene,
  cloneNodes,
  createDocument,
  createGroup,
  createRect,
  DocumentSession,
  duplicateNodes,
  groupNodes,
  locateNodes,
  paintTargets,
  removeNodes,
  selectionBounds,
  setNodeProps,
  setPaint,
  translateNodes,
  getActiveSpace,
  readVict,
  selectableIds,
  sequentialIds,
  transformNodes,
  translation,
  writeSvg,
  writeVict,
  ImageStore,
  type Document,
} from '..';

const N = 10_000;

/** A document with 10 000 rectangles on one layer, built directly (the commands are what is measured). */
function bigDocument() {
  const ids = sequentialIds('p');
  const doc: Document = createDocument({ name: 'Perf', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const space = getActiveSpace(doc);
  const layer = space.layers[0]!;
  for (let i = 0; i < N; i++) {
    const r = createRect(ids, 20, 20);
    r.transform = translation((i % 100) * 24, Math.floor(i / 100) * 24);
    layer.children.push(r);
  }
  return { ids, doc, space };
}

const timed = <T>(fn: () => T): { ms: number; value: T } => {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
};

/** Budgets are generous (slow CI machines); what they catch is an accidental O(n²), not a few milliseconds. */
describe('operations on a 10 000-object document', { timeout: 60_000 }, () => {
  it('moving, undoing and redoing every object, and selecting all', () => {
    const { ids, doc } = bigDocument();
    const session = new DocumentSession(doc, { ids, historyLimit: 20 });
    const space = getActiveSpace(session.document);
    const all = timed(() => selectableIds(space));
    expect(all.value).toHaveLength(N);
    const move = timed(() => session.run(transformNodes(space.id, all.value, translation(5, 5))));
    const undo = timed(() => session.undo());
    const redo = timed(() => session.redo());
    console.log(`10k · select all ${all.ms.toFixed(0)} ms · move all ${move.ms.toFixed(0)} ms · undo ${undo.ms.toFixed(0)} ms · redo ${redo.ms.toFixed(0)} ms`);
    expect(all.ms).toBeLessThan(200);
    expect(move.ms).toBeLessThan(1500);
    expect(undo.ms).toBeLessThan(1500);
    expect(redo.ms).toBeLessThan(1500);
  });

  it('saving and opening the file', () => {
    const { doc } = bigDocument();
    const save = timed(() => writeVict({ document: doc, app: 'perf' }));
    const open = timed(() => readVict(save.value));
    console.log(`10k · save ${save.ms.toFixed(0)} ms (${(save.value.length / 1024).toFixed(0)} KB) · open ${open.ms.toFixed(0)} ms`);
    expect(save.ms).toBeLessThan(2000);
    expect(open.ms).toBeLessThan(2000);
  });

  it('building the export scene and writing the SVG', () => {
    const { doc, space } = bigDocument();
    const region = { minX: 0, minY: 0, maxX: 2400, maxY: 2400 };
    const scene = timed(() => buildScene(space, { resources: doc.resources, region }));
    const svg = timed(() => writeSvg(scene.value, new ImageStore()));
    console.log(`10k · scene ${scene.ms.toFixed(0)} ms · svg ${svg.ms.toFixed(0)} ms (${(svg.value.svg.length / 1024).toFixed(0)} KB)`);
    expect(scene.ms).toBeLessThan(2000);
    expect(svg.ms).toBeLessThan(2000);
  });

  it('the other commands that take a whole selection stay linear', () => {
    const { ids, doc } = bigDocument();
    const session = new DocumentSession(doc, { ids, historyLimit: 20 });
    const space = () => getActiveSpace(session.document);
    const all = selectableIds(space());
    const clones = cloneNodes(all.map((id) => locateNodes(space(), [id])[0]!.node), ids);
    const red = { type: 'solid' as const, color: { model: 'rgb' as const, values: [255, 0, 0] as [number, number, number] } };
    const steps: Array<[string, () => void]> = [
      ['hide', () => session.run(setNodeProps(space().id, all, { visible: false }))],
      ['show', () => session.run(setNodeProps(space().id, all, { visible: true }))],
      ['fill', () => session.run(setPaint(space().id, all, 'fill', red))],
      ['align', () => session.run(translateNodes(space().id, new Map(all.map((id) => [id, { x: 1, y: 0 }] as const))))],
      ['arrange', () => session.run(arrangeNodes(space().id, all.slice(0, 5000), 'front'))],
      ['duplicate', () => session.run(duplicateNodes(space().id, all, clones))],
      ['group', () => session.run(groupNodes(space().id, selectableIds(space()), createGroup(ids, [])))],
      ['delete', () => session.run(removeNodes(space().id, selectableIds(space())))],
    ];
    const times: string[] = [];
    for (const [name, step] of steps) {
      const { ms } = timed(step);
      times.push(`${name} ${ms.toFixed(0)}`);
      expect(ms, name).toBeLessThan(2500);
    }
    console.log(`10k · ${times.join(' · ')} ms`);
  });

  it('measuring and reading the selection of every object', () => {
    const { doc, space } = bigDocument();
    const all = selectableIds(space);
    const bounds = timed(() => selectionBounds(space, all));
    const targets = timed(() => paintTargets(space, all));
    expect(bounds.value).not.toBeNull();
    expect(targets.value).toHaveLength(N);
    console.log(`10k · selection bounds ${bounds.ms.toFixed(0)} ms · paint targets ${targets.ms.toFixed(0)} ms`);
    expect(bounds.ms).toBeLessThan(500);
    expect(targets.ms).toBeLessThan(500);
    void doc;
  });
});
