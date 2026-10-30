import { useState } from 'react';
import { create } from 'zustand';
import { t } from '../i18n';
import '../components/DialogHost.css';
import './TransformDialog.css';

interface Pending {
  title: string;
  label: string;
  initial: string;
  resolve(value: string | null): void;
}

const usePrompt = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Asks for one line of text. Resolves with the trimmed text, or null when cancelled or left empty. */
export function askText(spec: { title: string; label: string; initial?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    usePrompt.getState().pending?.resolve(null); // a newer question replaces an unanswered one
    usePrompt.setState({ pending: { title: spec.title, label: spec.label, initial: spec.initial ?? '', resolve } });
  });
}

function PromptForm({ pending }: { pending: Pending }) {
  const [value, setValue] = useState(pending.initial);
  const answer = (result: string | null) => {
    usePrompt.setState({ pending: null });
    pending.resolve(result && result.trim() !== '' ? result.trim() : null);
  };
  return (
    <div className="vc-dialog__backdrop vc-dialog__backdrop--alert" data-testid="text-prompt">
      <form
        className="vc-dialog"
        role="dialog"
        aria-label={pending.title}
        onSubmit={(event) => {
          event.preventDefault();
          answer(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            answer(null);
          }
        }}
      >
        <h2 className="vc-dialog__title">{pending.title}</h2>
        <div className="vc-form__row">
          <label htmlFor="text-prompt-input">{pending.label}</label>
          <input id="text-prompt-input" data-testid="text-prompt-input" className="vc-form__input" value={value} maxLength={40} autoFocus onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="text-prompt-cancel" onClick={() => answer(null)}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="text-prompt-ok" disabled={value.trim() === ''}>
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Mounted once in the app; shows the question asked with `askText`. */
export function TextPromptHost() {
  const pending = usePrompt((s) => s.pending);
  return pending ? <PromptForm key={pending.title + pending.initial} pending={pending} /> : null;
}
