import { useState } from 'react';
import { getActiveSpace, MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS } from '../../core';
import { canvasApi } from '../canvas/api';
import { formatLength } from '../canvas/units';
import { Icon } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { formatAccelerator, SHORTCUTS } from './shortcuts';
import { useUi } from './store';
import './StatusBar.css';

const percent = (zoom: number) => `${Math.round(zoom * 10000) / 100}%`.replace('.', ',');

function anchorOf(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  // Opens upwards would be nicer; `below` flips automatically when there is no room under the bar.
  return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement: 'below' };
}

export function StatusBar() {
  const activeTool = useUi((s) => s.activeTool);
  const os = useUi((s) => s.platform.os);
  const zoom = useUi((s) => s.zoom);
  const cursor = useUi((s) => s.cursor);
  const activeArtboard = useUi((s) => s.activeArtboard);
  const setActiveArtboard = useUi((s) => s.setActiveArtboard);
  const documents = useDocuments();
  const session = documents.active?.session;
  const space = session ? getActiveSpace(session.document) : null;
  const units = session?.document.meta.units ?? 'mm';

  const artboards = space?.artboards ?? [];
  const activeId = space ? (activeArtboard[space.id] ?? artboards[0]?.id) : undefined;
  const artboardIndex = Math.max(0, artboards.findIndex((a) => a.id === activeId));
  const artboard = artboards[artboardIndex];

  const [menu, setMenu] = useState<{ entries: MenuEntry[]; anchor: Anchor } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const goToArtboard = (index: number) => {
    if (!space || artboards.length === 0) return;
    const target = artboards[(index + artboards.length) % artboards.length];
    if (!target) return;
    setActiveArtboard(space.id, target.id);
    canvasApi.current?.fitArtboardById(target.id);
  };

  const commitZoom = (text: string) => {
    const value = Number.parseFloat(text.replace('%', '').replace(',', '.'));
    setEditing(null);
    if (Number.isFinite(value) && value > 0) canvasApi.current?.zoomTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value / 100)));
  };

  const openZoomMenu = (el: HTMLElement) => {
    const entries: MenuEntry[] = [
      { id: 'fit-artboard', label: t('menu.view.fitArtboard'), icon: 'fit-artboard', shortcut: formatAccelerator(SHORTCUTS['view.fitArtboard'], os), onSelect: () => canvasApi.current?.fitArtboard() },
      { id: 'fit-all', label: t('menu.view.fitAll'), icon: 'fit-all', shortcut: formatAccelerator(SHORTCUTS['view.fitAll'], os), onSelect: () => canvasApi.current?.fitAll() },
      { type: 'separator', id: 'sep' },
      ...[...ZOOM_STEPS].reverse().map((step) => ({
        id: `z-${step}`,
        label: percent(step),
        icon: 'zoom-in' as const,
        checked: Math.abs(step - zoom) < 1e-4,
        onSelect: () => canvasApi.current?.zoomTo(step),
      })),
    ];
    setMenu({ entries, anchor: anchorOf(el) });
  };

  const openArtboardMenu = (el: HTMLElement) => {
    const entries: MenuEntry[] = artboards.map((a, i) => ({
      id: a.id,
      label: a.name,
      icon: 'tool-artboard' as const,
      checked: i === artboardIndex,
      onSelect: () => goToArtboard(i),
    }));
    setMenu({ entries, anchor: anchorOf(el) });
  };

  return (
    <footer className="vc-statusbar" data-testid="status-bar">
      <div className="vc-statusbar__cell" {...tip(t('status.zoom'))}>
        <Icon id="zoom-in" size={14} className="vc-statusbar__icon" />
        <input
          className="vc-statusbar__input vc-statusbar__input--edit"
          data-testid="zoom-field"
          value={editing ?? percent(zoom)}
          aria-label={t('status.zoom')}
          onFocus={(event) => {
            setEditing(percent(zoom));
            event.currentTarget.select();
          }}
          onChange={(event) => setEditing(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') commitZoom(editing ?? '');
            if (event.key === 'Escape') {
              setEditing(null);
              event.currentTarget.blur();
            }
          }}
          onBlur={() => setEditing(null)}
        />
        <button type="button" className="vc-statusbar__step" data-testid="zoom-menu" aria-label={t('status.zoomMenu')} onClick={(event) => openZoomMenu(event.currentTarget)}>
          <Icon id="chevron-down" size={10} />
        </button>
      </div>
      <div className="vc-statusbar__cell" {...tip(t('status.artboardNav'))}>
        <button type="button" className="vc-statusbar__step" data-testid="artboard-prev" aria-label={t('status.artboardPrev')} onClick={() => goToArtboard(artboardIndex - 1)}>
          <Icon id="chevron-left" size={12} />
        </button>
        <button type="button" className="vc-statusbar__select" data-testid="status-artboard" onClick={(event) => openArtboardMenu(event.currentTarget)}>
          <Icon id="tool-artboard" size={12} />
          <span>{artboard?.name ?? t('status.noArtboard')}</span>
          <Icon id="chevron-down" size={10} />
        </button>
        <button type="button" className="vc-statusbar__step" data-testid="artboard-next" aria-label={t('status.artboardNext')} onClick={() => goToArtboard(artboardIndex + 1)}>
          <Icon id="chevron-right" size={12} />
        </button>
      </div>
      <div className="vc-statusbar__cell vc-statusbar__cell--strong" data-testid="status-tool">
        <Icon id={activeTool} size={14} className="vc-statusbar__icon" />
        {t(`tool.${activeTool}`)}
      </div>
      <div className="vc-statusbar__cell" data-testid="status-cursor" {...tip(t('status.cursor'))}>
        <Icon id="locate-object" size={14} className="vc-statusbar__icon" />
        <span>
          X <b>{cursor ? formatLength(cursor.x, units) : '—'}</b>
        </span>
        <span>
          Y <b>{cursor ? formatLength(cursor.y, units) : '—'}</b>
        </span>
      </div>
      {space && (
        <div className="vc-statusbar__cell" data-testid="status-space" {...tip(t('status.space'))}>
          <Icon id="spaces" size={14} className="vc-statusbar__icon" />
          <span>{t('status.spaceLabel')}</span>
          <span className="vc-statusbar__dot" style={{ background: space.color }} />
          <b>{space.name}</b>
          <span>
            · {space.artboards.length} {t(space.artboards.length === 1 ? 'spaces.artboardOne' : 'spaces.artboardMany')}
          </span>
        </div>
      )}
      <div className="vc-statusbar__spacer" />
      <div className="vc-statusbar__cell vc-statusbar__cell--last" data-testid="status-saved" {...tip(t('status.autosaveTip'))}>
        <Icon id="cloud-check" size={14} className={session?.dirty ? 'vc-statusbar__icon' : 'vc-statusbar__saved'} />
        {session?.dirty ? t('status.unsaved') : t('status.saved')}
      </div>
      {menu && <MenuPopup entries={menu.entries} anchor={menu.anchor} onClose={() => setMenu(null)} minWidth={180} />}
    </footer>
  );
}
