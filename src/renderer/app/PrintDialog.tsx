import { useEffect, useMemo, useRef, useState } from 'react';
import { LOW_PPI, PAPER_SIZES, lowResolutionImages, type ExportScope, type Orientation } from '../../core';
import type { PrinterEntry } from '../../shared/ipc';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t, type TranslationKey } from '../i18n';
import { Choice, CheckRow } from '../panels/kit';
import { DEFAULT_PRINT_SETTINGS, planPrint, renderPage, type PrintSettings } from '../print/pages';
import { askUser } from './dialogs';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';
import './ExportDialog.css';
import './PrintDialog.css';

/** What the user chose last time: the dialog opens as it was left (Illustrator remembers it too). */
let remembered: PrintSettings = DEFAULT_PRINT_SETTINGS;

const alert = (message: string) => askUser({ title: t('dialog.error'), message, buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });

/** Archivo › Imprimir… (Ctrl+P): own dialog with a vector preview; the pages go to the printer at their real size. */
export function PrintDialog() {
  const open = useUi((s) => s.printDialog);
  const documents = useDocuments();
  if (!open || !documents.active) return null;
  return <PrintForm />;
}

function PrintForm() {
  const documents = useDocuments();
  const close = useUi((s) => s.closePrintDialog);
  const activeArtboard = useUi((s) => s.activeArtboard);
  const session = documents.active!.session;
  const doc = session.document;
  const activeSpace = doc.spaces.find((s) => s.id === doc.activeSpaceId);
  const activeBoard = activeSpace ? (activeArtboard[activeSpace.id] ?? null) : null;

  const [settings, setSettings] = useState<PrintSettings>(remembered);
  const [printers, setPrinters] = useState<PrinterEntry[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<PrintSettings>) => setSettings((s) => ({ ...s, ...p }));

  useEffect(() => {
    void window.victoria.listPrinters().then(setPrinters);
  }, []);
  useEffect(() => {
    remembered = settings;
  }, [settings]);

  const plan = useMemo(() => planPrint(doc, settings, activeBoard), [doc, settings, activeBoard]);
  const pages = plan.pages;
  const index = pages ? Math.min(pageIndex, Math.max(0, pages.length - 1)) : 0;
  const current = pages?.[index] ?? null;
  // Pictures that would come out soft at the chosen scale, over every page that will print.
  const softImages = useMemo(() => {
    const ids = new Set<string>();
    for (const page of pages ?? []) {
      for (const image of lowResolutionImages(doc, page.target.space.id, page.plan.region, page.plan.scale, (hash) => session.images.has(hash))) ids.add(image.id);
    }
    return ids.size;
  }, [pages, doc, session]);

  // The preview is the page itself, drawn by the same code that will print it (rebuilt a moment after the last change).
  const token = useRef(0);
  useEffect(() => {
    const mine = ++token.current;
    if (!current) return; // nothing to show: the sheet below hides the old picture
    const timer = setTimeout(() => {
      void renderPage(doc, session, settings, current)
        .then((svg) => {
          if (mine === token.current) setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        })
        .catch(() => mine === token.current && setPreview(null));
    }, 150);
    return () => clearTimeout(timer);
  }, [doc, session, settings, current]);

  const printerName = settings.printer ?? printers?.find((p) => p.isDefault)?.name ?? printers?.[0]?.name ?? null;
  const rangeInvalid = pages === null;
  const nothing = pages !== null && pages.length === 0;
  const canPrint = !busy && printers !== null && printers.length > 0 && !rangeInvalid && !nothing;

  const run = async () => {
    if (!canPrint || !pages) return;
    setBusy(true);
    try {
      const svgs: string[] = [];
      for (const p of pages) svgs.push(await renderPage(doc, session, settings, p));
      const outcome = await window.victoria.print({ pages: svgs, width: plan.page.w, height: plan.page.h, printer: printerName, copies: settings.copies, title: doc.meta.name });
      if (outcome.ok) close();
      else await alert(t('print.failed', { reason: outcome.error ?? '' }));
    } catch (error) {
      await alert(t('print.failed', { reason: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, field: React.ReactNode) => (
    <div className="vc-form__row">
      <label>{label}</label>
      {field}
    </div>
  );
  const paperOptions = [...PAPER_SIZES.map((p) => ({ id: p.id, label: t(`print.paper.${p.id}` as TranslationKey) })), { id: 'custom', label: t('print.paper.custom') }];

  return (
    <div className="vc-dialog__backdrop" data-testid="print-dialog">
      <form
        className="vc-dialog vc-print"
        role="dialog"
        aria-label={t('print.title')}
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
        <h2 className="vc-dialog__title">{t('print.title')}</h2>
        <div className="vc-print__body">
          <div className="vc-print__form">
            {row(
              t('print.printer'),
              printers !== null && printers.length === 0 ? (
                <span className="vc-print__hint" data-testid="print-no-printers">{t('print.noPrinters')}</span>
              ) : (
                <Choice<string>
                  value={printerName}
                  onChange={(printer) => patch({ printer })}
                  label={t('print.printer')}
                  testId="print-printer"
                  width={230}
                  options={(printers ?? []).map((p) => ({ id: p.name, label: p.displayName }))}
                />
              ),
            )}
            {row(t('print.copies'), <NumberInput value={settings.copies} onCommit={(v) => patch({ copies: Math.min(999, Math.max(1, Math.round(v))) })} min={1} max={999} decimals={0} width={90} testId="print-copies" tooltip={t('print.copies')} />)}

            <h3 className="vc-print__section">{t('print.artboards')}</h3>
            {row(
              t('export.scope'),
              <Choice<ExportScope>
                value={settings.scope}
                onChange={(scope) => patch({ scope })}
                label={t('export.scope')}
                testId="print-scope"
                width={230}
                options={(['active-artboard', 'space-artboards', 'all-spaces'] as const).map((id) => ({ id, label: t(`export.scope.${id}` as TranslationKey) }))}
              />,
            )}
            {row(
              t('print.range'),
              <input className={`vc-export__suffix${rangeInvalid ? ' is-invalid' : ''}`} type="text" value={settings.range} placeholder="1-3, 5" aria-label={t('print.range')} data-testid="print-range" onChange={(event) => patch({ range: event.target.value })} />,
            )}
            {rangeInvalid && <p className="vc-print__error">{t('print.rangeInvalid')}</p>}

            <h3 className="vc-print__section">{t('print.paper')}</h3>
            {row(t('print.paperSize'), <Choice<string> value={settings.paper} onChange={(paper) => patch({ paper })} label={t('print.paperSize')} testId="print-paper" width={230} options={paperOptions} />)}
            {settings.paper === 'custom' &&
              row(
                `${t('measure.width')} × ${t('measure.height')}`,
                <span className="vc-print__pair">
                  <NumberInput value={settings.customMm.w} onCommit={(w) => patch({ customMm: { ...settings.customMm, w: Math.min(5000, Math.max(13, w)) } })} suffix="mm" min={13} max={5000} decimals={1} width={90} testId="print-custom-w" tooltip={t('measure.width')} />
                  <NumberInput value={settings.customMm.h} onCommit={(h) => patch({ customMm: { ...settings.customMm, h: Math.min(5000, Math.max(13, h)) } })} suffix="mm" min={13} max={5000} decimals={1} width={90} testId="print-custom-h" tooltip={t('measure.height')} />
                </span>,
              )}
            {row(
              t('print.orientation'),
              <Choice<'auto' | Orientation>
                value={settings.orientation}
                onChange={(orientation) => patch({ orientation })}
                label={t('print.orientation')}
                testId="print-orientation"
                width={230}
                options={(['auto', 'portrait', 'landscape'] as const).map((id) => ({ id, label: t(`print.orientation.${id}` as TranslationKey) }))}
              />,
            )}

            <h3 className="vc-print__section">{t('print.scale')}</h3>
            {row(
              t('print.scale'),
              <Choice<'none' | 'fit' | 'custom'>
                value={settings.scale}
                onChange={(scale) => patch({ scale })}
                label={t('print.scale')}
                testId="print-scale"
                width={230}
                options={(['none', 'fit', 'custom'] as const).map((id) => ({ id, label: t(`print.scale.${id}` as TranslationKey) }))}
              />,
            )}
            {settings.scale === 'custom' && row(t('print.percent'), <NumberInput value={settings.percent} onCommit={(percent) => patch({ percent: Math.min(1000, Math.max(1, percent)) })} suffix="%" min={1} max={1000} decimals={1} width={100} testId="print-percent" tooltip={t('print.percent')} />)}
            {row(
              t('print.position'),
              <span className="vc-print__grid" role="group" aria-label={t('print.position')}>
                {([0, 1, 2] as const).flatMap((r) =>
                  ([0, 1, 2] as const).map((c) => (
                    <button
                      key={`${c}${r}`}
                      type="button"
                      className={settings.anchor.col === c && settings.anchor.row === r ? 'is-active' : ''}
                      aria-pressed={settings.anchor.col === c && settings.anchor.row === r}
                      aria-label={`${t('print.position')} ${r + 1}-${c + 1}`}
                      data-testid={`print-anchor-${c}${r}`}
                      onClick={() => patch({ anchor: { col: c, row: r } })}
                    />
                  )),
                )}
              </span>,
            )}

            <h3 className="vc-print__section">{t('print.marks')}</h3>
            <CheckRow checked={settings.marks} onChange={(marks) => patch({ marks })} label={t('print.cropMarks')} testId="print-marks" />
            {settings.marks && (
              <>
                {row(
                  t('print.markStyle'),
                  <Choice<'western' | 'japanese'>
                    value={settings.markStyle}
                    onChange={(markStyle) => patch({ markStyle })}
                    label={t('print.markStyle')}
                    testId="print-mark-style"
                    width={160}
                    options={(['western', 'japanese'] as const).map((id) => ({ id, label: t(`print.markStyle.${id}` as TranslationKey) }))}
                  />,
                )}
                {row(t('print.markWeight'), <NumberInput value={settings.markWeight} onCommit={(markWeight) => patch({ markWeight: Math.min(10, Math.max(0.05, markWeight)) })} suffix="pt" min={0.05} max={10} step={0.05} decimals={2} width={90} testId="print-mark-weight" tooltip={t('print.markWeight')} />)}
                {row(t('print.markOffset'), <NumberInput value={settings.markOffsetMm} onCommit={(markOffsetMm) => patch({ markOffsetMm: Math.min(50, Math.max(0, markOffsetMm)) })} suffix="mm" min={0} max={50} decimals={1} width={90} testId="print-mark-offset" tooltip={t('print.markOffset')} />)}
              </>
            )}
            <CheckRow checked={settings.includeBleed} onChange={(includeBleed) => patch({ includeBleed })} label={t('export.bleed')} testId="print-bleed" />
          </div>

          <div className="vc-print__preview">
            <div className="vc-print__sheet" data-testid="print-preview" style={{ aspectRatio: `${plan.page.w} / ${plan.page.h}` }}>
              {preview && current ? <img src={preview} alt={t('print.preview')} draggable={false} /> : <span className="vc-print__hint">{nothing ? t('print.nothing') : t('print.previewing')}</span>}
            </div>
            <div className="vc-print__nav">
              <button type="button" className="vc-export__icon" aria-label={t('print.previous')} disabled={index <= 0} onClick={() => setPageIndex(index - 1)} data-testid="print-prev">
                <Icon id="chevron-left" size={12} />
              </button>
              <span data-testid="print-page">{pages && pages.length > 0 ? t('print.pageOf', { n: index + 1, total: pages.length }) : '–'}</span>
              <button type="button" className="vc-export__icon" aria-label={t('print.next')} disabled={!pages || index >= pages.length - 1} onClick={() => setPageIndex(index + 1)} data-testid="print-next">
                <Icon id="chevron-right" size={12} />
              </button>
            </div>
            {softImages > 0 && (
              <p className="vc-print__error" data-testid="print-low-ppi">
                {t('print.lowPpi', { count: softImages, ppi: LOW_PPI })}
              </p>
            )}
            {current?.plan.overflow && (
              <p className="vc-print__error" data-testid="print-overflow">
                {t('print.overflow')}
              </p>
            )}
          </div>
        </div>

        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="print-cancel" disabled={busy} onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="print-run" disabled={!canPrint}>
            <Icon id="print" size={12} /> {busy ? t('print.printing') : t('print.run')}
          </button>
        </div>
      </form>
    </div>
  );
}
