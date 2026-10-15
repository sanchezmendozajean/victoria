import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addLayer,
  combineCommands,
  createLayer,
  emptySelection,
  locateLayer,
  locateNode,
  moveLayer,
  moveNodesToLayer,
  nodeWorldBounds,
  removeLayer,
  selectOnly,
  setNodeProps,
  SPACE_COLORS,
  updateLayer,
  walkLayers,
  type Layer,
  type Node,
  type Paint,
} from '../../core';
import { askUser } from '../app/dialogs';
import { nodeIcon, nodeLabel } from '../app/nodeLabels';
import { makeClipSelection, releaseClipSelection, deleteSelection } from '../app/selectionActions';
import { useUi } from '../app/store';
import { canvasApi } from '../canvas/api';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { PaintChip } from './kit';
import { ancestorIds, buildRows, planDrop, type DropPosition, type LayerRow } from './layersModel';
import { usePanelContext } from './context';

const ROW_HEIGHT = 28;
const DRAG_TYPE = 'application/x-victoria-layerrow';

/** Capas (specs/06): tree with eye, lock, colour bar, name, target and selection square; drag to reorder; layer buttons. */
export function LayersPanel() {
  const ctx = usePanelContext();
  const activeLayerMap = useUi((s) => s.activeLayer);
  const setActiveLayer = useUi((s) => s.setActiveLayer);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; position: DropPosition } | null>(null);
  const [scroll, setScroll] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const [viewHeight, setViewHeight] = useState(260);
  const dragging = useRef<{ kind: 'layer' | 'node'; ids: string[] } | null>(null);

  const space = ctx?.space;
  const rows = useMemo(() => (space ? buildRows(space, collapsed, expanded) : []), [space, collapsed, expanded]);

  // Locate: scroll the (virtualised) list so that a row is visible.
  const scrollToRow = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    const el = list.current;
    if (index < 0 || !el) return;
    const top = index * ROW_HEIGHT;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
  };
  const hasList = space !== undefined;
  // The list fills the panel: the virtual window follows its real height.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewHeight(el.clientHeight || 260));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasList]);
  const pendingReveal = useRef<string | null>(null);
  useEffect(() => {
    if (pendingReveal.current) {
      scrollToRow(pendingReveal.current);
      pendingReveal.current = null;
    }
  });

  if (!ctx || !space) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const { session, selection } = ctx;
  const selected = new Set(selection.ids);
  const active = activeLayerMap[space.id] ?? null;
  const first = Math.max(0, Math.floor(scroll / ROW_HEIGHT) - 6);
  const last = Math.min(rows.length, Math.ceil((scroll + viewHeight) / ROW_HEIGHT) + 6);

  const layerCount = () => [...walkLayers(space.layers)].length;
  const toggleSet = (set: ReadonlySet<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const layerContents = (layer: Layer): string[] => layer.children.filter((c): c is Node => c.type !== 'layer').map((c) => c.id);

  const selectRow = (row: LayerRow, additive: boolean) => {
    if (row.kind === 'node') {
      setActiveLayer(space.id, row.parentLayerId ?? '');
      if (additive) {
        const has = selected.has(row.id);
        session.select(selectOnly(space.id, has ? selection.ids.filter((i) => i !== row.id) : [...selection.ids, row.id]));
      } else session.select(selectOnly(space.id, [row.id]));
    } else {
      setActiveLayer(space.id, row.id);
      session.select(emptySelection(space.id));
    }
  };

  const selectContents = (row: LayerRow) => {
    if (row.kind === 'node') session.select(selectOnly(space.id, [row.id]));
    else if (row.layer) session.select(selectOnly(space.id, layerContents(row.layer)));
  };

  const toggleVisible = (row: LayerRow, event: React.MouseEvent) => {
    if (row.kind === 'node') {
      session.run(setNodeProps(space.id, [row.id], { visible: !row.node?.visible }));
      return;
    }
    const layer = row.layer as Layer;
    if (event.ctrlKey || event.metaKey) {
      session.run(updateLayer(space.id, layer.id, { outline: !layer.outline }));
      return;
    }
    if (event.altKey) {
      // Alt+click: show only this layer; again to bring the others back.
      const others = [...walkLayers(space.layers)].filter((l) => l.id !== layer.id);
      const alone = layer.visible && others.every((l) => !l.visible);
      session.run(
        combineCommands(
          'layer.update',
          others.map((l) => updateLayer(space.id, l.id, { visible: alone })).concat(updateLayer(space.id, layer.id, { visible: true })),
        ),
      );
      return;
    }
    session.run(updateLayer(space.id, layer.id, { visible: !layer.visible }));
  };

  const toggleLock = (row: LayerRow) => {
    if (row.kind === 'node') session.run(setNodeProps(space.id, [row.id], { locked: !row.node?.locked }));
    else if (row.layer) session.run(updateLayer(space.id, row.layer.id, { locked: !row.layer.locked }));
  };

  const commitName = (row: LayerRow, name: string) => {
    setRenaming(null);
    const clean = name.trim();
    if (clean === '') return;
    if (row.kind === 'layer' && row.layer) {
      if (clean !== row.layer.name) session.run(updateLayer(space.id, row.layer.id, { name: clean }));
    } else if (row.node && clean !== nodeLabel(row.node)) session.run(setNodeProps(space.id, [row.id], { name: clean }));
  };

  const newLayer = (sub: boolean) => {
    const color = SPACE_COLORS[layerCount() % SPACE_COLORS.length] as string;
    const layer = createLayer(session.ids, t('layers.newName', { n: layerCount() + 1 }), color);
    let parent: string | null = null;
    if (sub) {
      const fromSelection = selection.ids[0] ? locateNode(space, selection.ids[0])?.layer.id : undefined;
      parent = fromSelection ?? active ?? space.layers[space.layers.length - 1]?.id ?? null;
    }
    session.run(addLayer(space.id, layer, undefined, parent));
    setActiveLayer(space.id, layer.id);
    if (parent) setCollapsed((c) => new Set([...c].filter((id) => id !== parent)));
  };

  const hasClip = ctx.ids.some((id) => locateNode(space, id)?.node.type === 'clipGroup');

  const locate = () => {
    const id = selection.ids[0];
    if (!id) return;
    const { layers, groups } = ancestorIds(space, id);
    setCollapsed((c) => new Set([...c].filter((x) => !layers.includes(x))));
    setExpanded((e) => new Set([...e, ...groups]));
    pendingReveal.current = id;
    const bounds = nodeWorldBounds(space, id);
    if (bounds) canvasApi.current?.revealRect(bounds);
  };

  const remove = async () => {
    if (selection.ids.length > 0) return deleteSelection();
    const id = active;
    const found = id ? locateLayer(space, id) : null;
    if (!found) return;
    if (found.layer.children.length > 0) {
      const answer = await askUser({
        title: t('layers.deleteTitle', { name: found.layer.name }),
        detail: t('layers.deleteDetail'),
        buttons: [
          { id: 'cancel', label: t('dialog.cancel') },
          { id: 'delete', label: t('layers.delete'), variant: 'danger' },
        ],
      });
      if (answer !== 'delete') return;
    }
    session.run(removeLayer(space.id, found.layer.id));
  };

  const onDrop = (row: LayerRow, position: DropPosition) => {
    setDrop(null);
    const raw = dragging.current;
    dragging.current = null;
    if (!raw) return;
    const plan = planDrop(space, raw.kind === 'layer' ? { kind: 'layer', ids: raw.ids } : { kind: 'node', ids: raw.ids }, row.id, position);
    if (!plan) return;
    if (plan.type === 'moveLayer') session.run(moveLayer(space.id, plan.layerId, plan.parentId, plan.index));
    else session.run(moveNodesToLayer(space.id, plan.ids, plan.layerId, plan.index));
  };
  const positionAt = (event: React.DragEvent<HTMLElement>, row: LayerRow): DropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    if (row.kind === 'layer') return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
    return y < 0.5 ? 'before' : 'after';
  };

  const renderRow = (row: LayerRow, index: number) => {
    const isLayer = row.kind === 'layer';
    const layer = row.layer;
    const node = row.node;
    const color = layer?.color ?? (locateNode(space, row.id)?.layer.color ?? '#888');
    const visible = isLayer ? layer?.visible : node?.visible;
    const locked = isLayer ? layer?.locked : node?.locked;
    const isSelected = selected.has(row.id);
    const insideSelected = isLayer && !!layer && layerContents(layer).some((id) => selected.has(id));
    const fill = node ? (node.appearance.items.find((i) => i.kind === 'fill') as { paint: Paint } | undefined)?.paint ?? null : null;
    const label = isLayer ? (layer?.name ?? '') : node ? nodeLabel(node) : '';
    return (
      <div
        key={row.id}
        role="treeitem"
        aria-selected={isSelected}
        data-testid="layer-row"
        data-row={row.id}
        data-kind={row.kind}
        className={cx('vc-layerrow', isSelected && 'is-selected', isLayer && row.id === active && 'is-active', drop?.id === row.id && `is-drop-${drop.position}`, (isLayer ? !layer?.visible : !node?.visible) && 'is-hidden')}
        style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
        draggable={renaming !== row.id}
        onDragStart={(event) => {
          const ids = row.kind === 'node' && selected.has(row.id) ? ctx.ids : [row.id];
          dragging.current = { kind: row.kind, ids };
          event.dataTransfer.setData(DRAG_TYPE, row.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          const position = positionAt(event, row);
          if (drop?.id !== row.id || drop.position !== position) setDrop({ id: row.id, position });
        }}
        onDragLeave={() => setDrop((d) => (d?.id === row.id ? null : d))}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(row, positionAt(event, row));
        }}
        onClick={(event) => selectRow(row, event.shiftKey || event.ctrlKey || event.metaKey)}
      >
        <span className="vc-layerrow__bar" style={{ background: color }} />
        <button type="button" className="vc-layerrow__btn" data-testid="layer-eye" aria-pressed={!!visible} {...tip(t('layers.toggleVisible'))} onClick={(e) => { e.stopPropagation(); toggleVisible(row, e); }}>
          <Icon id={visible ? 'visibility' : 'visibility-off'} size={14} />
        </button>
        <button type="button" className="vc-layerrow__btn" data-testid="layer-lock" aria-pressed={!!locked} {...tip(t('layers.toggleLock'))} onClick={(e) => { e.stopPropagation(); toggleLock(row); }}>
          <Icon id={locked ? 'lock' : 'lock-open'} size={14} />
        </button>
        <span className="vc-layerrow__indent" style={{ width: row.depth * 14 }} />
        {row.expandable ? (
          <button
            type="button"
            className="vc-layerrow__btn vc-layerrow__chevron"
            data-testid="layer-chevron"
            onClick={(e) => {
              e.stopPropagation();
              if (isLayer) setCollapsed((c) => toggleSet(c, row.id));
              else setExpanded((x) => toggleSet(x, row.id));
            }}
          >
            <Icon id={row.expanded ? 'chevron-down' : 'chevron-right'} size={12} />
          </button>
        ) : (
          <span className="vc-layerrow__chevron" />
        )}
        {isLayer ? <Icon id="layers" size={14} className="vc-layerrow__icon" /> : fill ? <PaintChip paint={fill} resources={ctx.resources} size={14} className="vc-layerrow__chip" /> : <Icon id={node ? nodeIcon(node) : 'shapes'} size={14} className="vc-layerrow__icon" />}
        {renaming === row.id ? (
          <input
            className="vc-layerrow__input"
            data-testid="layer-name-input"
            defaultValue={label}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commitName(row, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitName(row, e.currentTarget.value);
              else if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className="vc-layerrow__name" data-testid="layer-name" onDoubleClick={() => setRenaming(row.id)}>
            {label}
          </span>
        )}
        <button type="button" className={cx('vc-layerrow__btn vc-layerrow__target', (isSelected || insideSelected) && 'is-on')} data-testid="layer-target" {...tip(t('layers.target'))} onClick={(e) => { e.stopPropagation(); selectContents(row); }}>
          <span />
        </button>
        <span className="vc-layerrow__select" data-testid="layer-selected" style={{ background: isSelected || insideSelected ? color : 'transparent', borderColor: color }} />
      </div>
    );
  };

  return (
    <div className="vc-panelbody vc-layers" data-testid="layers-panel">
      <div
        ref={list}
        className="vc-layers__list"
        role="tree"
        data-testid="layers-list"
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      >
        <div style={{ position: 'relative', height: rows.length * ROW_HEIGHT }}>{rows.slice(first, last).map((row, i) => renderRow(row, first + i))}</div>
      </div>
      <div className="vc-layers__footer">
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="layers-new" {...tip(t('layers.new'))} onClick={() => newLayer(false)}>
          <Icon id="layer-new" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="layers-new-sub" {...tip(t('layers.newSub'))} onClick={() => newLayer(true)}>
          <Icon id="sublayer-new" size={16} />
        </button>
        <button
          type="button"
          className="vc-pbutton vc-pbutton--icon"
          data-testid="layers-clip"
          {...tip(hasClip ? t('layers.clipRelease') : t('layers.clipMake'))}
          disabled={!hasClip && ctx.ids.length < 2}
          onClick={() => (hasClip ? releaseClipSelection() : makeClipSelection())}
        >
          <Icon id="clip-mask" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="layers-locate" {...tip(t('layers.locate'))} disabled={selection.ids.length === 0} onClick={locate}>
          <Icon id="locate-object" size={16} />
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="layers-delete" {...tip(t('layers.delete'))} disabled={selection.ids.length === 0 && !active} onClick={() => void remove()}>
          <Icon id="delete" size={16} />
        </button>
      </div>
    </div>
  );
}
