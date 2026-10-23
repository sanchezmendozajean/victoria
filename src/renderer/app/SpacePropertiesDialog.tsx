import { useState } from 'react';
import { combineCommands, setGrid, setSpaceCanvasColor } from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { CheckRow } from '../panels/kit';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Space › Propiedades…: grid (size, subdivisions, visibility) and canvas colour of one Space (specs/04 · Menú de Espacio). */
export function SpacePropertiesDialog() {
  const spaceId = useUi((s) => s.spaceProps);
  const documents = useDocuments();
  const session = documents.active?.session;
  const space = session?.document.spaces.find((s) => s.id === spaceId);
  if (!spaceId || !session || !space) return null;
  return <PropertiesForm key={spaceId} spaceId={spaceId} />;
}

function PropertiesForm({ spaceId }: { spaceId: string }) {
  const documents = useDocuments();
  const close = useUi((s) => s.closeSpaceProps);
  const session = documents.active!.session;
  const units = session.document.meta.units;
  const space = session.document.spaces.find((s) => s.id === spaceId)!;

  const [size, setSize] = useState(ptToUnit(space.grid.size, units));
  const [subdivisions, setSubdivisions] = useState(space.grid.subdivisions);
  const [themeColor, setThemeColor] = useState(space.canvasColor === null);
  const [color, setColor] = useState(space.canvasColor ?? '#535353');

  const accept = () => {
    session.run(
      combineCommands('space.properties', [
        setGrid(spaceId, { size: Math.max(0.001, unitToPt(size, units)), subdivisions: Math.max(1, Math.round(subdivisions)) }),
        setSpaceCanvasColor(spaceId, themeColor ? null : color),
      ]),
    );
    close();
  };

  const row = (label: string, field: React.ReactNode) => (
    <div className="vc-form__row">
      <label>{label}</label>
      {field}
    </div>
  );

  return (
    <div className="vc-dialog__backdrop" data-testid="space-properties">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t('space.propsTitle')}
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
        <h2 className="vc-dialog__title">{t('space.propsTitle')} · {space.name}</h2>
        {row(t('space.propsGridSize'), <NumberInput value={size} onCommit={setSize} min={0.001} suffix={units} lengthUnit={units} step={1} decimals={3} width={110} testId="space-grid-size" tooltip={t('space.propsGridSize')} />)}
        {row(t('space.propsSubdivisions'), <NumberInput value={subdivisions} onCommit={setSubdivisions} min={1} decimals={0} width={110} testId="space-grid-subdivisions" tooltip={t('space.propsSubdivisions')} />)}
        <CheckRow checked={themeColor} label={t('space.propsCanvasTheme')} testId="space-canvas-theme" onChange={setThemeColor} />
        {row(t('space.propsCanvasColor'), <input type="color" aria-label={t('space.propsCanvasColor')} data-testid="space-canvas-color" disabled={themeColor} value={color} onChange={(e) => setColor(e.target.value)} />)}
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="space-props-cancel" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="space-props-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
