import type { ParagraphStyle } from '../../core';
import { applyParagraph, paragraphField, selectedTextIds, type Field } from '../app/textActions';
import { useUi } from '../app/store';
import { ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { t } from '../i18n';
import { CheckRow, IconChoice, Row, Section } from './kit';
import { usePanelContext } from './context';

const ALIGNS = [
  { id: 'left', icon: 'para-left', tooltip: 'text.alignLeft' },
  { id: 'center', icon: 'para-center', tooltip: 'text.alignCenter' },
  { id: 'right', icon: 'para-right', tooltip: 'text.alignRight' },
  { id: 'justify', icon: 'justify-left', tooltip: 'text.justifyLeft' },
  { id: 'justifyCenter', icon: 'justify-center', tooltip: 'text.justifyCenter' },
  { id: 'justifyRight', icon: 'justify-right', tooltip: 'text.justifyRight' },
  { id: 'justifyAll', icon: 'justify-all', tooltip: 'text.justifyAll' },
] as const;

/** Párrafo (specs/07): alignment, justification variants, indents, spacing and hyphenation. */
export function ParagraphPanel() {
  const ctx = usePanelContext();
  useUi((s) => s.textEditing);
  useUi((s) => s.paragraphStyle);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const units = ctx.session.document.meta.units;
  const hasTarget = selectedTextIds().length > 0 || useUi.getState().textEditing !== null;

  const length = (key: 'indentLeft' | 'indentRight' | 'indentFirst' | 'spaceBefore' | 'spaceAfter', icon: 'indent-left' | 'indent-right' | 'indent-first' | 'space-before' | 'space-after', tooltip: Parameters<typeof t>[0]) => {
    const f: Field<number> = paragraphField(key);
    return (
      <NumberInput
        icon={icon}
        tooltip={t(tooltip)}
        value={f.mixed ? null : ptToUnit(f.value ?? 0, units)}
        suffix={units}
        lengthUnit={units}
        decimals={3}
        step={1}
        width={96}
        testId={`para-${key}`}
        onCommit={(v) => applyParagraph({ [key]: unitToPt(v, units) } as Partial<ParagraphStyle>)}
      />
    );
  };

  const align = paragraphField('align');
  const hyphenate = paragraphField('hyphenate');
  return (
    <div className="vc-panelbody" data-testid="paragraph-panel">
      {!hasTarget && <p className="vc-phint">{t('text.noText')}</p>}
      <Section title={t('text.paragraphSection')}>
        <Row>
          <IconChoice
            testId="para-align"
            value={align.mixed ? null : (align.value ?? 'left')}
            options={ALIGNS.slice(0, 3).map((a) => ({ id: a.id, icon: a.icon, tooltip: t(a.tooltip) }))}
            onChange={(a) => applyParagraph({ align: a })}
          />
        </Row>
        <Row>
          <IconChoice
            testId="para-justify"
            value={align.mixed ? null : (align.value ?? 'left')}
            options={ALIGNS.slice(3).map((a) => ({ id: a.id, icon: a.icon, tooltip: t(a.tooltip) }))}
            onChange={(a) => applyParagraph({ align: a })}
          />
        </Row>
      </Section>
      <Section title={t('text.indentSection')}>
        <Row>
          {length('indentLeft', 'indent-left', 'text.indentLeft')}
          {length('indentRight', 'indent-right', 'text.indentRight')}
        </Row>
        <Row>
          {length('indentFirst', 'indent-first', 'text.indentFirst')}
        </Row>
        <Row>
          {length('spaceBefore', 'space-before', 'text.spaceBefore')}
          {length('spaceAfter', 'space-after', 'text.spaceAfter')}
        </Row>
        <Row>
          <CheckRow checked={!hyphenate.mixed && hyphenate.value === true} mixed={hyphenate.mixed} label={t('text.hyphenate')} testId="para-hyphenate" onChange={(on) => applyParagraph({ hyphenate: on ? true : undefined })} />
        </Row>
      </Section>
    </div>
  );
}
