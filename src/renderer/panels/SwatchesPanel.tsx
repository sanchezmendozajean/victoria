import { useRef, useState } from 'react';
import {
  addSwatch,
  addSwatches,
  colorToCss,
  colorToHex,
  hexToColor,
  parsePalette,
  removeSwatches,
  setSwatchGroup,
  updateSwatch,
  type Color,
  type Swatch,
} from '../../core';
import { applyPaint } from '../app/paintActions';
import { useUi } from '../app/store';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { BASIC_LIBRARY } from './basicSwatches';
import { solidColorOf } from './FillPanel';
import { CheckRow, Choice, Row } from './kit';
import { usePaintLook } from './PaintWidget';
import '../components/DialogHost.css';

const ALL = '__all__';

/** Muestras (specs/06): grid or list, groups, global swatches, new from selection, palette import. */
export function SwatchesPanel() {
  const { look, resources, ctx } = usePaintLook();
  const active = useUi((s) => s.activePaint);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [group, setGroup] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const swatches = resources.swatches;
  const groups = [...new Set(swatches.map((s) => s.group).filter((g): g is string => !!g))];
  const shown = swatches.filter((s) => group === ALL || (group === '' ? !s.group : s.group === group));
  const paint = look[active];
  const currentId = !paint.mixed && paint.value.type === 'swatch' ? paint.value.swatchId : null;
  const session = ctx?.session;

  if (!session) return <div className="vc-pempty">{t('fill.noDocument')}</div>;

  const run = (command: Parameters<typeof session.run>[0]) => void session.run(command);

  const newSwatch = () => {
    const base = !paint.mixed ? solidColorOf(paint.value, resources) : null;
    const color: Color = base ?? { model: 'rgb', values: [0, 0, 0] };
    const swatch: Swatch = { id: session.ids(), name: t('swatches.newName', { n: swatches.length + 1 }), color, global: false, ...(group !== ALL && group !== '' ? { group } : {}) };
    run(addSwatch(swatch));
    setSelected(swatch.id);
    setEditing(swatch.id);
  };

  const importFile = async (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    const colors = parsePalette(new Uint8Array(await picked.arrayBuffer()));
    if (colors.length === 0) return;
    const fallback = picked.name.replace(/\.[^.]+$/, '');
    run(addSwatches(colors.map((c) => ({ id: session.ids(), name: c.name, color: c.color, global: false, group: c.group ?? fallback }))));
  };

  const addLibrary = () => {
    const have = new Set(swatches.map((s) => s.name));
    const fresh = BASIC_LIBRARY.filter((l) => !have.has(l.name));
    if (fresh.length > 0) run(addSwatches(fresh.map((l) => ({ id: session.ids(), name: l.name, color: l.color, global: false, group: l.group }))));
  };

  return (
    <div className="vc-panelbody vc-swatches" data-testid="swatches-panel">
      <div className="vc-swatches__bar">
        <Choice
          value={group}
          label={t('swatches.group')}
          testId="swatches-group"
          width={130}
          options={[
            { id: ALL, label: t('swatches.all') },
            ...groups.map((g) => ({ id: g, label: g })),
            ...(swatches.some((s) => !s.group) && groups.length > 0 ? [{ id: '', label: t('swatches.ungrouped') }] : []),
          ]}
          onChange={(v) => setGroup(String(v))}
        />
        <span style={{ flex: 1 }} />
        <button type="button" className={cx('vc-pbutton vc-pbutton--icon', view === 'grid' && 'is-active')} {...tip(t('swatches.viewGrid'))} data-testid="swatches-grid" onClick={() => setView('grid')}>
          <Icon id="shapes" size={16} />
        </button>
        <button type="button" className={cx('vc-pbutton vc-pbutton--icon', view === 'list' && 'is-active')} {...tip(t('swatches.viewList'))} data-testid="swatches-list" onClick={() => setView('list')}>
          <Icon id="para-left" size={16} />
        </button>
      </div>

      <div className={cx('vc-swatches__items', view === 'list' && 'is-list')} data-testid="swatches-items">
        <button
          type="button"
          className={cx('vc-swatchitem', !paint.mixed && paint.value.type === 'none' && 'is-current')}
          data-testid="swatch-none"
          {...tip(t('swatches.none'))}
          onClick={() => applyPaint(active, { type: 'none' })}
        >
          <span className="vc-chip vc-chip--none" style={{ width: 16, height: 16 }} />
          {view === 'list' && <span className="vc-swatchitem__name">{t('swatches.none')}</span>}
        </button>
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cx('vc-swatchitem', currentId === s.id && 'is-current', selected === s.id && 'is-selected')}
            data-testid="swatch"
            data-swatch={s.id}
            {...tip(`${s.name} · ${colorToHex(s.color)}`)}
            onClick={() => {
              setSelected(s.id);
              applyPaint(active, { type: 'swatch', swatchId: s.id });
            }}
            onDoubleClick={() => setEditing(s.id)}
          >
            <span className="vc-chip" style={{ width: 16, height: 16, background: colorToCss(s.color) }}>
              {s.global && <span className="vc-swatchitem__global" />}
            </span>
            {view === 'list' && <span className="vc-swatchitem__name">{s.name}</span>}
          </button>
        ))}
      </div>

      <div className="vc-swatches__footer">
        <button type="button" className="vc-pbutton vc-pbutton--icon" {...tip(t('swatches.library'))} data-testid="swatches-library" onClick={addLibrary}>
          <Icon id="folder" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" {...tip(t('swatches.import'))} data-testid="swatches-import" onClick={() => file.current?.click()}>
          <Icon id="import" size={16} />
        </button>
        <input ref={file} type="file" accept=".ase,.gpl" hidden data-testid="swatches-file" onChange={(e) => void importFile(e.target.files).then(() => (e.target.value = ''))} />
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="vc-pbutton vc-pbutton--icon"
          {...tip(t('swatches.newGroup'))}
          data-testid="swatches-new-group"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditing(`group:${selected}`);
          }}
        >
          <Icon id="swatch-group" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" {...tip(t('swatches.options'))} data-testid="swatches-options" disabled={!selected} onClick={() => selected && setEditing(selected)}>
          <Icon id="swatch-global" size={16} />
        </button>
        <button type="button" className="vc-pbutton vc-pbutton--icon" {...tip(t('swatches.new'))} data-testid="swatches-new" onClick={newSwatch}>
          <Icon id="swatch-new" size={16} />
        </button>
        <button
          type="button"
          className="vc-pbutton vc-pbutton--icon"
          {...tip(t('swatches.delete'))}
          data-testid="swatches-delete"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            run(removeSwatches([selected]));
            setSelected(null);
          }}
        >
          <Icon id="delete-item" size={16} />
        </button>
      </div>

      {editing && editing.startsWith('group:') && (
        <GroupDialog
          current={swatches.find((s) => s.id === editing.slice(6))?.group ?? ''}
          onCancel={() => setEditing(null)}
          onOk={(name) => {
            run(setSwatchGroup([editing.slice(6)], name.trim() === '' ? undefined : name.trim()));
            setEditing(null);
          }}
        />
      )}
      {editing && !editing.startsWith('group:') && swatches.find((s) => s.id === editing) && (
        <OptionsDialog
          swatch={swatches.find((s) => s.id === editing) as Swatch}
          onCancel={() => setEditing(null)}
          onOk={(patch) => {
            run(updateSwatch(editing, patch));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function OptionsDialog({ swatch, onOk, onCancel }: { swatch: Swatch; onOk(patch: Partial<Omit<Swatch, 'id'>>): void; onCancel(): void }) {
  const [name, setName] = useState(swatch.name);
  const [global, setGlobal] = useState(swatch.global);
  const [hex, setHex] = useState(colorToHex(swatch.color));
  const valid = hexToColor(hex) !== null;
  return (
    <div className="vc-dialog__backdrop" data-testid="swatch-options">
      <form
        className="vc-dialog"
        role="dialog"
        aria-label={t('swatches.optionsTitle')}
        onSubmit={(e) => {
          e.preventDefault();
          const color = hexToColor(hex);
          onOk({ name: name.trim() || swatch.name, global, ...(color && hex.toUpperCase() !== colorToHex(swatch.color) ? { color } : {}) });
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <h2 className="vc-dialog__title">{t('swatches.optionsTitle')}</h2>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('swatches.name')}</span>
          <div className="vc-field" style={{ flex: 1 }}>
            <input className="vc-field__input" data-testid="swatch-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.stopPropagation()} style={{ textAlign: 'left' }} />
          </div>
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('swatches.colour')}</span>
          <div className="vc-field" style={{ width: 96 }}>
            <input className="vc-field__input" data-testid="swatch-hex" value={hex} onChange={(e) => setHex(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-invalid={!valid} />
          </div>
        </Row>
        <CheckRow checked={global} onChange={setGlobal} label={t('swatches.global')} testId="swatch-global" />
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" onClick={onCancel}>{t('dialog.cancel')}</button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="swatch-ok" disabled={!valid}>{t('dialog.ok')}</button>
        </div>
      </form>
    </div>
  );
}

function GroupDialog({ current, onOk, onCancel }: { current: string; onOk(name: string): void; onCancel(): void }) {
  const [name, setName] = useState(current);
  return (
    <div className="vc-dialog__backdrop" data-testid="swatch-group-dialog">
      <form
        className="vc-dialog"
        role="dialog"
        aria-label={t('swatches.newGroup')}
        onSubmit={(e) => {
          e.preventDefault();
          onOk(name);
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <h2 className="vc-dialog__title">{t('swatches.newGroup')}</h2>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('swatches.group')}</span>
          <div className="vc-field" style={{ flex: 1 }}>
            <input className="vc-field__input" data-testid="swatch-group-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.stopPropagation()} style={{ textAlign: 'left' }} />
          </div>
        </Row>
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" onClick={onCancel}>{t('dialog.cancel')}</button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="swatch-group-ok">{t('dialog.ok')}</button>
        </div>
      </form>
    </div>
  );
}
