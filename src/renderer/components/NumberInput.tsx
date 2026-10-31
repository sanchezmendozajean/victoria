import { useEffect, useRef, useState } from 'react';
import { evaluateExpression, type Units } from '../../core';
import { PT_PER_UNIT } from '../canvas/units';
import { cx } from './cx';
import { Icon, type IconId } from './Icon';
import { tip } from './Tooltip';
import './controls.css';

export interface NumberInputProps {
  /** Value in the field's own unit. null = mixed values: the field shows blank. */
  value: number | null;
  onCommit(value: number): void;
  /** Suffix shown after the value ("pt", "°", "%"). */
  suffix?: string;
  /** When set, expressions may mix length units ("2 cm + 5 mm") and bare numbers mean this unit. */
  lengthUnit?: Units;
  /** Wheel and arrow-key step (Shift ×10, Alt ×0,1). */
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  width?: number | string;
  label?: string;
  icon?: IconId;
  tooltip?: string;
  disabled?: boolean;
  /** Small up / down buttons at the right (9 px chevrons) that step the value. */
  arrows?: boolean;
  testId?: string;
}

const clampTo = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

export function formatNumber(value: number, decimals: number): string {
  const fixed = (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  // Trailing zeros go only after a decimal point: "100" stays "100".
  const text = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return (text === '-0' ? '0' : text).replace('.', ',');
}

/**
 * Numeric field of specs/10: the wheel changes the value, Enter (or leaving the field) evaluates
 * arithmetic such as `15 + 5` → `20`, invalid text restores the previous value.
 */
export function NumberInput({ value, onCommit, suffix, lengthUnit, step = 1, min, max, decimals = 3, width = 78, label, icon, tooltip, disabled, arrows, testId }: NumberInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : formatNumber(value, decimals));
  const latest = useRef({ value, onCommit, step, min, max, disabled });
  useEffect(() => {
    latest.current = { value, onCommit, step, min, max, disabled };
  });

  const parse = (text: string): number | null => {
    const clean = text.replace(/[°%]/g, '');
    return evaluateExpression(clean, lengthUnit ? { units: PT_PER_UNIT, defaultUnit: lengthUnit } : undefined);
  };

  const commit = (text: string) => {
    setDraft(null);
    const parsed = parse(text);
    if (parsed === null) return; // invalid: the previous value comes back
    onCommit(clampTo(parsed, min, max));
  };

  // The wheel needs a non-passive native listener to stop the page from scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const { value: current, onCommit: commitValue, step: s, min: lo, max: hi, disabled: off } = latest.current;
      if (off) return;
      event.preventDefault();
      const base = current ?? 0;
      const amount = s * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1) * (event.deltaY < 0 ? 1 : -1);
      commitValue(clampTo(Math.round((base + amount) * 1e6) / 1e6, lo, hi));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={cx('vc-field', 'vc-field--input', disabled && 'is-disabled')} style={{ width }} {...(tooltip ? tip(tooltip) : {})}>
      {icon && <Icon id={icon} size={12} className="vc-field__icon" />}
      {label && <span className="vc-field__label">{label}</span>}
      <input
        ref={ref}
        className="vc-field__input"
        data-testid={testId}
        value={shown}
        disabled={disabled}
        spellCheck={false}
        aria-label={tooltip ?? label}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (skipBlur.current) skipBlur.current = false;
          else if (draft !== null) commit(draft);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            commit(draft ?? shown);
            skipBlur.current = true; // the blur below must not commit the stale draft again
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(null);
            skipBlur.current = true;
            event.currentTarget.blur();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const base = parse(draft ?? shown) ?? value ?? 0;
            const amount = step * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
            setDraft(null);
            onCommit(clampTo(Math.round((base + amount) * 1e6) / 1e6, min, max));
          }
        }}
      />
      {suffix && <span className="vc-field__unit">{suffix}</span>}
      {arrows && (
        <span className="vc-field__arrows">
          {([1, -1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={direction > 0 ? '+' : '−'}
              onClick={() => onCommit(clampTo(Math.round(((value ?? 0) + step * direction) * 1e6) / 1e6, min, max))}
            >
              <Icon id={direction > 0 ? 'chevron-up' : 'chevron-down'} size={9} />
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
