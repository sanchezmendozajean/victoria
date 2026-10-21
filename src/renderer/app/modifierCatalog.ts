import type { IconId } from '../components/Icon';
import type { TranslationKey } from '../i18n';

/** The Modificador menu by category (specs/05 · Catálogo). `v2` entries are listed but not available yet. */
export interface ModifierMenuItem {
  id: string;
  label: TranslationKey;
  icon: IconId;
  kind: 'structural' | 'appearance';
  v2: boolean;
}
export interface ModifierMenuCategory {
  id: string;
  label: TranslationKey;
  icon: IconId;
  items: readonly ModifierMenuItem[];
}

export const MODIFIER_MENU: readonly ModifierMenuCategory[] = [
  {
    id: 'path',
    label: 'menu.modifier.path',
    icon: 'offset-path',
    items: [
      {
        id: 'offset-path',
        label: 'modifier.offsetPath',
        icon: 'offset-path',
        kind: 'structural',
        v2: false
      },
      {
        id: 'outline-stroke',
        label: 'modifier.outlineStroke',
        icon: 'outline-stroke',
        kind: 'structural',
        v2: false
      },
      {
        id: 'outline-object',
        label: 'modifier.outlineObject',
        icon: 'outline-mode',
        kind: 'structural',
        v2: true
      }
    ]
  },
  {
    id: 'pathfinder',
    label: 'menu.modifier.pathfinder',
    icon: 'pf-unite',
    items: [
      {
        id: 'pf-unite',
        label: 'modifier.pfUnite',
        icon: 'pf-unite',
        kind: 'structural',
        v2: false
      },
      {
        id: 'pf-minus-front',
        label: 'modifier.pfMinusFront',
        icon: 'pf-minus-front',
        kind: 'structural',
        v2: false
      },
      {
        id: 'pf-intersect',
        label: 'modifier.pfIntersect',
        icon: 'pf-intersect',
        kind: 'structural',
        v2: false
      },
      {
        id: 'pf-exclude',
        label: 'modifier.pfExclude',
        icon: 'pf-exclude',
        kind: 'structural',
        v2: false
      },
      {
        id: 'pf-divide',
        label: 'modifier.pfDivide',
        icon: 'pf-divide',
        kind: 'structural',
        v2: true
      },
      {
        id: 'pf-trim',
        label: 'modifier.pfTrim',
        icon: 'pf-trim',
        kind: 'structural',
        v2: true
      },
      {
        id: 'pf-merge',
        label: 'modifier.pfMerge',
        icon: 'pf-merge',
        kind: 'structural',
        v2: true
      },
      {
        id: 'pf-crop',
        label: 'modifier.pfCrop',
        icon: 'pf-crop',
        kind: 'structural',
        v2: true
      },
      {
        id: 'pf-outline',
        label: 'modifier.pfOutline',
        icon: 'pf-outline',
        kind: 'structural',
        v2: true
      },
      {
        id: 'pf-minus-back',
        label: 'modifier.pfMinusBack',
        icon: 'pf-minus-back',
        kind: 'structural',
        v2: true
      }
    ]
  },
  {
    id: 'distort',
    label: 'menu.modifier.distort',
    icon: 'pucker-bloat',
    items: [
      {
        id: 'round-corners',
        label: 'modifier.roundCorners',
        icon: 'round-corners',
        kind: 'structural',
        v2: false
      },
      {
        id: 'zigzag',
        label: 'modifier.zigzag',
        icon: 'zigzag',
        kind: 'structural',
        v2: false
      },
      {
        id: 'pucker-bloat',
        label: 'modifier.puckerBloat',
        icon: 'pucker-bloat',
        kind: 'structural',
        v2: false
      },
      {
        id: 'roughen',
        label: 'modifier.roughen',
        icon: 'roughen',
        kind: 'structural',
        v2: false
      },
      {
        id: 'transform',
        label: 'modifier.transform',
        icon: 'mod-transform',
        kind: 'structural',
        v2: false
      },
      {
        id: 'twist',
        label: 'modifier.twist',
        icon: 'twist',
        kind: 'structural',
        v2: true
      },
      {
        id: 'free-distort',
        label: 'modifier.freeDistort',
        icon: 'free-distort',
        kind: 'structural',
        v2: true
      },
      {
        id: 'scribble',
        label: 'modifier.scribble',
        icon: 'tool-pencil',
        kind: 'structural',
        v2: true
      }
    ]
  },
  {
    id: 'warp',
    label: 'menu.modifier.warp',
    icon: 'warp-arc',
    items: [
      {
        id: 'warp-arc',
        label: 'modifier.warpArc',
        icon: 'warp-arc',
        kind: 'structural',
        v2: false
      },
      {
        id: 'warp-flag',
        label: 'modifier.warpFlag',
        icon: 'warp-flag',
        kind: 'structural',
        v2: false
      },
      {
        id: 'warp-wave',
        label: 'modifier.warpWave',
        icon: 'warp-wave',
        kind: 'structural',
        v2: false
      },
      {
        id: 'warp-inflate',
        label: 'modifier.warpInflate',
        icon: 'warp-inflate',
        kind: 'structural',
        v2: false
      },
      {
        id: 'warp-arc-lower',
        label: 'modifier.warpArcLower',
        icon: 'warp-arc-lower',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-arc-upper',
        label: 'modifier.warpArcUpper',
        icon: 'warp-arc-upper',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-arch',
        label: 'modifier.warpArch',
        icon: 'warp-arch',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-bulge',
        label: 'modifier.warpBulge',
        icon: 'warp-bulge',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-shell-lower',
        label: 'modifier.warpShellLower',
        icon: 'warp-shell-lower',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-shell-upper',
        label: 'modifier.warpShellUpper',
        icon: 'warp-shell-upper',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-fish',
        label: 'modifier.warpFish',
        icon: 'warp-fish',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-rise',
        label: 'modifier.warpRise',
        icon: 'warp-rise',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-fisheye',
        label: 'modifier.warpFisheye',
        icon: 'warp-fisheye',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-squeeze',
        label: 'modifier.warpSqueeze',
        icon: 'warp-squeeze',
        kind: 'structural',
        v2: true
      },
      {
        id: 'warp-twist',
        label: 'modifier.warpTwist',
        icon: 'warp-twist',
        kind: 'structural',
        v2: true
      }
    ]
  },
  {
    id: 'convert',
    label: 'menu.modifier.convert',
    icon: 'convert-rect',
    items: [
      {
        id: 'convert-rect',
        label: 'modifier.convertRect',
        icon: 'convert-rect',
        kind: 'structural',
        v2: true
      },
      {
        id: 'convert-rounded',
        label: 'modifier.convertRounded',
        icon: 'convert-rounded',
        kind: 'structural',
        v2: true
      },
      {
        id: 'convert-ellipse',
        label: 'modifier.convertEllipse',
        icon: 'convert-ellipse',
        kind: 'structural',
        v2: true
      }
    ]
  },
  {
    id: 'stylize',
    label: 'menu.modifier.stylize',
    icon: 'drop-shadow',
    items: [
      {
        id: 'drop-shadow',
        label: 'modifier.dropShadow',
        icon: 'drop-shadow',
        kind: 'appearance',
        v2: false
      },
      {
        id: 'outer-glow',
        label: 'modifier.outerGlow',
        icon: 'outer-glow',
        kind: 'appearance',
        v2: false
      },
      {
        id: 'inner-glow',
        label: 'modifier.innerGlow',
        icon: 'inner-glow',
        kind: 'appearance',
        v2: true
      },
      {
        id: 'feather',
        label: 'modifier.feather',
        icon: 'feather',
        kind: 'appearance',
        v2: true
      }
    ]
  }
];
