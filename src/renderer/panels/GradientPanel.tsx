import { useRef, useState } from 'react';
import {
  colorToHex,
  colorToRgb,
  convertColor,
  editGradients,
  gradientAngle,
  gradientAxis,
  gradientColorAt,
  gradientTransform,
  hexToColor,
  primaryItem,
  reversedStops,
  rotateGradient,
  setGradientTransform,
  sortStops,
  type Color,
  type Gradient,
  type GradientStop,
  type Matrix,
  type Paint,
} from '../../core';
import { paintAsGradient, nextPaintKey } from '../app/paintActions';
import { useUi } from '../app/store';
import { cx } from '../components/cx';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { Choice, gradientCss, Row, Section, Slider } from './kit';
import { usePaintLook } from './PaintWidget';

type GradientPaint = Extract<Paint, { type: 'linear' | 'radial' }>;

/** Degradado (specs/06): type, angle, aspect, stop bar with midpoints, per-stop colour and opacity, reverse. */
export function GradientPanel() {
  const { look, resources, ctx } = usePaintLook();
  const active = useUi((s) => s.activePaint);
  const [selected, setSelected] = useState(0);
  const key = useRef<string | undefined>(undefined);
  const bar = useRef<HTMLDivElement>(null);

  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  if (ctx.leaves.length === 0) return <div className="vc-pempty">{t('gradient.selectFirst')}</div>;

  const first = ctx.leaves.map((n) => ({ node: n, item: primaryItem(n.appearance, active) })).find((x) => x.item && (x.item.paint.type === 'linear' || x.item.paint.type === 'radial'));
  const paint = first?.item?.paint as GradientPaint | undefined;
  const gradient = paint ? resources.gradients.find((g) => g.id === paint.gradientId) : undefined;
  void look;

  if (!paint || !gradient) {
    return (
      <div className="vc-panelbody" data-testid="gradient-panel">
        <Section title={t('gradient.title')}>
          <p className="vc-phint">{t('gradient.none')}</p>
          <Row>
            <button type="button" className="vc-pbutton" data-testid="gradient-apply" onClick={() => paintAsGradient(active)}>
              <Icon id="paint-gradient" size={16} />
              {t('gradient.apply')}
            </button>
          </Row>
        </Section>
      </div>
    );
  }

  const { session, space, ids } = ctx;
  const stops = sortStops(gradient.stops);
  const index = Math.min(selected, stops.length - 1);
  const stop = stops[index] as GradientStop;
  const axis = gradientAxis(paint.transform);

  const edit = (mutate: (g: Gradient) => void, k = key.current) => session.run(editGradients(space.id, ids, active, mutate as Parameters<typeof editGradients>[3], session.ids, k));
  const editStop = (i: number, patch: Partial<GradientStop>, k = key.current) =>
    edit((g) => {
      const sorted = sortStops(g.stops);
      const target = sorted[i];
      if (!target) return;
      Object.assign(target, patch);
      g.stops = sortStops(sorted);
    }, k);
  const transformsWith = (fn: (m: Matrix) => Matrix) => {
    const map = new Map<string, Matrix>();
    for (const n of ctx.leaves) {
      const p = primaryItem(n.appearance, active)?.paint;
      if (p && (p.type === 'linear' || p.type === 'radial')) map.set(n.id, fn(p.transform));
    }
    return map;
  };
  const setTransform = (fn: (m: Matrix) => Matrix, k = key.current) => session.run(setGradientTransform(space.id, ids, active, transformsWith(fn), undefined, k));

  const positionOf = (e: React.PointerEvent) => {
    const r = bar.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0;
  };

  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A click on the bar itself (not on a marker) adds a stop with the gradient's colour there.
    if ((e.target as HTMLElement).closest('[data-stop],[data-mid]')) return;
    const offset = Math.round(positionOf(e) * 1000) / 1000;
    const { color, opacity } = gradientColorAt(stops, offset);
    edit((g) => {
      g.stops.push({ offset, color, opacity });
      g.stops = sortStops(g.stops);
    }, nextPaintKey());
    const at = sortStops([...stops, { offset, color, opacity }]).findIndex((s) => s.offset === offset);
    setSelected(Math.max(0, at));
  };

  const dragStop = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(i);
    key.current = nextPaintKey();
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const r = bar.current?.getBoundingClientRect();
      if (!r || !el.hasPointerCapture(ev.pointerId)) return;
      const offset = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      editStop(i, { offset: Math.round(offset * 1000) / 1000 });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const r = bar.current?.getBoundingClientRect();
      // Dragged well below the bar: the stop is removed (at least two stops stay).
      if (r && ev.clientY - r.bottom > 28 && stops.length > 2) {
        edit((g) => {
          g.stops = sortStops(g.stops).filter((_, j) => j !== i);
        });
        setSelected(0);
      }
      key.current = undefined;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const dragMid = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    key.current = nextPaintKey();
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const r = bar.current?.getBoundingClientRect();
      const a = stops[i];
      const b = stops[i + 1];
      if (!r || !a || !b || !el.hasPointerCapture(ev.pointerId)) return;
      const at = (ev.clientX - r.left) / r.width;
      const mid = Math.min(0.95, Math.max(0.05, (at - a.offset) / (b.offset - a.offset || 1)));
      editStop(i, { midpoint: Math.round(mid * 1000) / 1000 });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      key.current = undefined;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const rgb = colorToRgb(stop.color).map(Math.round) as [number, number, number];
  const setRgb = (channel: number, value: number) => {
    const values = rgb.map((v, c) => (c === channel ? value : v));
    editStop(index, { color: { model: 'rgb', values, ...(stop.color.alpha === undefined ? {} : { alpha: stop.color.alpha }) } });
  };

  return (
    <div className="vc-panelbody" data-testid="gradient-panel">
      <Section title={t('gradient.title')}>
        <div className="vc-gradbar" style={{ background: 'transparent' }}>
          <div ref={bar} className="vc-gradbar__bar" data-testid="gradient-bar" style={{ background: gradientCss({ ...gradient, type: 'linear' }) }} onPointerDown={onBarDown}>
            {stops.slice(0, -1).map((s, i) => {
              const next = stops[i + 1] as GradientStop;
              const mid = s.offset + (next.offset - s.offset) * (s.midpoint ?? 0.5);
              return <span key={`m${i}`} className="vc-gradbar__mid" data-mid={i} data-testid="gradient-mid" style={{ left: `${mid * 100}%` }} onPointerDown={dragMid(i)} />;
            })}
          </div>
          <div className="vc-gradbar__stops">
            {stops.map((s, i) => (
              <span
                key={i}
                className={cx('vc-gradbar__stop', i === index && 'is-selected')}
                data-stop={i}
                data-testid="gradient-stop"
                style={{ left: `${s.offset * 100}%` }}
                onPointerDown={dragStop(i)}
              >
                <i style={{ background: colorToHex(s.color) }} />
              </span>
            ))}
          </div>
        </div>

        <Row>
          <Choice
            value={gradient.type}
            label={t('gradient.type')}
            testId="gradient-type"
            width={110}
            options={[
              { id: 'linear', label: t('gradient.linear') },
              { id: 'radial', label: t('gradient.radial') },
            ]}
            onChange={(type) => edit((g) => void (g.type = type), nextPaintKey())}
          />
          <span style={{ flex: 1 }} />
          <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="gradient-reverse" {...tip(t('gradient.reverse'))} onClick={() => edit((g) => void (g.stops = reversedStops(g.stops)), nextPaintKey())}>
            <Icon id="flip-h" size={16} />
          </button>
        </Row>
        <Row>
          <Icon id="angle" size={14} className="vc-field__icon" />
          <NumberInput
            value={Math.round(gradientAngle(paint.transform) * 100) / 100}
            onCommit={(v) => setTransform((m) => rotateGradient(m, v, gradient.type), nextPaintKey())}
            suffix="°"
            decimals={2}
            width={84}
            testId="gradient-angle"
            tooltip={t('gradient.angle')}
          />
          {gradient.type === 'radial' && (
            <NumberInput
              icon="scale-fit"
              value={Math.round(axis.aspect * 1000) / 10}
              onCommit={(v) =>
                setTransform((m) => {
                  const a = gradientAxis(m);
                  return gradientTransform(a.start, a.end, Math.max(0.01, v / 100));
                }, nextPaintKey())
              }
              suffix="%"
              min={1}
              decimals={1}
              width={84}
              testId="gradient-aspect"
              tooltip={t('gradient.aspect')}
            />
          )}
        </Row>
      </Section>

      <Section title={t('gradient.stop')}>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('gradient.location')}</span>
          <NumberInput value={Math.round(stop.offset * 1000) / 10} onCommit={(v) => editStop(index, { offset: v / 100 }, nextPaintKey())} suffix="%" min={0} max={100} decimals={1} width={84} testId="gradient-location" tooltip={t('gradient.location')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('fill.opacity')}</span>
          <NumberInput value={Math.round(stop.opacity * 100)} onCommit={(v) => editStop(index, { opacity: v / 100 }, nextPaintKey())} suffix="%" min={0} max={100} decimals={0} width={84} testId="gradient-stop-opacity" tooltip={t('fill.opacity')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 70 }}>{t('gradient.midpoint')}</span>
          <NumberInput
            value={index < stops.length - 1 ? Math.round((stop.midpoint ?? 0.5) * 1000) / 10 : null}
            onCommit={(v) => editStop(index, { midpoint: v / 100 }, nextPaintKey())}
            suffix="%"
            min={5}
            max={95}
            decimals={1}
            width={84}
            disabled={index >= stops.length - 1}
            testId="gradient-midpoint"
            tooltip={t('gradient.midpoint')}
          />
        </Row>
        {(['R', 'G', 'B'] as const).map((label, c) => (
          <Row key={label}>
            <span className="vc-plabel" style={{ width: 14 }}>{label}</span>
            <Slider
              label={label}
              testId={`gradient-slider-${label}`}
              value={rgb[c] as number}
              min={0}
              max={255}
              onStart={() => (key.current = nextPaintKey())}
              onChange={(v) => setRgb(c, v)}
              onEnd={() => (key.current = undefined)}
              background={`linear-gradient(to right, ${colorToHex({ model: 'rgb', values: rgb.map((v, k) => (k === c ? 0 : v)) })}, ${colorToHex({ model: 'rgb', values: rgb.map((v, k) => (k === c ? 255 : v)) })})`}
            />
            <NumberInput value={rgb[c] as number} onCommit={(v) => setRgb(c, v)} min={0} max={255} decimals={0} width={52} testId={`gradient-field-${label}`} tooltip={label} />
          </Row>
        ))}
        <Row>
          <span className="vc-plabel" style={{ width: 14 }}>#</span>
          <HexStop color={stop.color} onCommit={(c) => editStop(index, { color: c }, nextPaintKey())} />
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="vc-pbutton vc-pbutton--icon"
            data-testid="gradient-delete-stop"
            {...tip(t('gradient.deleteStop'))}
            disabled={stops.length <= 2}
            onClick={() => {
              edit((g) => void (g.stops = sortStops(g.stops).filter((_, j) => j !== index)), nextPaintKey());
              setSelected(0);
            }}
          >
            <Icon id="delete-item" size={16} />
          </button>
        </Row>
      </Section>
    </div>
  );
}

function HexStop({ color, onCommit }: { color: Color; onCommit(color: Color): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = (text: string) => {
    setDraft(null);
    const parsed = hexToColor(text);
    if (parsed) onCommit({ ...convertColor(parsed, 'rgb'), ...(color.alpha === undefined ? {} : { alpha: color.alpha }) });
  };
  return (
    <div className="vc-field" style={{ width: 84 }}>
      <input
        className="vc-field__input"
        data-testid="gradient-hex"
        aria-label="HEX"
        value={(draft ?? colorToHex(color)).replace('#', '')}
        maxLength={7}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && finish(draft)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            finish(draft ?? colorToHex(color));
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
