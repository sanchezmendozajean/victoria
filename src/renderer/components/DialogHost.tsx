import { useEffect, useRef } from 'react';
import { answerDialog, useDialogs } from '../app/dialogs';
import { cx } from './cx';
import './DialogHost.css';

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
        <h2 className="vc-dialog__title">{dialog.title}</h2>
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
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
