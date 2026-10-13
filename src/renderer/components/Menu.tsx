import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon, type IconId } from './Icon';
import { t } from '../i18n';
import './Menu.css';

export interface MenuItem {
  type?: 'item';
  id: string;
  label: string;
  /** Mandatory: every menu entry has an icon (CLAUDE.md rule 8). */
  icon: IconId;
  /** Already formatted for display, e.g. "Mayús+Ctrl+S". */
  shortcut?: string;
  danger?: boolean;
  /** Shows a check at the right (toggle / current choice). */
  checked?: boolean;
  /** Greyed out and not selectable (e.g. Undo with nothing to undo). */
  disabled?: boolean;
  /** Not available yet; shown as a small tag such as "v2". */
  badge?: string;
  /** Modifier kind chip (structural / appearance). */
  kind?: 'structural' | 'appearance';
  submenu?: MenuEntry[];
  onSelect?: () => void;
}
export interface MenuSeparator {
  type: 'separator';
  id: string;
}
export type MenuEntry = MenuItem | MenuSeparator;

const isItem = (entry: MenuEntry): entry is MenuItem => entry.type !== 'separator';

export interface Anchor {
  /** Viewport rectangle the menu hangs from. */
  rect: { left: number; top: number; right: number; bottom: number };
  /** `below`: under the anchor, left-aligned (menu bar). `right`: beside it (submenus, flyouts). */
  placement: 'below' | 'right';
}

interface PopupProps {
  entries: MenuEntry[];
  anchor: Anchor;
  onClose: () => void;
  /** Width in px; menus size to content when omitted. */
  minWidth?: number;
}

/** Floating menu with icons, shortcuts, checks and nested submenus (specs/10 · Menú). */
export function MenuPopup({ entries, anchor, onClose, minWidth = 220 }: PopupProps) {
  // Pointer-down outside every menu, Escape from anywhere, or losing the window closes the whole tree.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.vc-menu')) onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <MenuList entries={entries} anchor={anchor} onClose={onClose} minWidth={minWidth} depth={0} />,
    document.body,
  );
}

interface ListProps extends PopupProps {
  depth: number;
  onBack?: () => void;
}

function MenuList({ entries, anchor, onClose, minWidth, depth, onBack }: ListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState<number>(-1);
  const [open, setOpen] = useState<number>(-1);
  const [subAnchor, setSubAnchor] = useState<Anchor | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const { rect, placement } = anchor;
    let left = placement === 'below' ? rect.left : rect.right + 4;
    let top = placement === 'below' ? rect.bottom : rect.top - 5;
    if (left + width > window.innerWidth - 4) {
      left = placement === 'below' ? window.innerWidth - width - 4 : rect.left - width - 4;
    }
    if (top + height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - height - 4);
    setPos({ left: Math.max(4, left), top });
  }, [anchor]);

  // The root list takes keyboard focus (again whenever it moves to another anchor).
  useEffect(() => {
    if (depth === 0) ref.current?.focus();
  }, [depth, anchor]);

  const itemIndexes = entries.flatMap((entry, index) => (isItem(entry) ? [index] : []));

  const openSub = useCallback((index: number, row: HTMLElement | null) => {
    const entry = entries[index];
    if (!entry || !isItem(entry) || !entry.submenu || !row) {
      setOpen(-1);
      return;
    }
    const r = row.getBoundingClientRect();
    setSubAnchor({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, placement: 'right' });
    setOpen(index);
  }, [entries]);

  const select = (entry: MenuItem) => {
    if (entry.submenu || entry.disabled) return;
    entry.onSelect?.();
    onClose();
  };

  const move = (delta: 1 | -1) => {
    if (itemIndexes.length === 0) return;
    const at = itemIndexes.indexOf(active);
    const next = at === -1 ? (delta === 1 ? 0 : itemIndexes.length - 1) : (at + delta + itemIndexes.length) % itemIndexes.length;
    setActive(itemIndexes[next] ?? -1);
    setOpen(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entry = entries[active];
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'ArrowRight':
        if (entry && isItem(entry) && entry.submenu) {
          openSub(active, ref.current?.querySelector<HTMLElement>(`[data-index="${active}"]`) ?? null);
        }
        break;
      case 'ArrowLeft':
        if (onBack) onBack();
        else onClose();
        break;
      case 'Enter':
      case ' ':
        if (entry && isItem(entry)) {
          if (entry.submenu) openSub(active, ref.current?.querySelector<HTMLElement>(`[data-index="${active}"]`) ?? null);
          else select(entry);
        }
        break;
      case 'Escape':
        onClose();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const openEntry = open >= 0 ? entries[open] : undefined;

  return (
    <>
      <div
        ref={ref}
        className="vc-menu"
        role="menu"
        tabIndex={-1}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, minWidth, visibility: pos ? 'visible' : 'hidden' }}
        onKeyDown={onKeyDown}
      >
        {entries.map((entry, index) =>
          isItem(entry) ? (
            <div
              key={entry.id}
              data-index={index}
              role="menuitem"
              aria-haspopup={entry.submenu ? 'menu' : undefined}
              aria-checked={entry.checked}
              className={cx(
                'vc-menu__item',
                entry.danger && 'vc-menu__item--danger',
                entry.disabled && 'vc-menu__item--disabled',
                (active === index || open === index) && 'is-active',
              )}
              onPointerEnter={(event) => {
                setActive(index);
                openSub(index, event.currentTarget);
              }}
              onClick={() => select(entry)}
            >
              <span className="vc-menu__icon">
                <Icon id={entry.icon} size={16} />
              </span>
              <span className="vc-menu__label">{entry.label}</span>
              {entry.badge && <span className="vc-menu__badge">{entry.badge}</span>}
              {entry.kind && (
                <span
                  className={cx('vc-menu__kind', `vc-menu__kind--${entry.kind}`)}
                  title={t(entry.kind === 'structural' ? 'modifier.kind.structural' : 'modifier.kind.appearance')}
                >
                  <Icon id={entry.kind === 'structural' ? 'mod-structural' : 'mod-appearance'} size={12} />
                </span>
              )}
              {entry.shortcut && <span className="vc-menu__shortcut">{entry.shortcut}</span>}
              {entry.checked && (
                <span className="vc-menu__check">
                  <Icon id="check" size={14} />
                </span>
              )}
              {entry.submenu && <Icon id="chevron-right" size={12} />}
            </div>
          ) : (
            <div key={entry.id} className="vc-menu__separator" role="separator" />
          ),
        )}
      </div>
      {openEntry && isItem(openEntry) && openEntry.submenu && subAnchor && (
        <MenuList
          entries={openEntry.submenu}
          anchor={subAnchor}
          onClose={onClose}
          minWidth={minWidth}
          depth={depth + 1}
          onBack={() => setOpen(-1)}
        />
      )}
    </>
  );
}
