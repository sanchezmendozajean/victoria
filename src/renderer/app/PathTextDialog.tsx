import { setPathTextOptions, type PathTextEffect, type PathTextOptions } from '../../core';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t, type TranslationKey } from '../i18n';
import { CheckRow, Choice } from '../panels/kit';
import { selectedPathText } from './textActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

const EFFECTS: PathTextEffect[] = ['rainbow', 'skew', 'ribbon', 'stair', 'gravity'];
const ALIGNS: PathTextOptions['align'][] = ['ascender', 'descender', 'center', 'baseline'];

/** Texto › Opciones de texto en trazado: effect, alignment to the path, spacing and flip. Changes apply at once. */
export function PathTextDialog() {
  const open = useUi((s) => s.pathTextDialog);
  const close = useUi((s) => s.setPathTextDialog);
  const documents = useDocuments();
  const session = documents.active?.session;
  const node = open && session ? selectedPathText() : null;
  if (!open || !session || !node?.pathOptions) return null;
  const options = node.pathOptions;
  const spaceId = session.selection.spaceId;
  const apply = (patch: Partial<PathTextOptions>) => session.run(setPathTextOptions(spaceId, node.id, patch));
  const row = (label: string, field: React.ReactNode) => (
    <div className="vc-form__row">
      <span>{label}</span>
      {field}
    </div>
  );
  return (
    <div className="vc-dialog__backdrop" data-testid="pathtext-dialog">
      <div
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t('pathText.title')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            close(false);
          }
        }}
      >
        <h2 className="vc-dialog__title">{t('pathText.title')}</h2>
        {row(t('pathText.effect'), <Choice label={t('pathText.effect')} value={options.effect} testId="pathtext-effect" width={150} options={EFFECTS.map((e) => ({ id: e, label: t(`pathText.effect.${e}` as TranslationKey) }))} onChange={(effect) => apply({ effect })} />)}
        {row(t('pathText.align'), <Choice label={t('pathText.align')} value={options.align} testId="pathtext-align" width={150} options={ALIGNS.map((a) => ({ id: a, label: t(`pathText.align.${a}` as TranslationKey) }))} onChange={(align) => apply({ align })} />)}
        {row(t('pathText.spacing'), <NumberInput value={options.spacing} suffix="pt" decimals={2} step={1} width={110} testId="pathtext-spacing" tooltip={t('pathText.spacing')} onCommit={(spacing) => apply({ spacing })} />)}
        <CheckRow checked={options.flip} label={t('pathText.flip')} testId="pathtext-flip" onChange={(flip) => apply({ flip })} />
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button vc-dialog__button--primary" data-testid="pathtext-close" onClick={() => close(false)}>
            {t('pathText.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
