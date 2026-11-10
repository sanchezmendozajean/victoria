import type { ReactNode } from 'react';
import { t } from '../i18n';
import { Icon, type IconId } from './Icon';
import { tip } from './Tooltip';

/** Header bar shared by every dialog (same look as Imprimir): icon, title and an optional close button. */
export function DialogTitle({ icon, children, onClose }: { icon: IconId; children: ReactNode; onClose?: () => void }) {
  return (
    <header className="vc-dialog__header">
      <Icon id={icon} size={16} />
      <h2 className="vc-dialog__title">{children}</h2>
      <span className="vc-dialog__spacer" />
      {onClose && (
        <button type="button" className="vc-dialog__close" data-testid="dialog-close" {...tip(t('dialog.close'))} onClick={onClose}>
          <Icon id="close" size={14} />
        </button>
      )}
    </header>
  );
}
