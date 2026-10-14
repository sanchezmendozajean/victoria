import { cx } from './cx';
import { Icon, type IconId } from './Icon';
import { tip } from './Tooltip';
import './controls.css';

export function BarSeparator() {
  return <div className="vc-sep" role="separator" />;
}

interface FieldProps {
  /** Short text label ("X") or an icon. */
  label?: string;
  icon?: IconId;
  value: string;
  unit?: string;
  width: number;
  tooltip?: string;
  chevron?: boolean;
}

/** 22 px number field of specs/10. Display only in Phase 1 (no document to edit yet). */
export function NumberField({ label, icon, value, unit, width, tooltip, chevron }: FieldProps) {
  return (
    <div className={'vc-field'} style={{ width }} {...(tooltip ? tip(tooltip) : {})}>
      {icon && <Icon id={icon} size={12} className="vc-field__icon" />}
      {label && <span className="vc-field__label">{label}</span>}
      <span className="vc-field__value">{value}</span>
      {unit && <span className="vc-field__unit">{unit}</span>}
      {chevron && <Icon id="chevron-down" size={10} className="vc-field__icon" />}
    </div>
  );
}

export interface SegmentItem {
  icon: IconId;
  tooltip: string;
  active?: boolean;
  onClick?: () => void;
}

export function Segmented({ items, buttonWidth = 28 }: { items: SegmentItem[]; buttonWidth?: number }) {
  return (
    <div className="vc-segmented" role="group">
      {items.map((item) => (
        <button
          key={item.icon}
          type="button"
          className={cx('vc-segmented__button', item.active && 'is-active')}
          style={{ width: buttonWidth }}
          aria-pressed={item.active ?? false}
          onClick={item.onClick}
          {...tip(item.tooltip)}
        >
          <Icon id={item.icon} size={16} />
        </button>
      ))}
    </div>
  );
}

interface BarButtonProps {
  icon: IconId;
  label?: string;
  tooltip: string;
  shortcut?: string;
  onClick?: () => void;
}

/** 24 px icon button, with an optional text label (control bar actions). */
export function BarButton({ icon, label, tooltip, shortcut, onClick }: BarButtonProps) {
  return (
    <button type="button" className={cx('vc-barbutton', label && 'vc-barbutton--label')} onClick={onClick} {...tip(tooltip, shortcut)}>
      <Icon id={icon} size={16} />
      {label && <span>{label}</span>}
    </button>
  );
}
