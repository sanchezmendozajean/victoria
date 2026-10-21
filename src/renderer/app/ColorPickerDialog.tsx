import { useEffect, useRef, useState } from 'react';
import { COLOR_CHANNELS, setPaintItem, colorToCss, colorToHex, convertColor, deepClone, hexToColor, toWebSafe, type Appearance, type Color, type Paint, type DocumentSession } from '../../core';
import { NumberInput } from '../components/NumberInput';
import { channelGradient, solidColorOf } from '../panels/FillPanel';
import { CheckRow, Choice, Row, Slider } from '../panels/kit';
import { usePaintLook } from '../panels/PaintWidget';
import { rememberColor } from '../panels/recentColors';
import { t } from '../i18n';
import { applyPaint as applyLookPaint, nextPaintKey } from './paintActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './ColorPickerDialog.css';

/** Full colour picker (specs/06 · Selector de color completo): saturation/brightness square, hue bar, fields, web-only colours. */
export function ColorPickerDialog() {
  const picker = useUi((s) => s.colorPicker);
  const { look, resources, ctx } = usePaintLook();
  if (!picker) return null;
  const target = picker.target;
  const paint = look[target];
  const original = picker.item ? picker.item.color : !paint.mixed ? solidColorOf(paint.value, resources) : null;
  return <PickerForm key={`${target}:${picker.item?.nodeId ?? ''}:${picker.item?.index ?? ''}`} item={picker.item} anchor={picker.anchor} target={target} original={original ?? { model: 'rgb', values: [0, 0, 0] }} hasSelection={!!picker.item || (!!ctx && ctx.leaves.length > 0)} session={ctx?.session} />;
}

type Anchor = { left: number; top: number; right: number; bottom: number };
const POPOVER_W = 400;
const POPOVER_H = 380;

/** Beside the anchor when it fits (the panels live on the right, so usually to its left), kept inside the window. */
function placeBeside(anchor: Anchor): { left: number; top: number } {
  const room = window.innerWidth;
  let left = anchor.right + 8;
  if (left + POPOVER_W > room - 8) left = anchor.left - POPOVER_W - 8;
  left = Math.max(8, Math.min(left, room - POPOVER_W - 8));
  const top = Math.max(8, Math.min(anchor.top - 8, window.innerHeight - POPOVER_H - 8));
  return { left, top };
}

function PickerForm({ target, original, hasSelection, session, anchor, item }: { item: { nodeId: string; index: number } | undefined; target: 'fill' | 'stroke'; original: Color; hasSelection: boolean; session: DocumentSession | undefined; anchor: Anchor }) {
  const close = useUi((s) => s.closeColorPicker);
  const initial = convertColor(original, 'hsb');
  const [hsb, setHsb] = useState<[number, number, number]>([initial.values[0] ?? 0, initial.values[1] ?? 0, initial.values[2] ?? 0]);
  const [model, setModel] = useState<Color['model']>('rgb');
  const [webOnly, setWebOnly] = useState(false);
  // CMYK is not recoverable from RGB (K can trade with C, M and Y): after typing CMYK the typed values stay on screen.
  const [typedCmyk, setTypedCmyk] = useState<number[] | null>(null);
  const key = useRef(nextPaintKey());
  const applied = useRef(false);
  const savedLook = useRef<Appearance>(deepClone(useUi.getState().newLook) as Appearance);

  // Pointed at one item of the Appearance list the paint goes there; otherwise to the selection and the next objects.
  const applyPaint = (to: 'fill' | 'stroke', paint: Paint, mergeKey: string) => {
    const space = session?.document.spaces.find((sp) => sp.id === session.document.activeSpaceId);
    if (item && session && space) session.run(setPaintItem(space.id, item.nodeId, item.index, { paint }, mergeKey));
    else applyLookPaint(to, paint, mergeKey);
  };
  const colorOf = (v: [number, number, number]): Color => {
    const c: Color = { model: 'hsb', values: v, ...(original.alpha === undefined ? {} : { alpha: original.alpha }) };
    return webOnly ? toWebSafe(c) : c;
  };
  const color = colorOf(hsb);
  // What the colour is before snapping to the web palette, to compare it with its web version.
  const real: Color = { model: 'hsb', values: hsb, ...(original.alpha === undefined ? {} : { alpha: original.alpha }) };

  const set = (next: [number, number, number]) => {
    setTypedCmyk(null);
    setHsb(next);
    applied.current = true;
    applyPaint(target, { type: 'solid', color: colorOf(next) }, key.current);
  };
  const setFromColor = (c: Color) => {
    const h = convertColor(c, 'hsb');
    // Keep the hue when the colour has none (gray): HSB loses it at s = 0.
    set([h.values[2] === 0 || h.values[1] === 0 ? hsb[0] : (h.values[0] ?? 0), h.values[1] ?? 0, h.values[2] ?? 0]);
  };

  const accept = () => {
    rememberColor(color);
    close();
  };
  const cancel = () => {
    if (applied.current) {
      useUi.getState().setNewLook(savedLook.current);
      // With a selection the live preview is one history entry (same merge key): drop it.
      if (hasSelection) session?.rollback();
    }
    close();
  };

  const root = useRef<HTMLFormElement>(null);
  // A popover, not a modal: a click anywhere else keeps what was picked and closes it.
  const acceptRef = useRef(accept);
  const cancelRef = useRef(cancel);
  useEffect(() => {
    acceptRef.current = accept;
    cancelRef.current = cancel;
  });
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) acceptRef.current();
    };
    // Escape cancels wherever the focus is (the fields stop key events from bubbling).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancelRef.current();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const square = useRef<HTMLDivElement>(null);
  const hueBar = useRef<HTMLDivElement>(null);
  const dragSquare = (event: React.PointerEvent) => {
    const r = square.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)) * 100;
    const b = (1 - Math.min(1, Math.max(0, (event.clientY - r.top) / r.height))) * 100;
    set([hsb[0], s, b]);
  };
  const dragHue = (event: React.PointerEvent) => {
    const r = hueBar.current?.getBoundingClientRect();
    if (!r) return;
    set([Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)) * 360, hsb[1], hsb[2]]);
  };
  // The sliders show the colour in the chosen model; CMYK keeps what was typed (K trades with C, M and Y).
  const shown: Color = model === 'cmyk' && typedCmyk ? { model: 'cmyk', values: typedCmyk } : convertColor(color, model);
  const setChannel = (index: number, value: number) => {
    const values = [...shown.values];
    values[index] = value;
    setFromColor({ model, values });
    if (model === 'cmyk') setTypedCmyk(values);
  };

  return (
    <>
      <form
        ref={root}
        data-testid="color-picker"
        style={placeBeside(anchor)}
        className="vc-dialog vc-picker vc-popover"
        role="dialog"
        aria-label={t('picker.title')}
        onSubmit={(event) => {
          event.preventDefault();
          accept();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      >
        <h2 className="vc-dialog__title">{t('picker.title')}</h2>
        <div className="vc-picker__body">
          <div
            ref={square}
            className="vc-picker__square"
            data-testid="picker-square"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${colorToCss({ model: 'hsb', values: [hsb[0], 100, 100] })})` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragSquare(e);
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && dragSquare(e)}
          >
            <span className="vc-picker__marker" style={{ left: `${hsb[1]}%`, top: `${100 - hsb[2]}%` }} />
          </div>
          <div
            ref={hueBar}
            className="vc-picker__hue"
            data-testid="picker-hue"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragHue(e);
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && dragHue(e)}
          >
            <span className="vc-picker__huemarker" style={{ top: `${(hsb[0] / 360) * 100}%` }} />
          </div>
          <div className="vc-picker__side">
            <CheckRow checked={webOnly} onChange={(v) => { setWebOnly(v); if (v) applyPaint(target, { type: 'solid', color: toWebSafe(colorOf(hsb)) }, key.current); }} label={t('picker.webOnly')} testId="picker-web" />
            <div className="vc-picker__compare" aria-label={t('picker.webReal')}>
              <div className="vc-picker__half">
                <span className="vc-picker__swatch" style={{ background: colorToCss(toWebSafe(real)) }} data-testid="picker-web-swatch" />
                <span className="vc-picker__caption">{t('picker.web')}</span>
              </div>
              <div className="vc-picker__half">
                <span className="vc-picker__swatch" style={{ background: colorToCss(real) }} data-testid="picker-real-swatch" />
                <span className="vc-picker__caption">{t('picker.real')}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="vc-picker__channels">
          <Row>
            <Choice
              value={model}
              label={t('fill.model')}
              testId="picker-model"
              width={110}
              options={[
                { id: 'rgb', label: 'RGB' },
                { id: 'hsb', label: 'HSB' },
                { id: 'cmyk', label: 'CMYK' },
                { id: 'gray', label: t('fill.gray') },
              ]}
              onChange={(m) => {
                setModel(m);
                setTypedCmyk(null);
              }}
            />
            <span style={{ flex: 1 }} />
            <HexInput value={colorToHex(color)} onCommit={(hex) => setFromColor(hex)} />
          </Row>
          {COLOR_CHANNELS[model].map((channel, i) => {
            const value = shown.values[i] ?? 0;
            return (
              <Row key={`${model}${channel.id}${i}`}>
                <span className="vc-plabel" style={{ width: 14 }}>{channel.id}</span>
                <Slider
                  label={channel.id}
                  testId={`picker-slider-${channel.id}`}
                  value={value}
                  min={0}
                  max={channel.max}
                  background={channelGradient(shown, i)}
                  onChange={(v) => setChannel(i, v)}
                />
                <NumberInput value={Math.round(value * 10) / 10} onCommit={(v) => setChannel(i, v)} min={0} max={channel.max} decimals={model === 'rgb' ? 0 : 1} width={52} testId={`picker-field-${channel.id}`} tooltip={channel.id} />
              </Row>
            );
          })}
        </div>
        <div className="vc-dialog__buttons">
          <button type="button" className="vc-dialog__button" data-testid="picker-cancel" onClick={cancel}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="picker-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit(color: Color): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = (text: string) => {
    setDraft(null);
    const c = hexToColor(text);
    if (c) onCommit(c);
  };
  return (
    <div className="vc-field" style={{ width: 84 }}>
      <input
        className="vc-field__input"
        data-testid="picker-hex"
        aria-label="HEX"
        value={(draft ?? value).replace('#', '')}
        maxLength={7}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && finish(draft)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(draft ?? value);
          }
        }}
      />
    </div>
  );
}
