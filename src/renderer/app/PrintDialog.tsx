import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LOW_PPI, markLines, mmToPt, PAPER_SIZES, selectOnly, type Orientation, type RangeError } from '../../core';
import type { PrinterEntry } from '../../shared/ipc';
import { cx } from '../components/cx';
import { Icon, type IconId } from '../components/Icon';
import { formatNumber, NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { displayName } from '../documents/manager';
import { t, type TranslationKey } from '../i18n';
import { CheckRow, Choice } from '../panels/kit';
import {
  DEFAULT_BLEED_MM,
  DEFAULT_PRINT_SETTINGS,
  layoutOf,
  PDF_DESTINATION,
  planPrint,
  printWarnings,
  rememberable,
  renderPage,
  type PlannedPage,
  type PrintSettings,
  type PrintWarning,
  type RememberedPrint,
} from '../print/pages';
import { askUser } from './dialogs';
import { useUi } from './store';
import '../components/DialogHost.css';
import './PrintDialog.css';

/** What the user chose last time, per document: the dialog opens as it was left (Illustrator remembers it too). */
const remembered = new Map<string, RememberedPrint>();

const alert = (message: string) => askUser({ title: t('dialog.error'), message, buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });

/** Archivo › Imprimir… (Ctrl+P): own dialog with a vector preview; the pages go to the printer at their real size. */
export function PrintDialog() {
  const open = useUi((s) => s.printDialog);
  const documents = useDocuments();
  if (!open || !documents.active) return null;
  return <PrintForm />;
}

const plural = (n: number, one: TranslationKey, many: TranslationKey, params: Record<string, string | number> = {}) => t(n === 1 ? one : many, { n, ...params });

function rangeText(error: RangeError): string {
  if (error.kind === 'empty') return t('print.range.empty');
  if (error.kind === 'token') return t('print.range.token', { token: error.token });
  return t(error.count === 1 ? 'print.range.bounds.one' : 'print.range.bounds', { count: error.count, token: error.token });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="vc-print__sec">
      <h3 className="vc-print__sec-title">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon, label, children }: { icon?: IconId; label?: string; children: ReactNode }) {
  return (
    <div className="vc-print__row">
      <span className="vc-print__label">
        {icon && <Icon id={icon} size={14} />}
        {label}
      </span>
      <div className="vc-print__cell">{children}</div>
    </div>
  );
}

interface SegmentedOption<T extends string> {
  id: T;
  label?: string;
  icon?: IconId;
  tooltip?: string;
}

/** Group of buttons with one pressed: icon and label, or only an icon with its tooltip. */
function Segmented<T extends string>({ value, options, onChange, label, testId, compact }: { value: T; options: ReadonlyArray<SegmentedOption<T>>; onChange(value: T): void; label: string; testId: string; compact?: boolean }) {
  return (
    <div className={cx('vc-print__seg', compact && 'is-compact')} role="group" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" className={cx(o.icon && !o.label && 'is-icon')} aria-pressed={value === o.id} data-testid={`${testId}-${o.id}`} {...(o.tooltip ? tip(o.tooltip) : {})} onClick={() => onChange(o.id)}>
          {o.icon && <Icon id={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PrintForm() {
  const documents = useDocuments();
  const close = useUi((s) => s.closePrintDialog);
  const activeArtboard = useUi((s) => s.activeArtboard);
  const open = documents.active!;
  const session = open.session;
  const doc = session.document;
  const activeSpace = doc.spaces.find((s) => s.id === doc.activeSpaceId);
  const activeBoardId = activeSpace ? (activeArtboard[activeSpace.id] ?? null) : null;

  const [settings, setSettings] = useState<PrintSettings>(() => {
    const board = activeSpace?.artboards.find((a) => a.id === activeBoardId) ?? activeSpace?.artboards[0];
    const documentBleed = board ? Math.round((Math.max(board.bleed.top, board.bleed.right, board.bleed.bottom, board.bleed.left) / mmToPt(1)) * 10) / 10 : 0;
    return { ...DEFAULT_PRINT_SETTINGS, bleedMm: documentBleed > 0 ? documentBleed : DEFAULT_BLEED_MM, ...remembered.get(open.id) };
  });
  const [printers, setPrinters] = useState<PrinterEntry[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const patch = (p: Partial<PrintSettings>) => setSettings((s) => ({ ...s, ...p }));

  const root = useRef<HTMLDivElement>(null);
  const warnButton = useRef<HTMLButtonElement>(null);
  const warnWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
    void window.victoria.listPrinters().then(setPrinters);
  }, []);
  useEffect(() => {
    remembered.set(open.id, rememberable(settings));
  }, [open.id, settings]);

  const plan = useMemo(() => planPrint(doc, settings, activeBoardId), [doc, settings, activeBoardId]);
  const pages = plan.pages;
  const index = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const current = pages[index] ?? null;
  const warnings = useMemo(() => printWarnings(doc, plan, (hash) => session.images.has(hash)), [doc, plan, session]);

  // Where the job goes: the chosen printer, else the system's default, else a PDF.
  const destination =
    printers === null ? null : settings.destination === PDF_DESTINATION ? PDF_DESTINATION : (printers.find((p) => p.name === settings.destination) ?? printers.find((p) => p.isDefault) ?? printers[0])?.name ?? PDF_DESTINATION;
  const toPdf = destination === PDF_DESTINATION;
  const printer = printers?.find((p) => p.name === destination) ?? null;

  // The preview is the page itself, drawn by the same code that will print it (rebuilt a moment after the last change).
  const token = useRef(0);
  useEffect(() => {
    const mine = ++token.current;
    if (!current) return;
    const timer = setTimeout(() => {
      void renderPage(doc, session, settings, current, { marks: false })
        .then((svg) => {
          if (mine === token.current) setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        })
        .catch(() => mine === token.current && setPreview(null));
    }, 50);
    return () => clearTimeout(timer);
  }, [doc, session, settings, current]);

  // The popover closes by itself once nothing is left to warn about.
  const popoverOpen = warnOpen && warnings.length > 0;
  useEffect(() => {
    if (!popoverOpen) return;
    const away = (event: MouseEvent) => {
      if (!warnWrap.current?.contains(event.target as Node)) setWarnOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [popoverOpen]);

  const sheets = plan.error ? 0 : pages.length * settings.copies;
  const canPrint = !busy && destination !== null && sheets > 0;

  const run = async () => {
    if (!canPrint) return;
    setBusy(true);
    try {
      const svgs: string[] = [];
      for (const p of pages) svgs.push(await renderPage(doc, session, settings, p));
      const outcome = await window.victoria.print({
        pages: svgs,
        sizes: pages.map((p) => p.plan.page),
        printer: toPdf ? null : destination,
        toPdf,
        saveTitle: t('print.saveTitle'),
        copies: settings.copies,
        collate: settings.collate,
        color: settings.color === 'color',
        title: doc.meta.name,
      });
      if (outcome.ok) close();
      else if (!outcome.canceled) await alert(t('print.failed', { reason: outcome.error ?? '' }));
    } catch (error) {
      await alert(t('print.failed', { reason: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  };

  // Esc closes the popover first, then the dialog; Enter prints. On the document, so they work when a button that had the focus is gone.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keys.current = (event) => {
      if (document.querySelector('.vc-dialog__backdrop--alert')) return; // a message is on top
      if (event.key === 'Escape') {
        event.preventDefault();
        if (popoverOpen) {
          setWarnOpen(false);
          warnButton.current?.focus();
        } else if (!busy) close();
      } else if (event.key === 'Enter' && !['BUTTON', 'SELECT', 'TEXTAREA', 'A'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        void run();
      }
    };
  });
  useEffect(() => {
    const on = (event: KeyboardEvent) => keys.current(event);
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  const selectImage = (spaceId: string, nodeId: string) => {
    close();
    if (session.document.activeSpaceId !== spaceId) session.setActiveSpace(spaceId);
    session.select(selectOnly(spaceId, [nodeId]));
  };

  const paperName = (id: string) => t(`print.paperName.${id}` as TranslationKey);
  const paperOptions = PAPER_SIZES.map((p) => ({ id: p.id, label: t(`print.paper.${p.id}` as TranslationKey) }));
  const destinationOptions = [...(printers ?? []).map((p) => ({ id: p.name, label: p.displayName })), { id: PDF_DESTINATION, label: t('print.destinationPdf') }];
  const scopeSummary = pages.length === 0 ? '' : plural(pages.length, 'print.scopeSummary.one', 'print.scopeSummary.many', { list: pages.map((p) => `${p.number} (${p.target.artboard.name})`).join(', ') });

  const unprintable = layoutOf(settings).unprintable ?? 0;
  const effectiveScale = current ? Math.round(current.plan.scale * 1000) / 10 : settings.percent;
  const noSlack = current !== null && current.plan.slack.x <= mmToPt(0.5) && current.plan.slack.y <= mmToPt(0.5);

  const summary = (
    <>
      <b>{plural(sheets, 'print.summary.sheets.one', 'print.summary.sheets.many')}</b> · {paperName(settings.paper)} ·{' '}
      {settings.copies > 1 && settings.collate ? t('print.summary.collated.many', { n: settings.copies }) : plural(settings.copies, 'print.summary.copies.one', 'print.summary.copies.many')} ·{' '}
      {settings.color === 'color' ? t('print.color.color') : t('print.summary.gray')}
    </>
  );

  return (
    <div className="vc-dialog__backdrop" data-testid="print-dialog">
      <div
        ref={root}
        className="vc-print"
        role="dialog"
        aria-modal="true"
        aria-label={t('print.title')}
        tabIndex={-1}
      >
        <header className="vc-print__head">
          <Icon id="print" size={16} />
          <span className="vc-print__head-title">{t('print.title')}</span>
          <span className="vc-print__head-file">· {displayName(open)}</span>
          <span className="vc-print__spacer" />
          <button type="button" className="vc-print__iconbtn" data-testid="print-close" disabled={busy} {...tip(t('print.close'))} onClick={close}>
            <Icon id="close" size={14} />
          </button>
        </header>

        <div className="vc-print__body">
          <div className="vc-print__preview">
            <Sheet settings={settings} page={current} image={preview} empty={t('print.nothing')} />
            <div className="vc-print__nav">
              <button type="button" className="vc-print__iconbtn" {...tip(t('print.previous'))} disabled={index <= 0} onClick={() => setPageIndex(index - 1)} data-testid="print-prev">
                <Icon id="chevron-left" size={14} />
              </button>
              <span data-testid="print-page">{pages.length > 0 ? t('print.pageOf', { n: index + 1, total: pages.length }) : '–'}</span>
              {current && <span>{t('print.pageMeta', { name: current.target.artboard.name, paper: paperName(settings.paper), orientation: t(`print.sheet.${current.plan.orientation}` as TranslationKey) })}</span>}
              <button type="button" className="vc-print__iconbtn" {...tip(t('print.next'))} disabled={index >= pages.length - 1} onClick={() => setPageIndex(index + 1)} data-testid="print-next">
                <Icon id="chevron-right" size={14} />
              </button>
            </div>
            <Legend settings={settings} printable={unprintable > 0} clip={unprintable > 0 && current !== null && current.plan.clip > mmToPt(0.05)} />
          </div>

          <div className="vc-print__settings">
            <Section title={t('print.section.printer')}>
              <Row icon="print" label={t('print.destination')}>
                <Choice<string> value={destination} onChange={(d) => patch({ destination: d })} label={t('print.destination')} testId="print-destination" icon={toPdf ? 'file' : 'print'} options={destinationOptions} />
              </Row>
              <Row>
                {toPdf ? null : (
                  <>
                    {printer && (
                      <span className="vc-print__status">
                        <i className={cx('vc-print__dot', !printer.ready && 'is-warn')} />
                        {printer.ready ? t('print.statusReady') : t('print.statusNotReady')}
                      </span>
                    )}
                    {printer?.canConfigure && (
                      <button type="button" className="vc-print__link" data-testid="print-preferences" {...tip(t('print.preferencesTip'))} onClick={() => void window.victoria.openPrinterPreferences(printer.name)}>
                        <Icon id="preferences" size={12} />
                        {t('print.preferences')}
                      </button>
                    )}
                  </>
                )}
              </Row>
              <Row icon="copies" label={t('print.copies')}>
                <NumberInput value={settings.copies} onCommit={(v) => patch({ copies: Math.min(99, Math.max(1, Math.round(v))) })} min={1} max={99} decimals={0} width={64} arrows testId="print-copies" tooltip={t('print.copies')} />
                {settings.copies >= 2 && <CheckRow checked={settings.collate} onChange={(collate) => patch({ collate })} label={t('print.collate')} testId="print-collate" />}
              </Row>
              <Row icon="color-model" label={t('print.color')}>
                <Choice<'color' | 'gray'>
                  value={settings.color}
                  onChange={(color) => patch({ color })}
                  label={t('print.color')}
                  testId="print-color"
                  icon="paint-color"
                  options={(['color', 'gray'] as const).map((id) => ({ id, label: t(`print.color.${id}` as TranslationKey) }))}
                />
              </Row>
            </Section>

            <Section title={t('print.section.what')}>
              <Segmented<PrintSettings['scope']>
                value={settings.scope}
                onChange={(scope) => {
                  patch({ scope });
                  setPageIndex(0);
                }}
                label={t('print.scope')}
                testId="print-scope"
                options={[
                  { id: 'active', icon: 'tool-artboard', label: t('print.scope.active') },
                  { id: 'all', icon: 'fit-all', label: t('print.scope.all', { n: plan.total }) },
                  { id: 'range', label: t('print.scope.range') },
                ]}
              />
              {settings.scope === 'range' && (
                <div className="vc-print__range">
                  <input
                    className={cx('vc-print__field', plan.error && 'is-invalid')}
                    type="text"
                    value={settings.range}
                    placeholder={t('print.rangePlaceholder')}
                    aria-label={t('print.rangeLabel')}
                    aria-invalid={plan.error !== null}
                    data-testid="print-range"
                    spellCheck={false}
                    onChange={(event) => {
                      patch({ range: event.target.value });
                      setPageIndex(0);
                    }}
                  />
                  {plan.error && (
                    <p className="vc-print__hint is-error" data-testid="print-range-error">
                      {rangeText(plan.error)}
                    </p>
                  )}
                </div>
              )}
              {scopeSummary && <p className="vc-print__hint">{scopeSummary}</p>}
            </Section>

            <Section title={t('print.section.paper')}>
              <Row icon="page" label={t('print.paperSize')}>
                <Choice<string> value={settings.paper} onChange={(paper) => patch({ paper })} label={t('print.paperSize')} testId="print-paper" icon="page" options={paperOptions} />
              </Row>
              <Row icon="orientation" label={t('print.orientation')}>
                <Segmented<'auto' | Orientation>
                  value={settings.orientation}
                  onChange={(orientation) => patch({ orientation })}
                  label={t('print.orientation')}
                  testId="print-orientation"
                  compact
                  options={[
                    { id: 'auto', label: t('print.orientation.auto'), tooltip: t('print.orientation.autoTip') },
                    { id: 'portrait', icon: 'artboard-portrait', tooltip: t('print.orientation.portrait') },
                    { id: 'landscape', icon: 'artboard-landscape', tooltip: t('print.orientation.landscape') },
                  ]}
                />
              </Row>
            </Section>

            <Section title={t('print.section.size')}>
              <Segmented<PrintSettings['scale']>
                value={settings.scale}
                onChange={(scale) => patch({ scale })}
                label={t('print.scale')}
                testId="print-scale"
                options={[
                  { id: 'none', icon: 'actual-size', label: t('print.scale.none') },
                  { id: 'fit', icon: 'fit-artboard', label: t('print.scale.fit') },
                  { id: 'custom', label: t('print.scale.custom') },
                ]}
              />
              <Row icon="scale-fit" label={t('print.scale')}>
                <NumberInput
                  value={settings.scale === 'custom' ? settings.percent : effectiveScale}
                  onCommit={(percent) => patch({ percent: Math.min(400, Math.max(5, percent)) })}
                  suffix="%"
                  min={5}
                  max={400}
                  step={5}
                  decimals={1}
                  width={84}
                  arrows
                  disabled={settings.scale !== 'custom'}
                  testId="print-percent"
                  tooltip={t('print.scale')}
                />
                {settings.scale === 'fit' && pages.length > 1 && <span className="vc-print__hint">{t('print.scaleVaries')}</span>}
              </Row>
              <Row icon="tool-artboard" label={t('print.position')}>
                <span className={cx('vc-print__grid', noSlack && 'is-off')} role="group" aria-label={t('print.position')} aria-disabled={noSlack}>
                  {([0, 1, 2] as const).flatMap((r) =>
                    ([0, 1, 2] as const).map((c) => {
                      const active = settings.anchor.col === c && settings.anchor.row === r;
                      const name = t(`print.position.${r * 3 + c}` as TranslationKey);
                      return <button key={`${c}${r}`} type="button" disabled={noSlack} aria-pressed={active} data-testid={`print-anchor-${c}${r}`} {...tip(name)} onClick={() => patch({ anchor: { col: c, row: r } })} />;
                    }),
                  )}
                </span>
                {noSlack && <span className="vc-print__hint">{t('print.positionFull')}</span>}
              </Row>
            </Section>

            <Section title={t('print.section.marks')}>
              <CheckRow checked={settings.marks} onChange={(marks) => patch({ marks })} label={t('print.cropMarks')} icon="crop-marks" testId="print-marks" />
              <div className="vc-print__inline">
                <CheckRow checked={settings.includeBleed} onChange={(includeBleed) => patch({ includeBleed })} label={t('print.bleed')} icon="bleed" testId="print-bleed" />
                <NumberInput value={settings.bleedMm} onCommit={(bleedMm) => patch({ bleedMm: Math.min(20, Math.max(0, bleedMm)) })} suffix="mm" min={0} max={20} step={1} decimals={1} width={72} arrows disabled={!settings.includeBleed} testId="print-bleed-mm" tooltip={t('print.bleedMm')} />
              </div>
            </Section>
          </div>
        </div>

        <footer className="vc-print__foot">
          {warnings.length > 0 && (
            <div className="vc-print__warn" ref={warnWrap}>
              <button ref={warnButton} type="button" className="vc-print__warnbtn" aria-expanded={popoverOpen} data-testid="print-warnings" onClick={() => setWarnOpen(!warnOpen)}>
                <Icon id="alert" size={16} />
                {plural(warnings.length, 'print.warnings.one', 'print.warnings.many')}
              </button>
              {popoverOpen && (
                <div className="vc-print__popover" role="dialog" aria-label={plural(warnings.length, 'print.warnings.one', 'print.warnings.many')} data-testid="print-warnings-popover">
                  <div className="vc-print__pop-head">
                    <span>{plural(warnings.length, 'print.warnings.one', 'print.warnings.many')}</span>
                    <button type="button" className="vc-print__iconbtn" {...tip(t('print.warnings.close'))} onClick={() => setWarnOpen(false)}>
                      <Icon id="close" size={12} />
                    </button>
                  </div>
                  <div className="vc-print__alerts" aria-live="polite">
                    {warnings.map((w) => (
                      <Warning key={w.kind} warning={w} onFit={() => patch({ scale: 'fit' })} onSelectImage={selectImage} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <span className="vc-print__summary" data-testid="print-summary">
            {summary}
          </span>
          <span className="vc-print__spacer" />
          <button type="button" className="vc-print__button" data-testid="print-cancel" disabled={busy} onClick={close}>
            <Icon id="close" size={14} />
            {t('dialog.cancel')}
          </button>
          <button type="button" className="vc-print__button is-primary" data-testid="print-run" disabled={!canPrint} onClick={() => void run()}>
            <Icon id="print" size={14} />
            {busy ? t('print.printing') : toPdf ? t('print.runPdf') : t('print.run')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Warning({ warning, onFit, onSelectImage }: { warning: PrintWarning; onFit(): void; onSelectImage(spaceId: string, nodeId: string): void }) {
  let title: string;
  let detail: string;
  let action: { icon: IconId; label: string; run(): void } | null = null;
  const fit = { icon: 'fit-artboard' as const, label: t('print.action.fit'), run: onFit };
  switch (warning.kind) {
    case 'range':
      title = t('print.warn.range');
      detail = rangeText(warning.error);
      break;
    case 'resolution':
      title = plural(warning.count, 'print.warn.ppi.one', 'print.warn.ppi.many', { count: warning.count, ppi: Math.round(warning.ppi) });
      detail = plural(warning.count, 'print.warn.ppi.detail.one', 'print.warn.ppi.detail.many', { min: LOW_PPI });
      action = { icon: 'image', label: t('print.action.selectImage'), run: () => onSelectImage(warning.image.spaceId, warning.image.nodeId) };
      break;
    case 'clip':
      title = plural(warning.count, 'print.warn.clip.one', 'print.warn.clip.many', { count: warning.count, name: warning.name });
      detail = t('print.warn.clip.detail', { mm: formatNumber(warning.mm, 1) });
      action = fit;
      break;
    case 'marks':
      title = t('print.warn.marks');
      detail = t('print.warn.marks.detail');
      action = fit;
      break;
  }
  return (
    <div className="vc-print__alert" data-testid={`print-warning-${warning.kind}`}>
      <Icon id="alert" size={16} />
      <div>
        <b>{title}</b> {detail}
        {action && (
          <>
            <br />
            <button type="button" className="vc-print__act" data-testid={`print-warning-${warning.kind}-action`} onClick={action.run}>
              <Icon id={action.icon} size={14} />
              {action.label}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Only what is on the sheet right now. */
function Legend({ settings, printable, clip }: { settings: PrintSettings; printable: boolean; clip: boolean }) {
  const items = [
    printable && { key: 'printable', swatch: <i className="vc-print__sw is-printable" />, label: t('print.legend.printable') },
    settings.marks && { key: 'marks', swatch: <i className="vc-print__sw is-marks" />, label: t('print.legend.marks') },
    settings.includeBleed && { key: 'bleed', swatch: <i className="vc-print__sw is-bleed" />, label: t('print.legend.bleed') },
    clip && { key: 'clip', swatch: <i className="vc-print__sw is-clip" />, label: t('print.legend.clip') },
  ].filter((i): i is Exclude<typeof i, false> => i !== false);
  if (items.length === 0) return <div className="vc-print__legend" />;
  return (
    <div className="vc-print__legend">
      {items.map((i) => (
        <span key={i.key}>
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** The sheet at scale with the artwork the printer will get; marks and bleed are drawn over it at a weight that can be seen. */
function Sheet({ settings, page, image, empty }: { settings: PrintSettings; page: PlannedPage | null; image: string | null; empty: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let sheet: ReactNode = <span className="vc-print__hint vc-print__empty">{empty}</span>;
  if (page && size.w > 0 && size.h > 0) {
    const { plan, target } = page;
    const margin = 10;
    const k = Math.min((size.w - 2 * margin) / plan.page.w, (size.h - 2 * margin) / plan.page.h);
    const layout = layoutOf(settings);
    const m = layout.unprintable ?? 0;
    const px = (v: number) => `${(v * k).toFixed(2)}px`;
    const bleed = settings.includeBleed ? mmToPt(settings.bleedMm) * plan.scale : 0;
    const t0 = plan.trimOnPage;
    const marks = layout.marks ? markLines(plan, layout.marks, target.artboard) : [];
    const weight = Math.max(1, (layout.marks?.weight ?? 0) * k);
    const clipped = m > 0 && plan.clip > mmToPt(0.05);
    sheet = (
      <div className={cx('vc-print__paper', settings.color === 'gray' && 'is-gray')} data-testid="print-preview" style={{ left: (size.w - plan.page.w * k) / 2, top: (size.h - plan.page.h * k) / 2, width: plan.page.w * k, height: plan.page.h * k }}>
        {image ? <img src={image} alt={t('print.preview')} draggable={false} /> : <span className="vc-print__hint">{t('print.previewing')}</span>}
        {m > 0 && <div className="vc-print__printable" style={{ left: px(m), top: px(m), width: px(plan.page.w - 2 * m), height: px(plan.page.h - 2 * m) }} />}
        {settings.includeBleed && <div className="vc-print__bleed" style={{ left: px(t0.minX - bleed), top: px(t0.minY - bleed), width: px(t0.maxX - t0.minX + 2 * bleed), height: px(t0.maxY - t0.minY + 2 * bleed) }} />}
        {marks.map((line, i) => {
          const [a, b] = line as [{ x: number; y: number }, { x: number; y: number }];
          const horizontal = a.y === b.y;
          return <span key={i} className="vc-print__mark" style={horizontal ? { left: px(Math.min(a.x, b.x)), top: `calc(${px(a.y)} - ${weight / 2}px)`, width: px(Math.abs(b.x - a.x)), height: weight } : { top: px(Math.min(a.y, b.y)), left: `calc(${px(a.x)} - ${weight / 2}px)`, height: px(Math.abs(b.y - a.y)), width: weight }} />;
        })}
        {clipped && (
          <>
            <div className="vc-print__clip" style={{ left: 0, top: 0, width: '100%', height: px(m) }} />
            <div className="vc-print__clip" style={{ left: 0, bottom: 0, width: '100%', height: px(m) }} />
            <div className="vc-print__clip" style={{ left: 0, top: px(m), width: px(m), height: px(plan.page.h - 2 * m) }} />
            <div className="vc-print__clip" style={{ right: 0, top: px(m), width: px(m), height: px(plan.page.h - 2 * m) }} />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="vc-print__stage" ref={stage}>
      {sheet}
    </div>
  );
}
