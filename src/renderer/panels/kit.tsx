import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { colorToCss, sortStops, type Gradient, type Paint, type Resources } from '../../core';
import { cx } from '../components/cx';
import { Icon, type IconId } from '../components/Icon';
import { tip } from '../components/Tooltip';
import './panels.css';

/** Collapsible section of a panel (specs/10 §7: 11 px semibold title with a chevron). */
export function Section({ title, children, defaultOpen = true, actions, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="vc-psection" data-testid={testId}>
      <header className="vc-psection__header">
        <button type="button" className="vc-psection__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon id={open ? 'chevron-down' : 'chevron-right'} size={12} />
          <span>{title}</span>
        </button>
        {actions}
      </header>
      {open && <div className="vc-psection__body">{children}</div>}
    </section>
  );
}

export const Row = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={cx('vc-prow', className)} style={style}>
    {children}
  </div>
);

export const Hint = ({ children }: { children: ReactNode }) => <p className="vc-phint">{children}</p>;

/** CSS for any paint: solid colours, swatches (by lookup) and gradients. null = none. */
export function paintCss(paint: Paint, resources: Resources): string | null {
  switch (paint.type) {
    case 'none':
      return null;
    case 'solid':
      return colorToCss(paint.color);
    case 'swatch': {
      const swatch = resources.swatches.find((s) => s.id === paint.swatchId);
      return swatch ? colorToCss(swatch.color) : null;
    }
    default: {
      const g = resources.gradients.find((x) => x.id === paint.gradientId);
      return g ? gradientCss(g) : null;
    }
  }
}

export function gradientCss(gradient: Gradient, direction = 'to right'): string {
  const stops = sortStops(gradient.stops).map((s) => `${colorToCss(s.color, s.opacity)} ${Math.round(s.offset * 1000) / 10}%`);
  if (stops.length === 0) return 'transparent';
  if (stops.length === 1) return colorToCss(gradient.stops[0]!.color);
  return gradient.type === 'radial' ? `radial-gradient(circle, ${stops.join(',')})` : `linear-gradient(${direction}, ${stops.join(',')})`;
}

/** Colour chip: checkerboard under transparency, red diagonal for none, diagonal split when mixed. */
export function PaintChip({ paint, mixed, resources, size = 16, className }: { paint: Paint | null; mixed?: boolean; resources: Resources; size?: number; className?: string }) {
  const css = paint ? paintCss(paint, resources) : null;
  return (
    <span
      className={cx('vc-chip', (!paint || paint.type === 'none') && !mixed && 'vc-chip--none', mixed && 'vc-chip--mixed', className)}
      style={{ width: size, height: size, ...(css && !mixed ? { background: css } : {}) }}
    />
  );
}

interface SliderProps {
  value: number | null;
  min: number;
  max: number;
  onChange(value: number): void;
  /** Called once when a drag starts (to open an undo group) and when it ends. */
  onStart?(): void;
  onEnd?(): void;
  /** CSS background of the track (colour sliders show their own gradient). */
  background?: string;
  step?: number;
  disabled?: boolean;
  label: string;
  testId?: string;
}

/** Slider with a 4 px track and 10 px thumb (specs/10); drag, click and arrow keys. */
export function Slider({ value, min, max, onChange, onStart, onEnd, background, step = 1, disabled, label, testId }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (event: ReactPointerEvent | PointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return min;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    return Math.round(raw / step) * step;
  };
  const fraction = value === null ? 0 : (value - min) / (max - min || 1);
  return (
    <div
      ref={track}
      className={cx('vc-slider', disabled && 'is-disabled')}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      data-testid={testId}
      style={background ? { background } : undefined}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onStart?.();
        onChange(at(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) onChange(at(event));
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onEnd?.();
      }}
      onKeyDown={(event) => {
        if (disabled || value === null) return;
        const big = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          onChange(Math.min(max, value + step * big));
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          onChange(Math.max(min, value - step * big));
        }
      }}
    >
      {value !== null && <span className="vc-slider__thumb" style={{ left: `${fraction * 100}%` }} />}
    </div>
  );
}

/** Row of icon toggle buttons, one active (caps, joins, alignment of strokes…). A null `value` (mixed) shows none. */
export function IconChoice<T extends string>({ value, options, onChange, testId }: { value: T | null; options: ReadonlyArray<{ id: T; icon: IconId; tooltip: string }>; onChange(value: T): void; testId?: string }) {
  return (
    <div className="vc-segmented" role="group" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cx('vc-segmented__button', value === o.id && 'is-active')}
          style={{ width: 28 }}
          aria-pressed={value === o.id}
          data-value={o.id}
          {...tip(o.tooltip)}
          onClick={() => onChange(o.id)}
        >
          <Icon id={o.icon} size={16} />
        </button>
      ))}
    </div>
  );
}

export function CheckRow({ checked, mixed, onChange, label, testId, disabled }: { checked: boolean; mixed?: boolean; onChange(checked: boolean): void; label: string; testId?: string; disabled?: boolean }) {
  return (
    <label className={cx('vc-pcheck', disabled && 'is-disabled')}>
      <input
        type="checkbox"
        checked={checked && !mixed}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed;
        }}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** Native select styled as the app's drop-down, with an optional icon on the left. */
export function Choice<T extends string | number>({ value, options, onChange, icon, mixed, testId, width, label }: { value: T | null; options: ReadonlyArray<{ id: T; label: string }>; onChange(value: T): void; icon?: IconId; mixed?: boolean; testId?: string; width?: number; label: string }) {
  return (
    <div className={cx('vc-choice', icon && 'has-icon')} style={width ? { width } : { flex: 1, minWidth: 0 }}>
      {icon && <Icon id={icon} size={12} className="vc-field__icon vc-choice__lead" />}
      <select
        value={mixed || value === null ? '' : String(value)}
        aria-label={label}
        data-testid={testId}
        onChange={(event) => {
          const picked = options.find((o) => String(o.id) === event.target.value);
          if (picked) onChange(picked.id);
        }}
      >
        {(mixed || value === null) && <option value="" disabled />}
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon id="chevron-down" size={10} className="vc-field__icon vc-choice__chevron" />
    </div>
  );
}
