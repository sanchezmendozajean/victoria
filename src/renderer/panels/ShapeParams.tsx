import { useState } from 'react';
import { patchNode, type EllipseParams, type PolygonParams, type RectParams, type ShapeNode, type StarParams } from '../../core';
import { nextPaintKey } from '../app/paintActions';
import { ptToUnit, unitToPt } from '../canvas/units';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { Choice, Row, Section } from './kit';
import { usePanelContext } from './context';

/** Parameters of a selected live shape: corner radii (with lock), sides, points, pie angles (specs/06 · Transformar, Propiedades). */
export function ShapeParams() {
  const ctx = usePanelContext();
  const [locked, setLocked] = useState(true);
  if (!ctx || ctx.ids.length !== 1) return null;
  const node = ctx.leaves[0];
  if (!node || node.type !== 'shape' || ctx.leaves.length !== 1) return null;
  const shape = node as ShapeNode;
  const units = ctx.session.document.meta.units;
  const len = { suffix: units, lengthUnit: units, decimals: 3, step: 1, width: 92 } as const;
  const patch = (params: ShapeNode['params'], key?: string) => ctx.session.run(patchNode<ShapeNode>(ctx.space.id, shape.id, { params } as Partial<ShapeNode>, key));

  if (shape.shape === 'rect') {
    const p = shape.params as RectParams;
    const setRadius = (index: number, value: number) => {
      const v = Math.max(0, unitToPt(value, units));
      const radii = (locked ? [v, v, v, v] : p.radii.map((r, i) => (i === index ? v : r))) as RectParams['radii'];
      patch({ ...p, radii });
    };
    return (
      <Section title={t('shape.paramsTitle')} testId="shape-params">
        <div className="vc-pgrid">
          {[0, 1, 3, 2].map((i) => (
            <NumberInput
              key={i}
              icon={i === 0 ? 'tool-rounded-rect' : undefined}
              label={['↖', '↗', '↘', '↙'][i]}
              value={Math.round(ptToUnit(p.radii[i] as number, units) * 1000) / 1000}
              onCommit={(v) => setRadius(i, v)}
              min={0}
              testId={`shape-radius-${i}`}
              tooltip={t('shape.cornerRadius')}
              {...len}
            />
          ))}
        </div>
        <Row>
          <button type="button" className="vc-pbutton vc-pbutton--icon" aria-pressed={locked} data-testid="shape-radius-lock" {...tip(t('control.keepProportions'))} onClick={() => setLocked(!locked)} style={locked ? { background: 'var(--bg-active)' } : undefined}>
            <Icon id={locked ? 'link' : 'unlink'} size={14} />
          </button>
          <Choice
            value={p.cornerType}
            label={t('shape.cornerType')}
            testId="shape-corner-type"
            width={130}
            options={[
              { id: 'round', label: t('shape.cornerRound') },
              { id: 'inverted', label: t('shape.cornerInverted') },
              { id: 'chamfer', label: t('shape.cornerChamfer') },
            ]}
            onChange={(cornerType) => patch({ ...p, cornerType })}
          />
        </Row>
      </Section>
    );
  }

  if (shape.shape === 'polygon') {
    const p = shape.params as PolygonParams;
    return (
      <Section title={t('shape.paramsTitle')} testId="shape-params">
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.sides')}</span>
          <NumberInput value={p.sides} onCommit={(v) => patch({ ...p, sides: Math.max(3, Math.round(v)) })} min={3} decimals={0} width={92} testId="shape-sides-field" tooltip={t('shape.sides')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.radius')}</span>
          <NumberInput value={Math.round(ptToUnit(p.radius, units) * 1000) / 1000} onCommit={(v) => patch({ ...p, radius: Math.max(0.001, unitToPt(v, units)) })} min={0.001} testId="shape-radius-field" tooltip={t('shape.radius')} {...len} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.cornerRadius')}</span>
          <NumberInput value={Math.round(ptToUnit(p.cornerRadius, units) * 1000) / 1000} onCommit={(v) => patch({ ...p, cornerRadius: Math.max(0, unitToPt(v, units)) })} min={0} testId="shape-corner-field" tooltip={t('shape.cornerRadius')} {...len} />
        </Row>
      </Section>
    );
  }

  if (shape.shape === 'star') {
    const p = shape.params as StarParams;
    return (
      <Section title={t('shape.paramsTitle')} testId="shape-params">
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.points')}</span>
          <NumberInput value={p.points} onCommit={(v) => patch({ ...p, points: Math.max(3, Math.round(v)) })} min={3} decimals={0} width={92} testId="shape-points-field" tooltip={t('shape.points')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.radius1')}</span>
          <NumberInput value={Math.round(ptToUnit(p.r1, units) * 1000) / 1000} onCommit={(v) => patch({ ...p, r1: Math.max(0.001, unitToPt(v, units)) })} min={0.001} testId="shape-r1-field" tooltip={t('shape.radius1')} {...len} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.radius2')}</span>
          <NumberInput value={Math.round(ptToUnit(p.r2, units) * 1000) / 1000} onCommit={(v) => patch({ ...p, r2: Math.max(0.001, unitToPt(v, units)) })} min={0.001} testId="shape-r2-field" tooltip={t('shape.radius2')} {...len} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.cornerRadius')}</span>
          <NumberInput value={Math.round(ptToUnit(p.cornerRadius, units) * 1000) / 1000} onCommit={(v) => patch({ ...p, cornerRadius: Math.max(0, unitToPt(v, units)) })} min={0} testId="shape-corner-field" tooltip={t('shape.cornerRadius')} {...len} />
        </Row>
      </Section>
    );
  }

  if (shape.shape === 'ellipse') {
    const p = shape.params as EllipseParams;
    return (
      <Section title={t('shape.paramsTitle')} testId="shape-params">
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.pieStart')}</span>
          <NumberInput icon="angle" value={Math.round(p.startAngle * 100) / 100} onCommit={(v) => patch({ ...p, startAngle: ((v % 360) + 360) % 360 }, nextPaintKey())} suffix="°" decimals={2} width={92} testId="shape-pie-start" tooltip={t('shape.pieStart')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('shape.pieEnd')}</span>
          <NumberInput icon="angle" value={Math.round(p.endAngle * 100) / 100} onCommit={(v) => patch({ ...p, endAngle: v })} suffix="°" decimals={2} width={92} testId="shape-pie-end" tooltip={t('shape.pieEnd')} />
        </Row>
      </Section>
    );
  }

  return null;
}
