import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { t } from '../i18n';
import { CheckRow } from '../panels/kit';
import { AUTOSAVE_MINUTES, DEFAULT_PREFERENCES, usePreferences } from '../prefs/preferences';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/** Edición › Preferencias… (Ctrl+K). Changes apply at once; there is nothing to confirm. */
export function PreferencesDialog() {
  const open = useUi((s) => s.preferencesDialog);
  return open ? <PreferencesForm /> : null;
}

function PreferencesForm() {
  const close = useUi((s) => s.closePreferencesDialog);
  const { prefs, set, reset } = usePreferences();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const row = (label: string, field: React.ReactNode) => (
    <div className="vc-form__row">
      <label>{label}</label>
      {field}
    </div>
  );
  return (
    <div className="vc-dialog__backdrop" data-testid="preferences-dialog">
      <div className="vc-dialog vc-transform" role="dialog" aria-label={t('prefs.title')}>
        <h2 className="vc-dialog__title">{t('prefs.title')}</h2>
        <h3 className="vc-prefs__group">{t('prefs.tools')}</h3>
        <CheckRow checked={prefs.autoAddDelete} onChange={(autoAddDelete) => set({ autoAddDelete })} label={t('prefs.autoAddDelete')} testId="pref-auto-add-delete" />
        {row(
          t('prefs.pencilFidelity'),
          <NumberInput value={prefs.pencilFidelity} onCommit={(v) => set({ pencilFidelity: Math.round(v) as 1 })} min={1} max={5} step={1} decimals={0} width={80} testId="pref-pencil-fidelity" tooltip={t('prefs.pencilFidelityHint')} />,
        )}
        <h3 className="vc-prefs__group">{t('prefs.files')}</h3>
        <CheckRow checked={prefs.startScreen} onChange={(startScreen) => set({ startScreen })} label={t('prefs.startScreen')} testId="pref-start-screen" />
        <CheckRow checked={prefs.placeLinked} onChange={(placeLinked) => set({ placeLinked })} label={t('prefs.placeLinked')} testId="pref-place-linked" />
        {row(
          t('prefs.autosave'),
          <NumberInput value={prefs.autosaveMinutes} onCommit={(v) => set({ autosaveMinutes: v })} min={AUTOSAVE_MINUTES.min} max={AUTOSAVE_MINUTES.max} step={1} decimals={0} suffix={t('prefs.minutes')} width={110} testId="pref-autosave" tooltip={t('prefs.autosave')} />,
        )}
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="prefs-reset" disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFERENCES)} onClick={reset}>
            <Icon id="undo" size={12} /> {t('prefs.reset')}
          </button>
          <button type="button" className="vc-dialog__button vc-dialog__button--primary" data-testid="prefs-close" onClick={close}>
            {t('prefs.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
