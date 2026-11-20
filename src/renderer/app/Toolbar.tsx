import { useShortcuts } from './useShortcuts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { cx } from '../components/cx';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { formatAccelerator } from './shortcuts';
import { currentSlotTool, useUi } from './store';
import { toolBlockReason, useSvgMode } from './svgMode';
import { TOOL_SECTIONS, toolAccelerator, type ToolId, type ToolSlot } from './tools';
import { PaintModes, PaintWidget } from '../panels/PaintWidget';
import './Toolbar.css';

const HOLD_MS = 300; // specs/03: holding the click opens the group flyout

interface FlyoutState {
  slot: ToolSlot;
  left: number;
  top: number;
}

export function Toolbar() {
  useShortcuts();
  const os = useUi((s) => s.platform.os);
  const activeTool = useUi((s) => s.activeTool);
  const slotTool = useUi((s) => s.slotTool);
  const twoColumns = useUi((s) => s.toolbarTwoColumns);
  const setActiveTool = useUi((s) => s.setActiveTool);
  const toggleColumns = useUi((s) => s.toggleToolbarColumns);
  // In SVG mode some tools are unavailable: they stay in place, greyed out, and their tooltip says why.
  const svgMode = useSvgMode();
  const blockedBy = (tool: ToolId): string | null => (svgMode ? toolBlockReason(tool) : null);

  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const heldOpen = useRef(false);

  useEffect(() => {
    if (!flyout) return;
    const close = () => setFlyout(null);
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.vc-flyout')) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [flyout]);

  const keyOf = (tool: ToolId) => {
    const accel = toolAccelerator(tool);
    return accel ? formatAccelerator(accel, os) : undefined;
  };

  const openFlyout = (slot: ToolSlot, button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    setFlyout({ slot, left: r.right + 6, top: r.top - 4 });
  };

  const onPointerDown = (slot: ToolSlot, event: ReactPointerEvent<HTMLButtonElement>) => {
    heldOpen.current = false;
    if (slot.tools.length < 2 || event.button !== 0) return;
    const button = event.currentTarget;
    holdTimer.current = window.setTimeout(() => {
      heldOpen.current = true;
      openFlyout(slot, button);
    }, HOLD_MS);
  };

  const onClick = (slot: ToolSlot, shown: ToolId, altKey: boolean) => {
    window.clearTimeout(holdTimer.current);
    if (heldOpen.current) {
      heldOpen.current = false;
      return;
    }
    if (blockedBy(shown)) return;
    if (altKey && slot.tools.length > 1) {
      // Alt+click rotates through the tools of the group.
      const next = slot.tools[(slot.tools.indexOf(shown) + 1) % slot.tools.length] as ToolId;
      setActiveTool(next);
      return;
    }
    setActiveTool(shown);
  };

  return (
    <aside className={cx('vc-toolbar', twoColumns && 'vc-toolbar--two')} data-testid="toolbar">
      <button type="button" className="vc-toolbar__collapse" {...tip(t('toolbar.twoColumns'))} onClick={toggleColumns}>
        <Icon id="collapse-panel" size={12} />
      </button>

      {TOOL_SECTIONS.map((section, index) => (
        <div className="vc-toolbar__section" key={index}>
          {section.map((slot) => {
            const shown = currentSlotTool(slotTool, slot.id);
            const isGroup = slot.tools.length > 1;
            const isActive = slot.tools.includes(activeTool);
            const preferred = isActive ? activeTool : shown;
            // A slot never shows a tool it cannot use while another one of the group is free.
            const display = blockedBy(preferred) ? (slot.tools.find((tool) => !blockedBy(tool)) ?? preferred) : preferred;
            const blocked = blockedBy(display);
            const key = keyOf(display);
            return (
              <button
                key={slot.id}
                type="button"
                className={cx('vc-toolbar__tool', isActive && 'is-active', blocked && 'is-blocked')}
                data-tool={display}
                aria-pressed={isActive}
                aria-disabled={blocked ? true : undefined}
                {...(blocked ? tip(`${t(`tool.${display}`)}. ${blocked}`) : tip(t(`tool.${display}`), key))}
                onPointerDown={(event) => onPointerDown(slot, event)}
                onPointerLeave={() => window.clearTimeout(holdTimer.current)}
                onClick={(event) => onClick(slot, display, event.altKey)}
                onContextMenu={(event) => {
                  if (!isGroup) return;
                  event.preventDefault();
                  openFlyout(slot, event.currentTarget);
                }}
              >
                <Icon id={display} size={18} />
                {isGroup && <span className="vc-toolbar__corner" />}
              </button>
            );
          })}
        </div>
      ))}

      <div className="vc-toolbar__paint" style={{ width: twoColumns ? 50 : 30 }}>
        <PaintWidget size={twoColumns ? 50 : 30} stacked={!twoColumns} />
      </div>
      <div className="vc-toolbar__modes">
        <PaintModes compact iconSize={twoColumns ? 17 : 10} />
      </div>

      <div className="vc-toolbar__section vc-toolbar__section--end">
        <button type="button" className="vc-toolbar__tool" {...tip(t('toolbar.drawMode'), formatAccelerator('Shift+D', os))}>
          <Icon id="draw-normal" size={18} />
        </button>
        <button type="button" className="vc-toolbar__tool" {...tip(t('toolbar.screenMode'), 'F')}>
          <Icon id="screen-mode" size={18} />
        </button>
      </div>

      {flyout &&
        // Portal: the toolbar's stacking context sits below the document tabs.
        createPortal(
        <div className="vc-flyout" role="menu" style={{ left: flyout.left, top: flyout.top }} data-testid="tool-flyout">
          {flyout.slot.tools.map((tool) => {
            const key = keyOf(tool);
            return (
              <button
                key={tool}
                type="button"
                role="menuitem"
                className={cx('vc-flyout__item', tool === activeTool && 'is-active', blockedBy(tool) && 'is-blocked')}
                data-tool={tool}
                aria-disabled={blockedBy(tool) ? true : undefined}
                {...(blockedBy(tool) ? tip(`${t(`tool.${tool}`)}. ${blockedBy(tool)}`) : tip(t(`tool.${tool}`), key))}
                onClick={() => {
                  if (blockedBy(tool)) return;
                  setActiveTool(tool);
                  setFlyout(null);
                }}
              >
                <Icon id={tool} size={16} />
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </aside>
  );
}
