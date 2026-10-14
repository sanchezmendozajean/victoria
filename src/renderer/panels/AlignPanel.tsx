import { alignSelection, distributeSelection } from '../app/layoutActions';
import { useUi } from '../app/store';
import { Icon, type IconId } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t, type TranslationKey } from '../i18n';
import type { AlignKind, DistributeKind } from '../../core';
import { CheckRow, Choice, Row, Section } from './kit';
import { usePanelContext } from './context';

const ALIGN: Array<{ kind: AlignKind; icon: IconId; label: TranslationKey }> = [
  { kind: 'left', icon: 'align-left', label: 'align.left' },
  { kind: 'hcenter', icon: 'align-hcenter', label: 'align.hcenter' },
  { kind: 'right', icon: 'align-right', label: 'align.right' },
  { kind: 'top', icon: 'align-top', label: 'align.top' },
  { kind: 'vcenter', icon: 'align-vcenter', label: 'align.vcenter' },
  { kind: 'bottom', icon: 'align-bottom', label: 'align.bottom' },
];

const DISTRIBUTE: Array<{ kind: DistributeKind; icon: IconId; label: TranslationKey }> = [
  { kind: 'top', icon: 'dist-top', label: 'align.distTop' },
  { kind: 'vcenter', icon: 'dist-vcenter', label: 'align.distVCenter' },
  { kind: 'bottom', icon: 'dist-bottom', label: 'align.distBottom' },
  { kind: 'left', icon: 'dist-left', label: 'align.distLeft' },
  { kind: 'hcenter', icon: 'dist-hcenter', label: 'align.distHCenter' },
  { kind: 'right', icon: 'dist-right', label: 'align.distRight' },
];

/** The compact row of alignment buttons (also used by the Properties panel). */
export function AlignButtons({ testId = 'align-row' }: { testId?: string }) {
  const ctx = usePanelContext();
  const alignTo = useUi((s) => s.alignTo);
  const disabled = !ctx || ctx.ids.length === 0 || (alignTo !== 'artboard' && ctx.ids.length < 2);
  return (
    <div className="vc-iconrow" data-testid={testId}>
      {ALIGN.map((a) => (
        <button key={a.kind} type="button" className="vc-pbutton vc-pbutton--icon" data-testid={`align-${a.kind}`} disabled={disabled} {...tip(t(a.label))} onClick={() => alignSelection(a.kind)}>
          <Icon id={a.icon} size={16} />
        </button>
      ))}
    </div>
  );
}

/** Alineación (Mayús+F7): align, distribute and the "Alinear a" selector (specs/06). */
export function AlignPanel() {
  const ctx = usePanelContext();
  const alignTo = useUi((s) => s.alignTo);
  const setAlignTo = useUi((s) => s.setAlignTo);
  const preview = useUi((s) => s.alignPreviewBounds);
  const setPreview = useUi((s) => s.setAlignPreviewBounds);
  const keyObject = useUi((s) => s.keyObject);
  const setKey = useUi((s) => s.setKeyObject);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  const many = ctx.ids.length >= 3;

  return (
    <div className="vc-panelbody" data-testid="align-panel">
      <Section title={t('align.objects')}>
        <AlignButtons />
      </Section>
      <Section title={t('align.distribute')}>
        <div className="vc-iconrow">
          {DISTRIBUTE.map((d) => (
            <button key={d.kind} type="button" className="vc-pbutton vc-pbutton--icon" data-testid={`distribute-${d.kind}`} disabled={!many} {...tip(t(d.label))} onClick={() => distributeSelection(d.kind)}>
              <Icon id={d.icon} size={16} />
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('align.alignTo')}>
        <Row>
          <Choice
            value={alignTo}
            label={t('align.alignTo')}
            testId="align-to"
            width={190}
            icon={alignTo === 'key' ? 'align-to-key' : alignTo === 'artboard' ? 'align-to-artboard' : 'align-to-selection'}
            options={[
              { id: 'selection', label: t('align.toSelection') },
              { id: 'key', label: t('align.toKey') },
              { id: 'artboard', label: t('align.toArtboard') },
            ]}
            onChange={(v) => {
              setAlignTo(v as 'selection' | 'key' | 'artboard');
              if (v !== 'key') setKey(null);
            }}
          />
        </Row>
        {alignTo === 'key' && <p className="vc-phint" data-testid="align-key-hint">{keyObject ? t('align.keyChosen') : t('align.keyHint')}</p>}
        <CheckRow checked={preview} onChange={setPreview} label={t('align.previewBounds')} testId="align-preview-bounds" />
      </Section>
    </div>
  );
}
