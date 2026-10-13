import { useEffect, useRef, useState } from 'react';
import { SPACE_COLORS, type Space } from '../../core';
import { Icon } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { cx } from '../components/cx';
import { tip } from '../components/Tooltip';
import { displayName } from '../documents/manager';
import { useDocuments } from '../documents';
import {
  createNewSpace,
  deleteSpaceOf,
  duplicateSpaceOf,
  recolorSpace,
  renameSpaceOf,
  toggleSpaceExcluded,
} from '../documents/spaceActions';
import { t, type TranslationKey } from '../i18n';
import { formatAccelerator, SHORTCUTS } from './shortcuts';
import { useUi } from './store';
import './DocBar.css';

const COLOR_NAMES: readonly TranslationKey[] = [
  'color.blue',
  'color.green',
  'color.amber',
  'color.red',
  'color.violet',
  'color.turquoise',
  'color.orange',
  'color.gray',
];

interface OpenSpaceMenu {
  spaceId: string;
  anchor: Anchor;
}

export function DocBar() {
  const os = useUi((s) => s.platform.os);
  const openPanel = useUi((s) => s.openPanel);
  const documents = useDocuments();
  const [menu, setMenu] = useState<OpenSpaceMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const active = documents.active;
  if (!active) return null;
  const session = active.session;
  const doc = session.document;

  const showMenu = (spaceId: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ spaceId, anchor: { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement: 'below' } });
  };

  const entriesFor = (space: Space): MenuEntry[] => [
    { id: 'rename', label: t('space.rename'), icon: 'space-rename', shortcut: t('space.renameHint'), onSelect: () => setRenaming(space.id) },
    {
      id: 'color',
      label: t('space.color'),
      icon: 'space-color',
      submenu: SPACE_COLORS.map((hex, i) => ({
        id: hex,
        label: t(COLOR_NAMES[i] as TranslationKey),
        icon: 'space-color',
        checked: hex === space.color,
        onSelect: () => recolorSpace(session, space.id, hex),
      })),
    },
    { id: 'duplicate', label: t('space.duplicate'), icon: 'space-duplicate', onSelect: () => duplicateSpaceOf(session, space.id) },
    {
      id: 'exclude',
      label: t('space.excludeExport'),
      icon: 'space-exclude-export',
      checked: space.excludeFromExport,
      onSelect: () => toggleSpaceExcluded(session, space.id),
    },
    // Needs a selection to move; arrives with the selection tools (Phase 4) and Phase 10.
    { id: 'move-here', label: t('space.moveHere'), icon: 'space-move-to', disabled: true },
    { id: 'properties', label: t('space.properties'), icon: 'space-properties', disabled: true },
    { type: 'separator', id: 'sep' },
    {
      id: 'delete',
      label: t('space.delete'),
      icon: 'space-delete',
      danger: true,
      disabled: doc.spaces.length <= 1,
      onSelect: () => void deleteSpaceOf(session, space.id),
    },
  ];

  const step = (delta: number) => {
    const index = doc.spaces.findIndex((s) => s.id === doc.activeSpaceId);
    const next = doc.spaces[(index + delta + doc.spaces.length) % doc.spaces.length];
    if (next) session.setActiveSpace(next.id);
  };

  const menuSpace = menu ? doc.spaces.find((s) => s.id === menu.spaceId) : undefined;

  return (
    <div className="vc-docbar" data-testid="doc-bar">
      <div className="vc-doctabs" role="tablist" data-testid="doc-tabs">
        {documents.documents.map((d) => {
          const isActive = d.id === active.id;
          const dirty = d.session.dirty;
          return (
            <div
              key={d.id}
              role="tab"
              aria-selected={isActive}
              className={cx('vc-doctab', isActive && 'is-active')}
              onClick={() => documents.activate(d.id)}
              onAuxClick={(event) => event.button === 1 && void documents.close(d.id)}
            >
              <Icon id="file" size={14} />
              <span className="vc-doctab__name">{displayName(d)}</span>
              {dirty && <span className="vc-doctab__dirty" data-testid="doc-dirty" {...tip(t('doc.unsaved'))} />}
              <button
                type="button"
                className="vc-doctab__close"
                data-testid="doc-close"
                {...tip(t('doc.close'), formatAccelerator(SHORTCUTS['file.close'], os))}
                onClick={(event) => {
                  event.stopPropagation();
                  void documents.close(d.id);
                }}
              >
                <Icon id="close" size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="vc-doctabs__new"
          data-testid="doc-new"
          {...tip(t('doc.new'), formatAccelerator(SHORTCUTS['file.new'], os))}
          onClick={() => documents.newDocument()}
        >
          <Icon id="plus" size={14} />
        </button>
      </div>

      <div className="vc-spacesbar" data-testid="spaces-bar">
        <span className="vc-spacesbar__icon" {...tip(t('spaces.bar'))}>
          <Icon id="spaces" size={14} />
        </span>
        {doc.spaces.map((space) => {
          const isActive = space.id === doc.activeSpaceId;
          const count = space.artboards.length;
          const label = t('spaces.pillTip', {
            name: space.name,
            count,
            artboards: t(count === 1 ? 'spaces.artboardOne' : 'spaces.artboardMany'),
          });
          return (
            <div
              key={space.id}
              role="tab"
              aria-selected={isActive}
              className={cx('vc-spacetab', isActive && 'is-active')}
              style={{ ['--space' as string]: space.color }}
              data-testid="space-tab"
              {...(renaming === space.id ? {} : tip(space.excludeFromExport ? `${label} · ${t('space.excludedTip')}` : label))}
              onClick={() => session.setActiveSpace(space.id)}
              onDoubleClick={() => setRenaming(space.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                showMenu(space.id, event.currentTarget);
              }}
            >
              <span className="vc-spacetab__dot" />
              {renaming === space.id ? (
                <RenameField
                  initial={space.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name !== null) renameSpaceOf(session, space.id, name);
                  }}
                />
              ) : (
                <span className="vc-spacetab__name">{space.name}</span>
              )}
              {space.excludeFromExport && <Icon id="space-exclude-export" size={12} className="vc-spacetab__excluded" />}
              <button
                type="button"
                className="vc-spacetab__more"
                {...tip(t('space.options'))}
                onClick={(event) => {
                  event.stopPropagation();
                  showMenu(space.id, event.currentTarget.parentElement ?? event.currentTarget);
                }}
              >
                <Icon id="more" size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="vc-spacesbar__add"
          data-testid="space-add"
          {...tip(t('space.new'), formatAccelerator(SHORTCUTS['space.new'], os))}
          onClick={() => createNewSpace(session)}
        >
          <Icon id="space-add" size={16} />
        </button>
        <div className="vc-spacesbar__spacer" />
        <div
          className="vc-spacesbar__nav"
          {...tip(t('spaces.prevNext'), `${formatAccelerator(SHORTCUTS['space.previous'], os)} / ${formatAccelerator(SHORTCUTS['space.next'], os)}`)}
        >
          <button type="button" onClick={() => step(-1)} aria-label={t('spaces.previous')}>
            <Icon id="chevron-left" size={14} />
          </button>
          <button type="button" onClick={() => step(1)} aria-label={t('spaces.next')}>
            <Icon id="chevron-right" size={14} />
          </button>
        </div>
        <button type="button" className="vc-spacesbar__panel" {...tip(t('spaces.panel'))} onClick={() => openPanel('spaces')}>
          <Icon id="spaces" size={16} />
          <span>{t(doc.spaces.length === 1 ? 'spaces.countOne' : 'spaces.count', { count: doc.spaces.length })}</span>
        </button>
      </div>

      {menu && menuSpace && <MenuPopup entries={entriesFor(menuSpace)} anchor={menu.anchor} onClose={() => setMenu(null)} minWidth={236} />}
    </div>
  );
}

/** Inline name editor: Enter commits, Escape or blur-with-no-change cancels. */
function RenameField({ initial, onDone }: { initial: string; onDone(name: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };

  return (
    <input
      ref={ref}
      className="vc-spacetab__input"
      data-testid="space-rename"
      value={value}
      size={Math.max(4, value.length)}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(value);
        else if (event.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value)}
    />
  );
}

