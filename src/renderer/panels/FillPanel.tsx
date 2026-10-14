import { useRef, useState, useSyncExternalStore } from 'react';
import { colorToCss, colorToHex, convertColor, COLOR_CHANNELS, hexToColor, type BlendMode, type Color, type Paint, type Resources } from '../../core';
import { applyItemOpacity, applyObjectLook, applyPaint, nextPaintKey } from '../app/paintActions';
import { useUi } from '../app/store';
import { NumberInput } from '../components/NumberInput';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { Choice, Row, Section, Slider, PaintChip } from './kit';
import { PaintModes, PaintWidget, usePaintLook } from './PaintWidget';
import { loadRecentColors, recentColorsVersion, rememberColor, subscribeRecentColors } from './recentColors';

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
const HUES = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];

/** The solid colour of a paint, resolving swatches; null for none, gradients and mixed values. */
export function solidColorOf(paint: Paint, resources: Resources): Color | null {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'swatch') return resources.swatches.find((s) => s.id === paint.swatchId)?.color ?? null;
  return null;
}

/** Track background of the slider of channel `index` for a colour in `model`: the channel sweeps with the others fixed. */
export function channelGradient(color: Color, index: number): string {
  const model = color.model;
  const max = COLOR_CHANNELS[model][index]?.max ?? 100;
  const at = (v: number) => {
    const values = [...color.values];
    values[index] = v;
    return colorToCss({ model, values });
  };
  if (model === 'hsb' && index === 0) return `linear-gradient(to right, ${HUES.join(',')})`;
  return `linear-gradient(to right, ${at(0)}, ${at(max)})`;
}

const FALLBACK: Color = { model: 'rgb', values: [0, 0, 0] };

export function FillPanel() {
  const { look, resources, ctx } = usePaintLook();
  const active = useUi((s) => s.activePaint);
  const openPicker = useUi((s) => s.openColorPicker);
  const paint = look[active];
  const current = !paint.mixed ? solidColorOf(paint.value, resources) : null;
  const [model, setModel] = useState<Color['model']>('rgb');
  const key = useRef<string | undefined>(undefined);
  const shownModel = current ? (current.model === 'rgb' || current.model === 'hsb' || current.model === 'cmyk' || current.model === 'gray' ? model : model) : model;
  const shown = current ? convertColor(current, shownModel) : null;
  const channels = COLOR_CHANNELS[shownModel];
  const recents = useSyncExternalStore(subscribeRecentColors, recentColorsVersion);
  void recents;

  const commit = (color: Color) => applyPaint(active, { type: 'solid', color }, key.current);
  const start = () => {
    key.current = nextPaintKey();
  };
  const end = () => {
    const c = key.current ? current : null;
    key.current = undefined;
    if (c) rememberColor(c);
  };
  const setChannel = (index: number, value: number) => {
    const base = shown ?? convertColor(FALLBACK, shownModel);
    const values = [...base.values];
    values[index] = value;
    commit({ model: shownModel, values, ...(base.alpha === undefined ? {} : { alpha: base.alpha }) });
  };

  const gradientPaint = !paint.mixed && (paint.value.type === 'linear' || paint.value.type === 'radial');

  return (
    <div className="vc-panelbody" data-testid="fill-panel">
      <Section title={t('fill.colour')}>
        <Row>
          <PaintWidget size={44} testId="fill-widget" />
          <PaintModes />
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="vc-pbutton vc-pbutton--icon"
            {...tip(t('fill.eyedropper'))}
            data-testid="fill-eyedropper"
            onClick={async () => {
              const Picker = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
              if (!Picker) return;
              try {
                const result = await new Picker().open();
                const color = hexToColor(result.sRGBHex);
                if (color) {
                  applyPaint(active, { type: 'solid', color });
                  rememberColor(color);
                }
              } catch {
                // The user cancelled the screen picker.
              }
            }}
          >
            <Icon id="eyedropper" size={16} />
          </button>
          <button type="button" className="vc-pbutton vc-pbutton--icon" {...tip(t('fill.fullPicker'))} data-testid="fill-open-picker" onClick={() => openPicker(active)}>
            <Icon id="swatches" size={16} />
          </button>
        </Row>

        {gradientPaint && <p className="vc-phint">{t('fill.gradientHint')}</p>}
        {!paint.mixed && paint.value.type === 'none' && <p className="vc-phint">{t('fill.noneHint')}</p>}

        {(!gradientPaint && !(!paint.mixed && paint.value.type === 'none')) && (
          <>
            <Row>
              <Choice
                value={shownModel}
                label={t('fill.model')}
                testId="fill-model"
                width={110}
                options={[
                  { id: 'rgb', label: 'RGB' },
                  { id: 'hsb', label: 'HSB' },
                  { id: 'cmyk', label: 'CMYK' },
                  { id: 'gray', label: t('fill.gray') },
                ]}
                onChange={(m) => setModel(m)}
              />
              <span style={{ flex: 1 }} />
              <HexField color={current} onCommit={(c) => {
                applyPaint(active, { type: 'solid', color: c });
                rememberColor(c);
              }} />
            </Row>
            {channels.map((channel, index) => (
              <Row key={`${shownModel}${channel.id}${index}`}>
                <span className="vc-plabel" style={{ width: 14 }}>
                  {channel.id}
                </span>
                <Slider
                  label={`${t('fill.channel')} ${channel.id}`}
                  testId={`fill-slider-${channel.id}`}
                  value={shown ? (shown.values[index] ?? 0) : null}
                  min={0}
                  max={channel.max}
                  step={shownModel === 'rgb' ? 1 : 1}
                  background={shown ? channelGradient(shown, index) : undefined}
                  onStart={start}
                  onChange={(v) => setChannel(index, v)}
                  onEnd={end}
                />
                <NumberInput
                  value={shown ? (shown.values[index] ?? 0) : null}
                  onCommit={(v) => {
                    key.current = undefined;
                    setChannel(index, v);
                    if (shown) rememberColor(shown);
                  }}
                  min={0}
                  max={channel.max}
                  decimals={0}
                  width={52}
                  testId={`fill-field-${channel.id}`}
                  tooltip={channel.id}
                />
              </Row>
            ))}
            <Spectrum onPick={(c) => commit(c)} onStart={start} onEnd={end} />
            <Recents onPick={(c) => applyPaint(active, { type: 'solid', color: c })} />
          </>
        )}
      </Section>

      <Section title={t('fill.opacitySection')}>
        <Row>
          <Icon id="opacity" size={14} className="vc-field__icon" />
          <span className="vc-plabel" style={{ width: 56 }}>
            {t('fill.opacity')}
          </span>
          <ObjectOpacity />
        </Row>
        <Row>
          <Icon id="blend-mode" size={14} className="vc-field__icon" />
          <span className="vc-plabel" style={{ width: 56 }}>
            {t('fill.blend')}
          </span>
          <Choice
            value={look.blend.mixed ? null : look.blend.value}
            mixed={look.blend.mixed}
            label={t('fill.blend')}
            testId="fill-blend"
            width={120}
            options={BLEND_MODES.map((m) => ({ id: m, label: t(`blend.${m}`) }))}
            onChange={(m) => applyObjectLook({ blendMode: m })}
          />
        </Row>
        <Row>
          <PaintChip paint={look[active].mixed ? null : (look[active] as { value: Paint }).value} mixed={look[active].mixed} resources={resources} size={14} />
          <span className="vc-plabel">{active === 'fill' ? t('toolbar.fill') : t('toolbar.stroke')}</span>
          <span style={{ flex: 1 }} />
          <NumberInput
            value={look[active === 'fill' ? 'fillOpacity' : 'strokeOpacity'].mixed ? null : Math.round((look[active === 'fill' ? 'fillOpacity' : 'strokeOpacity'] as { value: number }).value * 100)}
            onCommit={(v) => applyItemOpacity(active, v / 100)}
            suffix="%"
            min={0}
            max={100}
            decimals={0}
            width={70}
            testId="fill-item-opacity"
            tooltip={t('fill.itemOpacity')}
          />
        </Row>
        {ctx === null && <p className="vc-phint">{t('fill.noDocument')}</p>}
      </Section>
    </div>
  );
}

function ObjectOpacity() {
  const { look } = usePaintLook();
  const key = useRef<string | undefined>(undefined);
  const value = look.opacity.mixed ? null : Math.round(look.opacity.value * 100);
  return (
    <>
      <Slider
        label={t('fill.opacity')}
        testId="fill-opacity-slider"
        value={value}
        min={0}
        max={100}
        onStart={() => (key.current = nextPaintKey())}
        onChange={(v) => applyObjectLook({ opacity: v / 100 }, key.current)}
        onEnd={() => (key.current = undefined)}
      />
      <NumberInput value={value} onCommit={(v) => applyObjectLook({ opacity: v / 100 })} suffix="%" min={0} max={100} decimals={0} width={64} testId="fill-opacity" tooltip={t('fill.opacity')} />
    </>
  );
}

/** `#RRGGBB` field: Enter or leaving it applies; invalid text restores the previous value. */
function HexField({ color, onCommit }: { color: Color | null; onCommit(color: Color): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const shown = draft ?? (color ? colorToHex(color) : '');
  const finish = (text: string) => {
    setDraft(null);
    const parsed = hexToColor(text);
    if (parsed) onCommit(parsed);
  };
  return (
    <div className="vc-field" style={{ width: 84 }}>
      <span className="vc-field__label">#</span>
      <input
        className="vc-field__input"
        data-testid="fill-hex"
        aria-label="HEX"
        value={shown.replace('#', '')}
        maxLength={7}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (skipBlur.current) skipBlur.current = false;
          else if (draft !== null) finish(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            finish(draft ?? shown);
            skipBlur.current = true; // the blur below must not commit the stale draft again
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            skipBlur.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

/** A bar that turns the horizontal position of the pointer into a colour. */
function RampBar({ className, testId, toColor, onPick, onStart, onEnd }: { className: string; testId: string; toColor(ratio: number): Color; onPick(color: Color): void; onStart(): void; onEnd(): void }) {
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick(toColor(r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0));
  };
  return (
    <div
      className={className}
      data-testid={testId}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
        pick(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)}
      onPointerUp={onEnd}
    />
  );
}

/** Colour ramp: hue across, plus a gray strip (specs/06 · Rampa de color). */
function Spectrum(props: { onPick(color: Color): void; onStart(): void; onEnd(): void }) {
  return (
    <div className="vc-spectrum" data-testid="fill-spectrum">
      <RampBar className="vc-spectrum__hue" testId="fill-spectrum-hue" toColor={(r) => ({ model: 'hsb', values: [r * 360, 100, 100] })} {...props} />
      <RampBar className="vc-spectrum__gray" testId="fill-spectrum-gray" toColor={(r) => ({ model: 'gray', values: [r * 100] })} {...props} />
    </div>
  );
}

function Recents({ onPick }: { onPick(color: Color): void }) {
  useSyncExternalStore(subscribeRecentColors, recentColorsVersion);
  const colors = loadRecentColors();
  if (colors.length === 0) return null;
  return (
    <div className="vc-recents" data-testid="fill-recents" aria-label={t('fill.recent')}>
      {colors.map((c) => (
        <button key={colorToHex(c)} type="button" className="vc-recents__chip" style={{ background: colorToCss(c) }} {...tip(colorToHex(c))} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}
