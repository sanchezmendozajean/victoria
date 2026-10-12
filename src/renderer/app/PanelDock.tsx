import { useEffect, useState, type DragEvent } from 'react';
import { Icon } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { cx } from '../components/cx';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import type { PanelGroup } from '../panels/layout';
import { PANELS, type PanelId } from '../panels/registry';
import { useUi } from './store';
import './PanelDock.css';

const DRAG_TYPE = 'application/x-victoria-panel';

/** Groups with many tabs show only the icon on inactive tabs once labels would not fit (as in the mockup). */
function isCompact(group: PanelGroup): boolean {
  const chars = group.tabs.reduce((n, id) => n + t(PANELS[id].title).length, 0);
  return group.tabs.length >= 3 && chars > 26;
}

function draggedPanel(event: DragEvent): PanelId | null {
  const id = event.dataTransfer.getData(DRAG_TYPE);
  return id in PANELS ? (id as PanelId) : null;
}

const hasPanel = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE);

export function PanelDock() {
  const groups = useUi((s) => s.panels.groups);
  const strip = useUi((s) => s.panels.strip);
  const stripOpen = useUi((s) => s.stripOpen);
  const selectPanelTab = useUi((s) => s.selectPanelTab);
  const toggleGroup = useUi((s) => s.toggleGroup);
  const dockPanel = useUi((s) => s.dockPanel);
  const dockPanelAsGroup = useUi((s) => s.dockPanelAsGroup);
  const collapsePanel = useUi((s) => s.collapsePanel);
  const resetPanels = useUi((s) => s.resetPanels);
  const setStripOpen = useUi((s) => s.setStripOpen);

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ group: PanelGroup; anchor: Anchor } | null>(null);

  // The floating window of a strip panel closes on any outside click.
  useEffect(() => {
    if (!stripOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('.vc-floatpanel, .vc-dock__stripbutton')) setStripOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [stripOpen, setStripOpen]);

  const startDrag = (event: DragEvent, panel: PanelId) => {
    event.dataTransfer.setData(DRAG_TYPE, panel);
    event.dataTransfer.effectAllowed = 'move';
  };

  const dropOnTabs = (event: DragEvent<HTMLElement>, group: PanelGroup) => {
    const panel = draggedPanel(event);
    setDropTarget(null);
    if (!panel) return;
    event.preventDefault();
    // Insert before the first tab whose centre is right of the pointer.
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-panel]'));
    const before = tabs.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return event.clientX < r.left + r.width / 2;
    });
    dockPanel(panel, group.id, before === -1 ? undefined : before);
  };

  const menuEntries = (group: PanelGroup): MenuEntry[] => [
    {
      id: 'collapse',
      label: t('dock.collapseToStrip'),
      icon: 'collapse-panel',
      onSelect: () => collapsePanel(group.active),
    },
    { id: 'reset', label: t('dock.reset'), icon: 'restore-backup', onSelect: resetPanels },
  ];

  const floating = stripOpen && strip.includes(stripOpen) ? stripOpen : null;

  return (
    <div className="vc-dock" data-testid="panel-dock">
      <div
        className={cx('vc-dock__strip', dropTarget === 'strip' && 'is-drop')}
        data-testid="panel-strip"
        onDragOver={(event) => {
          if (!hasPanel(event)) return;
          event.preventDefault();
          setDropTarget('strip');
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => {
          const panel = draggedPanel(event);
          setDropTarget(null);
          if (panel) {
            event.preventDefault();
            collapsePanel(panel);
          }
        }}
      >
        {strip.map((id) => (
          <button
            key={id}
            type="button"
            draggable
            className={cx('vc-dock__stripbutton', stripOpen === id && 'is-open')}
            data-panel={id}
            {...tip(t(PANELS[id].title))}
            onDragStart={(event) => startDrag(event, id)}
            onClick={() => setStripOpen(stripOpen === id ? null : id)}
          >
            <Icon id={PANELS[id].icon} size={16} />
          </button>
        ))}
      </div>

      <div className="vc-dock__column" data-testid="panel-column">
        {groups.map((group) => {
          const compact = isCompact(group);
          return (
            <section
              key={group.id}
              className={cx('vc-group', group.open && 'is-open', dropTarget === group.id && 'is-drop')}
              data-testid="panel-group"
              data-group={group.id}
            >
              <div
                className="vc-group__tabs"
                role="tablist"
                onDragOver={(event) => {
                  if (!hasPanel(event)) return;
                  event.preventDefault();
                  setDropTarget(group.id);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => dropOnTabs(event, group)}
              >
                {group.tabs.map((id) => {
                  const active = id === group.active;
                  const title = t(PANELS[id].title);
                  const iconOnly = compact && !active;
                  return (
                    <div
                      key={id}
                      role="tab"
                      aria-selected={active}
                      draggable
                      data-panel={id}
                      className={cx('vc-group__tab', active && 'is-active', iconOnly && 'is-compact')}
                      {...(iconOnly ? tip(title) : {})}
                      onDragStart={(event) => startDrag(event, id)}
                      onClick={() => selectPanelTab(group.id, id)}
                      onDoubleClick={() => toggleGroup(group.id)}
                    >
                      <Icon id={PANELS[id].icon} size={14} />
                      {!iconOnly && title}
                    </div>
                  );
                })}
                <div className="vc-group__spacer" />
                <button
                  type="button"
                  className="vc-group__button"
                  {...tip(t('dock.panelMenu'))}
                  onClick={(event) => {
                    const r = event.currentTarget.getBoundingClientRect();
                    setMenu({
                      group,
                      anchor: { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement: 'below' },
                    });
                  }}
                >
                  <Icon id="panel-menu" size={14} />
                </button>
                <button
                  type="button"
                  className="vc-group__button"
                  data-testid="group-toggle"
                  {...tip(group.open ? t('dock.collapseGroup') : t('dock.expandGroup'))}
                  onClick={() => toggleGroup(group.id)}
                >
                  <Icon id={group.open ? 'chevron-up' : 'chevron-down'} size={14} />
                </button>
              </div>
              {group.open && <div className="vc-group__body" data-testid={`panel-body-${group.active}`} />}
            </section>
          );
        })}
      </div>

      {floating && (
        <aside className="vc-floatpanel" data-testid="panel-float" aria-label={t(PANELS[floating].title)}>
          <header className="vc-floatpanel__header">
            <Icon id={PANELS[floating].icon} size={14} />
            <span>{t(PANELS[floating].title)}</span>
            <div className="vc-group__spacer" />
            <button
              type="button"
              className="vc-group__button"
              {...tip(t('dock.dock'))}
              onClick={() => dockPanelAsGroup(floating, groups.length)}
            >
              <Icon id="restore" size={14} />
            </button>
            <button type="button" className="vc-group__button" {...tip(t('dock.close'))} onClick={() => setStripOpen(null)}>
              <Icon id="close" size={14} />
            </button>
          </header>
          <div className="vc-floatpanel__body" />
        </aside>
      )}

      {menu && <MenuPopup entries={menuEntries(menu.group)} anchor={menu.anchor} onClose={() => setMenu(null)} minWidth={200} />}
    </div>
  );
}
