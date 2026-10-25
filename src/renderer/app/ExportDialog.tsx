import { useMemo, useState } from 'react';
import { exportTargets, type ExportFormat, type ExportScope, type ExportTarget } from '../../core';
import { NumberInput } from '../components/NumberInput';
import { Icon } from '../components/Icon';
import { useDocuments } from '../documents';
import { ExportError } from '../export/raster';
import { countFiles, DEFAULT_EXPORT_OPTIONS, generateExport, type BackgroundChoice, type ExportOptions, type OutputSpec } from '../export/exporter';
import { deliver, type Destination } from '../export/deliver';
import { t, type TranslationKey } from '../i18n';
import { Choice, CheckRow } from '../panels/kit';
import { askUser } from './dialogs';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';
import './ExportDialog.css';

const FORMATS: ExportFormat[] = ['png', 'jpg', 'svg', 'pdf'];
const formatOptions = FORMATS.map((id) => ({ id, label: t(`export.format.${id}` as TranslationKey) }));
const PPI_PRESETS = [72, 150, 300] as const;
const SCALES = [1, 2, 3] as const;

/** Archivo › Exportar… and Exportar para pantallas…: both end in the same generator (`generateExport`). */
export function ExportDialog() {
  const mode = useUi((s) => s.exportDialog);
  const documents = useDocuments();
  if (!mode || !documents.active) return null;
  return <ExportForm key={mode} mode={mode} />;
}

/** Runs a job, writes it and tells the user how it went. Returns false when nothing was written because the user cancelled. */
async function runJob(job: Parameters<typeof generateExport>[0], destination: (count: number) => Promise<Destination | null>, setProgress: (text: string) => void): Promise<boolean> {
  const total = countFiles(job.targets, job.outputs, job.options);
  if (total === 0) {
    await askUser({ title: t('dialog.error'), message: t('export.nothing'), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
    return false;
  }
  // A folder is asked for before the work, a single file after it (the dialog needs the bytes).
  const upfront = total > 1 ? await destination(total) : null;
  if (total > 1 && !upfront) return false;
  try {
    const report = await generateExport({ ...job, onProgress: (done, count) => setProgress(t('export.running', { done, total: count })) });
    const target = upfront ?? (await destination(report.files.length));
    if (!target) return false;
    const delivery = await deliver(report.files, target);
    if (!delivery) return false;
    const lines = [report.files.length === 1 ? t('export.doneOne') : t('export.done', { n: delivery.written.length }), ...report.warnings.map((w) => t(`export.warn.${w.code}` as TranslationKey))];
    if (delivery.failed.length > 0) lines.push(t('export.failedFiles', { names: delivery.failed.map((f) => f.name).join(', ') }));
    await askUser({ title: t('export.saveTitle'), message: lines.join('\n'), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
    return true;
  } catch (error) {
    const reason = error instanceof ExportError && error.code === 'too-large' ? t('export.tooLarge') : error instanceof Error ? error.message : String(error);
    await askUser({ title: t('dialog.error'), message: t('export.failed', { reason }), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
    return false;
  }
}

function ExportForm({ mode }: { mode: 'as' | 'screens' }) {
  const documents = useDocuments();
  const close = useUi((s) => s.closeExportDialog);
  const activeArtboard = useUi((s) => s.activeArtboard);
  const session = documents.active!.session;
  const doc = session.document;
  const documentName = doc.meta.name;

  const [format, setFormat] = useState<ExportFormat>('png');
  const [scope, setScope] = useState<ExportScope>('active-artboard');
  const [ppi, setPpi] = useState<number>(72);
  const [options, setOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS, pdfSinglePdf: mode === 'as' });
  const [busy, setBusy] = useState<string | null>(null);
  const patch = (p: Partial<ExportOptions>) => setOptions((o) => ({ ...o, ...p }));

  // "Exportar para pantallas": a checked list of artboards and a list of formats.
  const everyTarget = useMemo(() => exportTargets(doc, 'all-spaces'), [doc]);
  const keyOf = (tg: ExportTarget) => `${tg.space.id}:${tg.artboard.id}`;
  const activeSpace = doc.spaces.find((s) => s.id === doc.activeSpaceId);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(everyTarget.filter((tg) => tg.space.id === doc.activeSpaceId).map(keyOf)));
  const [spaceFilter, setSpaceFilter] = useState<string>('all');
  const [rows, setRows] = useState<OutputSpec[]>([{ format: 'png', ppi: 72, suffix: '' }]);
  const [folder, setFolder] = useState<string | null>(null);
  const [openWhenDone, setOpenWhenDone] = useState(true);

  const visibleTargets = everyTarget.filter((tg) => spaceFilter === 'all' || tg.space.id === spaceFilter);
  const rasterFormat = format === 'png' || format === 'jpg';

  const run = async () => {
    if (busy) return;
    setBusy(t('export.running', { done: 0, total: 0 }));
    const finished = await runJob(
      mode === 'as'
        ? {
            document: doc,
            session,
            documentName,
            targets: exportTargets(doc, scope, activeSpace ? (activeArtboard[activeSpace.id] ?? null) : null),
            outputs: [{ format, ppi, suffix: '' }],
            options,
          }
        : { document: doc, session, documentName, targets: everyTarget.filter((tg) => checked.has(keyOf(tg))), outputs: rows, options: { ...options, pdfSinglePdf: false } },
      mode === 'as'
        ? async (count) => (count > 1 ? pickFolder(setFolder) : { kind: 'save', format })
        : async () => (folder ? { kind: 'folder', folder, open: openWhenDone } : null),
      setBusy,
    );
    setBusy(null);
    if (finished) close();
  };

  const folderRow = (
    <div className="vc-form__row">
      <label>{t('export.folder')}</label>
      <span className="vc-export__folder" title={folder ?? ''} data-testid="export-folder">
        {folder ?? t('export.noFolder')}
      </span>
      <button type="button" className="vc-dialog__button" data-testid="export-choose-folder" onClick={() => void pickFolder(setFolder)}>
        <Icon id="folder" size={12} /> {t('export.chooseFolder')}
      </button>
    </div>
  );

  const backgroundRow = (
    <div className="vc-form__row">
      <label>{t('export.background')}</label>
      <Choice<BackgroundChoice>
        value={options.background}
        onChange={(background) => patch({ background })}
        label={t('export.background')}
        testId="export-background"
        width={190}
        options={(['transparent', 'white', 'artboard'] as const).map((id) => ({ id, label: t(`export.background.${id}` as TranslationKey) }))}
      />
    </div>
  );

  return (
    <div className="vc-dialog__backdrop" data-testid="export-dialog">
      <form
        className="vc-dialog vc-export"
        role="dialog"
        aria-label={t(mode === 'as' ? 'export.title.as' : 'export.title.screens')}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            close();
          }
        }}
      >
        <h2 className="vc-dialog__title">{t(mode === 'as' ? 'export.title.as' : 'export.title.screens')}</h2>

        {mode === 'as' ? (
          <>
            <div className="vc-form__row">
              <label>{t('export.format')}</label>
              <Choice<ExportFormat> value={format} onChange={setFormat} label={t('export.format')} testId="export-format" width={190} options={formatOptions} />
            </div>
            <div className="vc-form__row">
              <label>{t('export.scope')}</label>
              <Choice<ExportScope>
                value={scope}
                onChange={setScope}
                label={t('export.scope')}
                testId="export-scope"
                width={190}
                options={(['active-artboard', 'space-artboards', 'all-spaces'] as const).map((id) => ({ id, label: t(`export.scope.${id}` as TranslationKey) }))}
              />
            </div>
            {rasterFormat && (
              <div className="vc-form__row">
                <label>{t('export.resolution')}</label>
                <NumberInput value={ppi} onCommit={(v) => setPpi(Math.min(1200, Math.max(1, Math.round(v))))} min={1} max={1200} decimals={0} suffix={t('export.ppi')} width={110} testId="export-ppi" tooltip={t('export.resolution')} />
                <span className="vc-export__presets">
                  {PPI_PRESETS.map((p) => (
                    <button key={p} type="button" className={`vc-dialog__button${ppi === p ? ' vc-dialog__button--primary' : ''}`} data-testid={`export-ppi-${p}`} onClick={() => setPpi(p)}>
                      {p}
                    </button>
                  ))}
                </span>
              </div>
            )}
            {format === 'png' && backgroundRow}
            {format === 'jpg' && <NumberRow label={t('export.jpgQuality')} value={options.jpgQuality} onCommit={(v) => patch({ jpgQuality: Math.min(100, Math.max(1, Math.round(v))) })} testId="export-quality" />}
            {format === 'svg' && <CheckRow checked={options.minifySvg} onChange={(minifySvg) => patch({ minifySvg })} label={t('export.minify')} testId="export-minify" />}
            {format === 'pdf' && <CheckRow checked={options.pdfSinglePdf} onChange={(pdfSinglePdf) => patch({ pdfSinglePdf })} label={t('export.pdfSingle')} testId="export-pdf-single" />}
          </>
        ) : (
          <>
            <div className="vc-form__row">
              <label>{t('export.artboards')}</label>
              <Choice<string>
                value={spaceFilter}
                onChange={setSpaceFilter}
                label={t('export.artboards')}
                testId="export-space-filter"
                width={190}
                options={[{ id: 'all', label: t('export.allSpaces') }, ...doc.spaces.map((s) => ({ id: s.id, label: s.name }))]}
              />
            </div>
            <ul className="vc-export__list" data-testid="export-artboards">
              {visibleTargets.map((tg) => (
                <li key={keyOf(tg)}>
                  <CheckRow
                    checked={checked.has(keyOf(tg))}
                    onChange={(on) => setChecked((c) => new Set(on ? [...c, keyOf(tg)] : [...c].filter((k) => k !== keyOf(tg))))}
                    label={spaceFilter === 'all' && doc.spaces.length > 1 ? `${tg.space.name} · ${tg.artboard.name}` : tg.artboard.name}
                    testId={`export-artboard-${tg.artboard.id}`}
                  />
                </li>
              ))}
            </ul>
            <div className="vc-form__row">
              <label>{t('export.formats')}</label>
            </div>
            {rows.map((row, index) => (
              <div className="vc-form__row vc-export__format" key={index} data-testid="export-row">
                <Choice<ExportFormat>
                  value={row.format}
                  onChange={(f) => setRows((r) => r.map((x, i) => (i === index ? { ...x, format: f } : x)))}
                  label={t('export.format')}
                  testId={`export-row-format-${index}`}
                  width={90}
                  options={formatOptions}
                />
                {(row.format === 'png' || row.format === 'jpg') && (
                  <Choice<number>
                    value={row.ppi / 72}
                    onChange={(s) => setRows((r) => r.map((x, i) => (i === index ? { ...x, ppi: s * 72, suffix: s === 1 ? '' : `@${s}x` } : x)))}
                    label={t('export.scale')}
                    testId={`export-row-scale-${index}`}
                    width={70}
                    options={SCALES.map((s) => ({ id: s, label: `${s}x` }))}
                  />
                )}
                <input
                  className="vc-export__suffix"
                  type="text"
                  value={row.suffix}
                  placeholder={t('export.suffix')}
                  aria-label={t('export.suffix')}
                  data-testid={`export-row-suffix-${index}`}
                  onChange={(event) => setRows((r) => r.map((x, i) => (i === index ? { ...x, suffix: event.target.value } : x)))}
                />
                <button type="button" className="vc-export__icon" aria-label={t('export.removeFormat')} title={t('export.removeFormat')} disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, i) => i !== index))}>
                  <Icon id="delete" size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="vc-dialog__button" data-testid="export-add-format" onClick={() => setRows((r) => [...r, { format: 'png', ppi: 144, suffix: '@2x' }])}>
              <Icon id="plus" size={12} /> {t('export.addFormat')}
            </button>
            {backgroundRow}
            {folderRow}
            <CheckRow checked={openWhenDone} onChange={setOpenWhenDone} label={t('export.openWhenDone')} testId="export-open" />
          </>
        )}

        <CheckRow checked={options.includeBleed} onChange={(includeBleed) => patch({ includeBleed })} label={t('export.bleed')} testId="export-bleed" />

        <div className="vc-dialog__buttons">
          {busy && <span className="vc-export__progress" data-testid="export-progress">{busy}</span>}
          <button type="button" className="vc-dialog__button" data-testid="export-cancel" disabled={busy !== null} onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="export-run" disabled={busy !== null || (mode === 'screens' && (!folder || checked.size === 0))}>
            {t('export.run')}
          </button>
        </div>
      </form>
    </div>
  );
}

async function pickFolder(setFolder: (folder: string) => void): Promise<Destination | null> {
  const folder = await window.victoria.chooseExportFolder(t('export.folderTitle'));
  if (!folder) return null;
  setFolder(folder);
  return { kind: 'folder', folder, open: true };
}

function NumberRow({ label, value, onCommit, testId }: { label: string; value: number; onCommit(value: number): void; testId: string }) {
  return (
    <div className="vc-form__row">
      <label>{label}</label>
      <NumberInput value={value} onCommit={onCommit} min={1} max={100} decimals={0} suffix="%" width={110} testId={testId} tooltip={label} />
    </div>
  );
}
