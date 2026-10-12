import { useState } from 'react';
import { Icon } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { cx } from '../components/cx';
import { tip } from '../components/Tooltip';
import { t, type TranslationKey } from '../i18n';
import { PLACEHOLDER_DOCUMENTS, type PlaceholderSpace } from './placeholder';
import { formatAccelerator, SHORTCUTS } from './shortcuts';
import { useUi } from './store';
import './DocBar.css';

const SPACE_COLORS: readonly { name: TranslationKey; token: string }[] = [
  { name: 'color.blue', token: 'var(--space-1)' },
  { name: 'color.green', token: 'var(--space-2)' },
  { name: 'color.amber', token: 'var(--space-3)' },
  { name: 'color.red', token: 'var(--space-4)' },
  { name: 'color.violet', token: 'var(--space-5)' },
  { name: 'color.turquoise', token: 'var(--space-6)' },
  { name: 'color.orange', token: 'var(--space-7)' },
  { name: 'color.gray', token: 'var(--space-8)' },
];

interface OpenSpaceMenu {
  index: number;
  anchor: Anchor;
}

function spaceMenu(space: PlaceholderSpace): MenuEntry[] {
  return [
    { id: 'rename', label: t('space.rename'), icon: 'space-rename', shortcut: t('space.renameHint') },
    {
      id: 'color',
      label: t('space.color'),
      icon: 'space-color',
      submenu: SPACE_COLORS.map((c) => ({ id: c.token, label: t(c.name), icon: 'space-color', checked: c.token === space.color })),
    },
    { id: 'duplicate', label: t('space.duplicate'), icon: 'space-duplicate' },
    { id: 'exclude', label: t('space.excludeExport'), icon: 'space-exclude-export', checked: !!space.excludedFromExport },
    { id: 'move-here', label: t('space.moveHere'), icon: 'space-move-to' },
    { id: 'properties', label: t('space.properties'), icon: 'space-properties' },
    { type: 'separator', id: 'sep' },
    { id: 'delete', label: t('space.delete'), icon: 'space-delete', danger: true },
  ];
}

export function DocBar() {
  const os = useUi((s) => s.platform.os);
  const activeDocument = useUi((s) => s.activeDocument);
  const activeSpace = useUi((s) => s.activeSpace);
  const setActiveDocument = useUi((s) => s.setActiveDocument);
  const setActiveSpace = useUi((s) => s.setActiveSpace);
  const openPanel = useUi((s) => s.openPanel);
  const [menu, setMenu] = useState<OpenSpaceMenu | null>(null);

  const doc = PLACEHOLDER_DOCUMENTS[activeDocument] ?? PLACEHOLDER_DOCUMENTS[0];
  if (!doc) return null;

  const showMenu = (index: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ index, anchor: { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement: 'below' } });
  };

  const step = (delta: number) => setActiveSpace((activeSpace + delta + doc.spaces.length) % doc.spaces.length);

  return (
    <div className="vc-docbar" data-testid="doc-bar">
      <div className="vc-doctabs" role="tablist" data-testid="doc-tabs">
        {PLACEHOLDER_DOCUMENTS.map((d, index) => {
          const active = index === activeDocument;
          return (
            <div
              key={d.id}
              role="tab"
              aria-selected={active}
              className={cx('vc-doctab', active && 'is-active')}
              onClick={() => setActiveDocument(index)}
            >
              <Icon id="file" size={14} />
              <span className="vc-doctab__name">{d.name}</span>
              {d.dirty && <span className="vc-doctab__dirty" {...tip(t('doc.unsaved'))} />}
              {active && (
                <button type="button" className="vc-doctab__close" {...tip(t('doc.close'), formatAccelerator(SHORTCUTS['file.close'], os))}>
                  <Icon id="close" size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="vc-doctabs__new" {...tip(t('doc.new'), formatAccelerator(SHORTCUTS['file.new'], os))}>
          <Icon id="plus" size={14} />
        </button>
      </div>

      <div className="vc-spacesbar" data-testid="spaces-bar">
        <span className="vc-spacesbar__icon" {...tip(t('spaces.bar'))}>
          <Icon id="spaces" size={14} />
        </span>
        {doc.spaces.map((space, index) => {
          const active = index === activeSpace;
          const label = t('spaces.pillTip', {
            name: space.name,
            count: space.artboards,
            artboards: t(space.artboards === 1 ? 'spaces.artboardOne' : 'spaces.artboardMany'),
          });
          return (
            <div
              key={space.id}
              role="tab"
              aria-selected={active}
              className={cx('vc-spacetab', active && 'is-active')}
              style={{ ['--space' as string]: space.color }}
              data-testid="space-tab"
              {...tip(space.excludedFromExport ? `${label} · ${t('space.excludedTip')}` : label)}
              onClick={() => setActiveSpace(index)}
              onContextMenu={(event) => {
                event.preventDefault();
                showMenu(index, event.currentTarget);
              }}
            >
              <span className="vc-spacetab__dot" />
              <span className="vc-spacetab__name">{space.name}</span>
              {space.excludedFromExport && <Icon id="space-exclude-export" size={12} className="vc-spacetab__excluded" />}
              <button
                type="button"
                className="vc-spacetab__more"
                {...tip(t('space.options'))}
                onClick={(event) => {
                  event.stopPropagation();
                  showMenu(index, event.currentTarget.parentElement ?? event.currentTarget);
                }}
              >
                <Icon id="more" size={14} />
              </button>
            </div>
          );
        })}
        <button type="button" className="vc-spacesbar__add" {...tip(t('space.new'), formatAccelerator(SHORTCUTS['space.new'], os))}>
          <Icon id="space-add" size={16} />
        </button>
        <div className="vc-spacesbar__spacer" />
        <div className="vc-spacesbar__nav" {...tip(t('spaces.prevNext'), `${formatAccelerator(SHORTCUTS['space.previous'], os)} / ${formatAccelerator(SHORTCUTS['space.next'], os)}`)}>
          <button type="button" onClick={() => step(-1)} aria-label={t('spaces.previous')}>
            <Icon id="chevron-left" size={14} />
          </button>
          <button type="button" onClick={() => step(1)} aria-label={t('spaces.next')}>
            <Icon id="chevron-right" size={14} />
          </button>
        </div>
        <button type="button" className="vc-spacesbar__panel" {...tip(t('spaces.panel'))} onClick={() => openPanel('spaces')}>
          <Icon id="spaces" size={16} />
          <span>{t('spaces.count', { count: doc.spaces.length })}</span>
        </button>
      </div>

      {menu && doc.spaces[menu.index] && (
        <MenuPopup entries={spaceMenu(doc.spaces[menu.index] as PlaceholderSpace)} anchor={menu.anchor} onClose={() => setMenu(null)} minWidth={236} />
      )}
    </div>
  );
}
