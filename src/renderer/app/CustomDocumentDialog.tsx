import { useState } from 'react';
import type { Units } from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { manager } from '../documents';
import { t } from '../i18n';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Largest side of a new artboard, in points (Illustrator's limit is about 5.7 m). */
const MAX_PT = 16383;
const UNITS: readonly Units[] = ['px', 'mm', 'cm', 'pt', 'in'];

/** Start screen › Personalizado: a new document with an artboard of any size. */
export function CustomDocumentDialog() {
  const open = useUi((s) => s.customDocumentDialog);
  return open ? <CustomForm /> : null;
}

function CustomForm() {
  const close = useUi((s) => s.closeCustomDocumentDialog);
  const [units, setUnits] = useState<Units>('mm');
  const [w, setW] = useState(ptToUnit(unitToPt(210, 'mm'), 'mm'));
  const [h, setH] = useState(ptToUnit(unitToPt(297, 'mm'), 'mm'));
  const clamp = (value: number) => Math.min(MAX_PT, Math.max(1, unitToPt(value, units)));
  const lengthProps = { suffix: units, lengthUnit: units, step: 1, decimals: 3, width: 110, min: 0.001 } as const;

  // Changing units keeps the size: the same points, shown in the new unit.
  const changeUnits = (next: Units) => {
    setW(ptToUnit(clamp(w), next));
    setH(ptToUnit(clamp(h), next));
    setUnits(next);
  };
  const create = () => {
    manager.newDocument(undefined, { w: clamp(w), h: clamp(h), units });
    close();
  };
  return (
    <div className="vc-dialog__backdrop" data-testid="custom-document-dialog">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t('start.custom')}
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <h2 className="vc-dialog__title">{t('start.custom')}</h2>
        <div className="vc-form__row">
          <label>{t('measure.width')}</label>
          <NumberInput value={w} onCommit={setW} testId="custom-w" tooltip={t('measure.width')} {...lengthProps} />
        </div>
        <div className="vc-form__row">
          <label>{t('measure.height')}</label>
          <NumberInput value={h} onCommit={setH} testId="custom-h" tooltip={t('measure.height')} {...lengthProps} />
        </div>
        <div className="vc-form__row">
          <label htmlFor="custom-units">{t('properties.units')}</label>
          <select id="custom-units" data-testid="custom-units" className="vc-form__input" value={units} onChange={(e) => changeUnits(e.target.value as Units)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="custom-cancel" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="custom-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
