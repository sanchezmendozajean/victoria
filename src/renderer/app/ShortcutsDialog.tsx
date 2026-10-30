import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { t, type TranslationKey } from '../i18n';
import { usePreferences } from '../prefs/preferences';
import { SHORTCUT_SECTIONS, sectionOf, shortcutLabel } from './shortcutLabels';
import { acceleratorFromEvent, DEFAULT_SHORTCUTS, findConflict, formatAccelerator, normalizeAccelerator, SHORTCUTS, type ShortcutAction } from './shortcuts';
import { useUi } from './store';
import '../components/DialogHost.css';
import './ShortcutsDialog.css';

/** Edición › Atajos de teclado…: every shortcut, searchable, each one changeable by pressing the new keys. */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsDialog);
  return open ? <ShortcutsForm /> : null;
}

const ACTIONS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

function ShortcutsForm() {
  const close = useUi((s) => s.closeShortcutsDialog);
  const os = useUi((s) => s.platform.os);
  const { prefs, set } = usePreferences();
  const [query, setQuery] = useState('');
  /** The action waiting for a key press, and the clash a press ran into, if any. */
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [clash, setClash] = useState<{ action: ShortcutAction; accelerator: string; other: ShortcutAction } | null>(null);

  const save = (changes: Partial<Record<ShortcutAction, string>>) => {
    const next = { ...prefs.shortcuts };
    for (const [action, accelerator] of Object.entries(changes) as Array<[ShortcutAction, string]>) {
      // A shortcut put back to its default is not stored as a change.
      if (normalizeAccelerator(accelerator) === normalizeAccelerator(DEFAULT_SHORTCUTS[action])) delete next[action];
      else next[action] = accelerator;
    }
    set({ shortcuts: next });
  };

  // While waiting for keys, nothing reaches the rest of the app (a typed "V" must not switch tools).
  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === 'Escape') {
        setCapturing(null);
        setClash(null);
        return;
      }
      const accelerator = acceleratorFromEvent(event, os);
      if (!accelerator) return;
      const other = findConflict(accelerator, capturing);
      if (other) {
        setClash({ action: capturing, accelerator, other });
        setCapturing(null);
        return;
      }
      save({ [capturing]: accelerator });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, os, prefs.shortcuts]);

  useEffect(() => {
    if (capturing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (clash) setClash(null);
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, clash, close]);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      SHORTCUT_SECTIONS.map((section) => ({
        section,
        actions: ACTIONS.filter((a) => sectionOf(a) === section && (needle === '' || shortcutLabel(a).toLowerCase().includes(needle) || formatAccelerator(SHORTCUTS[a], os).toLowerCase().includes(needle))),
      })).filter((g) => g.actions.length > 0),
    // The list reads the live map, which changes with the preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, os, prefs.shortcuts],
  );

  const changed = Object.keys(prefs.shortcuts).length;
  return (
    <div className="vc-dialog__backdrop" data-testid="shortcuts-dialog">
      <div className="vc-dialog vc-shortcuts" role="dialog" aria-label={t('shortcuts.title')}>
        <h2 className="vc-dialog__title">{t('shortcuts.title')}</h2>
        <input className="vc-shortcuts__search" data-testid="shortcuts-search" type="search" placeholder={t('shortcuts.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        {clash && (
          <div className="vc-shortcuts__clash" role="alert" data-testid="shortcuts-clash">
            <span>{t('shortcuts.conflict', { keys: formatAccelerator(clash.accelerator, os), other: shortcutLabel(clash.other) })}</span>
            <button
              type="button"
              className="vc-dialog__button vc-dialog__button--primary"
              data-testid="shortcuts-swap"
              onClick={() => {
                // The other action gets the key this one gives up, so no key ever does two things.
                save({ [clash.action]: clash.accelerator, [clash.other]: SHORTCUTS[clash.action] });
                setClash(null);
              }}
            >
              {t('shortcuts.swap')}
            </button>
            <button type="button" className="vc-dialog__button" data-testid="shortcuts-clash-cancel" onClick={() => setClash(null)}>
              {t('shortcuts.cancel')}
            </button>
          </div>
        )}
        <div className="vc-shortcuts__list" data-testid="shortcuts-list">
          {groups.length === 0 && <p className="vc-shortcuts__empty">{t('shortcuts.none')}</p>}
          {groups.map(({ section, actions }) => (
            <section key={section}>
              <h3 className="vc-prefs__group">{t(`shortcuts.section.${section}` as TranslationKey)}</h3>
              {actions.map((action) => {
                const custom = action in prefs.shortcuts;
                return (
                  <div className="vc-shortcuts__row" key={action} data-testid={`shortcut-row-${action}`}>
                    <span className="vc-shortcuts__name">{shortcutLabel(action)}</span>
                    <button
                      type="button"
                      className={`vc-shortcuts__keys${capturing === action ? ' is-capturing' : ''}${custom ? ' is-custom' : ''}`}
                      data-testid={`shortcut-keys-${action}`}
                      onClick={() => {
                        setClash(null);
                        setCapturing(action);
                      }}
                    >
                      {capturing === action ? t('shortcuts.press') : formatAccelerator(SHORTCUTS[action], os)}
                    </button>
                    <button type="button" className="vc-shortcuts__reset" aria-label={t('shortcuts.reset')} title={t('shortcuts.reset')} disabled={!custom} data-testid={`shortcut-reset-${action}`} onClick={() => save({ [action]: DEFAULT_SHORTCUTS[action] })}>
                      <Icon id="undo" size={12} />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="shortcuts-reset-all" disabled={changed === 0} onClick={() => set({ shortcuts: {} })}>
            <Icon id="undo" size={12} /> {t('shortcuts.resetAll')}
          </button>
          <button type="button" className="vc-dialog__button vc-dialog__button--primary" data-testid="shortcuts-close" onClick={close}>
            {t('shortcuts.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
