import {
  commonStrokeField,
  getActiveSpace,
  moveAnchors,
  nodeWorldBounds,
  pathFrameOf,
  selectedAnchorIndices,
  selectionBounds,
  setPathAnchors,
  type DocumentSession,
  type Node,
  type Space,
  type Vec2,
} from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { BarButton, BarSeparator, Segmented } from '../components/controls';
import { Icon, type IconId } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { topLevelIds } from '../tools/shared';
import { nodeIcon, nodeLabel } from './nodeLabels';
import { applyObjectLook, applyStroke } from './paintActions';
import { moveSelectionTo, resizeSelection, rotateSelection } from './transformActions';
import { PaintChip } from '../panels/kit';
import { usePaintLook } from '../panels/PaintWidget';
import { convertSelectedAnchors, cutAtSelectedAnchors, deleteSelectedAnchors, joinSelection } from './pathActions';
import { SHORTCUTS, formatAccelerator } from './shortcuts';
import { useUi } from './store';
import type { ToolId } from './tools';
import './ControlBar.css';

const NODE_TOOLS: readonly ToolId[] = ['tool-pen', 'tool-anchor-add', 'tool-anchor-delete', 'tool-anchor-convert', 'tool-curvature', 'tool-direct-select', 'tool-group-select', 'tool-lasso'];

/**
 * Contextual bar (specs/10 §2): object fields for a selection, node fields for Direct Selection and the
 * pen tools, the tool name otherwise. X/Y/W/H are measured from the active artboard in document units.
 */
export function ControlBar() {
  const activeTool = useUi((s) => s.activeTool);
  const documents = useDocuments();
  const session = documents.active?.session;
  const space = session ? getActiveSpace(session.document) : null;
  const selection = session && space && session.selection.spaceId === space.id ? session.selection : null;
  const objectIds = space && selection ? topLevelIds(space, selection.ids) : [];

  let body;
  if (session && space && NODE_TOOLS.includes(activeTool)) body = <NodeControls session={session} space={space} />;
  else if (session && space && objectIds.length > 0) body = <ObjectControls session={session} space={space} ids={objectIds} />;
  else
    body = (
      <div className="vc-controlbar__title">
        <Icon id={activeTool} size={16} />
        <span>{t(`tool.${activeTool}`)}</span>
      </div>
    );

  return (
    <div className="vc-controlbar" data-testid="control-bar">
      {body}
      <div className="vc-controlbar__spacer" />
      <BarButton icon="panel-menu" tooltip={t('control.menu')} />
    </div>
  );
}

function useArtboardOrigin(space: Space): Vec2 {
  const active = useUi((s) => s.activeArtboard[space.id]);
  const board = space.artboards.find((a) => a.id === active) ?? space.artboards[0];
  return { x: board?.x ?? 0, y: board?.y ?? 0 };
}

function ObjectControls({ session, space, ids }: { session: DocumentSession; space: Space; ids: string[] }) {
  const units = session.document.meta.units;
  const origin = useArtboardOrigin(space);
  const ref = useUi((s) => s.referencePoint);
  const setRef = useUi((s) => s.setReferencePoint);
  const linked = useUi((s) => s.linkProportions);
  const toggleLink = useUi((s) => s.toggleLinkProportions);
  const setIsolation = useUi((s) => s.setIsolation);

  const first = selectionNode(space, ids[0] as string);
  const box = selectionBounds(space, ids);
  if (!first || !box) return null;

  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const point = { x: box.minX + ref.x * width, y: box.minY + ref.y * height };
  const label = ids.length > 1 ? t('control.objects', { count: ids.length }) : nodeLabel(first);
  const icon: IconId = ids.length > 1 ? 'group' : nodeIcon(first);
  const isGroup = ids.length === 1 && (first.type === 'group' || first.type === 'clipGroup');
  const moveTo = (axis: 'x' | 'y') => (value: number) => moveSelectionTo(axis, unitToPt(value, units) + origin[axis]);
  const resize = (axis: 'x' | 'y') => (value: number) => resizeSelection(axis, unitToPt(value, units));

  return (
    <>
      <div className="vc-controlbar__title" data-testid="control-type">
        <Icon id={icon} size={16} />
        <span>{label}</span>
      </div>
      <BarSeparator />
      <ControlPaints />
      <BarSeparator />
      <div className="vc-refpoint" role="group" aria-label={t('control.referencePoint')} data-testid="ref-point">
        {[0, 0.5, 1].flatMap((y) =>
          [0, 0.5, 1].map((x) => (
            <button
              key={`${x}-${y}`}
              type="button"
              className={x === ref.x && y === ref.y ? 'is-active' : undefined}
              aria-pressed={x === ref.x && y === ref.y}
              data-testid={`ref-${x}-${y}`}
              onClick={() => setRef({ x, y })}
            />
          )),
        )}
      </div>
      <NumberInput label="X" suffix={units} lengthUnit={units} value={ptToUnit(point.x - origin.x, units)} onCommit={moveTo('x')} testId="field-x" tooltip="X" decimals={3} />
      <NumberInput label="Y" suffix={units} lengthUnit={units} value={ptToUnit(point.y - origin.y, units)} onCommit={moveTo('y')} testId="field-y" tooltip="Y" decimals={3} />
      <div className="vc-controlbar__pair">
        <NumberInput label={t('measure.width')} suffix={units} lengthUnit={units} value={ptToUnit(width, units)} onCommit={resize('x')} min={0} testId="field-w" tooltip={t('measure.width')} decimals={3} />
        <button type="button" className={linked ? 'vc-linkbutton is-on' : 'vc-linkbutton'} aria-pressed={linked} data-testid="link-proportions" onClick={toggleLink} {...tip(t('control.keepProportions'))}>
          <Icon id={linked ? 'link' : 'unlink'} size={14} />
        </button>
        <NumberInput label={t('measure.height')} suffix={units} lengthUnit={units} value={ptToUnit(height, units)} onCommit={resize('y')} min={0} testId="field-h" tooltip={t('measure.height')} decimals={3} />
      </div>
      <NumberInput
        icon="angle"
        suffix="°"
        value={0}
        width={64}
        step={1}
        decimals={3}
        testId="field-angle"
        tooltip={t('control.angle')}
        onCommit={rotateSelection}
      />
      <BarSeparator />
      <BarButton
        icon="isolate"
        tooltip={t('control.isolate')}
        onClick={() => isGroup && setIsolation(space.id, first.id)}
      />
    </>
  );
}

function selectionNode(space: Space, id: string): Node | null {
  const bounds = nodeWorldBounds(space, id);
  if (!bounds) return null;
  for (const layer of space.layers) {
    const found = findIn(layer.children, id);
    if (found) return found;
  }
  return null;
}

function findIn(children: readonly (Node | Space['layers'][number])[], id: string): Node | null {
  for (const child of children) {
    if (child.type === 'layer') {
      const found = findIn(child.children, id);
      if (found) return found;
    } else if (child.id === id) {
      return child;
    } else if (child.type === 'group' || child.type === 'clipGroup') {
      const found = findIn(child.children, id);
      if (found) return found;
    }
  }
  return null;
}

function NodeControls({ session, space }: { session: DocumentSession; space: Space }) {
  const os = useUi((s) => s.platform.os);
  const showHandles = useUi((s) => s.viewOptions.showHandles);
  const toggleView = useUi((s) => s.toggleViewOption);
  const units = session.document.meta.units;
  const origin = useArtboardOrigin(space);
  const joinKeys = formatAccelerator(SHORTCUTS['object.join'], os);
  const selection = session.selection.spaceId === space.id ? session.selection : null;

  // A single selected anchor can be placed by number (X/Y from the artboard, in document units).
  const entries = Object.entries(selection?.anchors ?? {}).flatMap(([pathId, list]) => list.map((index) => ({ pathId, index })));
  const only = entries.length === 1 ? entries[0] : undefined;
  const frame = only ? pathFrameOf(space, only.pathId) : null;
  const anchor = frame && only ? frame.path.anchors[only.index] : undefined;
  const world = frame && anchor ? { x: frame.world[0] * anchor.p.x + frame.world[2] * anchor.p.y + frame.world[4], y: frame.world[1] * anchor.p.x + frame.world[3] * anchor.p.y + frame.world[5] } : null;

  const place = (axis: 'x' | 'y') => (value: number) => {
    if (!frame || !only || !world || frame.live) return;
    const target = unitToPt(value, units) + origin[axis];
    const dWorld = axis === 'x' ? { x: target - world.x, y: 0 } : { x: 0, y: target - world.y };
    const det = frame.world[0] * frame.world[3] - frame.world[1] * frame.world[2];
    if (det === 0) return;
    const local = { x: (frame.world[3] * dWorld.x - frame.world[2] * dWorld.y) / det, y: (-frame.world[1] * dWorld.x + frame.world[0] * dWorld.y) / det };
    session.run(setPathAnchors(space.id, frame.path.id, moveAnchors(frame.path.anchors, selectedAnchorIndices(selection as NonNullable<typeof selection>, frame.path.id), local)));
  };

  return (
    <>
      <div className="vc-controlbar__title">
        <Icon id="tool-pen" size={16} />
        <span>{t('control.anchorSelected')}</span>
      </div>
      <BarSeparator />
      <span className="vc-controlbar__muted">{t('control.convert')}</span>
      <Segmented
        items={[
          { icon: 'tool-anchor-convert', tooltip: t('control.convertCorner'), onClick: () => convertSelectedAnchors('corner') },
          { icon: 'tool-curvature', tooltip: t('control.convertSmooth'), onClick: () => convertSelectedAnchors('smooth') },
        ]}
      />
      <span className="vc-controlbar__muted vc-controlbar__muted--gap">{t('control.handles')}</span>
      <Segmented
        items={[
          { icon: 'visibility', tooltip: t('control.handlesShow'), active: showHandles, onClick: () => !showHandles && toggleView('showHandles') },
          { icon: 'visibility-off', tooltip: t('control.handlesHide'), active: !showHandles, onClick: () => showHandles && toggleView('showHandles') },
        ]}
      />
      <BarSeparator />
      <BarButton icon="tool-anchor-delete" label={t('control.deleteAnchor')} tooltip={t('control.deleteAnchorTip')} onClick={() => deleteSelectedAnchors()} />
      <BarButton icon="tool-scissors" label={t('control.cutAtAnchor')} tooltip={t('control.cutAtAnchorTip')} onClick={cutAtSelectedAnchors} />
      <BarButton icon="join" label={t('control.join')} tooltip={t('control.joinTip')} shortcut={joinKeys} onClick={joinSelection} />
      <BarSeparator />
      <span className="vc-controlbar__muted">{t('control.anchor')}</span>
      <NumberInput label="X" suffix={units} lengthUnit={units} value={world ? ptToUnit(world.x - origin.x, units) : null} onCommit={place('x')} disabled={!world || !!frame?.live} testId="anchor-x" tooltip="X" decimals={3} />
      <NumberInput label="Y" suffix={units} lengthUnit={units} value={world ? ptToUnit(world.y - origin.y, units) : null} onCommit={place('y')} disabled={!world || !!frame?.live} testId="anchor-y" tooltip="Y" decimals={3} />
    </>
  );
}

/** Fill, stroke (with weight) and opacity of the selection, editable right in the control bar (specs/10 §2). */
function ControlPaints() {
  const { look, resources, ctx } = usePaintLook();
  const setActive = useUi((s) => s.setActivePaint);
  const openPanel = useUi((s) => s.openPanel);
  const openPicker = useUi((s) => s.openColorPicker);
  const weight = ctx ? commonStrokeField(ctx.leaves, 'width') : null;
  const chip = (target: 'fill' | 'stroke') => {
    const paint = look[target];
    return (
      <button
        type="button"
        className="vc-controlbar__chip"
        data-testid={`control-${target}`}
        {...tip(t(target === 'fill' ? 'control.fill' : 'control.stroke'))}
        onClick={() => {
          setActive(target);
          openPanel('fill');
        }}
        onDoubleClick={() => openPicker(target)}
      >
        <Icon id={target} size={14} className="vc-controlbar__muted" />
        <PaintChip paint={paint.mixed ? null : paint.value} mixed={paint.mixed} resources={resources} size={16} />
      </button>
    );
  };
  return (
    <>
      {chip('fill')}
      {chip('stroke')}
      <NumberInput
        icon="stroke-weight"
        suffix="pt"
        value={weight && !weight.mixed ? Math.round(weight.value * 1000) / 1000 : null}
        onCommit={(v) => applyStroke({ width: v })}
        min={0}
        step={0.5}
        decimals={3}
        width={88}
        testId="control-weight"
        tooltip={t('control.strokeWeight')}
      />
      <NumberInput
        icon="opacity"
        suffix="%"
        value={look.opacity.mixed ? null : Math.round(look.opacity.value * 100)}
        onCommit={(v) => applyObjectLook({ opacity: v / 100 })}
        min={0}
        max={100}
        decimals={0}
        width={80}
        testId="control-opacity"
        tooltip={t('control.opacity')}
      />
    </>
  );
}
