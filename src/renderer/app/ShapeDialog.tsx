import { useState } from 'react';
import { addNode, getActiveSpace, selectOnly, toRadians, translation, multiply, rotation, type Matrix, type Vec2 } from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { buildShape, type ShapeSpec, type ShapeToolKind } from '../tools/shapeDrag';
import { shapePrefs } from '../tools/shapeTools';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Click with a shape tool: exact dimensions, as Illustrator's "Rectángulo…", "Elipse…", "Polígono…" dialogs. */
export function ShapeDialog() {
  const dialog = useUi((s) => s.shapeDialog);
  const documents = useDocuments();
  const session = documents.active?.session;
  if (!dialog || !session) return null;
  return <ShapeForm key={`${dialog.kind}:${dialog.at.x}:${dialog.at.y}`} kind={dialog.kind} at={dialog.at} />;
}

function ShapeForm({ kind, at }: { kind: ShapeToolKind; at: Vec2 }) {
  const documents = useDocuments();
  const close = useUi((s) => s.closeShapeDialog);
  const session = documents.active!.session;
  const units = session.document.meta.units;
  const lengthProps = { suffix: units, lengthUnit: units, step: 1, decimals: 3, width: 110 } as const;

  const [w, setW] = useState(100);
  const [h, setH] = useState(100);
  const [radius, setRadius] = useState(shapePrefs.radius);
  const [r1, setR1] = useState(50);
  const [r2, setR2] = useState(50 * shapePrefs.ratio);
  const [sides, setSides] = useState(shapePrefs.sides);
  const [points, setPoints] = useState(shapePrefs.points);
  const [length, setLength] = useState(100);
  const [angle, setAngle] = useState(0);

  const accept = () => {
    const space = getActiveSpace(session.document);
    const layer = space.layers.find((l) => !l.locked && l.visible) ?? space.layers[0];
    if (!layer) return close();
    const transform: Matrix = kind === 'line' ? multiply(translation(at.x, at.y), rotation(toRadians(-angle))) : translation(at.x, at.y);
    let spec: ShapeSpec;
    switch (kind) {
      case 'rect':
      case 'rounded-rect':
        spec = { shape: 'rect', w: unitToPt(w, units), h: unitToPt(h, units), radius: kind === 'rounded-rect' ? unitToPt(radius, units) : 0, transform };
        if (kind === 'rounded-rect') shapePrefs.radius = unitToPt(radius, units);
        break;
      case 'ellipse':
        spec = { shape: 'ellipse', w: unitToPt(w, units), h: unitToPt(h, units), transform };
        break;
      case 'polygon':
        spec = { shape: 'polygon', radius: unitToPt(r1, units), sides: Math.max(3, Math.round(sides)), transform };
        shapePrefs.sides = Math.max(3, Math.round(sides));
        break;
      case 'star':
        spec = { shape: 'star', r1: unitToPt(r1, units), r2: unitToPt(r2, units), points: Math.max(3, Math.round(points)), transform };
        shapePrefs.points = Math.max(3, Math.round(points));
        if (r1 > 0) shapePrefs.ratio = r2 / r1;
        break;
      case 'line':
        spec = { shape: 'line', length: unitToPt(length, units), transform };
        break;
    }
    const node = buildShape(session.ids, spec);
    if (spec.shape !== 'line') node.appearance = JSON.parse(JSON.stringify(useUi.getState().newLook));
    else node.appearance = { items: (JSON.parse(JSON.stringify(useUi.getState().newLook)) as typeof node.appearance).items.filter((i) => i.kind === 'stroke') };
    session.run(addNode(space.id, layer.id, node), selectOnly(space.id, [node.id]));
    close();
  };

  const title = t(`shape.${kind}`);
  const row = (label: string, field: React.ReactNode) => (
    <div className="vc-form__row">
      <label>{label}</label>
      {field}
    </div>
  );

  return (
    <div className="vc-dialog__backdrop" data-testid="shape-dialog">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={title}
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
        <h2 className="vc-dialog__title">{title}</h2>
        {(kind === 'rect' || kind === 'rounded-rect' || kind === 'ellipse') && (
          <>
            {row(t('measure.width'), <NumberInput value={ptToUnit(unitToPt(w, units), units)} onCommit={setW} min={0.001} testId="shape-w" tooltip={t('measure.width')} {...lengthProps} />)}
            {row(t('measure.height'), <NumberInput value={h} onCommit={setH} min={0.001} testId="shape-h" tooltip={t('measure.height')} {...lengthProps} />)}
          </>
        )}
        {kind === 'rounded-rect' && row(t('shape.cornerRadius'), <NumberInput value={radius} onCommit={setRadius} min={0} testId="shape-radius" tooltip={t('shape.cornerRadius')} {...lengthProps} />)}
        {kind === 'polygon' && (
          <>
            {row(t('shape.radius'), <NumberInput value={r1} onCommit={setR1} min={0.001} testId="shape-r1" tooltip={t('shape.radius')} {...lengthProps} />)}
            {row(t('shape.sides'), <NumberInput value={sides} onCommit={setSides} min={3} decimals={0} width={110} testId="shape-sides" tooltip={t('shape.sides')} />)}
          </>
        )}
        {kind === 'star' && (
          <>
            {row(t('shape.radius1'), <NumberInput value={r1} onCommit={setR1} min={0.001} testId="shape-r1" tooltip={t('shape.radius1')} {...lengthProps} />)}
            {row(t('shape.radius2'), <NumberInput value={r2} onCommit={setR2} min={0.001} testId="shape-r2" tooltip={t('shape.radius2')} {...lengthProps} />)}
            {row(t('shape.points'), <NumberInput value={points} onCommit={setPoints} min={3} decimals={0} width={110} testId="shape-points" tooltip={t('shape.points')} />)}
          </>
        )}
        {kind === 'line' && (
          <>
            {row(t('shape.length'), <NumberInput value={length} onCommit={setLength} min={0.001} testId="shape-length" tooltip={t('shape.length')} {...lengthProps} />)}
            {row(t('transform.angle'), <NumberInput value={angle} onCommit={setAngle} suffix="°" step={1} decimals={3} width={110} testId="shape-angle" tooltip={t('transform.angle')} />)}
          </>
        )}
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="shape-cancel" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="shape-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
