import { useShortcuts } from '../app/useShortcuts';
import { useUi } from '../app/store';
import { defaultPaints, paintAsColor, paintAsGradient, paintAsNone, swapPaints } from '../app/paintActions';
import { SHORTCUTS, formatAccelerator } from '../app/shortcuts';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { paintCss } from './kit';
import { usePanelContext } from './context';
import { lookOf } from './look';
import { defaultAppearance, type Paint, type Resources } from '../../core';

const EMPTY: Resources = { swatches: [], gradients: [], images: {}, fonts: {}, modifierPresets: [] };

/** What the paint widgets show: the selection, or the look of the next object when nothing is selected. */
export function usePaintLook() {
  const ctx = usePanelContext();
  const newLook = useUi((s) => s.newLook);
  return { look: ctx?.look ?? lookOf([], newLook ?? defaultAppearance()), resources: ctx?.resources ?? EMPTY, ctx };
}

const modeOf = (paint: Paint): 'color' | 'gradient' | 'none' => (paint.type === 'none' ? 'none' : paint.type === 'solid' || paint.type === 'swatch' ? 'color' : 'gradient');

/**
 * Fill and stroke overlay of Illustrator (specs/06 · Relleno y color): fill top-left, hollow stroke
 * bottom-right. A click makes one active, a double click opens the colour picker; the curved arrow swaps
 * (Mayús+X) and the small icon restores the defaults (D).
 */
export function PaintWidget({ size = 36, testId = 'paint-widget', stacked = false }: { size?: number; testId?: string; stacked?: boolean }) {
  useShortcuts();
  const { look, resources } = usePaintLook();
  const active = useUi((s) => s.activePaint);
  const setActive = useUi((s) => s.setActivePaint);
  const openPicker = useUi((s) => s.openColorPicker);
  const os = useUi((s) => s.platform.os);
  const chip = Math.round(size * 0.62);
  const fillCss = look.fill.mixed ? null : paintCss(look.fill.value, resources);
  const strokeCss = look.stroke.mixed ? null : paintCss(look.stroke.value, resources);
  const fillNone = !look.fill.mixed && look.fill.value.type === 'none';
  const strokeNone = !look.stroke.mixed && look.stroke.value.type === 'none';

  // The free corners (top right, bottom left) are the free space beside the two squares: centre the controls in them.
  const corner = { width: size - chip, height: size - chip, alignItems: 'center', justifyContent: 'center' } as const;
  const swap = (
    <button type="button" className="vc-paintwidget__swap" style={stacked ? undefined : corner} data-testid={`${testId}-swap`} {...tip(t('toolbar.swap'), formatAccelerator(SHORTCUTS['paint.swap'], os))} onClick={swapPaints}>
      <Icon id="swap-fill-stroke" size={12} />
    </button>
  );
  const defaults = (
    <button type="button" className="vc-paintwidget__defaults" style={stacked ? undefined : corner} data-testid={`${testId}-defaults`} {...tip(t('toolbar.defaults'), 'D')} onClick={defaultPaints}>
      <Icon id="default-colors" size={12} />
    </button>
  );

  const widget = (
    <div className="vc-paintwidget" style={{ width: size, height: size }} data-testid={testId} {...tip(t('toolbar.fillStroke'))}>
      <div
        className={cx('vc-paintwidget__stroke', active === 'stroke' && 'is-active', strokeNone && 'is-none', look.stroke.mixed && 'is-mixed')}
        style={{ width: chip, height: chip, left: size - chip, top: size - chip, ...(strokeCss ? { background: strokeCss } : {}) }}
        data-testid={`${testId}-stroke`}
        data-active={active === 'stroke'}
        onClick={() => setActive('stroke')}
        onDoubleClick={(e) => openPicker('stroke', e.currentTarget)}
        {...tip(t('toolbar.stroke'), 'X')}
      />
      <div
        className={cx('vc-paintwidget__fill', active === 'fill' && 'is-active', fillNone && 'is-none', look.fill.mixed && 'is-mixed')}
        style={{ width: chip, height: chip, left: 0, top: 0, ...(fillCss ? { background: fillCss } : {}) }}
        data-testid={`${testId}-fill`}
        data-active={active === 'fill'}
        onClick={() => setActive('fill')}
        onDoubleClick={(e) => openPicker('fill', e.currentTarget)}
        {...tip(t('toolbar.fill'), 'X')}
      />
      {!stacked && swap}
      {!stacked && defaults}
    </div>
  );
  // One-column toolbar: defaults and swap sit in a row above the widget.
  if (!stacked) return widget;
  return (
    <div className="vc-paintstack">
      <div className="vc-paintstack__row">
        {defaults}
        {swap}
      </div>
      {widget}
    </div>
  );
}

/** Color / Gradient / None buttons for the active paint. */
export function PaintModes({ compact = false, iconSize = compact ? 10 : 16 }: { compact?: boolean; iconSize?: number }) {
  const { look } = usePaintLook();
  const active = useUi((s) => s.activePaint);
  const paint = look[active];
  const mode = paint.mixed ? null : modeOf(paint.value);
  const buttons = [
    { id: 'color', icon: 'paint-color', label: t('toolbar.paintColor'), key: ',', run: () => paintAsColor(active) },
    { id: 'gradient', icon: 'paint-gradient', label: t('toolbar.paintGradient'), key: '.', run: () => paintAsGradient(active) },
    { id: 'none', icon: 'paint-none', label: t('toolbar.paintNone'), key: '/', run: () => paintAsNone(active) },
  ] as const;
  return (
    <div className={cx('vc-paintmodes', compact && 'is-compact')} style={compact ? { ['--mode-w' as string]: `${iconSize}px` } : undefined} role="group">
      {buttons.map((b) => (
        <button key={b.id} type="button" className={cx(mode === b.id && 'is-active')} aria-pressed={mode === b.id} data-testid={`paint-mode-${b.id}`} {...tip(b.label, b.key)} onClick={b.run}>
          <Icon id={b.icon} size={iconSize} />
        </button>
      ))}
    </div>
  );
}
