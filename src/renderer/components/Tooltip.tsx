import { useEffect, useState } from 'react';
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

  if (!shown) return null;
  return (
    <div className="vc-tooltip" role="tooltip" style={{ left: shown.x, top: shown.y }}>
      {shown.name}
      {shown.key && <span className="vc-tooltip__key">{shown.key}</span>}
    </div>
  );
}
