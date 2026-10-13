import { getActiveSpace } from '../../core';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { useUi } from './store';
import './StatusBar.css';

/** Status bar (specs/10 §8). Zoom and cursor are placeholders until the canvas exists (Phase 3). */
export function StatusBar() {
  const activeTool = useUi((s) => s.activeTool);
  const documents = useDocuments();
  const session = documents.active?.session;
  const space = session ? getActiveSpace(session.document) : null;
  const artboard = space?.artboards[0];

  return (
    <footer className="vc-statusbar" data-testid="status-bar">
      <div className="vc-statusbar__cell" {...tip(t('status.zoom'))}>
        <Icon id="zoom-in" size={14} className="vc-statusbar__icon" />
        <span className="vc-statusbar__input">1200%</span>
        <Icon id="chevron-down" size={10} />
      </div>
      <div className="vc-statusbar__cell" {...tip(t('status.artboardNav'))}>
        <button type="button" className="vc-statusbar__step" aria-label={t('status.artboardPrev')}>
          <Icon id="chevron-left" size={12} />
        </button>
        <span className="vc-statusbar__select" data-testid="status-artboard">
          <Icon id="tool-artboard" size={12} />
          <span>{artboard?.name ?? t('status.noArtboard')}</span>
          <Icon id="chevron-down" size={10} />
        </span>
        <button type="button" className="vc-statusbar__step" aria-label={t('status.artboardNext')}>
          <Icon id="chevron-right" size={12} />
        </button>
      </div>
      <div className="vc-statusbar__cell vc-statusbar__cell--strong" data-testid="status-tool">
        <Icon id={activeTool} size={14} className="vc-statusbar__icon" />
        {t(`tool.${activeTool}`)}
      </div>
      <div className="vc-statusbar__cell" {...tip(t('status.cursor'))}>
        <Icon id="locate-object" size={14} className="vc-statusbar__icon" />
        <span>
          X <b>0 pt</b>
        </span>
        <span>
          Y <b>0 pt</b>
        </span>
      </div>
      {space && (
        <div className="vc-statusbar__cell" data-testid="status-space" {...tip(t('status.space'))}>
          <Icon id="spaces" size={14} className="vc-statusbar__icon" />
          <span>{t('status.spaceLabel')}</span>
          <span className="vc-statusbar__dot" style={{ background: space.color }} />
          <b>{space.name}</b>
          <span>
            · {space.artboards.length} {t(space.artboards.length === 1 ? 'spaces.artboardOne' : 'spaces.artboardMany')}
          </span>
        </div>
      )}
      <div className="vc-statusbar__spacer" />
      <div className="vc-statusbar__cell vc-statusbar__cell--last" data-testid="status-saved" {...tip(t('status.autosaveTip'))}>
        <Icon id="cloud-check" size={14} className={session?.dirty ? 'vc-statusbar__icon' : 'vc-statusbar__saved'} />
        {session?.dirty ? t('status.unsaved') : t('status.saved')}
      </div>
    </footer>
  );
}
