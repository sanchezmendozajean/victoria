import { useState } from 'react';
import { getActiveSpace } from '../../core';
import { activeArtboardOf, deleteArtboardOf, duplicateArtboardOf, fitToArtwork, fitToSelection, newArtboardIn, renameArtboardOf, shiftArtboard } from '../app/artboardActions';
import { useUi } from '../app/store';
import { canvasApi } from '../canvas/api';
import { formatLength } from '../canvas/units';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';

/** Mesas de trabajo (specs/04 · Panel Mesas de trabajo): numbered list of the active Space with name and size, plus the artboard actions. */
export function ArtboardsPanel() {
  const documents = useDocuments();
  const activeMap = useUi((s) => s.activeArtboard);
  const setActive = useUi((s) => s.setActiveArtboard);
  const openArrange = useUi((s) => s.openArrangeDialog);
  const [renaming, setRenaming] = useState<string | null>(null);
  const session = documents.active?.session;
  if (!session) return null;
  const space = getActiveSpace(session.document);
  const units = session.document.meta.units;
  // `activeMap` is read so the panel repaints when the active artboard changes.
  const current = space.artboards.find((a) => a.id === activeMap[space.id]) ?? activeArtboardOf(space);
  const index = current ? space.artboards.findIndex((a) => a.id === current.id) : -1;
  const hasSelection = session.selection.spaceId === space.id && session.selection.ids.length > 0;
  const many = space.artboards.length > 1;

  const button = (testId: string, icon: Parameters<typeof Icon>[0]['id'], tooltip: string, disabled: boolean, onClick: () => void) => (
    <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid={testId} {...tip(tooltip)} disabled={disabled} onClick={onClick}>
      <Icon id={icon} size={16} />
    </button>
  );

  return (
    <div className="vc-panelbody vc-artboards" data-testid="artboards-panel">
      <div className="vc-artboards__list" role="list">
        {space.artboards.map((board, i) => (
          <div
            key={board.id}
            role="listitem"
            className={cx('vc-artboardrow', board.id === current?.id && 'is-active')}
            data-testid="artboards-row"
            onClick={() => {
              setActive(space.id, board.id);
              canvasApi.current?.revealRect({ minX: board.x, minY: board.y, maxX: board.x + board.w, maxY: board.y + board.h });
            }}
            onDoubleClick={() => setRenaming(board.id)}
          >
            <span className="vc-artboardrow__index" data-testid="artboards-index">{i + 1}</span>
            <Icon id={board.w > board.h ? 'artboard-landscape' : 'artboard-portrait'} size={14} className="vc-field__icon" />
            {renaming === board.id ? (
              <input
                className="vc-spacetab__input"
                data-testid="artboards-rename"
                autoFocus
                defaultValue={board.name}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    renameArtboardOf(session, board.id, e.currentTarget.value);
                    setRenaming(null);
                  } else if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={(e) => {
                  if (renaming === board.id) renameArtboardOf(session, board.id, e.currentTarget.value);
                  setRenaming(null);
                }}
              />
            ) : (
              <span className="vc-artboardrow__name" data-testid="artboards-name">{board.name}</span>
            )}
            <span className="vc-artboardrow__size" data-testid="artboards-size">
              {formatLength(board.w, units)} × {formatLength(board.h, units)}
            </span>
          </div>
        ))}
      </div>
      <div className="vc-artboards__toolbar">
        {button('artboards-new', 'artboard-new', t('artboards.new'), false, () => newArtboardIn(session))}
        {button('artboards-duplicate', 'artboard-duplicate', t('artboards.duplicate'), !current, () => current && duplicateArtboardOf(session, current.id))}
        {button('artboards-arrange', 'artboard-rearrange', t('artboards.arrange'), !many, openArrange)}
        {button('artboards-fit-art', 'artboard-fit-art', t('artboards.fitArt'), !current, () => current && fitToArtwork(session, current.id))}
        {button('artboards-fit-selection', 'artboard-fit-selection', t('artboards.fitSelection'), !current || !hasSelection, () => current && fitToSelection(session, current.id))}
        <span style={{ flex: 1 }} />
        {button('artboards-up', 'chevron-up', t('artboards.moveUp'), index <= 0, () => current && shiftArtboard(session, current.id, -1))}
        {button('artboards-down', 'chevron-down', t('artboards.moveDown'), index < 0 || index >= space.artboards.length - 1, () => current && shiftArtboard(session, current.id, 1))}
        {button('artboards-delete', 'artboard-delete', t('artboards.delete'), !many, () => current && deleteArtboardOf(session, current.id))}
      </div>
    </div>
  );
}
