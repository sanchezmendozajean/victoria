import { useShortcuts } from './useShortcuts';
import { useMemo, useRef, useState } from 'react';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { cx } from '../components/cx';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { buildMenus, WORKSPACES, type MenuId } from './menus';
import { useUi } from './store';
import './TitleBar.css';

function anchorOf(el: HTMLElement, placement: Anchor['placement']): Anchor {
  const r = el.getBoundingClientRect();
  return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement };
}

interface OpenMenu {
  id: MenuId | 'workspace';
  anchor: Anchor;
}

export function TitleBar() {
  const shortcuts = useShortcuts();
  const platform = useUi((s) => s.platform);
  const theme = useUi((s) => s.theme);
  const workspace = useUi((s) => s.workspace);
  const maximized = useUi((s) => s.maximized);
  const setTheme = useUi((s) => s.setTheme);
  const setWorkspace = useUi((s) => s.setWorkspace);
  const openPanel = useUi((s) => s.openPanel);
  const resetPanels = useUi((s) => s.resetPanels);
  const viewOptions = useUi((s) => s.viewOptions);
  const openTransformDialog = useUi((s) => s.openTransformDialog);

  const documents = useDocuments();
  const session = documents.active?.session;
  const undoLabel = session?.undoLabel ?? null;
  const redoLabel = session?.redoLabel ?? null;
  const [open, setOpen] = useState<OpenMenu | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const menus = useMemo(
    () => buildMenus({ os: platform.os, theme, workspace, setTheme, setWorkspace, openPanel, resetPanels, undoLabel, redoLabel, viewOptions, openTransformDialog: (kind) => openTransformDialog(kind, null) }),
    [platform.os, theme, workspace, setTheme, setWorkspace, openPanel, resetPanels, undoLabel, redoLabel, viewOptions, openTransformDialog, shortcuts],
  );

  const workspaceEntries: MenuEntry[] = WORKSPACES.map((id) => ({
    id,
    label: t(`workspace.${id}`),
    icon: 'workspace',
    checked: workspace === id,
    onSelect: () => setWorkspace(id),
  }));

  const entriesFor = (menu: OpenMenu): MenuEntry[] =>
    menu.id === 'workspace' ? workspaceEntries : (menus.find((m) => m.id === menu.id)?.entries ?? []);

  const toggle = (id: OpenMenu['id'], el: HTMLElement, placement: Anchor['placement']) =>
    setOpen((current) => (current?.id === id ? null : { id, anchor: anchorOf(el, placement) }));

  const hoverSwitch = (id: MenuId, el: HTMLElement) => {
    if (open && open.id !== id) setOpen({ id, anchor: anchorOf(el, 'below') });
  };

  const { chrome } = platform;
  const api = window.victoria;

  return (
    <header
      ref={barRef}
      className={cx('vc-titlebar', `vc-titlebar--${chrome}`)}
      data-testid="titlebar"
      onDoubleClick={chrome === 'custom' ? () => api.toggleMaximizeWindow() : undefined}
    >
      <div className="vc-titlebar__logo">
        <Logo />
      </div>
      <nav className="vc-titlebar__menus" aria-label={t('app.menubar')}>
        {menus.map((menu) => (
          <button
            key={menu.id}
            type="button"
            className={cx('vc-titlebar__menu', open?.id === menu.id && 'is-open')}
            aria-haspopup="menu"
            data-menu-trigger
            aria-expanded={open?.id === menu.id}
            data-testid={`menu-${menu.id}`}
            onClick={(event) => toggle(menu.id, event.currentTarget, 'below')}
            onPointerEnter={(event) => hoverSwitch(menu.id, event.currentTarget)}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {menu.label}
          </button>
        ))}
      </nav>
      <div className="vc-titlebar__spacer" />
      <button
        type="button"
        className={cx('vc-titlebar__workspace', open?.id === 'workspace' && 'is-open')}
        data-testid="workspace-selector"
        data-menu-trigger
        aria-haspopup="menu"
        {...tip(t('titlebar.workspace'))}
        onClick={(event) => toggle('workspace', event.currentTarget, 'below')}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Icon id="workspace" size={14} />
        <span>{t(`workspace.${workspace}`)}</span>
        <Icon id="chevron-down" size={12} className="vc-titlebar__chevron" />
      </button>
      {chrome === 'custom' && (
        <div className="vc-titlebar__controls">
          <button type="button" className="vc-titlebar__control" {...tip(t('window.minimize'))} onClick={() => api.minimizeWindow()}>
            <Icon id="minimize" size={12} />
          </button>
          <button
            type="button"
            className="vc-titlebar__control"
            {...tip(maximized ? t('window.restore') : t('window.maximize'))}
            onClick={() => api.toggleMaximizeWindow()}
          >
            <Icon id={maximized ? 'restore' : 'maximize'} size={10} />
          </button>
          <button
            type="button"
            className="vc-titlebar__control vc-titlebar__control--close"
            {...tip(t('window.close'))}
            onClick={() => api.closeWindow()}
          >
            <Icon id="close-window" size={12} />
          </button>
        </div>
      )}
      {open && (
        <MenuPopup
          entries={entriesFor(open)}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          minWidth={open.id === 'workspace' ? 160 : 240}
        />
      )}
    </header>
  );
}
