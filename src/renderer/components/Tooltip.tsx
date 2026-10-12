import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './Tooltip.css';

const DELAY_MS = 500;

/** Props that give any element a Victoria tooltip: name + optional shortcut chip. */
export function tip(name: string, shortcut?: string): Record<string, string> {
  const props: Record<string, string> = { 'data-tip': name, 'aria-label': name };
  if (shortcut) props['data-tip-key'] = shortcut;
  return props;
}

interface Shown {
  name: string;
  key: string | null;
  x: number;
  y: number;
  /** Top edge of the element, used when the tooltip has to open upwards. */
  top: number;
}

/** One host for the whole app; listens for `data-tip` on hovered elements (500 ms delay, specs/10). */
export function TooltipHost() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setShown(null);
    };

    const onOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]') ?? null;
      if (target === current) return;
      hide();
      if (!target) return;
      current = target;
      timer = window.setTimeout(() => {
        const rect = target.getBoundingClientRect();
        setShown({
          name: target.dataset.tip ?? '',
          key: target.dataset.tipKey ?? null,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 6,
          top: rect.top,
        });
      }, DELAY_MS);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Centre under the element, then keep the tooltip inside the window (flip above if it would overflow).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el) {
      setPos(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(Math.max(shown.x - width / 2, 4), window.innerWidth - width - 4);
    const top = shown.y + height > window.innerHeight - 4 ? shown.top - height - 6 : shown.y;
    setPos({ left, top });
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      ref={ref}
      className="vc-tooltip"
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {shown.name}
      {shown.key && <span className="vc-tooltip__key">{shown.key}</span>}
    </div>
  );
}
