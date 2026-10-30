import { operandCount, PATHFINDERS, SHAPE_MODES, type PathfinderOp } from '../../core';
import { applyModifiersToSelection, selectionHasModifiers } from '../app/modifierActions';
import { runPathfinder } from '../app/pathfinderActions';
import { Icon, type IconId } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t, type TranslationKey } from '../i18n';
import { Row, Section } from './kit';
import { usePanelContext } from './context';

const ICONS: Record<PathfinderOp, IconId> = {
  unite: 'pf-unite',
  minusFront: 'pf-minus-front',
  intersect: 'pf-intersect',
  exclude: 'pf-exclude',
  divide: 'pf-divide',
  trim: 'pf-trim',
  merge: 'pf-merge',
  crop: 'pf-crop',
  outline: 'pf-outline',
  minusBack: 'pf-minus-back',
};

/** Buscatrazos (specs/06): shape modes and pathfinders over the selection. */
export function PathfinderPanel() {
  const ctx = usePanelContext();
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const enabled = operandCount(ctx.space, ctx.ids) >= 2;

  const button = (op: PathfinderOp) => (
    <button
      key={op}
      type="button"
      className="vc-pbutton vc-pbutton--icon"
      data-testid={`pf-${op}`}
      disabled={!enabled}
      {...tip(t(`pf.${op}` as TranslationKey))}
      onClick={(event) => void runPathfinder(op, event.altKey)}
    >
      <Icon id={ICONS[op]} size={18} />
    </button>
  );

  return (
    <div className="vc-panelbody" data-testid="pathfinder-panel">
      <Section title={t('pf.shapeModes')}>
        <Row>
          {SHAPE_MODES.map(button)}
          <button type="button" className="vc-pbutton" data-testid="pf-expand" disabled={!selectionHasModifiers()} {...tip(t('pf.expandTip'))} onClick={() => applyModifiersToSelection()}>
            <Icon id="pf-expand" size={16} />
            {t('pf.expand')}
          </button>
        </Row>
      </Section>
      <Section title={t('pf.pathfinders')}>
        <Row>{PATHFINDERS.map(button)}</Row>
      </Section>
    </div>
  );
}
