import { describe, expect, it } from 'vitest';
import { selectOnly } from '../../../core';
import { createShapeBuilderTool } from '../shapeBuilderTool';
import { click, createTestHost, drag, type TestHost } from './fakeHost';

/** Two overlapping circles: A spans x 0..100, B spans x 60..160 (the lens is x 60..100). */
function twoCircles() {
  const t = createTestHost();
  const a = t.ellipse(0, 0, 100, 100);
  const b = t.ellipse(60, 0, 100, 100);
  t.session.select(selectOnly(t.spaceId(), [a.id, b.id]));
  return { t, a, b };
}
const count = (t: TestHost) => t.space().layers[0]!.children.length;

describe('Shape Builder', () => {
  it('a click on a region turns the selection into its regions, in one undo step', () => {
    const { t } = twoCircles();
    const tool = createShapeBuilderTool();
    const before = t.session.historyLength;
    click(tool, t, 80, 50); // the lens
    expect(count(t)).toBe(3);
    expect(t.session.selection.ids).toHaveLength(3);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(count(t)).toBe(2);
  });

  it('dragging across regions unites them', () => {
    const { t } = twoCircles();
    const tool = createShapeBuilderTool();
    drag(tool, t, { x: 20, y: 50 }, { x: 80, y: 50 }, {}, 8); // crescent of A, then the lens
    expect(count(t)).toBe(2); // the united region and the crescent of B
  });

  it('Alt + click deletes a region', () => {
    const { t } = twoCircles();
    const tool = createShapeBuilderTool();
    click(tool, t, 80, 50, { altKey: true });
    expect(count(t)).toBe(2);
    t.session.undo();
    expect(count(t)).toBe(2);
    expect(t.session.selection.ids).toHaveLength(2);
  });

  it('does nothing without a selection', () => {
    const t = createTestHost();
    t.ellipse(0, 0, 100, 100);
    const tool = createShapeBuilderTool();
    click(tool, t, 50, 50);
    expect(count(t)).toBe(1);
  });
});
