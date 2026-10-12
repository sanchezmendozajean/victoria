import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import './Rulers.css';

interface Tick {
  pos: number;
  size: number;
  label: string;
}

/** Ruler marks along one axis. `origin`: pixel of 0; `ppu`: pixels per unit; `every`: units between labelled marks. */
export function rulerTicks(length: number, origin: number, ppu: number, every: number): Tick[] {
  const major = every * ppu;
  const minor = major / 8;
  const ticks: Tick[] = [];
  let index = Math.floor(-origin / minor);
  for (let pos = origin + index * minor; pos < length; pos += minor, index++) {
    if (pos < 0) continue;
    const m = ((index % 8) + 8) % 8;
    ticks.push({
      pos: Math.round(pos),
      size: m === 0 ? 18 : m === 4 ? 8 : 4,
      label: m === 0 ? String(Math.round((index / 8) * every)) : '',
    });
  }
  return ticks;
}

interface RulersProps {
  /** Pixel position of the origin and scale. Phase 3 binds these to the Viewport. */
  originX: number;
  originY: number;
  pixelsPerUnit: number;
  every: number;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

export function Rulers({ originX, originY, pixelsPerUnit, every }: RulersProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const horizontal = rulerTicks(size.width - 18, originX, pixelsPerUnit, every);
  const vertical = rulerTicks(size.height - 18, originY, pixelsPerUnit, every);

  return (
    <div ref={ref} className="vc-rulers" data-testid="rulers">
      <div className="vc-ruler vc-ruler--h">
        {horizontal.map((tick) => (
          <span key={tick.pos}>
            <i style={{ left: tick.pos, height: tick.size }} />
            {tick.label && <b style={{ left: tick.pos + 3 }}>{tick.label}</b>}
          </span>
        ))}
      </div>
      <div className="vc-ruler vc-ruler--v">
        {vertical.map((tick) => (
          <span key={tick.pos}>
            <i style={{ top: tick.pos, width: tick.size }} />
            {tick.label && <b style={{ top: tick.pos + 3 }}>{tick.label}</b>}
          </span>
        ))}
      </div>
      <div className="vc-ruler__corner" title={t('canvas.rulerOrigin')}>
        <span />
        <span />
      </div>
    </div>
  );
}
