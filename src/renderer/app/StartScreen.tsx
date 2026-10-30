import { useEffect, useState } from 'react';
import { findPreset } from '../../core';
import type { RecentFile } from '../../shared/ipc';
import { Icon } from '../components/Icon';
import { manager } from '../documents';
import { t } from '../i18n';
import './StartScreen.css';

/** Presets offered as cards (ids of `core/model/presets`). */
const CARDS = [
  { id: 'A4', icon: 'file-text' },
  { id: 'Carta', icon: 'file-text' },
  { id: 'Icono 24', icon: 'artboard-new' },
  { id: 'Instagram', icon: 'image' },
] as const;

const SIZE_UNIT = (preset: string): string => {
  const p = findPreset(preset);
  if (!p) return '';
  // Presets in pt: paper sizes read in mm, screen sizes in px.
  return preset === 'A4' ? '210 × 297 mm' : preset === 'Carta' ? '8,5 × 11 in' : `${Math.round(p.w)} × ${Math.round(p.h)} px`;
};

/** Shown when no document is open (specs/10 · pantalla de inicio): new document from a preset, open, and the recent ones. */
export function StartScreen() {
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => {
    let alive = true;
    void window.victoria.listRecentFiles().then((list) => alive && setRecent(list));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="vc-start" data-testid="start-screen">
      <div className="vc-start__inner">
        <h1 className="vc-start__title">{t('start.title')}</h1>
        <section>
          <h2 className="vc-start__heading">{t('start.new')}</h2>
          <div className="vc-start__cards">
            {CARDS.map((card) => (
              <button key={card.id} type="button" className="vc-start__card" data-testid={`start-new-${card.id}`} onClick={() => manager.newDocument(card.id)}>
                <Icon id={card.icon as 'new'} size={28} />
                <span className="vc-start__card-name">{t(`start.preset.${card.id}` as 'start.preset.A4')}</span>
                <span className="vc-start__card-size">{SIZE_UNIT(card.id)}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="vc-start__row">
            <h2 className="vc-start__heading">{t('start.recent')}</h2>
            <button type="button" className="vc-start__open" data-testid="start-open" onClick={() => void manager.open()}>
              <Icon id="open" size={14} /> {t('start.open')}
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="vc-start__empty" data-testid="start-no-recent">{t('start.noRecent')}</p>
          ) : (
            <ul className="vc-start__recent" data-testid="start-recent">
              {recent.map((file) => (
                <li key={file.path}>
                  <button type="button" className="vc-start__file" data-testid="start-recent-item" title={file.path} onClick={() => void manager.openRecent(file.path)}>
                    <Icon id="file" size={16} />
                    <span className="vc-start__file-name">{file.name}</span>
                    <span className="vc-start__file-date">{new Date(file.modified).toLocaleDateString('es')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
