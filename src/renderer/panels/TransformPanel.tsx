import { selectionBounds, toDegrees, worldRotationOf } from '../../core';
import { flipSelection, moveSelectionTo, resizeSelection, rotateSelection, shearSelection } from '../app/transformActions';
import { useUi } from '../app/store';
import { ptToUnit, unitToPt } from '../canvas/units';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { CheckRow, Row, Section } from './kit';
import { usePanelContext } from './context';
import { ShapeParams } from './ShapeParams';

/** Transformar (Mayús+F8, specs/06): X, Y, An, Al with reference point, angle, shear, flip, scale strokes and live-shape parameters. */
export function TransformPanel({ compact = false }: { compact?: boolean }) {
  const ctx = usePanelContext();
  const ref = useUi((s) => s.referencePoint);
  const setRef = useUi((s) => s.setReferencePoint);
  const linked = useUi((s) => s.linkProportions);
  const toggleLink = useUi((s) => s.toggleLinkProportions);
  const scaleStrokes = useUi((s) => s.scaleStrokes);
  const setScaleStrokes = useUi((s) => s.setScaleStrokes);
  const active = useUi((s) => s.activeArtboard);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const box = ctx.ids.length > 0 ? selectionBounds(ctx.space, ctx.ids) : null;
  const units = ctx.session.document.meta.units;
  const board = ctx.space.artboards.find((a) => a.id === active[ctx.space.id]) ?? ctx.space.artboards[0];
  const origin = { x: board?.x ?? 0, y: board?.y ?? 0 };
  const width = box ? box.maxX - box.minX : 0;
  const height = box ? box.maxY - box.minY : 0;
  const point = box ? { x: box.minX + ref.x * width, y: box.minY + ref.y * height } : null;
  const off = !box;
  const angle = ctx.ids.length === 1 ? -toDegrees(worldRotationOf(ctx.space, ctx.ids[0] as string)) : 0;
  const lengthProps = { suffix: units, lengthUnit: units, decimals: 3, disabled: off } as const;
  const body = (
    <>
      <div className="vc-transformgrid">
        <div className="vc-refpoint" role="group" aria-label={t('control.referencePoint')} data-testid="transform-ref-point">
          {[0, 0.5, 1].flatMap((y) =>
            [0, 0.5, 1].map((x) => (
              <button key={`${x}-${y}`} type="button" className={x === ref.x && y === ref.y ? 'is-active' : undefined} aria-pressed={x === ref.x && y === ref.y} data-testid={`transform-ref-${x}-${y}`} onClick={() => setRef({ x, y })} />
            )),
          )}
        </div>
        <NumberInput label="X" value={point ? ptToUnit(point.x - origin.x, units) : null} onCommit={(v) => moveSelectionTo('x', unitToPt(v, units) + origin.x)} testId="transform-x" tooltip="X" width={92} {...lengthProps} />
        <NumberInput label="Y" value={point ? ptToUnit(point.y - origin.y, units) : null} onCommit={(v) => moveSelectionTo('y', unitToPt(v, units) + origin.y)} testId="transform-y" tooltip="Y" width={92} {...lengthProps} />
        <NumberInput label={t('measure.width')} value={box ? ptToUnit(width, units) : null} onCommit={(v) => resizeSelection('x', unitToPt(v, units))} min={0} testId="transform-w" tooltip={t('measure.width')} width={92} {...lengthProps} />
        <button type="button" className={linked ? 'vc-linkbutton is-on' : 'vc-linkbutton'} aria-pressed={linked} data-testid="transform-link" {...tip(t('control.keepProportions'))} onClick={toggleLink}>
          <Icon id={linked ? 'link' : 'unlink'} size={14} />
        </button>
        <NumberInput label={t('measure.height')} value={box ? ptToUnit(height, units) : null} onCommit={(v) => resizeSelection('y', unitToPt(v, units))} min={0} testId="transform-h" tooltip={t('measure.height')} width={92} {...lengthProps} />
      </div>
      <Row>
        <NumberInput icon="angle" value={box ? Math.round(angle * 1000) / 1000 : null} onCommit={(v) => rotateSelection(v - angle)} suffix="°" decimals={3} width={92} disabled={off} testId="transform-angle" tooltip={t('control.angle')} />
        <NumberInput icon="shear" value={box ? 0 : null} onCommit={(v) => shearSelection(v)} suffix="°" decimals={3} width={92} disabled={off} testId="transform-shear" tooltip={t('transform.shear')} />
      </Row>
      <Row>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="transform-flip-h" disabled={off} {...tip(t('transform.flipH'))} onClick={() => flipSelection('h')}>
          <Icon id="flip-h" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="transform-flip-v" disabled={off} {...tip(t('transform.flipV'))} onClick={() => flipSelection('v')}>
          <Icon id="flip-v" size={16} />
        </button>
      </Row>
    </>
  );
  if (compact) return <div data-testid="transform-compact">{body}</div>;
  return (
    <div className="vc-panelbody" data-testid="transform-panel">
      <Section title={t('transform.title')}>
        {body}
        <CheckRow checked={scaleStrokes} onChange={setScaleStrokes} label={t('transform.scaleStrokes')} testId="transform-scale-strokes" />
      </Section>
      <ShapeParams />
    </div>
  );
}
