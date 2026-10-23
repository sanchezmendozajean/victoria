import { useEffect, useRef, useState } from 'react';
import { countObjects, fitRect, setSpaceExcluded, type Document, type Space } from '../../core';
import { readCanvasTheme } from '../canvas/theme';
import { renderContent } from '../canvas/contentRenderer';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { createNewSpace, deleteSpaceOf, duplicateSpaceOf, renameSpaceOf, shiftSpace } from '../documents/spaceActions';
import { useUi } from '../app/store';
import { t } from '../i18n';
import { formatAccelerator, SHORTCUTS } from '../app/shortcuts';

const THUMB_W = 56;
const THUMB_H = 40;

/** Spaces are immutable, so the object count of one can be remembered by identity. */
const counts = new WeakMap<Space, number>();

/** A miniature of the Space: its artboards and artwork, fitted to the thumbnail. Repaints when the Space changes. */
function SpaceThumb({ space, doc }: { space: Space; doc: Document }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(THUMB_W * dpr);
    canvas.height = Math.round(THUMB_H * dpr);
    const boards = space.artboards;
    const rect = boards.length
      ? {
          minX: Math.min(...boards.map((b) => b.x)),
          minY: Math.min(...boards.map((b) => b.y)),
          maxX: Math.max(...boards.map((b) => b.x + b.w)),
          maxY: Math.max(...boards.map((b) => b.y + b.h)),
        }
      : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    try {
      renderContent(ctx, {
        space,
        resources: doc.resources,
        view: fitRect(THUMB_W, THUMB_H, rect, 3),
        width: THUMB_W,
        height: THUMB_H,
        dpr,
        outline: false,
        showArtboards: true,
        showGrid: false,
        activeArtboardId: null,
        theme: readCanvasTheme(),
        isolatedId: null,
      });
    } catch {
      // A thumbnail is decoration: a Space that cannot be drawn shows an empty frame.
    }
  }, [space, doc.resources, theme]);
  return <canvas ref={ref} className="vc-spacerow__thumb" width={THUMB_W} height={THUMB_H} style={{ width: THUMB_W, height: THUMB_H }} data-testid="space-thumb" />;
}

/** Espacios (specs/04 · Panel Espacios): thumbnails, artboard and object counts, export visibility and the Space buttons. */
export function SpacesPanel() {
  const documents = useDocuments();
  const os = useUi((s) => s.platform.os);
  const [renaming, setRenaming] = useState<string | null>(null);
  const session = documents.active?.session;
  const doc = session?.document;
  if (!session || !doc) return null;
  const objectsOf = (space: Space) => {
    let n = counts.get(space);
    if (n === undefined) {
      n = countObjects(space);
      counts.set(space, n);
    }
    return n;
  };
  const active = doc.spaces.find((s) => s.id === doc.activeSpaceId) ?? doc.spaces[0];
  const index = doc.spaces.findIndex((s) => s.id === active?.id);

  return (
    <div className="vc-panelbody vc-spaces" data-testid="spaces-panel">
      <div className="vc-spaces__list" role="list">
        {doc.spaces.map((space, i) => {
          const boards = space.artboards.length;
          const objects = objectsOf(space);
          return (
            <div
              key={space.id}
              role="listitem"
              className={cx('vc-spacerow', space.id === doc.activeSpaceId && 'is-active')}
              style={{ ['--space' as string]: space.color }}
              data-testid="spaces-row"
              {...tip(t('space.thumbTip'))}
              onClick={() => session.setActiveSpace(space.id)}
              onDoubleClick={() => setRenaming(space.id)}
            >
              <span className="vc-spacerow__dot" />
              <SpaceThumb space={space} doc={doc} />
              <div className="vc-spacerow__text">
                {renaming === space.id ? (
                  <input
                    className="vc-spacetab__input"
                    data-testid="spaces-rename"
                    autoFocus
                    defaultValue={space.name}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        renameSpaceOf(session, space.id, e.currentTarget.value);
                        setRenaming(null);
                      } else if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={(e) => {
                      if (renaming === space.id) renameSpaceOf(session, space.id, e.currentTarget.value);
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="vc-spacerow__name" data-testid="spaces-name">{space.name}</span>
                )}
                <span className="vc-spacerow__meta">
                  {t(boards === 1 ? 'space.artboardsOne' : 'space.artboards', { count: boards })} · {t(objects === 1 ? 'space.objectsOne' : 'space.objects', { count: objects })}
                </span>
              </div>
              <button
                type="button"
                className="vc-layerrow__btn"
                data-testid="spaces-export"
                aria-pressed={!space.excludeFromExport}
                {...tip(space.excludeFromExport ? t('space.notExported') : t('space.exported'))}
                onClick={(event) => {
                  event.stopPropagation();
                  session.run(setSpaceExcluded(space.id, !space.excludeFromExport));
                }}
              >
                <Icon id={space.excludeFromExport ? 'space-exclude-export' : 'visibility'} size={14} />
              </button>
              <span className="vc-spacerow__index">{i < 9 ? i + 1 : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="vc-spaces__toolbar">
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="spaces-new" {...tip(t('space.new'), formatAccelerator(SHORTCUTS['space.new'], os))} onClick={() => createNewSpace(session)}>
          <Icon id="space-add" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="spaces-duplicate" {...tip(t('space.duplicate'))} disabled={!active} onClick={() => active && duplicateSpaceOf(session, active.id)}>
          <Icon id="space-duplicate" size={16} />
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="spaces-up" {...tip(t('space.moveUp'))} disabled={index <= 0} onClick={() => active && shiftSpace(session, active.id, -1)}>
          <Icon id="chevron-up" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="spaces-down" {...tip(t('space.moveDown'))} disabled={index < 0 || index >= doc.spaces.length - 1} onClick={() => active && shiftSpace(session, active.id, 1)}>
          <Icon id="chevron-down" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="spaces-delete" {...tip(t('space.delete'))} disabled={doc.spaces.length <= 1} onClick={() => active && void deleteSpaceOf(session, active.id)}>
          <Icon id="space-delete" size={16} />
        </button>
      </div>
    </div>
  );
}
