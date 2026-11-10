import { useState } from 'react';
import { getActiveSpace, type ArtboardArrangeDirection } from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { DialogTitle } from '../components/DialogTitle';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { CheckRow, Choice } from '../panels/kit';
import { getPreferences, usePreferences } from '../prefs/preferences';
import { arrangeAll } from './artboardActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Reorganizar mesas (specs/04): grid of columns, spacing and direction; the artwork follows its artboard. */
export function ArrangeArtboardsDialog() {
  const open = useUi((s) => s.arrangeDialog);
  const documents = useDocuments();
  if (!open || !documents.active) return null;
  return <ArrangeForm />;
}

function ArrangeForm() {
  const documents = useDocuments();
  const close = useUi((s) => s.closeArrangeDialog);
  const session = documents.active!.session;
  const units = session.document.meta.units;
  const count = getActiveSpace(session.document).artboards.length;
  // The last values are remembered between sessions (Preferences.arrange).
  const last = getPreferences().arrange;
  const [columns, setColumns] = useState(last.columns > 0 ? Math.min(last.columns, count) : Math.ceil(Math.sqrt(count)));
  const [spacing, setSpacing] = useState(ptToUnit(last.spacing, units));
  const [direction, setDirection] = useState<ArtboardArrangeDirection>(last.direction);
  const [moveArtwork, setMoveArtwork] = useState(last.moveArtwork);

  const accept = () => {
    const spacingPt = unitToPt(spacing, units);
    usePreferences.getState().set({ arrange: { columns, spacing: spacingPt, direction, moveArtwork } });
    arrangeAll(session, { columns, spacing: spacingPt, direction }, moveArtwork);
    close();
  };

  return (
    <div className="vc-dialog__backdrop" data-testid="arrange-dialog">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t('arrange.title')}
        onSubmit={(event) => {
          event.preventDefault();
          accept();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <DialogTitle icon="artboard-rearrange" onClose={close}>{t('arrange.title')}</DialogTitle>
        <div className="vc-form__row">
          <label>{t('arrange.direction')}</label>
          <Choice<ArtboardArrangeDirection>
            value={direction}
            onChange={setDirection}
            label={t('arrange.direction')}
            testId="arrange-direction"
            options={[
              { id: 'row', label: t('arrange.dir.row') },
              { id: 'row-rtl', label: t('arrange.dir.rowRtl') },
              { id: 'column', label: t('arrange.dir.column') },
            ]}
          />
        </div>
        <div className="vc-form__row">
          <label>{t('arrange.columns')}</label>
          <NumberInput value={columns} onCommit={(v) => setColumns(Math.min(count, Math.max(1, Math.round(v))))} min={1} max={count} decimals={0} width={110} testId="arrange-columns" tooltip={t('arrange.columns')} />
        </div>
        <div className="vc-form__row">
          <label>{t('arrange.spacing')}</label>
          <NumberInput value={spacing} onCommit={(v) => setSpacing(Math.max(0, v))} min={0} suffix={units} lengthUnit={units} step={1} decimals={3} width={110} testId="arrange-spacing" tooltip={t('arrange.spacing')} />
        </div>
        <CheckRow checked={moveArtwork} onChange={setMoveArtwork} label={t('arrange.moveArtwork')} testId="arrange-artwork" />
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="arrange-cancel" onClick={close}>
            <Icon id="close" size={14} />
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="arrange-ok">
            <Icon id="check" size={14} />
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
