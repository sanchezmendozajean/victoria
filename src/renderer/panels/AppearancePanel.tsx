import { useState } from 'react';
import {
  addPaintItem,
  copyAppearance,
  defaultAppearance,
  duplicateAppearanceItem,
  duplicateModifier,
  getModifier,
  locateNode,
  moveAppearanceItem,
  removeAppearanceItem,
  updateModifier,
  type AppearanceItem,
  type Node,
} from '../../core';
import { editModifier, modifierLabelKey, openModifier, selectionHasModifiers, applyModifiersToSelection } from '../app/modifierActions';
import { MODIFIER_MENU } from '../app/modifierCatalog';
import { nodeIcon, nodeLabel } from '../app/nodeLabels';
import { Icon } from '../components/Icon';
import { MenuPopup, type MenuEntry } from '../components/Menu';
import { tip } from '../components/Tooltip';
import { cx } from '../components/cx';
import { t, type TranslationKey } from '../i18n';
import { PaintChip } from './kit';
import { usePanelContext } from './context';

/** The fx menu: every modifier of v1, by category, opening its dialog for the selection. */
function fxEntries(): MenuEntry[] {
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
      ...(entry.v2 ? {} : { onSelect: () => openModifier(entry.id) }),
    })),
  }));
}

/** The fx button (Apariencia and Propiedades): opens the modifier menu under it. */
export function FxButton({ testId = 'appearance-fx' }: { testId?: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid={testId} {...tip(t('appearance.addFx'))} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <Icon id="fx" size={16} />
      </button>
      {anchor && <MenuPopup entries={fxEntries()} anchor={{ rect: anchor, placement: 'right' }} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** Apariencia (specs/06): the list of fills, strokes and modifiers of the selected object, top to bottom. */
export function AppearancePanel() {
  const ctx = usePanelContext();
  const [selected, setSelected] = useState<number | null>(null);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  if (ctx.ids.length === 0) return <div className="vc-pempty">{t('appearance.noSelection')}</div>;
  const node: Node | undefined = ctx.ids.length === 1 ? locateNode(ctx.space, ctx.ids[0] as string)?.node : undefined;
  const run = (command: Parameters<typeof ctx.session.run>[0]) => ctx.session.run(command);
  const spaceId = ctx.space.id;

  const toolbar = (disabled: boolean) => (
    <div className="vc-appearance__toolbar">
      <FxButton />
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-add-stroke" {...tip(t('appearance.addStroke'))} disabled={disabled} onClick={() => run(addPaintItem(spaceId, ctx.ids, 'stroke', { type: 'solid', color: { model: 'rgb', values: [0, 0, 0] } }))}>
        <Icon id="add-stroke" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-add-fill" {...tip(t('appearance.addFill'))} disabled={disabled} onClick={() => run(addPaintItem(spaceId, ctx.ids, 'fill', { type: 'solid', color: { model: 'rgb', values: [255, 255, 255] } }))}>
        <Icon id="add-fill" size={16} />
      </button>
      <span style={{ flex: 1 }} />
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-apply" {...tip(t('appearance.apply'))} disabled={!selectionHasModifiers()} onClick={() => applyModifiersToSelection()}>
        <Icon id="mod-apply" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-clear" {...tip(t('appearance.clear'))} onClick={() => run(copyAppearance(spaceId, ctx.ids, defaultAppearance()))}>
        <Icon id="clear-appearance" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-duplicate" {...tip(t('appearance.duplicate'))} disabled={!node || selected === null} onClick={() => duplicateSelected()}>
        <Icon id="duplicate-item" size={16} />
      </button>
      <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="appearance-delete" {...tip(t('appearance.delete'))} disabled={!node || selected === null} onClick={() => deleteSelected()}>
        <Icon id="delete-item" size={16} />
      </button>
    </div>
  );

  function duplicateSelected() {
    if (!node || selected === null) return;
    const item = node.appearance.items[selected];
    if (!item) return;
    if (item.kind === 'modifier') run(duplicateModifier(spaceId, node.id, item.mod.id, ctx!.session.ids()));
    else run(duplicateAppearanceItem(spaceId, node.id, selected));
  }
  function deleteSelected() {
    if (!node || selected === null) return;
    run(removeAppearanceItem(spaceId, node.id, selected));
    setSelected(null);
  }

  if (!node) {
    return (
      <div className="vc-panelbody" data-testid="appearance-panel">
        <p className="vc-phint">{t('appearance.manySelected')}</p>
        {toolbar(false)}
      </div>
    );
  }

  const items = node.appearance.items;
  const move = (index: number, to: number) => {
    run(moveAppearanceItem(spaceId, node.id, index, to));
    setSelected(to);
  };

  return (
    <div className="vc-panelbody vc-appearance" data-testid="appearance-panel">
      <div className="vc-propheader">
        <Icon id={nodeIcon(node)} size={16} />
        <span data-testid="appearance-title">{nodeLabel(node)}</span>
      </div>
      <div className="vc-appearance__list" role="list">
        {/* Top of the list = painted last, as in Illustrator. */}
        {items
          .map((item, index) => ({ item, index }))
          .reverse()
          .map(({ item, index }) => (
            <AppearanceRow
              key={item.kind === 'modifier' ? item.mod.id : `${item.kind}${index}`}
              item={item}
              index={index}
              count={items.length}
              selected={selected === index}
              onSelect={() => setSelected(index)}
              onMove={move}
              resources={ctx.resources}
              onToggle={(modId, enabled) => run(updateModifier(spaceId, node.id, modId, { enabled }))}
              onEdit={(modId, modifierId) => editModifier(node.id, modId, modifierId)}
            />
          ))}
      </div>
      {toolbar(false)}
    </div>
  );
}

interface RowProps {
  item: AppearanceItem;
  index: number;
  count: number;
  selected: boolean;
  onSelect(): void;
  onMove(index: number, to: number): void;
  resources: ReturnType<typeof usePanelContext> extends infer C ? (C extends { resources: infer R } ? R : never) : never;
  onToggle(modId: string, enabled: boolean): void;
  onEdit(modId: string, modifierId: string): void;
}

function AppearanceRow({ item, index, count, selected, onSelect, onMove, resources, onToggle, onEdit }: RowProps) {
  const arrows = (
    <>
      <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.up')} disabled={index >= count - 1} onClick={(e) => { e.stopPropagation(); onMove(index, index + 1); }}>
        <Icon id="chevron-up" size={12} />
      </button>
      <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.down')} disabled={index <= 0} onClick={(e) => { e.stopPropagation(); onMove(index, index - 1); }}>
        <Icon id="chevron-down" size={12} />
      </button>
    </>
  );
  if (item.kind === 'modifier') {
    const def = getModifier(item.mod.modifierId);
    const key = modifierLabelKey(item.mod.modifierId);
    return (
      <div className={cx('vc-appearance__row', selected && 'is-selected', !item.mod.enabled && 'is-off')} role="listitem" data-testid="appearance-row" data-kind="modifier" onClick={onSelect} onDoubleClick={() => onEdit(item.mod.id, item.mod.modifierId)}>
        <button type="button" className="vc-layerrow__btn" data-testid="appearance-eye" aria-pressed={item.mod.enabled} {...tip(t('appearance.toggle'))} onClick={(e) => { e.stopPropagation(); onToggle(item.mod.id, !item.mod.enabled); }}>
          <Icon id={item.mod.enabled ? 'visibility' : 'visibility-off'} size={14} />
        </button>
        <Icon id={def?.affectsGeometry === false ? 'mod-appearance' : 'mod-structural'} size={14} className="vc-field__icon" />
        <span className="vc-appearance__name" data-testid="appearance-name">{(key ? t(key) : item.mod.modifierId).replace(/…$/, '')}</span>
        <button type="button" className="vc-layerrow__btn" aria-label={t('appearance.edit')} {...tip(t('appearance.edit'))} onClick={(e) => { e.stopPropagation(); onEdit(item.mod.id, item.mod.modifierId); }}>
          <Icon id="fx" size={12} />
        </button>
        {arrows}
      </div>
    );
  }
  return (
    <div className={cx('vc-appearance__row', selected && 'is-selected')} role="listitem" data-testid="appearance-row" data-kind={item.kind} onClick={onSelect}>
      <span className="vc-layerrow__btn" style={{ visibility: 'hidden' }} />
      <Icon id={item.kind === 'fill' ? 'fill' : 'stroke'} size={14} className="vc-field__icon" />
      <span className="vc-appearance__name">{item.kind === 'fill' ? t('appearance.fill') : t('appearance.stroke')}</span>
      <PaintChip paint={item.paint} resources={resources} size={14} />
      {item.kind === 'stroke' && <span className="vc-appearance__value">{Math.round(item.stroke.width * 100) / 100} pt</span>}
      {arrows}
    </div>
  );
}
