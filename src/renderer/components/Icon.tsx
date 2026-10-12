import { memo, type CSSProperties } from 'react';
import { ICONS, type IconId } from '../icons/catalog.generated';
import { cx } from './cx';

export type { IconId };

interface IconProps {
  id: IconId;
  /** 16 in panels and menus, 20 in the toolbar (specs/10). */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** The single icon component: resolves both Lucide-derived and `custom:` icons from the catalog. */
export const Icon = memo(function Icon({ id, size = 16, className, style }: IconProps) {
  return (
    <svg
      className={cx('vc-icon', className)}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[id] }}
    />
  );
});
