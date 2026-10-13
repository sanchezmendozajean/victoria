import { create } from 'zustand';

export interface DialogButton {
  id: string;
  label: string;
  variant?: 'primary' | 'danger';
}

export interface DialogSpec {
  title: string;
  message?: string;
  detail?: string;
  /** Plain lines shown in a list (recovery dialog). */
  items?: string[];
  buttons: DialogButton[];
  /** Button chosen by Escape (default: a button with id "cancel", else none). */
  escapeId?: string;
}

interface Pending extends DialogSpec {
  resolve(id: string): void;
}

interface DialogState {
  queue: Pending[];
}

export const useDialogs = create<DialogState>()(() => ({ queue: [] }));

/** Shows a modal dialog and resolves with the id of the pressed button. Dialogs queue up. */
export function askUser(spec: DialogSpec): Promise<string> {
  return new Promise((resolve) => {
    useDialogs.setState((s) => ({ queue: [...s.queue, { ...spec, resolve }] }));
  });
}

export function answerDialog(id: string): void {
  const [first, ...rest] = useDialogs.getState().queue;
  if (!first) return;
  useDialogs.setState({ queue: rest });
  first.resolve(id);
}
