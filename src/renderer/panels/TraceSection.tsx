import { TRACE_PRESETS, TRACE_VIEWS, locateNode, paramsForPreset, type TraceParams, type TracePresetId } from '../../core';
import { imageFactsOf } from '../app/imageObjectActions';
import { cancelTrace, expandSelectedTrace, retraceSelected, setSelectedTraceView, traceSelectedImage, useTrace } from '../app/traceActions';
import { Icon, type IconId } from '../components/Icon';
import { MenuPopup, type Anchor, type MenuEntry } from '../components/Menu';
import { tip } from '../components/Tooltip';
import { NumberInput } from '../components/NumberInput';
import { t, type TranslationKey } from '../i18n';
import { usePreferences } from '../prefs/preferences';
import { useState } from 'react';
import type { PanelContext } from './context';
import { CheckRow, Choice, Row, Section } from './kit';

const PRESETS = Object.keys(TRACE_PRESETS) as TracePresetId[];
type PresetChoice = TracePresetId | 'custom';

/** Menu icons of the presets (every menu entry has one) and the groups the menu separates, as Illustrator lists them. */
const PRESET_ICONS: Record<TracePresetId, IconId> = { high: 'image', low: 'image', colors3: 'paint-color', colors6: 'paint-color', colors16: 'paint-color', grays: 'opacity', bw: 'fill', silhouette: 'shapes', lineart: 'tool-pencil', technical: 'tool-line', logo: 'tool-star' };
const PRESET_GROUPS: TracePresetId[][] = [['high', 'low'], ['colors3', 'colors6', 'colors16'], ['grays'], ['bw', 'logo', 'silhouette', 'lineart', 'technical']];

/** The preset the settings still match exactly, else 'custom'. */
function presetOf(params: TraceParams): PresetChoice {
  return PRESETS.find((id) => JSON.stringify(paramsForPreset(id)) === JSON.stringify(params)) ?? 'custom';
}

/** Calco de imagen (specs/08): trace a picture, and tune a live trace. */
export function TraceSection({ ctx, id }: { ctx: PanelContext; id: string }) {
  const { running, progress } = useTrace();
  const preset = usePreferences((s) => s.prefs.tracePreset);
  const setPrefs = usePreferences((s) => s.set);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const node = locateNode(ctx.space, id)?.node;
  const live = node && node.type === 'group' ? node.trace : undefined;
  const facts = !live ? imageFactsOf(ctx.session, ctx.space, id) : null;
  const canTrace = !!facts && !facts.crop && facts.image.id === id && facts.link !== 'broken';
  if (!live && !canTrace) return null;

  const percent = Math.round(progress * 100);
  const progressRow = running && (
    <Row>
      <div className="vc-trace__bar" data-testid="trace-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${percent}%` }} />
      </div>
      <span className="vc-plabel">{t('trace.running', { percent })}</span>
      <button type="button" className="vc-pbutton" data-testid="trace-cancel" onClick={cancelTrace}>
        <Icon id="close" size={14} />
        {t('trace.cancel')}
      </button>
    </Row>
  );

  if (!live) {
    return (
      <Section title={t('trace.section')}>
        <Row>
          <div className="vc-split">
            <button type="button" className="vc-pbutton" data-testid="trace-run" {...tip(t('trace.runWith', { preset: t(`trace.preset.${preset}` as TranslationKey) }))} disabled={running} onClick={() => void traceSelectedImage()}>
              <Icon id="trace-image" size={14} />
              {t('trace.run')}
            </button>
            <button
              type="button"
              className="vc-pbutton vc-split__arrow"
              data-testid="trace-menu"
              data-menu-trigger
              aria-haspopup="menu"
              aria-expanded={!!menu}
              {...tip(t('trace.menu'))}
              disabled={running}
              onClick={(e) => setMenu(menu ? null : { rect: e.currentTarget.getBoundingClientRect(), placement: 'below' })}
            >
              <Icon id="chevron-down" size={12} />
            </button>
          </div>
        </Row>
        {menu && (
          <MenuPopup
            anchor={menu}
            minWidth={200}
            onClose={() => setMenu(null)}
            entries={PRESET_GROUPS.flatMap((group, i): MenuEntry[] => [
              ...(i > 0 ? [{ type: 'separator' as const, id: `sep-${i}` }] : []),
              ...group.map((p) => ({
                id: p,
                label: t(`trace.preset.${p}` as TranslationKey),
                icon: PRESET_ICONS[p],
                checked: p === preset,
                // Picking a preset traces with it and makes it the one the button uses from now on.
                onSelect: () => {
                  setPrefs({ tracePreset: p });
                  void traceSelectedImage(p);
                },
              })),
            ])}
          />
        )}
        {progressRow}
      </Section>
    );
  }

  const params = live.params;
  const change = (patch: Partial<TraceParams>) => void retraceSelected({ ...params, ...patch });
  const number = (key: 'colors' | 'threshold' | 'noise' | 'corners' | 'tolerance', min: number, max: number, decimals = 0) => (
    <Row key={key}>
      <span className="vc-plabel" style={{ width: 80 }}>{t(`trace.${key}` as TranslationKey)}</span>
      <NumberInput
        value={params[key]}
        onCommit={(v) => change({ [key]: v })}
        min={min}
        max={max}
        decimals={decimals}
        step={decimals ? 0.1 : 1}
        width={80}
        testId={`trace-${key}`}
        tooltip={t(`trace.${key}` as TranslationKey)}
        disabled={running}
      />
    </Row>
  );
  const choices: Array<{ id: PresetChoice; label: string }> = [
    ...PRESETS.map((p) => ({ id: p as PresetChoice, label: t(`trace.preset.${p}` as TranslationKey) })),
    { id: 'custom', label: t('trace.custom') },
  ];
  return (
    <Section title={t('trace.section')}>
      <Row>
        <span className="vc-plabel" style={{ width: 80 }}>{t('trace.preset')}</span>
        <Choice value={presetOf(params)} label={t('trace.preset')} testId="trace-preset" width={140} options={choices} onChange={(p) => p !== 'custom' && void retraceSelected(paramsForPreset(p))} />
      </Row>
      <Row>
        <span className="vc-plabel" style={{ width: 80 }}>{t('trace.view')}</span>
        <Choice
          value={live.view ?? 'result'}
          label={t('trace.view')}
          testId="trace-view"
          width={140}
          options={TRACE_VIEWS.map((v) => ({ id: v, label: t(`trace.view.${v}` as TranslationKey) }))}
          onChange={setSelectedTraceView}
        />
      </Row>
      <Row>
        <span className="vc-plabel" style={{ width: 80 }}>{t('trace.mode')}</span>
        <Choice
          value={params.mode}
          label={t('trace.mode')}
          testId="trace-mode"
          width={140}
          options={(['color', 'gray', 'bw'] as const).map((m) => ({ id: m, label: t(`trace.mode.${m}` as TranslationKey) }))}
          onChange={(mode) => change({ mode })}
        />
      </Row>
      {params.mode === 'bw' ? number('threshold', 0, 255) : number('colors', 2, 30)}
      {number('noise', 1, 1000)}
      {number('corners', 0, 100)}
      {number('tolerance', 0.2, 10, 1)}
      <Row>
        <span className="vc-plabel" style={{ width: 80 }}>{t('trace.method')}</span>
        <Choice
          value={params.method}
          label={t('trace.method')}
          testId="trace-method"
          width={140}
          options={(['overlapping', 'abutting'] as const).map((m) => ({ id: m, label: t(`trace.method.${m}` as TranslationKey) }))}
          onChange={(method) => change({ method })}
        />
      </Row>
      <CheckRow checked={params.snapLines === true} onChange={() => change({ snapLines: !params.snapLines })} label={t('trace.snapLines')} testId="trace-snap-lines" />
      <CheckRow checked={params.strokes === true} onChange={() => change({ strokes: !params.strokes })} label={t('trace.strokes')} testId="trace-strokes" />
      <CheckRow checked={params.ignoreWhite} onChange={() => change({ ignoreWhite: !params.ignoreWhite })} label={t('trace.ignoreWhite')} testId="trace-ignore-white" />
      {progressRow}
      <Row>
        <button type="button" className="vc-pbutton" data-testid="trace-expand" disabled={running} onClick={expandSelectedTrace}>
          <Icon id="ungroup" size={14} />
          {t('trace.expand')}
        </button>
      </Row>
    </Section>
  );
}
