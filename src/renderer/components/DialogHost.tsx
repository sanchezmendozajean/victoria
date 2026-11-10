import { useEffect, useRef } from 'react';
import { answerDialog, useDialogs } from '../app/dialogs';
import { cx } from './cx';
import { DialogTitle } from './DialogTitle';
import { Icon, type IconId } from './Icon';
import './DialogHost.css';

const BUTTON_ICONS: Record<string, IconId> = { cancel: 'close', ok: 'check', save: 'save', delete: 'delete', discard: 'close' };

/** Renders the first queued modal dialog (specs/10 · Diálogo: title 13 px, buttons at the right). */
export function DialogHost() {
  const dialog = useDialogs((s) => s.queue[0]);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    primary.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const escapeId = dialog.escapeId ?? dialog.buttons.find((b) => b.id === 'cancel')?.id;
      if (escapeId) {
        event.preventDefault();
        answerDialog(escapeId);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [dialog]);

  if (!dialog) return null;
  const defaultButton = dialog.buttons.find((b) => b.variant === 'primary') ?? dialog.buttons[dialog.buttons.length - 1];

  return (
    <div className="vc-dialog__backdrop vc-dialog__backdrop--alert" data-testid="dialog">
      <div className="vc-dialog" role="alertdialog" aria-modal="true" aria-label={dialog.title}>
        <DialogTitle icon={dialog.buttons.some((b) => b.variant === 'danger') ? 'alert' : 'info'}>{dialog.title}</DialogTitle>
        {dialog.message && <p className="vc-dialog__message">{dialog.message}</p>}
        {dialog.items && (
          <ul className="vc-dialog__items">
            {dialog.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {dialog.detail && <p className="vc-dialog__detail">{dialog.detail}</p>}
        <div className="vc-dialog__buttons">
          {dialog.buttons.map((button) => (
            <button
              key={button.id}
              ref={button.id === defaultButton?.id ? primary : undefined}
              type="button"
              data-testid={`dialog-${button.id}`}
              className={cx('vc-dialog__button', button.variant && `vc-dialog__button--${button.variant}`)}
              onClick={() => answerDialog(button.id)}
            >
              {BUTTON_ICONS[button.id] && <Icon id={BUTTON_ICONS[button.id] as IconId} size={14} />}
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
