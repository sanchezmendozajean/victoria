import { useState, type DragEvent } from 'react';
import {
  addPaintItem,
  copyAppearance,
  defaultAppearance,
  duplicateAppearanceItem,
  duplicateModifier,
  getModifier,
  locateNode,
  moveAppearanceItem,
  moveModifier,
  removeAppearanceItem,
  removeModifier,
  updateModifier,
  type AppearanceItem,
  type ModifierInstance,
  type ModifierTarget,
  type Node,
  type Resources,
} from '../../core';
import { applyModifiersToSelection, editModifier, modifierLabelKey, openModifier, selectionHasModifiers } from '../app/modifierActions';
import { MODIFIER_MENU } from '../app/modifierCatalog';
import { nodeIcon, nodeLabel } from '../app/nodeLabels';
import { Icon } from '../components/Icon';
import { MenuPopup, type MenuEntry } from '../components/Menu';
import { tip } from '../components/Tooltip';
import { cx } from '../components/cx';
import { t, type TranslationKey } from '../i18n';
import { PaintChip } from './kit';
import { usePanelContext } from './context';

/** The fx menu: every modifier of v1, by category, opening its dialog for the selection (on `target`). */
function fxEntries(target?: ModifierTarget): MenuEntry[] {
  return MODIFIER_MENU.map((category) => ({
    id: category.id,
    label: t(`menu.modifier.${category.id}` as TranslationKey),
    icon: category.icon,
    submenu: category.items.map((entry) => ({
      id: entry.id,
      label: t(entry.label),
      icon: entry.icon,
      kind: entry.kind,
      badge: entry.v2 ? 'v2' : undefined,
      disabled: entry.v2,
      ...(entry.v2 ? {} : { onSelect: () => openModifier(entry.id, target) }),
    })),
  }));
}

/** The fx button (Apariencia and Propiedades): opens the modifier menu under it. */
export function FxButton({ testId = 'appearance-fx', target }: { testId?: string; target?: ModifierTarget }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid={testId} {...tip(t('appearance.addFx'))} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <Icon id="fx" size={16} />
      </button>
      {anchor && <MenuPopup entries={fxEntries(target)} anchor={{ rect: anchor, placement: 'right' }} onClose={() => setAnchor(null)} />}
    </>
  );
}

const MODIFIER_DRAG = 'application/x-victoria-modifier';

/** What is selected in the list: a fill or stroke (by its position), a modifier (by id) or the "whole object" zone. */
type Pick = { kind: 'paint'; index: number } | { kind: 'modifier'; id: string; target: ModifierTarget; position: number } | { kind: 'object' } | null;

/**
 * Apariencia (specs/06): fills and strokes from top to bottom, the modifiers of each nested under it, then the
 * "Todo el objeto" zone with the modifiers that act on the object as a whole (fills and strokes together).
 * A modifier can be dragged from one zone to another to change what it acts on.
 */
export function AppearancePanel() {
  const ctx = usePanelContext();
  const [pick, setPick] = useState<Pick>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  if (ctx.ids.length === 0) return <div className="vc-pempty">{t('appearance.noSelection')}</div>;
  const node: Node | undefined = ctx.ids.length === 1 ? locateNode(ctx.space, ctx.ids[0] as string)?.node : undefined;
  const run = (command: Parameters<typeof ctx.session.run>[0]) => ctx.session.run(command);
  const spaceId = ctx.space.id;

  /** Where the fx button adds: to the selected fill or stroke, to the zone of the selected modifier, else to the whole object. */
  const fxTarget: ModifierTarget | undefined = pick?.kind === 'paint' ? { zone: 'item', index: pick.index } : pick?.kind === 'modifier' ? pick.target : undefined;

  const duplicateSelected = () => {
    if (!node || !pick) return;
    if (pick.kind === 'modifier') run(duplicateModifier(spaceId, node.id, pick.id, ctx!.session.ids()));
    else if (pick.kind === 'paint') run(duplicateAppearanceItem(spaceId, node.id, pick.index));
  };
  const deleteSelected = () => {
    if (!node || !pick) return;
    if (pick.kind === 'modifier') run(removeModifier(spaceId, node.id, pick.id));
    else if (pick.kind === 'paint') run(removeAppearanceItem(spaceId, node.id, pick.index));
    setPick(null);
  };

  const toolbar = (
    <div className="vc-appearance__toolbar">
      <FxButton target={fxTarget} />
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-add-stroke" {...tip(t('appearance.addStroke'))} onClick={() => run(addPaintItem(spaceId, ctx.ids, 'stroke', { type: 'solid', color: { model: 'rgb', values: [0, 0, 0] } }))}>
        <Icon id="add-stroke" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-add-fill" {...tip(t('appearance.addFill'))} onClick={() => run(addPaintItem(spaceId, ctx.ids, 'fill', { type: 'solid', color: { model: 'rgb', values: [255, 255, 255] } }))}>
        <Icon id="add-fill" size={16} />
      </button>
      <span style={{ flex: 1 }} />
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-apply" {...tip(t('appearance.apply'))} disabled={!selectionHasModifiers()} onClick={() => applyModifiersToSelection()}>
        <Icon id="mod-apply" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-clear" {...tip(t('appearance.clear'))} onClick={() => run(copyAppearance(spaceId, ctx.ids, defaultAppearance()))}>
        <Icon id="clear-appearance" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-duplicate" {...tip(t('appearance.duplicate'))} disabled={!node || !pick || pick.kind === 'object'} onClick={() => duplicateSelected()}>
        <Icon id="duplicate-item" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-delete" {...tip(t('appearance.delete'))} disabled={!node || !pick || pick.kind === 'object'} onClick={() => deleteSelected()}>
        <Icon id="delete-item" size={16} />
      </button>
    </div>
  );

  if (!node) {
    return (
      <div className="vc-panelbody vc-appearance" data-testid="appearance-panel">
        <p className="vc-phint">{t('appearance.manySelected')}</p>
        <span style={{ flex: 1 }} />
        {toolbar}
      </div>
    );
  }

  const items = node.appearance.items;
  const paint = items.map((item, index) => ({ item, index })).filter((x): x is { item: Extract<AppearanceItem, { kind: 'fill' | 'stroke' }>; index: number } => x.item.kind !== 'modifier');
  const objectMods = items.flatMap((i) => (i.kind === 'modifier' ? [i.mod] : []));

  // Dropping a modifier moves it to a zone, before `position` (at the end when omitted).
  const dropOn = (target: ModifierTarget, position?: number) => (event: DragEvent) => {
    const id = event.dataTransfer.getData(MODIFIER_DRAG);
    setOver(null);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    run(moveModifier(spaceId, node.id, id, target, position));
  };
  const hover = (key: string) => (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(MODIFIER_DRAG)) return;
    event.preventDefault();
    setOver(key);
  };

  const modifierRow = (mod: ModifierInstance, target: ModifierTarget, position: number, count: number, nested: boolean) => {
    const def = getModifier(mod.modifierId);
    const key = modifierLabelKey(mod.modifierId);
    const selected = pick?.kind === 'modifier' && pick.id === mod.id;
    return (
      <div
        key={mod.id}
        className={cx('vc-appearance__row', nested && 'vc-appearance__row--nested', selected && 'is-selected', !mod.enabled && 'is-off', over === `m:${mod.id}` && 'is-over')}
        role="listitem"
        data-testid="appearance-row"
        data-kind="modifier"
        data-zone={target.zone}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(MODIFIER_DRAG, mod.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={hover(`m:${mod.id}`)}
        onDragLeave={() => setOver(null)}
        onDrop={dropOn(target, position)}
        onClick={() => setPick({ kind: 'modifier', id: mod.id, target, position })}
        onDoubleClick={() => editModifier(node.id, mod.id, mod.modifierId)}
      >
        <button type="button" className="vc-layerrow__btn" data-testid="appearance-eye" aria-pressed={mod.enabled} {...tip(t('appearance.toggle'))} onClick={(e) => { e.stopPropagation(); run(updateModifier(spaceId, node.id, mod.id, { enabled: !mod.enabled })); }}>
          <Icon id={mod.enabled ? 'visibility' : 'visibility-off'} size={14} />
        </button>
        <Icon id={def?.affectsGeometry === false ? 'mod-appearance' : 'mod-structural'} size={14} className="vc-field__icon" />
        <span className="vc-appearance__name" data-testid="appearance-name">{(key ? t(key) : mod.modifierId).replace(/…$/, '')}</span>
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.edit')} {...tip(t('appearance.edit'))} onClick={(e) => { e.stopPropagation(); editModifier(node.id, mod.id, mod.modifierId); }}>
          <Icon id="fx" size={12} />
        </button>
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.up')} disabled={position <= 0} onClick={(e) => { e.stopPropagation(); run(moveModifier(spaceId, node.id, mod.id, target, position - 1)); }}>
          <Icon id="chevron-up" size={12} />
        </button>
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.down')} disabled={position >= count - 1} onClick={(e) => { e.stopPropagation(); run(moveModifier(spaceId, node.id, mod.id, target, position + 2)); }}>
          <Icon id="chevron-down" size={12} />
        </button>
      </div>
    );
  };

  const paintRow = (item: Extract<AppearanceItem, { kind: 'fill' | 'stroke' }>, index: number) => {
    // The paint order: up = painted later, so it swaps places with the next fill or stroke of the list.
    const later = paint.find((p) => p.index > index);
    const earlier = [...paint].reverse().find((p) => p.index < index);
    const selected = pick?.kind === 'paint' && pick.index === index;
    return (
      <div
        key={`paint${index}`}
        className={cx('vc-appearance__row', selected && 'is-selected', over === `p:${index}` && 'is-over')}
        role="listitem"
        data-testid="appearance-row"
        data-kind={item.kind}
        onDragOver={hover(`p:${index}`)}
        onDragLeave={() => setOver(null)}
        onDrop={dropOn({ zone: 'item', index })}
        onClick={() => setPick({ kind: 'paint', index })}
      >
        <span className="vc-layerrow__btn" style={{ visibility: 'hidden' }} />
        <Icon id={item.kind === 'fill' ? 'fill' : 'stroke'} size={14} className="vc-field__icon" />
        <span className="vc-appearance__name">{item.kind === 'fill' ? t('appearance.fill') : t('appearance.stroke')}</span>
        <PaintChip paint={item.paint} resources={ctx.resources as Resources} size={14} />
        {item.kind === 'stroke' && <span className="vc-appearance__value">{Math.round(item.stroke.width * 100) / 100} pt</span>}
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.up')} disabled={!later} onClick={(e) => { e.stopPropagation(); if (later) { run(moveAppearanceItem(spaceId, node.id, index, later.index)); setPick({ kind: 'paint', index: later.index }); } }}>
          <Icon id="chevron-up" size={12} />
        </button>
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.down')} disabled={!earlier} onClick={(e) => { e.stopPropagation(); if (earlier) { run(moveAppearanceItem(spaceId, node.id, index, earlier.index)); setPick({ kind: 'paint', index: earlier.index }); } }}>
          <Icon id="chevron-down" size={12} />
        </button>
      </div>
    );
  };

  return (
    <div className="vc-panelbody vc-appearance" data-testid="appearance-panel">
      <div className="vc-propheader">
        <Icon id={nodeIcon(node)} size={16} />
        <span data-testid="appearance-title">{nodeLabel(node)}</span>
      </div>
      <div className="vc-appearance__list" role="list">
        {/* Top of the list = painted last, as in Illustrator; each fill or stroke carries its own modifiers. */}
        {[...paint].reverse().map(({ item, index }) => (
          <div key={`group${index}`}>
            {paintRow(item, index)}
            {(item.modifiers as ModifierInstance[]).map((mod, position, all) => modifierRow(mod, { zone: 'item', index }, position, all.length, true))}
          </div>
        ))}
        <div
          className={cx('vc-appearance__zone', pick?.kind === 'object' && 'is-selected', over === 'object' && 'is-over')}
          data-testid="appearance-zone"
          {...tip(t('appearance.wholeObjectTip'))}
          onClick={() => setPick({ kind: 'object' })}
          onDragOver={hover('object')}
          onDragLeave={() => setOver(null)}
          onDrop={dropOn({ zone: 'object' })}
        >
          <Icon id={nodeIcon(node)} size={14} className="vc-field__icon" />
          <span className="vc-appearance__name">{t('appearance.wholeObject')}</span>
        </div>
        {objectMods.map((mod, position) => modifierRow(mod, { zone: 'object' }, position, objectMods.length, false))}
        <div className="vc-appearance__rest" onDragOver={hover('rest')} onDrop={dropOn({ zone: 'object' })} />
      </div>
      {toolbar}
    </div>
  );
}
