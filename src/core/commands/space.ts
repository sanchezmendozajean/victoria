import type { Draft } from 'immer';
import type { Document, Grid, Guide, Space } from '../model/types';
import type { Command } from './command';

const findSpace = (d: Draft<Document>, id: string) => d.spaces.find((s) => s.id === id);
const renumber = (d: Draft<Document>) => d.spaces.forEach((s, i) => (s.order = i));

/** Adds a Space (built with `createSpace` or `cloneSpace`) at the end and makes it active. */
export const addSpace = (space: Space): Command => ({
  label: 'space.add',
  spaceId: space.id,
  apply: (d) => {
    d.spaces.push({ ...space, order: d.spaces.length });
    d.activeSpaceId = space.id;
  },
});

/** A document always keeps at least one Space (specs/04 · regla 1): removing the last one does nothing. */
export const removeSpace = (spaceId: string): Command => ({
  label: 'space.remove',
  spaceId,
  apply: (d) => {
    const index = d.spaces.findIndex((s) => s.id === spaceId);
    if (index === -1 || d.spaces.length === 1) return;
    d.spaces.splice(index, 1);
    renumber(d);
    if (d.activeSpaceId === spaceId) d.activeSpaceId = (d.spaces[Math.min(index, d.spaces.length - 1)] as Space).id;
  },
});

export const renameSpace = (spaceId: string, name: string): Command => ({
  label: 'space.rename',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.name = name;
  },
});

export const setSpaceColor = (spaceId: string, color: string): Command => ({
  label: 'space.color',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.color = color;
  },
});

export const setSpaceExcluded = (spaceId: string, excluded: boolean): Command => ({
  label: 'space.excludeExport',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.excludeFromExport = excluded;
  },
});

export const setSpaceCanvasColor = (spaceId: string, color: string | null): Command => ({
  label: 'space.canvasColor',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.canvasColor = color;
  },
});

export const setGrid = (spaceId: string, grid: Partial<Grid>): Command => ({
  label: 'space.grid',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) Object.assign(space.grid, grid);
  },
});

/** Drag-reorder of Space tabs. */
export const reorderSpace = (spaceId: string, toIndex: number): Command => ({
  label: 'space.reorder',
  apply: (d) => {
    const from = d.spaces.findIndex((s) => s.id === spaceId);
    if (from === -1) return;
    const target = Math.max(0, Math.min(toIndex, d.spaces.length - 1));
    if (target === from) return;
    const [moved] = d.spaces.splice(from, 1);
    d.spaces.splice(target, 0, moved as Draft<Space>);
    renumber(d);
  },
});

export const addGuide = (spaceId: string, guide: Guide): Command => ({
  label: 'guide.add',
  spaceId,
  apply: (d) => {
    findSpace(d, spaceId)?.guides.push(guide);
  },
});

export const removeGuide = (spaceId: string, guideId: string): Command => ({
  label: 'guide.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.guides = space.guides.filter((g) => g.id !== guideId);
  },
});

export const moveGuide = (spaceId: string, guideId: string, position: number): Command => ({
  label: 'guide.move',
  spaceId,
  mergeKey: `guide.move:${guideId}`,
  apply: (d) => {
    const guide = findSpace(d, spaceId)?.guides.find((g) => g.id === guideId);
    if (guide) guide.position = position;
  },
});
