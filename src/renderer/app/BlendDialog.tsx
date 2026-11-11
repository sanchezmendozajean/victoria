import { clampBlendSteps } from '../../core';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { cancelBlendCreate, selectedBlends, setSelectedBlendOptions } from './selectionActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';
import { DialogTitle } from '../components/DialogTitle';
import { Icon } from '../components/Icon';
import { CheckRow } from '../panels/kit';

/**
 * Objeto › Mezcla: parameters of a blend. After Crear the blend already exists and is shown as a preview; the number of
 * steps applies at once, Aceptar keeps it and Cancelar undoes it. From Opciones de mezcla… it edits the selected blend.
 */
export function BlendDialog() {
  const dialog = useUi((s) => s.blendDialog);
  const close = useUi((s) => s.setBlendDialog);
  const remembered = useUi((s) => s.blendSteps);
  const setRemembered = useUi((s) => s.setBlendSteps);
  const rememberedEquidistant = useUi((s) => s.blendEquidistant);
  const setRememberedEquidistant = useUi((s) => s.setBlendEquidistant);
  const documents = useDocuments();
  if (!dialog || !documents.active) return null;
  const live = selectedBlends()[0];
  const steps = live?.blend?.steps ?? remembered;
  const commit = (value: number) => {
    const next = clampBlendSteps(value);
    setRemembered(next);
    setSelectedBlendOptions({ steps: next });
  };
  const equidistant = live ? live.blend?.equidistant === true : rememberedEquidistant;
  const commitEquidistant = (value: boolean) => {
    setRememberedEquidistant(value);
    setSelectedBlendOptions({ equidistant: value });
  };
  const accept = () => close(null);
  const cancel = () => {
    if (dialog.mode === 'create') cancelBlendCreate(dialog.base);
    close(null);
  };
  return (
    <div className="vc-dialog__backdrop" data-testid="blend-dialog">
      <div
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={t('blend.title')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            accept();
          }
        }}
      >
        <DialogTitle icon="blend-options" onClose={cancel}>{t('blend.title')}</DialogTitle>
        <div className="vc-form__row">
          <span>{t('blend.steps')}</span>
          <NumberInput value={steps} decimals={0} step={1} min={1} max={1000} width={110} testId="blend-steps" tooltip={t('blend.steps')} onCommit={commit} />
        </div>
        <CheckRow checked={equidistant} label={t('blend.equidistant')} testId="blend-equidistant" onChange={commitEquidistant} />
        <p className="vc-dialog__detail">{t(dialog.mode === 'create' ? 'blend.hintCreate' : 'blend.hintLive')}</p>
        <div className="vc-dialog__buttons">
          {dialog.mode === 'create' && (
            <button type="button" className="vc-dialog__button" data-testid="blend-cancel" onClick={cancel}>
              <Icon id="close" size={14} />
              {t('dialog.cancel')}
            </button>
          )}
          <button type="button" className="vc-dialog__button vc-dialog__button--primary" data-testid="blend-accept" onClick={accept}>
            <Icon id="check" size={14} />
            {t('blend.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
