import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveSpace,
  isIdentity,
  reflectAbout,
  rectCenter,
  rotateAbout,
  scaleAbout,
  selectionBounds,
  toRadians,
  translation,
  type Matrix,
  type Vec2,
} from '../../core';
import { formatLength, ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { topLevelIds } from '../tools/shared';
import type { TransformKind } from '../tools/types';
import { applyTransform, nextTransformKey } from './selectionActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Rotar…, Escala…, Reflejar… and Mover… with live preview, Copiar, Cancelar and Aceptar (specs/03 · Rotar, Reflejar, Escala). */
export function TransformDialog() {
  const dialog = useUi((s) => s.transformDialog);
  const documents = useDocuments();
  const session = documents.active?.session;
  if (!dialog || !session) return null;
  const space = getActiveSpace(session.document);
  const ids = topLevelIds(space, session.selection.spaceId === space.id ? session.selection.ids : []);
  if (ids.length === 0) return null;
  return <TransformForm key={`${dialog.kind}:${session.document.meta.id}`} kind={dialog.kind} origin={dialog.origin} ids={ids} />;
}

interface FormProps {
  kind: TransformKind;
  origin: Vec2 | null;
  ids: string[];
}

function TransformForm({ kind, origin, ids }: FormProps) {
  const documents = useDocuments();
  const close = useUi((s) => s.closeTransformDialog);
  const setLast = useUi((s) => s.setLastTransform);
  const session = documents.active!.session;
  const units = session.document.meta.units;

  const [angle, setAngle] = useState(kind === 'reflect' ? 0 : 0);
  const [uniform, setUniform] = useState(true);
  const [percent, setPercent] = useState(100);
  const [percentH, setPercentH] = useState(100);
  const [percentV, setPercentV] = useState(100);
  const [axis, setAxis] = useState<'h' | 'v' | 'angle'>('h');
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [preview, setPreview] = useState(true);

  // The origin is fixed for the lifetime of the dialog: the selection centre unless a tool set one.
  const center = useMemo<Vec2>(() => {
    const box = selectionBounds(getActiveSpace(session.document), ids);
    return origin ?? (box ? rectCenter(box) : { x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matrix: Matrix = useMemo(() => {
    switch (kind) {
      case 'rotate':
        return rotateAbout(toRadians(-angle), center); // counter-clockwise is positive, as in Illustrator
      case 'scale':
        return uniform ? scaleAbout(percent / 100, percent / 100, center) : scaleAbout(percentH / 100, percentV / 100, center);
      case 'reflect':
        return reflectAbout(axis === 'h' ? 0 : axis === 'v' ? Math.PI / 2 : toRadians(-angle), center);
      case 'move':
        return translation(unitToPt(dx, units), unitToPt(dy, units));
    }
  }, [kind, angle, uniform, percent, percentH, percentV, axis, dx, dy, center, units]);

  const applied = useRef(false);
  const committed = useRef(false);

  const dropPreview = () => {
    if (applied.current) {
      session.rollback();
      applied.current = false;
    }
  };

  // Live preview: every change replaces the previous provisional step.
  useEffect(() => {
    dropPreview();
    if (preview && !isIdentity(matrix)) {
      applyTransform(session, getActiveSpace(session.document), ids, matrix, false, nextTransformKey());
      applied.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, preview]);

  // Closing for any other reason must not leave the preview behind.
  useEffect(
    () => () => {
      if (!committed.current) dropPreview();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const accept = () => {
    if (!applied.current && !isIdentity(matrix)) {
      applyTransform(session, getActiveSpace(session.document), ids, matrix, false, nextTransformKey());
      applied.current = true;
    }
    committed.current = true;
    setLast({ matrix, copy: false });
    close();
  };

  const copy = () => {
    dropPreview();
    applyTransform(session, getActiveSpace(session.document), ids, matrix, true, nextTransformKey());
    committed.current = true;
    setLast({ matrix, copy: true });
    close();
  };

  const cancel = () => {
    dropPreview();
    close();
  };

  const distance = Math.hypot(dx, dy);
  const moveAngle = distance === 0 ? 0 : (Math.atan2(-dy, dx) * 180) / Math.PI;
  const sizeText = formatLength(1, units);

  return (
    <div className="vc-dialog__backdrop" data-testid="transform-dialog">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t(`transform.${kind}`)}
        onSubmit={(event) => {
          event.preventDefault();
          accept();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      >
        <h2 className="vc-dialog__title">{t(`transform.${kind}`)}</h2>

        {kind === 'rotate' && (
          <div className="vc-form__row">
            <label>{t('transform.angle')}</label>
            <NumberInput value={angle} onCommit={setAngle} suffix="°" step={1} decimals={3} width={96} testId="rotate-angle" tooltip={t('transform.angle')} />
          </div>
        )}

        {kind === 'scale' && (
          <>
            <label className="vc-form__radio">
              <input type="radio" name="scale-mode" checked={uniform} onChange={() => setUniform(true)} />
              {t('transform.uniform')}
            </label>
            <div className="vc-form__row vc-form__indent">
              <label>{t('transform.scale')}</label>
              <NumberInput value={percent} onCommit={setPercent} suffix="%" step={1} min={0.01} decimals={3} width={96} testId="scale-uniform" tooltip={t('transform.scale')} />
            </div>
            <label className="vc-form__radio">
              <input type="radio" name="scale-mode" checked={!uniform} onChange={() => setUniform(false)} />
              {t('transform.nonUniform')}
            </label>
            <div className="vc-form__row vc-form__indent">
              <label>{t('transform.horizontal')}</label>
              <NumberInput value={percentH} onCommit={setPercentH} suffix="%" step={1} decimals={3} width={96} testId="scale-h" tooltip={t('transform.horizontal')} />
            </div>
            <div className="vc-form__row vc-form__indent">
              <label>{t('transform.vertical')}</label>
              <NumberInput value={percentV} onCommit={setPercentV} suffix="%" step={1} decimals={3} width={96} testId="scale-v" tooltip={t('transform.vertical')} />
            </div>
          </>
        )}

        {kind === 'reflect' && (
          <>
            <label className="vc-form__radio">
              <input type="radio" name="axis" checked={axis === 'h'} onChange={() => setAxis('h')} />
              {t('transform.axisHorizontal')}
            </label>
            <label className="vc-form__radio">
              <input type="radio" name="axis" checked={axis === 'v'} onChange={() => setAxis('v')} />
              {t('transform.axisVertical')}
            </label>
            <label className="vc-form__radio">
              <input type="radio" name="axis" checked={axis === 'angle'} onChange={() => setAxis('angle')} />
              {t('transform.axisAngle')}
            </label>
            <div className="vc-form__row vc-form__indent">
              <label>{t('transform.angle')}</label>
              <NumberInput value={angle} onCommit={(v) => { setAngle(v); setAxis('angle'); }} suffix="°" step={1} width={96} testId="reflect-angle" tooltip={t('transform.angle')} />
            </div>
          </>
        )}

        {kind === 'move' && (
          <>
            <div className="vc-form__row">
              <label>{t('transform.horizontal')}</label>
              <NumberInput value={ptToUnit(unitToPt(dx, units), units)} onCommit={setDx} suffix={units} lengthUnit={units} step={1} decimals={3} width={110} testId="move-h" tooltip={t('transform.horizontal')} />
            </div>
            <div className="vc-form__row">
              <label>{t('transform.vertical')}</label>
              <NumberInput value={dy} onCommit={setDy} suffix={units} lengthUnit={units} step={1} decimals={3} width={110} testId="move-v" tooltip={t('transform.vertical')} />
            </div>
            <div className="vc-form__row">
              <label>{t('transform.distance')}</label>
              <NumberInput
                value={distance}
                onCommit={(v) => {
                  const a = (moveAngle * Math.PI) / 180;
                  setDx(v * Math.cos(a));
                  setDy(-v * Math.sin(a));
                }}
                suffix={units}
                lengthUnit={units}
                min={0}
                decimals={3}
                width={110}
                testId="move-distance"
                tooltip={t('transform.distance')}
              />
            </div>
            <div className="vc-form__row">
              <label>{t('transform.angle')}</label>
              <NumberInput
                value={moveAngle}
                onCommit={(v) => {
                  const a = (v * Math.PI) / 180;
                  setDx(distance * Math.cos(a));
                  setDy(-distance * Math.sin(a));
                }}
                suffix="°"
                decimals={3}
                width={110}
                testId="move-angle"
                tooltip={t('transform.angle')}
              />
            </div>
            <span className="vc-form__hint">{t('transform.unitHint', { unit: sizeText })}</span>
          </>
        )}

        <div className="vc-dialog__buttons vc-transform__footer">
          <label className="vc-form__check">
            <input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} data-testid="transform-preview" />
            {t('transform.preview')}
          </label>
          <span className="vc-transform__spacer" />
          <button type="button" className="vc-dialog__button" data-testid="transform-copy" onClick={copy}>
            {t('transform.copy')}
          </button>
          <button type="button" className="vc-dialog__button" data-testid="transform-cancel" onClick={cancel}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="transform-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
