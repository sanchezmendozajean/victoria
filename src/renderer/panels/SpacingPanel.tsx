import { useState } from 'react';
import { currentSpacing } from '../../core';
import { fitSelectionToArtboard, gridSelection, selectionItems, spaceSelection } from '../app/layoutActions';
import { actionContext } from '../app/selectionActions';
import { ptToUnit, unitToPt } from '../canvas/units';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { Row, Section } from './kit';
import { usePanelContext } from './context';

/** Espaciado (specs/06): distribute by an exact or automatic gap, equal grid, fit to the artboard with margins. */
export function SpacingPanel() {
  const ctx = usePanelContext();
  // Gap typed by the user, in the document unit; null = Auto.
  const [gap, setGap] = useState<number | null>(null);
  const [columns, setColumns] = useState(3);
  const [gridGapX, setGridGapX] = useState(10);
  const [gridGapY, setGridGapY] = useState(10);
  const [margin, setMargin] = useState(10);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const units = ctx.session.document.meta.units;
  const lengthProps = { suffix: units, lengthUnit: units, decimals: 3, step: 1, width: 96 } as const;

  const live = actionContext();
  const items = live ? selectionItems(live) : [];
  const horizontal = currentSpacing(items, 'h');
  const vertical = currentSpacing(items, 'v');
  const show = (s: { value: number | null; mixed: boolean }) => (s.mixed ? t('spacing.mixed') : s.value === null ? '—' : `${Math.round(ptToUnit(s.value, units) * 1000) / 1000} ${units}`);
  const many = ctx.ids.length >= 2;
  const gapPt = gap === null ? null : unitToPt(gap, units);

  return (
    <div className="vc-panelbody" data-testid="spacing-panel">
      <Section title={t('spacing.distribute')}>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('spacing.gap')}</span>
          <NumberInput value={gap} onCommit={setGap} testId="spacing-gap" tooltip={t('spacing.gap')} {...lengthProps} />
          <button type="button" className="vc-pbutton" data-testid="spacing-auto" disabled={gap === null} {...tip(t('spacing.autoTip'))} onClick={() => setGap(null)}>
            {t('spacing.auto')}
          </button>
        </Row>
        <Row>
          <button type="button" className="vc-pbutton" data-testid="spacing-h" disabled={!many} onClick={() => spaceSelection('h', gapPt)}>
            <Icon id="space-horizontal" size={16} />
            {t('spacing.horizontal')}
          </button>
          <button type="button" className="vc-pbutton" data-testid="spacing-v" disabled={!many} onClick={() => spaceSelection('v', gapPt)}>
            <Icon id="space-vertical" size={16} />
            {t('spacing.vertical')}
          </button>
        </Row>
        <Row>
          <span className="vc-plabel" style={{ flex: 1 }}>{t('spacing.currentH')}</span>
          <span data-testid="spacing-current-h">{show(horizontal)}</span>
        </Row>
        <Row>
          <span className="vc-plabel" style={{ flex: 1 }}>{t('spacing.currentV')}</span>
          <span data-testid="spacing-current-v">{show(vertical)}</span>
        </Row>
      </Section>

      <Section title={t('spacing.grid')}>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('spacing.columns')}</span>
          <NumberInput value={columns} onCommit={(v) => setColumns(Math.max(1, Math.round(v)))} min={1} decimals={0} width={96} testId="spacing-columns" tooltip={t('spacing.columns')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('spacing.gapX')}</span>
          <NumberInput value={gridGapX} onCommit={setGridGapX} testId="spacing-grid-x" tooltip={t('spacing.gapX')} {...lengthProps} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('spacing.gapY')}</span>
          <NumberInput value={gridGapY} onCommit={setGridGapY} testId="spacing-grid-y" tooltip={t('spacing.gapY')} {...lengthProps} />
        </Row>
        <Row>
          <button
            type="button"
            className="vc-pbutton"
            data-testid="spacing-grid"
            disabled={ctx.ids.length === 0}
            onClick={() => gridSelection({ columns, gapX: unitToPt(gridGapX, units), gapY: unitToPt(gridGapY, units) })}
          >
            <Icon id="space-grid" size={16} />
            {t('spacing.arrange')}
          </button>
        </Row>
      </Section>

      <Section title={t('spacing.fit')}>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('spacing.margin')}</span>
          <NumberInput value={margin} onCommit={setMargin} min={0} testId="spacing-margin" tooltip={t('spacing.margin')} {...lengthProps} />
        </Row>
        <Row>
          <button
            type="button"
            className="vc-pbutton"
            data-testid="spacing-fit"
            disabled={ctx.ids.length === 0}
            onClick={() => {
              const m = unitToPt(margin, units);
              fitSelectionToArtboard({ top: m, right: m, bottom: m, left: m });
            }}
          >
            <Icon id="space-margins" size={16} />
            {t('spacing.fitButton')}
          </button>
        </Row>
      </Section>
    </div>
  );
}
