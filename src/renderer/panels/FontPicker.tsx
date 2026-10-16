import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { fontManager } from '../text/fontManager';

// Font picker of the Character panel: search, every family previewed in its own face, favourites and recents.
// Favourites and recents are interface preferences (never document data).

const FAVORITES = 'victoria.favoriteFonts';
const RECENTS = 'victoria.recentFonts';
const MAX_RECENTS = 6;

function read(key: string): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function write(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage unavailable: the list just does not persist.
  }
}

export const rememberFont = (family: string): void => write(RECENTS, [family, ...read(RECENTS).filter((f) => f !== family)].slice(0, MAX_RECENTS));

/** Families that match a search text (case and accent insensitive). */
export function filterFamilies(families: readonly string[], query: string): string[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  return q ? families.filter((f) => fold(f).includes(q)) : [...families];
}

export function FontPicker({ family, mixed, onPick }: { family: string | null; mixed?: boolean; onPick(family: string): void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(() => read(FAVORITES));
  const root = useRef<HTMLDivElement>(null);
  const version = useSyncExternalStore(fontManager.subscribe, fontManager.getVersion);
  const families = useMemo(() => (version >= 0 ? fontManager.families() : []), [version]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);

  const shown = filterFamilies(families, query);
  const recents = query ? [] : read(RECENTS).filter((f) => families.includes(f));
  const favs = query ? [] : favorites.filter((f) => families.includes(f));
  const missing = !!family && !mixed && fontManager.isReady && !fontManager.hasFamily(family);

  const pick = (name: string) => {
    onPick(name);
    rememberFont(name);
    setOpen(false);
    setQuery('');
  };
  const toggleFavorite = (name: string) => {
    const next = favorites.includes(name) ? favorites.filter((f) => f !== name) : [...favorites, name];
    setFavorites(next);
    write(FAVORITES, next);
  };

  const item = (name: string, prefix: string) => (
    <div key={`${prefix}${name}`} className="vc-fontpicker__item" data-active={name === family}>
      <button type="button" className="vc-fontpicker__name" style={{ fontFamily: `"${name}", sans-serif` }} data-testid={`font-option-${name}`} onClick={() => pick(name)}>
        {name}
      </button>
      <button type="button" className="vc-fontpicker__star" aria-pressed={favorites.includes(name)} {...tip(favorites.includes(name) ? t('text.unfavorite') : t('text.favorite'))} onClick={() => toggleFavorite(name)}>
        <Icon id={favorites.includes(name) ? 'star-filled' : 'star'} size={12} />
      </button>
    </div>
  );
  const group = (title: string, list: string[], prefix: string) =>
    list.length > 0 && (
      <>
        <div className="vc-fontpicker__group">{title}</div>
        {list.map((f) => item(f, prefix))}
      </>
    );

  return (
    <div className="vc-fontpicker" ref={root}>
      <button type="button" className="vc-fontpicker__button" data-testid="font-picker" data-missing={missing} aria-expanded={open} {...tip(missing ? t('text.missing') : t('text.font'))} onClick={() => setOpen(!open)}>
        <Icon id="tool-type" size={12} />
        <span className="vc-fontpicker__current">{mixed ? '' : (family ?? '')}</span>
        <Icon id="chevron-down" size={10} />
      </button>
      {open && (
        <div className="vc-fontpicker__popup" role="listbox">
          <div className="vc-fontpicker__search">
            <Icon id="search" size={12} />
            <input autoFocus value={query} placeholder={t('text.fontSearch')} aria-label={t('text.fontSearch')} data-testid="font-search" onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="vc-fontpicker__list">
            {group(t('text.favorites'), favs, 'f:')}
            {group(t('text.recents'), recents, 'r:')}
            {shown.length === 0 ? <div className="vc-fontpicker__empty">{t('text.noFonts')}</div> : group(t('text.allFonts'), shown, 'a:')}
          </div>
        </div>
      )}
    </div>
  );
}
